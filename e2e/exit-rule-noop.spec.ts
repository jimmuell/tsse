import { expect, test } from "@playwright/test";
import {
  openStrategyBacktestTab,
  setDateWindow,
  setRuleField,
  runAndWaitForResult,
  readStats,
} from "./helpers";

/**
 * T16 — pins the CURRENT honest behaviour that the exit rule field does not change
 * results (confirmed live: bars_in_trade >= 1 vs the saved time >= 16:00 produced
 * byte-identical numbers). This is not an endorsement of that behaviour — see
 * "Exit rule (not applied)" in honest-fields.spec.ts for the UI's own disclosure of it.
 *
 * IMPORTANT: if the engine ever starts honouring exit rules, this test is EXPECTED to
 * start failing and should be flipped to assert the results DIFFER, not patched to
 * keep passing.
 */

test("T16: the exit rule genuinely does not change results (pins current behaviour)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);

  // Run once with the exit rule left exactly as saved on the spec.
  await runAndWaitForResult(page);
  const asSaved = await readStats(page);

  // Run again with an exit rule that, if applied, should change every trade (exit
  // after a single bar).
  await setRuleField(page, "Exit rule (not applied)", "bars_in_trade >= 1");
  await runAndWaitForResult(page);
  const withExitRule = await readStats(page);

  expect(withExitRule).toEqual(asSaved);
});
