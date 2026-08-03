import type { StrategyDefinition } from "@/lib/strategy-schema";

/** Rule fields the engine can execute, with the spec field they are prefilled from. */
export const RULE_FIELDS = [
  {
    section: "entry",
    key: "long_entry",
    label: "Long entry",
    placeholder: "close > sma(close, 20) and rsi(close, 14) > 55",
  },
  {
    section: "entry",
    key: "short_entry",
    label: "Short entry",
    placeholder: "close < sma(close, 20)",
  },
  { section: "stop_loss", key: "stop_formula", label: "Stop loss", placeholder: "2 * atr(14)" },
  {
    section: "profit_target",
    key: "target_formula",
    label: "Profit target",
    placeholder: "2 * risk",
  },
  {
    section: "position_sizing",
    key: "sizing_formula",
    label: "Position size (optional)",
    placeholder: "leave empty to use default quantity",
  },
  {
    section: "exit",
    key: "exit_conditions",
    label: "Exit rule (optional)",
    placeholder: "close < sma(close, 20)",
  },
] as const;

export type RuleOverrides = Record<string, string>;

export function overrideKeyOf(f: { section: string; key: string }): string {
  return `${f.section}.${f.key}`;
}

export function applyOverrides(
  definition: StrategyDefinition,
  overrides: RuleOverrides,
): StrategyDefinition {
  const sections: StrategyDefinition["sections"] = { ...(definition.sections ?? {}) };
  for (const f of RULE_FIELDS) {
    sections[f.section] = {
      ...(sections[f.section] ?? {}),
      [f.key]: overrides[overrideKeyOf(f)] ?? "",
    };
  }
  return { ...definition, sections };
}

export function initialOverrides(
  strategyId: string,
  definition: StrategyDefinition,
): RuleOverrides {
  let stored: RuleOverrides = {};
  if (typeof window !== "undefined") {
    try {
      stored = JSON.parse(window.localStorage.getItem(`tsse:rules:${strategyId}`) ?? "{}");
    } catch {
      stored = {};
    }
  }
  const out: RuleOverrides = {};
  for (const f of RULE_FIELDS) {
    const k = overrideKeyOf(f);
    out[k] = stored[k] ?? definition.sections?.[f.section]?.[f.key] ?? "";
  }
  return out;
}
