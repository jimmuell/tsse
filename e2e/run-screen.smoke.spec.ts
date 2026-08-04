import { expect, test } from "@playwright/test";
import { openStrategyBacktestTab, STRATEGY_NAME } from "./helpers";

/**
 * Groundwork smoke test (WIT-TEST-01): proves the harness can sign in as a real
 * Supabase user (there is no dev/test auth bypass in this app — see e2e/README.md)
 * and reach the fixture strategy's Backtest tab, where the run form is enabled with
 * no blocker banner. This test does not create the account or strategy itself.
 */

test("sign in and reach the backtest run form", async ({ page }) => {
  await openStrategyBacktestTab(page);

  await expect(page.getByText(STRATEGY_NAME, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Long entry")).toBeVisible();
  await expect(page.getByLabel("Stop (ticks)")).toBeVisible();
  await expect(page.getByLabel("Profit target")).toBeVisible();
  await expect(page.getByText("This specification is not yet executable")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run backtest" })).toBeEnabled();
});
