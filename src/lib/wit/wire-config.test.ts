import { describe, expect, test } from "bun:test";
import { normalizeRuleText, parseExpression } from "../backtest/parser";
import { emptyDefinition, type StrategyDefinition } from "../strategy-schema";
import { compileWireConfig } from "./wire-config";

/**
 * Regression tests for the "decimal eater" bug (WIT-FIX-01): normalizeRuleText's
 * list-marker regex required no whitespace after the marker, so it stripped the
 * integer part of any leading decimal ("8.5" -> "5") and any leading minus sign
 * ("-5" -> "5") — silently, with zero blockers, because the mangled value was
 * always a valid, often whole, number by the time downstream code ever saw it.
 */

function baseDef(
  overrides: Partial<{
    timeframe: string;
    longEntry: string;
    stopFormula: string;
    targetFormula: string;
    valueAreaPct: string;
  }> = {},
): StrategyDefinition {
  const def = emptyDefinition();
  def.sections["chart"]!["timeframe"] = overrides.timeframe ?? "5min";
  def.sections["entry"]!["long_entry"] = overrides.longEntry ?? "close > vah";
  def.sections["stop_loss"]!["stop_formula"] = overrides.stopFormula ?? "8";
  def.sections["profit_target"]!["target_formula"] = overrides.targetFormula ?? "2 * risk";
  def.sections["setup"]!["value_area_pct"] = overrides.valueAreaPct ?? "70";
  return def;
}

function compile(def: StrategyDefinition) {
  return compileWireConfig({
    from: "2025-01-01",
    to: "2026-08-04",
    config: { commission: 0, slippage: 0 },
    definition: def,
  });
}

describe("normalizeRuleText — the fixed regex directly", () => {
  test("still strips a real list marker", () => {
    expect(normalizeRuleText("1. close > vah")).toBe("close > vah");
    expect(normalizeRuleText("2) close > vah")).toBe("close > vah");
    expect(normalizeRuleText("- close > vah")).toBe("close > vah");
  });

  test("no longer eats the integer part of a leading decimal", () => {
    expect(normalizeRuleText("8.5")).toBe("8.5");
    expect(normalizeRuleText("8.1")).toBe("8.1");
    expect(normalizeRuleText("12.75")).toBe("12.75");
  });

  test("no longer strips a leading minus sign", () => {
    expect(normalizeRuleText("-5")).toBe("-5");
  });
});

test("parseExpression('-5') parses as negative five, not five", () => {
  expect(parseExpression("-5")).toEqual({ k: "un", op: "-", arg: { k: "num", v: 5 } });
});

describe("compileWireConfig — stop (ticks)", () => {
  test("'8' compiles to 8 ticks with no blockers", () => {
    const { config, blockers } = compile(baseDef({ stopFormula: "8" }));
    expect(blockers).toEqual([]);
    expect(config?.exits.stop.ticks).toBe(8);
  });

  test("'8.5' is blocked, naming the stop field", () => {
    const { config, blockers } = compile(baseDef({ stopFormula: "8.5" }));
    expect(config).toBeNull();
    expect(blockers.some((b) => b.field === "exits.stop.ticks")).toBe(true);
  });

  test("'12.75' is blocked, naming the stop field", () => {
    const { config, blockers } = compile(baseDef({ stopFormula: "12.75" }));
    expect(config).toBeNull();
    expect(blockers.some((b) => b.field === "exits.stop.ticks")).toBe(true);
  });
});

describe("compileWireConfig — profit target", () => {
  test("'2.5 * risk' compiles to target value 2.5", () => {
    const { config, blockers } = compile(baseDef({ targetFormula: "2.5 * risk" }));
    expect(blockers).toEqual([]);
    expect(config?.exits.target.value).toBe(2.5);
  });

  test("'1.5 * risk' compiles to target value 1.5", () => {
    const { config, blockers } = compile(baseDef({ targetFormula: "1.5 * risk" }));
    expect(blockers).toEqual([]);
    expect(config?.exits.target.value).toBe(1.5);
  });
});

test("entry '1. close > vah' still compiles — the list marker is stripped, the trigger still derives", () => {
  const { config, blockers } = compile(baseDef({ longEntry: "1. close > vah" }));
  expect(blockers.some((b) => b.field === "setup_entry.trigger")).toBe(false);
  expect(config?.setup_entry.trigger).toBe("bar_close_beyond_level");
});
