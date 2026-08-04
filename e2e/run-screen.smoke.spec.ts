import { expect, test } from "@playwright/test";

/**
 * Groundwork smoke test (WIT-TEST-01): proves the harness can sign in as a real
 * Supabase user (there is no dev/test auth bypass in this app — see e2e/README.md)
 * and reach a strategy's Backtest tab, where the run form's core fields render.
 *
 * Requires TEST_EMAIL / TEST_PASSWORD env vars for an existing account that owns
 * at least one strategy with a saved (non-failed) specification — see e2e/README.md
 * for why, and how to provision one. This test does not create that account or
 * strategy itself.
 */

const TEST_EMAIL = process.env["TEST_EMAIL"];
const TEST_PASSWORD = process.env["TEST_PASSWORD"];

test("sign in and reach the backtest run form", async ({ page }) => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      "TEST_EMAIL / TEST_PASSWORD are not set. This suite signs in as a real Supabase " +
        "user — there is no dev/test auth bypass — so it needs credentials for an " +
        "account that owns at least one strategy with a saved specification. See " +
        "e2e/README.md.",
    );
  }

  await page.goto("/auth");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/", { timeout: 15_000 });

  const firstStrategy = page
    .locator('a[href^="/strategies/"]:not([href="/strategies/new"])')
    .first();
  await expect(
    firstStrategy,
    "No strategies found for this account — the run screen needs at least one saved strategy specification to open. See e2e/README.md.",
  ).toBeVisible({ timeout: 15_000 });
  await firstStrategy.click();

  await expect(page).toHaveURL(/\/strategies\/.+/);
  await page.getByRole("tab", { name: "Backtest" }).click();

  await expect(page.getByLabel("Long entry")).toBeVisible();
  await expect(page.getByLabel("Stop (ticks)")).toBeVisible();
  await expect(page.getByLabel("Profit target")).toBeVisible();
});
