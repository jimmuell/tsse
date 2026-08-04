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
  {
    section: "stop_loss",
    key: "stop_formula",
    label: "Stop (ticks)",
    placeholder: "8 — a plain number of ticks",
  },
  {
    section: "profit_target",
    key: "target_formula",
    label: "Profit target",
    placeholder: "2 * risk",
  },
  {
    section: "position_sizing",
    key: "sizing_formula",
    label: "Position size (not applied)",
    placeholder: "engine sizes at a fixed 1 contract",
  },
  {
    section: "exit",
    key: "exit_conditions",
    label: "Exit rule (optional)",
    placeholder: "close < sma(close, 20)",
  },
] as const;

/**
 * Spec fields the run screen can edit that are not executable expressions. Kept out of
 * RULE_FIELDS so they don't appear in the expression grid, but carried in the same overrides
 * object so they reach the server on submit.
 */
export const EXTRA_OVERRIDE_FIELDS = [
  { section: "chart", key: "timeframe", label: "Chart timeframe" },
] as const;

const ALL_OVERRIDE_FIELDS = [...RULE_FIELDS, ...EXTRA_OVERRIDE_FIELDS] as ReadonlyArray<{
  section: string;
  key: string;
}>;

export type RuleOverrides = Record<string, string>;

export function overrideKeyOf(f: { section: string; key: string }): string {
  return `${f.section}.${f.key}`;
}

export function applyOverrides(
  definition: StrategyDefinition,
  overrides: RuleOverrides,
): StrategyDefinition {
  const sections: StrategyDefinition["sections"] = { ...(definition.sections ?? {}) };
  // Rule fields are authoritative even when blank (clearing one must clear the spec value);
  // any other "section.key" override present is applied as-is.
  for (const f of RULE_FIELDS) {
    sections[f.section] = {
      ...(sections[f.section] ?? {}),
      [f.key]: overrides[overrideKeyOf(f)] ?? "",
    };
  }
  for (const [k, value] of Object.entries(overrides)) {
    const dot = k.indexOf(".");
    if (dot <= 0) continue;
    const section = k.slice(0, dot);
    const key = k.slice(dot + 1);
    if (RULE_FIELDS.some((f) => f.section === section && f.key === key)) continue;
    if (!value.trim()) continue;
    sections[section] = { ...(sections[section] ?? {}), [key]: value };
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
  for (const f of ALL_OVERRIDE_FIELDS) {
    const k = overrideKeyOf(f);
    out[k] = stored[k] ?? definition.sections?.[f.section]?.[f.key] ?? "";
  }
  return out;
}
