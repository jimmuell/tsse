import { compileWireConfig, type WireConfigBlocker } from "./wire-config";
import { SPEC_SECTIONS, type StrategyDefinition } from "../strategy-schema";

/**
 * Blockers compileWireConfig can raise that describe the RUN SCREEN's own inputs, not the
 * saved specification. The user picks these when they press Run, so they must never appear
 * on the Specification tab's auditability panel.
 */
export const RUN_SCREEN_BLOCKER_FIELDS = ["data.window", "data.dataset"] as const;

/** Wire field -> the section/field of the specification form a user must fix. */
const BLOCKER_LOCATION: Record<string, { section: string; field: string }> = {
  "setup_entry.params.granularity": { section: "chart", field: "timeframe" },
  "setup_entry.trigger": { section: "entry", field: "long_entry" },
  "setup_entry.params.value_area_pct": { section: "setup", field: "value_area_pct" },
  "exits.stop.ticks": { section: "stop_loss", field: "stop_formula" },
  "exits.target.value": { section: "profit_target", field: "target_formula" },
};

export type AuditabilityIssue = {
  field: string;
  /** The compiler's own message text, verbatim. */
  message: string;
  sectionLabel: string;
  fieldLabel: string;
};

export type AuditabilityResult = {
  auditable: boolean;
  issues: AuditabilityIssue[];
};

function labelsFor(field: string): { sectionLabel: string; fieldLabel: string } {
  const loc = BLOCKER_LOCATION[field];
  if (!loc) return { sectionLabel: "Specification", fieldLabel: field };
  const section = SPEC_SECTIONS.find((s) => s.key === loc.section);
  const specField = section?.fields.find((f) => f.key === loc.field);
  return {
    sectionLabel: section?.title ?? loc.section,
    fieldLabel: specField?.label ?? loc.field,
  };
}

export function isRunScreenBlocker(b: WireConfigBlocker): boolean {
  return (RUN_SCREEN_BLOCKER_FIELDS as readonly string[]).includes(b.field);
}

/**
 * Compiles the SAVED definition with no run-screen overrides and reports only what the
 * specification itself must fix. This is intentionally separate from the validation scores:
 * completeness/determinism/ambiguity measure how well the source was specified, this measures
 * whether this engine can execute it.
 */
export function checkAuditability(definition: StrategyDefinition): AuditabilityResult {
  const { blockers } = compileWireConfig({
    from: "",
    to: "",
    dataset: "",
    config: { commission: 0, slippage: 0 },
    definition,
  });
  const issues = blockers
    .filter((b) => !isRunScreenBlocker(b))
    .map((b) => ({ field: b.field, message: b.message, ...labelsFor(b.field) }));
  return { auditable: issues.length === 0, issues };
}
