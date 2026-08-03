import {
  REQUIRED_FIELDS,
  RULE_FIELDS,
  SPEC_SECTIONS,
  type StrategyDefinition,
} from "./strategy-schema";

export type ValidationIssue = {
  level: "error" | "warning" | "suggestion";
  section: string;
  message: string;
};

export type ValidationResult = {
  completeness: number;
  determinism: number;
  ambiguity: number;
  executionConfidence: number;
  missing: { section: string; field: string }[];
  issues: ValidationIssue[];
};

/** Words that make a rule non-deterministic. */
export const SUBJECTIVE_TERMS = [
  "strong",
  "weak",
  "weakens",
  "confirmation",
  "confirmed",
  "significant",
  "clean",
  "healthy",
  "obvious",
  "clear",
  "good",
  "bad",
  "quality",
  "momentum shift",
  "looks like",
  "feels",
  "seems",
  "roughly",
  "about",
  "some",
  "a bit",
  "usually",
  "often",
  "maybe",
  "probably",
  "wait for",
  "aggressive",
  "conservative",
  "reasonable",
  "nearby",
  "near the",
  "too far",
];

const OPERATOR_PATTERN = /(>=|<=|==|!=|>|<|\bcrosses\b|\bAND\b|\bOR\b|\bNOT\b)/i;

export function findSubjectiveTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return SUBJECTIVE_TERMS.filter((term) => new RegExp(`(^|\\W)${term}(\\W|$)`).test(lower));
}

function get(def: StrategyDefinition, section: string, field: string): string {
  return (def.sections[section]?.[field] ?? "").trim();
}

export function validateDefinition(def: StrategyDefinition): ValidationResult {
  const issues: ValidationIssue[] = [];
  const missing: { section: string; field: string }[] = [];

  for (const { section, field } of REQUIRED_FIELDS) {
    if (!get(def, section.key, field.key)) {
      missing.push({ section: section.title, field: field.label });
      issues.push({
        level: "error",
        section: section.title,
        message: `Required field "${field.label}" is empty.`,
      });
    }
  }

  const completeness =
    REQUIRED_FIELDS.length === 0
      ? 100
      : Math.round(((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100);

  // Determinism: rule fields that are filled must read as machine-evaluable
  // expressions and contain no subjective wording.
  let ruleTotal = 0;
  let ruleDeterministic = 0;
  for (const { section, field } of RULE_FIELDS) {
    const value = get(def, section.key, field.key);
    if (!value) continue;
    ruleTotal += 1;
    const subjective = findSubjectiveTerms(value);
    const hasOperator = OPERATOR_PATTERN.test(value);
    if (subjective.length === 0 && hasOperator) {
      ruleDeterministic += 1;
    }
    if (subjective.length > 0) {
      issues.push({
        level: "error",
        section: section.title,
        message: `"${field.label}" contains subjective language: ${subjective.join(", ")}.`,
      });
    }
    if (!hasOperator) {
      issues.push({
        level: "warning",
        section: section.title,
        message: `"${field.label}" has no comparison or Boolean operator, so it cannot be evaluated mechanically.`,
      });
    }
  }
  const determinism = ruleTotal === 0 ? 0 : Math.round((ruleDeterministic / ruleTotal) * 100);

  // Ambiguity: share of ambiguities that are still open.
  const total = def.ambiguities.length;
  const unresolved = def.ambiguities.filter((a) => a.status !== "resolved").length;
  const ambiguity = total === 0 ? 100 : Math.round(((total - unresolved) / total) * 100);
  for (const a of def.ambiguities) {
    if (a.status === "needs_user_input") {
      issues.push({
        level: "warning",
        section: "Ambiguities",
        message: `Needs user input: ${a.item}`,
      });
    }
    if (a.status === "cannot_determine" || a.status === "unknown") {
      issues.push({
        level: "suggestion",
        section: "Ambiguities",
        message: `Unresolved (${a.status.replace("_", " ")}): ${a.item}`,
      });
    }
  }

  // Contradiction and coherence checks.
  const stop = get(def, "stop_loss", "stop_formula");
  const target = get(def, "profit_target", "target_formula");
  const longEntry = get(def, "entry", "long_entry");
  const shortEntry = get(def, "entry", "short_entry");
  const exit = get(def, "exit", "exit_conditions");
  const sizing = get(def, "position_sizing", "sizing_formula");
  const timeframe = get(def, "chart", "timeframe");
  const biasMethod = get(def, "bias", "bias_method");

  if (stop && target && stop.replace(/\s+/g, "") === target.replace(/\s+/g, "")) {
    issues.push({
      level: "error",
      section: "Validation",
      message: "Stop loss and profit target resolve to the same price expression.",
    });
  }
  if (exit && !longEntry && !shortEntry) {
    issues.push({
      level: "error",
      section: "Validation",
      message: "Exit rules are defined but no entry rule exists.",
    });
  }
  if (/risk/i.test(sizing) && !stop) {
    issues.push({
      level: "error",
      section: "Validation",
      message: "Position sizing references risk but no stop loss formula is defined.",
    });
  }
  if (!timeframe && /(higher timeframe|htf|daily bias|weekly)/i.test(biasMethod)) {
    issues.push({
      level: "warning",
      section: "Validation",
      message: "Bias references a higher timeframe but the chart timeframe is undefined.",
    });
  }
  if (!get(def, "constraints", "overnight")) {
    issues.push({
      level: "suggestion",
      section: "Trade constraints",
      message: "State explicitly whether overnight positions are allowed.",
    });
  }
  for (const w of def.warnings) {
    issues.push({ level: "warning", section: "AI review", message: w });
  }

  const executionConfidence = Math.round(
    completeness * 0.4 + determinism * 0.4 + ambiguity * 0.2,
  );

  return { completeness, determinism, ambiguity, executionConfidence, missing, issues };
}

export function sectionCompletion(def: StrategyDefinition, sectionKey: string): number {
  const section = SPEC_SECTIONS.find((s) => s.key === sectionKey);
  if (!section) return 0;
  const filled = section.fields.filter((f) => get(def, sectionKey, f.key)).length;
  return Math.round((filled / section.fields.length) * 100);
}
