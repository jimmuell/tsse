import { expect, test } from "@playwright/test";
import {
  openStrategyBacktestTab,
  setDateWindow,
  setRuleField,
  runAndWaitForResult,
  readStats,
} from "./helpers";

/**
 * T4-T6 — regression guard for the bug where on-screen edits never reached the
 * engine, and for ticks-not-points (see WIT-SEAM-08). The baseline is the fixed
 * known-good numbers from baseline.spec.ts's T1, not a fresh run here — each test
 * only needs to prove ITS edit changed the outcome, not re-derive the baseline.
 */

const BASELINE_NET_PNL = "-28,526.25";

test("T4: Stop (ticks) 8 -> 40 changes the result versus baseline", async ({ page }) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await setRuleField(page, "Stop (ticks)", "40");
  await runAndWaitForResult(page);

  const stats = await readStats(page);
  expect(stats.netPnl).not.toBe(BASELINE_NET_PNL);
});

test('T5: Profit target "2 * risk" -> "4 * risk" changes the result versus baseline', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await setRuleField(page, "Profit target", "4 * risk");
  await runAndWaitForResult(page);

  const stats = await readStats(page);
  expect(stats.netPnl).not.toBe(BASELINE_NET_PNL);
});

test("T6: stop 8 and stop 32 give different results (ticks are not read as points)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);

  // Both runs live in this one test, compared directly against each other — not against
  // the fixed baseline constant. If the /0.25 points-to-ticks bug reappeared, both "8"
  // and "32" would still get *some* conversion applied and could plausibly land on
  // different-but-wrong numbers that still differ from each other, so the real guard
  // here is the direct 8-vs-32 comparison itself, not just "differs from baseline".
  await setRuleField(page, "Stop (ticks)", "8");
  await runAndWaitForResult(page);
  const eightTicks = await readStats(page);

  await setRuleField(page, "Stop (ticks)", "32");
  await runAndWaitForResult(page);
  const thirtyTwoTicks = await readStats(page);

  expect(thirtyTwoTicks.netPnl).not.toBe(eightTicks.netPnl);
  expect(eightTicks.netPnl).toBe(BASELINE_NET_PNL);
});
