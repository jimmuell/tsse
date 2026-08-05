import { expect, test } from "@playwright/test";
import {
  openStrategyBacktestTab,
  setDateWindow,
  runAndWaitForResult,
  readStats,
  readDateRangeLine,
  previousRunsPanel,
} from "./helpers";

/**
 * T1-T3 — the known-good baseline: E2E Test ORB's saved values, run over the fixed
 * window 2025-01-01 -> 2026-08-04, must keep returning the same numbers an earlier
 * independent run produced. No field overrides here — only the date window, which
 * every test in this suite fixes for comparability.
 */

test("T1: baseline run returns the known-good numbers", async ({ page }) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await runAndWaitForResult(page);

  const stats = await readStats(page);
  expect(stats.netPnl).toBe("-28,526.25");
  expect(stats.trades).toBe("326");
  expect(stats.winRate).toBe("6.4%");
  expect(stats.profitFactor).toBe("0.06");

  const rangeLine = await readDateRangeLine(page);
  expect(rangeLine).toContain("2025-01-02");
  expect(rangeLine).toContain("2026-04-09");
});

test("T2: the same inputs run twice return identical numbers", async ({ page }) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);

  await runAndWaitForResult(page);
  const first = await readStats(page);

  await runAndWaitForResult(page);
  const second = await readStats(page);

  expect(second).toEqual(first);
});

test('T3: a run appears in "Previous runs" with matching trades and P&L', async ({ page }) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await runAndWaitForResult(page);

  const stats = await readStats(page);
  const firstRow = previousRunsPanel(page).locator("ul > li").first();
  await expect(firstRow).toBeVisible();
  const rowText = (await firstRow.textContent()) ?? "";

  expect(rowText).toContain(stats.trades);
  expect(rowText).toContain(stats.netPnl);
});
