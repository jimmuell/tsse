import { describe, expect, it } from "vitest";
import { checkAuditability } from "./auditability";
import { normalizeDefinition, type StrategyDefinition } from "../strategy-schema";

function def(overrides: Record<string, Record<string, string>> = {}): StrategyDefinition {
  const base = normalizeDefinition({
    sections: {
      chart: { timeframe: "5m" },
      setup: { value_area_pct: "70" },
      entry: { long_entry: "close > vah" },
      stop_loss: { stop_formula: "8" },
      profit_target: { target_formula: "2 * risk" },
    },
  });
  for (const [k, v] of Object.entries(overrides)) {
    base.sections[k] = { ...(base.sections[k] ?? {}), ...v };
  }
  return base;
}

describe("checkAuditability", () => {
  it("reads as auditable when the specification has no blockers", () => {
    const r = checkAuditability(def());
    expect(r.auditable).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("reads as not auditable and names the stop field for a non-reducible stop formula", () => {
    const r = checkAuditability(def({ stop_loss: { stop_formula: "poc - 2 * tick_size" } }));
    expect(r.auditable).toBe(false);
    const stop = r.issues.find((i) => i.field === "exits.stop.ticks");
    expect(stop).toBeDefined();
    expect(stop?.sectionLabel).toBe("Stop loss");
    expect(stop?.fieldLabel).toBe("Stop formula");
    expect(stop?.message).toContain("Stop distance could not be read as a fixed number");
  });

  it("never surfaces run-screen blockers (missing window, missing data set)", () => {
    const fields = checkAuditability(def({ stop_loss: { stop_formula: "atr(14)" } })).issues.map(
      (i) => i.field,
    );
    expect(fields).not.toContain("data.window");
    expect(fields).not.toContain("data.dataset");
  });
});
