import { test } from "@playwright/test";
import { openStrategyBacktestTab, setDateWindow, setRuleField, expectBlocked } from "./helpers";

/**
 * T7-T9 — bad inputs must block before a run reaches the engine, the message must
 * name the offending field, and no row may appear in "Previous runs". None of these
 * reach the engine, so no long run wait is needed here.
 *
 * T10 (bad exit rule -> blocked) and T11 (value area % -> blocked) are deliberately
 * not written — see e2e/README.md.
 */

test("T7: Stop (ticks) = 8.5 -> blocked, message about whole ticks", async ({ page }) => {
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await setRuleField(page, "Stop (ticks)", "8.5");
  await expectBlocked(page, "ticks");
});

test("T8: Chart timeframe = 15min -> blocked (1min and 5min only)", async ({ page }) => {
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await page.getByLabel("Chart timeframe").fill("15min");
  await expectBlocked(page, "granularity");
});

test("T9: indicator crossover entry -> blocked (crossovers unsupported)", async ({ page }) => {
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await setRuleField(page, "Long entry", "sma(close, 20) crosses above sma(close, 50)");
  await expectBlocked(page, "trigger");
});
