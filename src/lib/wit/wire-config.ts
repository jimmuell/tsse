import type { BacktestConfig } from "../backtest/types";

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
  /** commission/slippage carry real economics into costs.*; the rest of BacktestConfig
   *  (defaultQuantity, allowLong, allowShort) has no wire-config equivalent — sizing is
   *  hard-gated to exactly one contract and the engine does not expose a long/short toggle. */
  config: Pick<BacktestConfig, "commission" | "slippage">;
};

/** MES tick size/value the engine bakes in v1 regardless of what instrument.* declares. */
const BAKED_TICK_SIZE = 0.25;
const BAKED_TICK_VALUE = 1.25; // $5/point ÷ 4 ticks/point

export type WireConfigBlocker = { field: string; message: string };

/**
 * Fields the engine HONOURS (they change the audit) but that TSSE has no structured source
 * for today — the app only captures free-text rule expressions (stop_formula, target_formula,
 * etc.), which the WIT engine does not read. Guessing a number here would silently misrepresent
 * the strategy under audit, so these block the submit instead of shipping a fabricated value.
 */
function wireConfigBlockers(): WireConfigBlocker[] {
  return [
    {
      field: "setup_entry.trigger",
      message:
        "Entry trigger style (close-beyond-level vs body-beyond-level) is not yet captured by TSSE.",
    },
    {
      field: "setup_entry.params.value_area_pct",
      message: "Value-area percentage is not yet captured by TSSE.",
    },
    {
      field: "setup_entry.params.granularity",
      message: "Volume-profile granularity (5min vs 1min) is not yet captured by TSSE.",
    },
    {
      field: "exits.stop.ticks",
      message: "Stop-loss distance in ticks is not yet captured by TSSE.",
    },
    {
      field: "exits.target.value",
      message: "Profit target R-multiple is not yet captured by TSSE.",
    },
  ];
}

/**
 * Compiles a WIT wire StrategyConfig. Real TSSE data fills config_version/data.window/costs.*;
 * every other section is either a single-legal-value hard gate or a declared-but-not-applied
 * field the engine bakes and merely discloses — both are transcribed from the contract's own
 * documented values, not invented. Fields the engine HONOURS with no TSSE data source (see
 * wireConfigBlockers) fail the submit before the engine is ever called.
 */
export function compileWireConfig(input: WireConfigInput): {
  config: WireStrategyConfig | null;
  blockers: WireConfigBlocker[];
} {
  const blockers = wireConfigBlockers();
  if (!input.from || !input.to) {
    blockers.push({
      field: "data.window",
      message: "A from/to date range is required — the engine has no window to audit.",
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
      dataset: "ES_5min_continuous", // declared but NOT applied — engine always reads its own parquet
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
      trigger: "", // BLOCKED — see wireConfigBlockers; unreachable once blockers are empty
      level: "va_high_low", // declared but NOT applied — engine always uses VAH/VAL structurally
      order: "market_on_close", // HONOURED hard gate D4 — single legal value
      params: {
        range_start: "09:30", // matches the schema's own stated session instants
        range_end: "11:00",
        value_area_pct: 0, // BLOCKED
        granularity: "", // BLOCKED
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
        ticks: 0, // BLOCKED
      },
      target: {
        mode: "r_multiple", // declared but NOT applied — engine bakes entry +/- value*R
        value: 0, // BLOCKED
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
  // shape stays in one place as blockers are resolved field-by-field in a future pass — but it
  // is only ever handed to the caller once every blocker clears.
  return { config: blockers.length > 0 ? null : config, blockers };
}
