import { expect, test } from "@playwright/test";
import { openStrategyBacktestTab, setDateWindow, runAndWaitForResult } from "./helpers";

/** T12 — a valid non-baseline timeframe still runs and returns a result. Numbers will
 *  differ from the 5-minute baseline; this only asserts a result comes back at all. */

test("T12: Chart timeframe = 1min runs and returns a result", async ({ page }) => {
  test.setTimeout(150_000);
  await openStrategyBacktestTab(page);
  await setDateWindow(page);
  await page.getByLabel("Chart timeframe").fill("1min");
  await runAndWaitForResult(page);

  await expect(page.getByText(/^Trades \(\d+\)$/)).toBeVisible();
});
