import { normalizeDefinition, type StrategyDefinition } from "../strategy-schema";
import { unknownNames } from "./evaluate";
import { ParseError, parseExpression, type Node } from "./parser";
import type { CompileIssue } from "./types";

export type CompiledStrategy = {
  longEntry: Node | null;
  shortEntry: Node | null;
  stop: { node: Node; kind: "price" | "distance" } | null;
  target: { node: Node; kind: "price" | "distance" | "r_multiple" } | null;
  sizing: Node | null;
  exitRule: Node | null;
  timeExitBars: number | null;
  issues: CompileIssue[];
  runnable: boolean;
};

const TRADE_VARS = [
  "entry_price",
  "stop_price",
  "target_price",
  "risk",
  "risk_per_unit",
  "capital",
  "equity",
  "bars_in_trade",
  "quantity",
];

function field(def: StrategyDefinition, section: string, key: string): string {
  return (def.sections[section]?.[key] ?? "").trim();
}

function compileField(
  def: StrategyDefinition,
  section: string,
  key: string,
  label: string,
  opts: { required: boolean; vars?: string[] },
  issues: CompileIssue[],
): Node | null {
  const raw = field(def, section, key);
  if (!raw) {
    if (opts.required) {
      issues.push({
        level: "blocker",
        section,
        field: key,
        message: `${label} is empty — the engine has nothing to evaluate.`,
      });
    }
    return null;
  }
  let node: Node;
  try {
    node = parseExpression(raw);
  } catch (err) {
    issues.push({
      level: opts.required ? "blocker" : "warning",
      section,
      field: key,
      message: `${label} is not machine-readable: ${
        err instanceof ParseError ? err.message : "could not be parsed"
      }. Rewrite it as an expression, e.g. "close > sma(close, 20)".`,
    });
    return null;
  }
  const unknown = unknownNames(node, opts.vars ?? []);
  if (unknown.length > 0) {
    issues.push({
      level: opts.required ? "blocker" : "warning",
      section,
      field: key,
      message: `${label} refers to ${unknown
        .map((u) => `"${u}"`)
        .join(", ")}, which the engine does not know. Use bar fields (open, high, low, close, volume) or indicators (sma, ema, atr, rsi, highest, lowest).`,
    });
    return null;
  }
  return node;
}

function referencesAny(raw: string, names: string[]): boolean {
  const lower = raw.toLowerCase();
  return names.some((n) => new RegExp(`\\b${n}\\b`).test(lower));
}

function parseTimeExit(raw: string): number | null {
  if (!raw) return null;
  const bars = raw.match(/(\d+)\s*(?:bars?|candles?|periods?)/i);
  if (bars?.[1]) return Number(bars[1]);
  return null;
}

export function compileStrategy(rawDefinition: unknown): CompiledStrategy {
  const def = normalizeDefinition(rawDefinition);
  const issues: CompileIssue[] = [];

  const longEntry = compileField(
    def,
    "entry",
    "long_entry",
    "Long entry expression",
    { required: true },
    issues,
  );
  const shortEntry = compileField(
    def,
    "entry",
    "short_entry",
    "Short entry expression",
    { required: false },
    issues,
  );

  const stopRaw = field(def, "stop_loss", "stop_formula");
  const stopNode = compileField(
    def,
    "stop_loss",
    "stop_formula",
    "Stop formula",
    { required: true, vars: TRADE_VARS },
    issues,
  );
  const stop = stopNode
    ? {
        node: stopNode,
        kind: (referencesAny(stopRaw, ["entry_price", "open", "high", "low", "close", "price"])
          ? "price"
          : "distance") as "price" | "distance",
      }
    : null;

  const targetRaw = field(def, "profit_target", "target_formula");
  const targetNode = compileField(
    def,
    "profit_target",
    "target_formula",
    "Target formula",
    { required: true, vars: TRADE_VARS },
    issues,
  );
  const target = targetNode
    ? {
        node: targetNode,
        kind: (referencesAny(targetRaw, ["risk", "risk_per_unit"])
          ? "r_multiple"
          : referencesAny(targetRaw, ["entry_price", "open", "high", "low", "close", "price"])
            ? "price"
            : "distance") as "price" | "distance" | "r_multiple",
      }
    : null;

  const sizing = compileField(
    def,
    "position_sizing",
    "sizing_formula",
    "Sizing formula",
    { required: false, vars: TRADE_VARS },
    issues,
  );
  if (!sizing) {
    issues.push({
      level: "warning",
      section: "position_sizing",
      field: "sizing_formula",
      message: "Falling back to the fixed quantity set in the run configuration.",
    });
  }

  const exitRule = compileField(
    def,
    "exit",
    "exit_conditions",
    "Exit conditions",
    { required: false, vars: TRADE_VARS },
    issues,
  );

  const timeExitBars = parseTimeExit(field(def, "exit", "time_exit"));

  const runnable = !!longEntry && !!stop && !!target;
  if (!runnable && issues.every((i) => i.level !== "blocker")) {
    issues.push({
      level: "blocker",
      section: "entry",
      field: "long_entry",
      message: "The specification does not yet contain a runnable entry, stop and target.",
    });
  }

  return {
    longEntry,
    shortEntry,
    stop,
    target,
    sizing,
    exitRule,
    timeExitBars,
    issues,
    runnable,
  };
}
