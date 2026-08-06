import { statementFor } from "../backtest/compile";
import { parseExpression, type Node } from "../backtest/parser";
import type { BacktestConfig } from "../backtest/types";
import type { StrategyDefinition } from "../strategy-schema";

/**
 * Wire shape from the engine's shipped contract
 * (api/_shipped/contract/strategy-config.v1.json, jimmuell/mes-orb-strategy, fetched 2026-08-04).
 * The engine currently runs exactly ONE Class-A strategy (vp_value_area_break / VAH-VAL ORB) —
 * most sections are hard-gated to a single legal value or are declared-but-not-applied (baked
 * and merely disclosed if a caller sends something different). Only a few fields are HONOURED
 * and actually change the audit.
 */
export type WireStrategyConfig = {
  config_version: "1.0";
  instrument: { symbol: string; tick_size: number; tick_value: number; proxy_for: string | null };
  data: { dataset: string; granularity_needed: string; window: { start: string; end: string } };
  session: { tz: string; trade_window: [string, string]; force_flat: string };
  bias: { mode: string; params: null };
  setup_entry: {
    trigger: string;
    level: string;
    order: string;
    params: { range_start: string; range_end: string; value_area_pct: number; granularity: string };
  };
  sizing: { mode: string; value: number };
  exits: {
    stop: { mode: string; ref: string; ticks: number };
    target: { mode: string; value: number };
    time_exit: string;
    same_bar_policy: "stop_first" | "target_first";
  };
  risk_controls: { max_trades_per_day: number; reentry: string };
  costs: { commission_per_side: number; slippage_ticks: number };
};

export type WireConfigInput = {
  /** ET calendar date, YYYY-MM-DD — the audited window. */
  from: string;
  /** ET calendar date, YYYY-MM-DD. */
  to: string;
  /** The dataset id the user picked from the engine's GET /wit/v1/datasets list. HONOURED —
   *  an unrecognised id now fails the run loudly rather than silently defaulting. */
  dataset: string;
  /** commission/slippage carry real economics into costs.*; the rest of BacktestConfig
   *  (defaultQuantity, allowLong, allowShort) has no wire-config equivalent — sizing is
   *  hard-gated to exactly one contract and the engine does not expose a long/short toggle. */
  config: Pick<BacktestConfig, "commission" | "slippage">;
  /** The strategy's 17-section spec — source of the 5 fields the engine HONOURS that TSSE's
   *  form already captures (chart.timeframe, entry.long_entry, stop_loss.stop_formula,
   *  profit_target.target_formula, setup.value_area_pct). */
  definition: StrategyDefinition;
};

/** MES tick size/value the engine bakes in v1 regardless of what instrument.* declares. */
const BAKED_TICK_SIZE = 0.25;
const BAKED_TICK_VALUE = 1.25; // $5/point ÷ 4 ticks/point

export type WireConfigBlocker = { field: string; message: string };

function section(def: StrategyDefinition, key: string, field: string): string {
  return (def.sections[key]?.[field] ?? "").trim();
}

function tryParse(raw: string): Node | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    return parseExpression(text);
  } catch {
    return null;
  }
}

/** Statically evaluates a constant arithmetic expression (no bar data, no identifiers). Returns
 *  null for anything that isn't a closed-form number — a formula referencing bar fields or
 *  indicators (e.g. "atr(14)") is dynamic per-trade and cannot be reduced to one fixed number. */
function evalConstant(node: Node): number | null {
  switch (node.k) {
    case "num":
      return node.v;
    case "un": {
      if (node.op !== "-") return null;
      const v = evalConstant(node.arg);
      return v === null ? null : -v;
    }
    case "bin": {
      if (!["+", "-", "*", "/"].includes(node.op)) return null;
      const l = evalConstant(node.l);
      const r = evalConstant(node.r);
      if (l === null || r === null) return null;
      if (node.op === "+") return l + r;
      if (node.op === "-") return l - r;
      if (node.op === "*") return l * r;
      return r === 0 ? null : l / r;
    }
    default:
      return null;
  }
}

/** Recognises "risk", "risk_per_unit", "<n> * risk", or "risk * <n>" and returns the
 *  coefficient (1 for a bare "risk"). Anything else returns null. */
function riskMultipleCoefficient(node: Node): number | null {
  const isRisk = (n: Node) => n.k === "ident" && (n.name === "risk" || n.name === "risk_per_unit");
  if (isRisk(node)) return 1;
  if (node.k === "bin" && node.op === "*") {
    if (isRisk(node.l)) return evalConstant(node.r);
    if (isRisk(node.r)) return evalConstant(node.l);
  }
  return null;
}

const TIMEFRAME_TO_GRANULARITY: Record<string, "1min" | "5min"> = {
  "1m": "1min",
  "1min": "1min",
  "1mins": "1min",
  "1minute": "1min",
  "1minutes": "1min",
  "5m": "5min",
  "5min": "5min",
  "5mins": "5min",
  "5minute": "5min",
  "5minutes": "5min",
};

function deriveGranularity(raw: string): "1min" | "5min" | null {
  const norm = raw.toLowerCase().replace(/[\s-]+/g, "");
  return TIMEFRAME_TO_GRANULARITY[norm] ?? null;
}

const COMPARISON_OPS = new Set([
  "<",
  ">",
  "<=",
  ">=",
  "==",
  "!=",
  "crosses_above",
  "crosses_below",
]);

/** TSSE's DSL has no "body" concept (only open/high/low/close/volume/indicators) — an entry
 *  expression can only ever confidently map to the close-based trigger, never the body-based
 *  one. Requires `close` as a BARE operand of the top-level comparison — a strategy that only
 *  references close inside an indicator call (e.g. "sma(close,10) > sma(close,20)") is an
 *  indicator crossover, not a level break, and must not be misread as one. */
function deriveTrigger(longEntryRaw: string): "bar_close_beyond_level" | null {
  const node = tryParse(longEntryRaw);
  if (!node || node.k !== "bin" || !COMPARISON_OPS.has(node.op)) return null;
  const isBareClose = (n: Node) => n.k === "ident" && n.name === "close";
  return isBareClose(node.l) || isBareClose(node.r) ? "bar_close_beyond_level" : null;
}

/** Parses "70" or "70%" into the FRACTION the contract wants — per strategy-config.v1.json:
 *  "HONOURED. A FRACTION of opening-window volume, NOT a percent: 0.70 means seventy percent."
 *  (values >1 up to 100 are auto-normalized by the engine too, but sending the native fraction
 *  directly avoids relying on that fallback). */
function parseValueAreaPct(raw: string): number | null {
  const match = raw.trim().match(/^(\d{1,3}(?:\.\d+)?)\s*%?$/);
  const pct = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : null;
}

/** A stated "<n>% value area" (either word order) near the literal phrase "value area",
 *  scanned across the free-text fields most likely to describe it — the fallback for
 *  strategies saved before setup.value_area_pct existed, or that never filled it in. */
function scanValueAreaPct(def: StrategyDefinition): number | null {
  const text = [
    section(def, "setup", "setup_conditions"),
    section(def, "bias", "bias_method"),
    section(def, "bias", "long_condition"),
    section(def, "bias", "short_condition"),
    section(def, "entry", "entry_notes"),
  ].join("\n");
  const patterns = [
    /(\d{1,3}(?:\.\d+)?)\s*%\s*[a-z\s]{0,15}?value\s*area/i,
    /value\s*area[a-z\s]{0,20}?(\d{1,3}(?:\.\d+)?)\s*%/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    const raw = match?.[1];
    if (raw) {
      const pct = Number(raw);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) return pct / 100;
    }
  }
  return null;
}

/** setup.value_area_pct is the dedicated field ("70" or "70%"); the free-text scan is only a
 *  fallback when the field is EMPTY — a filled-but-unparseable field is a blocker on its own
 *  terms, not a reason to silently fall through to a prose guess. */
function deriveValueAreaPct(def: StrategyDefinition): number | null {
  const fieldRaw = section(def, "setup", "value_area_pct");
  if (fieldRaw) return parseValueAreaPct(fieldRaw);
  return scanValueAreaPct(def);
}

/** Stop distance in ticks (positive), from a static stop_formula — the number the user enters
 *  there MEANS ticks (Jim's decision), so it is returned as-is. Null if the formula references
 *  bar data/indicators (dynamic) or doesn't parse. */
function deriveStopTicks(def: StrategyDefinition): number | null {
  const raw = statementFor(section(def, "stop_loss", "stop_formula"), "long");
  const node = tryParse(raw);
  if (!node) return null;
  const value = evalConstant(node);
  return value !== null && value !== 0 ? Math.abs(value) : null;
}

/** exits.target.value is HONOURED as a positive R-multiple; the engine has no other target
 *  shape in v1. Two confident derivations, tried in order:
 *   A. target_formula is already phrased as a multiple of risk ("2 * risk") -> that coefficient.
 *   B. target_formula and stop_formula are BOTH static distances in the same unit -> their ratio
 *      is the R-multiple (unit-independent — the shared unit cancels whether it's points or
 *      ticks, so this still holds now that stop is read as ticks). */
function deriveTargetRMultiple(def: StrategyDefinition, stopTicks: number | null): number | null {
  const raw = statementFor(section(def, "profit_target", "target_formula"), "long");
  const node = tryParse(raw);
  if (!node) return null;

  const asRiskMultiple = riskMultipleCoefficient(node);
  if (asRiskMultiple !== null && asRiskMultiple > 0) return asRiskMultiple;

  const targetPoints = evalConstant(node);
  if (targetPoints !== null && targetPoints !== 0 && stopTicks !== null && stopTicks > 0) {
    return Math.abs(targetPoints) / stopTicks;
  }
  return null;
}

/**
 * Compiles a WIT wire StrategyConfig. Real TSSE data fills config_version/data.window/costs.*
 * and the 5 fields the engine HONOURS that the strategy form already captures —
 * chart.timeframe, entry.long_entry, stop_loss.stop_formula, profit_target.target_formula, and
 * setup.value_area_pct (with a free-text scan as a fallback for strategies that never filled
 * the dedicated field in). Every other section is either a single-legal-value hard gate or a
 * declared-but-not-applied field the engine bakes and merely
 * discloses — both transcribed from the contract's own documented values, not invented. A field
 * that can't be confidently read from the strategy blocks the submit with a message naming the
 * form section to fix, per Jim's decision: no defaults, no guessing.
 */
export function compileWireConfig(input: WireConfigInput): {
  config: WireStrategyConfig | null;
  blockers: WireConfigBlocker[];
} {
  const blockers: WireConfigBlocker[] = [];
  if (!input.from || !input.to) {
    blockers.push({
      field: "data.window",
      message: "A from/to date range is required — the engine has no window to audit.",
    });
  }
  if (!input.dataset) {
    blockers.push({
      field: "data.dataset",
      message: "Choose a data set before running — none selected.",
    });
  }

  const timeframeRaw = section(input.definition, "chart", "timeframe");
  const granularity = deriveGranularity(timeframeRaw);
  if (!granularity) {
    blockers.push({
      field: "setup_entry.params.granularity",
      message: `Chart timeframe must be 1-minute or 5-minute for this engine — set it in the Chart section (currently "${timeframeRaw || "empty"}").`,
    });
  }

  const longEntryRaw = section(input.definition, "entry", "long_entry");
  const trigger = deriveTrigger(longEntryRaw);
  if (!trigger) {
    blockers.push({
      field: "setup_entry.trigger",
      message:
        'Entry trigger could not be determined — write the Long entry expression in the Entry rules section in terms of the bar\'s close price (e.g. "close > vah").',
    });
  }

  const valueAreaPct = deriveValueAreaPct(input.definition);
  if (valueAreaPct === null) {
    blockers.push({
      field: "setup_entry.params.value_area_pct",
      message: "Value area % is required — set it in the Setup section.",
    });
  }

  const stopTicks = deriveStopTicks(input.definition);
  if (stopTicks === null) {
    blockers.push({
      field: "exits.stop.ticks",
      message:
        'Stop distance could not be read as a fixed number — set the Stop formula in the Stop loss section to a plain number of ticks (e.g. "8"), not an indicator formula like "atr(14)".',
    });
  } else if (!Number.isInteger(stopTicks)) {
    blockers.push({
      field: "exits.stop.ticks",
      message: "Stop must be a whole number of ticks.",
    });
  }

  const targetRMultiple = deriveTargetRMultiple(input.definition, stopTicks);
  if (targetRMultiple === null) {
    blockers.push({
      field: "exits.target.value",
      message:
        'Profit target could not be expressed as a multiple of risk — set the Target formula in the Profit target section to a risk-multiple (e.g. "2 * risk"), or a plain number of points once the Stop loss section also uses a plain number.',
    });
  }

  const slippageTicks = Math.max(0, Math.round(input.config.slippage / BAKED_TICK_SIZE));

  const config: WireStrategyConfig = {
    config_version: "1.0",
    instrument: {
      symbol: "ES", // declared but NOT applied in v1 — engine bakes ES/MES regardless
      tick_size: BAKED_TICK_SIZE,
      tick_value: BAKED_TICK_VALUE,
      proxy_for: null,
    },
    data: {
      dataset: input.dataset, // HONOURED — the id the user picked from GET /wit/v1/datasets
      granularity_needed: "1min", // declared but NOT applied
      window: { start: input.from, end: input.to }, // HONOURED — real TSSE data
    },
    session: {
      tz: "America/New_York", // HONOURED hard gate — single legal value
      trade_window: ["09:30", "11:00"], // matches the schema's own stated session instants
      force_flat: "15:55", // declared but NOT applied — engine bakes last RTH bar
    },
    bias: {
      mode: "vp_value_area_break", // HONOURED hard gate D1 — single legal value
      params: null,
    },
    setup_entry: {
      trigger: trigger ?? "", // HONOURED — from entry.long_entry, or BLOCKED above
      level: "va_high_low", // declared but NOT applied — engine always uses VAH/VAL structurally
      order: "market_on_close", // HONOURED hard gate D4 — single legal value
      params: {
        range_start: "09:30", // matches the schema's own stated session instants
        range_end: "11:00",
        value_area_pct: valueAreaPct ?? 0, // HONOURED — from setup.value_area_pct (or prose fallback), or BLOCKED above
        granularity: granularity ?? "", // HONOURED — from chart.timeframe, or BLOCKED above
      },
    },
    sizing: {
      mode: "fixed_contracts", // HONOURED hard gate E1 — single legal value
      value: 1, // HONOURED hard gate E1 — single legal value
    },
    exits: {
      stop: {
        mode: "level_offset", // declared but NOT applied — engine bakes POC +/- ticks
        ref: "poc", // declared but NOT applied
        ticks: stopTicks !== null ? stopTicks : 0, // HONOURED as-is (the field already means ticks), or BLOCKED above
      },
      target: {
        mode: "r_multiple", // declared but NOT applied — engine bakes entry +/- value*R
        value: targetRMultiple ?? 0, // HONOURED, or BLOCKED above
      },
      time_exit: "force_flat", // HONOURED hard gate F4 — single legal value
      same_bar_policy: "stop_first", // matches the runner's own documented same-bar fallback
    },
    risk_controls: {
      max_trades_per_day: 1, // declared but NOT applied — runner takes at most one trade/day
      reentry: "none", // declared but NOT applied
    },
    costs: {
      commission_per_side: Math.max(0, input.config.commission), // HONOURED — real TSSE data
      slippage_ticks: slippageTicks, // HONOURED — real TSSE data, converted price units -> ticks
    },
  };

  // `config` is fully built above (including placeholder values for the blocked fields) so the
  // shape stays in one place — but it is only ever handed to the caller once every blocker clears.
  return { config: blockers.length > 0 ? null : config, blockers };
}
