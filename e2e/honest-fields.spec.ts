import { expect, test } from "@playwright/test";
import { openStrategyBacktestTab } from "./helpers";

/**
 * T13/T14 — the run screen must not promise controls the engine ignores. The engine
 * always runs ES/MES at a fixed 1 contract; there is no symbol, capital, quantity, or
 * long/short choice to make. See src/lib/wit/wire-config.ts's own "declared but NOT
 * applied" comments for what the engine actually honours.
 */

test("T13: run screen has no Symbol, Starting capital, Default quantity, or Long/Short toggles", async ({
  page,
}) => {
  await openStrategyBacktestTab(page);

  await expect(page.getByLabel("Symbol", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Starting capital", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Default quantity", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /long/i })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /short/i })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /^(allow )?long$/i })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /^(allow )?short$/i })).toHaveCount(0);
});

test('T14: stop field is "Stop (ticks)" and position size field is "Position size (not applied)"', async ({
  page,
}) => {
  await openStrategyBacktestTab(page);

  await expect(page.getByLabel("Stop (ticks)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Position size (not applied)", { exact: true })).toBeVisible();
});
