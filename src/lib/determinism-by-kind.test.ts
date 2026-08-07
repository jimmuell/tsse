import { describe, expect, test } from "bun:test";
import { RULE_FIELDS, emptyDefinition, type StrategyDefinition } from "./strategy-schema";
import { validateDefinition } from "./validation";

function scoreOne(section: string, field: string, value: string) {
  const def: StrategyDefinition = emptyDefinition();
  def.sections[section]![field] = value;
  const r = validateDefinition(def);
  const issues = r.issues.filter((i) => i.message.includes('"') && i.message.includes(field === "stop_formula" ? "Stop formula" : ""));
  return { determinism: r.determinism, issues: r.issues };
}

const QUANTITY = ["stop_formula", "target_formula", "sizing_formula", "time_exit"];

describe("rule field classification", () => {
  test("every rule field declares a kind, and the quantity set is exactly the four engine values", () => {
    expect(RULE_FIELDS.length).toBe(16);
    for (const { field } of RULE_FIELDS) expect(["condition", "quantity"]).toContain(field.rule!);
    const quantity = RULE_FIELDS.filter((f) => f.field.rule === "quantity").map((f) => f.field.key);
    expect(quantity.sort()).toEqual([...QUANTITY].sort());
  });
});

describe("quantity fields are scored as quantities", () => {
  test('"8" passes as a stop quantity', () => {
    expect(scoreOne("stop_loss", "stop_formula", "8").determinism).toBe(100);
  });
  test('"a few ticks" fails and warns about the quantity, not about operators', () => {
    const { determinism, issues } = scoreOne("stop_loss", "stop_formula", "a few ticks");
    expect(determinism).toBe(0);
    const warn = issues.find((i) => i.level === "warning" && i.message.includes("Stop formula"));
    expect(warn?.message).toContain("does not read as a definite quantity");
    expect(warn?.message).not.toContain("comparison or Boolean operator");
  });
  test('"around 2R" fails as a vague quantity', () => {
    expect(scoreOne("profit_target", "target_formula", "around 2R").determinism).toBe(0);
  });
  test('"2 * risk" passes', () => {
    expect(scoreOne("profit_target", "target_formula", "2 * risk").determinism).toBe(100);
  });
  test('"15:55" passes as a clock time', () => {
    expect(scoreOne("exit", "time_exit", "15:55").determinism).toBe(100);
  });
  test('"near the close" still fails', () => {
    expect(scoreOne("exit", "time_exit", "near the close").determinism).toBe(0);
  });
  test('"1" passes as a sizing quantity', () => {
    expect(scoreOne("position_sizing", "sizing_formula", "1").determinism).toBe(100);
  });
});

describe("condition fields keep the original test", () => {
  test('"close > vah" still passes', () => {
    expect(scoreOne("entry", "long_entry", "close > vah").determinism).toBe(100);
  });
  test('"close is strong" still fails on subjective language', () => {
    const { determinism, issues } = scoreOne("entry", "long_entry", "close is strong");
    expect(determinism).toBe(0);
    expect(issues.some((i) => i.level === "error" && i.message.includes("subjective"))).toBe(true);
  });
  test('a condition without an operator still gets the operator warning', () => {
    const { determinism, issues } = scoreOne("entry", "long_entry", "breakout of the range");
    expect(determinism).toBe(0);
    expect(
      issues.some((i) => i.message.includes("has no comparison or Boolean operator")),
    ).toBe(true);
  });
});
