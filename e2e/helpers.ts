import { expect, type Page } from "@playwright/test";

export const TEST_EMAIL = process.env["TEST_EMAIL"];
export const TEST_PASSWORD = process.env["TEST_PASSWORD"];

export const STRATEGY_NAME = "E2E Test ORB";

// The fixed audit window every test in this suite runs against, so results are
// comparable to each other and to the known-good baseline (see baseline.spec.ts).
export const FIXED_FROM = "2025-01-01";
export const FIXED_TO = "2026-08-04";

export function requireCreds(): { email: string; password: string } {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      "TEST_EMAIL / TEST_PASSWORD are not set. This suite signs in as a real Supabase " +
        "user — there is no dev/test auth bypass — so it needs credentials for the " +
        "E2E Test ORB fixture account. See e2e/README.md.",
    );
  }
  return { email: TEST_EMAIL, password: TEST_PASSWORD };
}

export async function signIn(page: Page): Promise<void> {
  const { email, password } = requireCreds();
  await page.goto("/auth");
  // On a freshly started dev server, Vite's dependency pre-bundling optimizer does a
  // one-time full-page reload shortly after first load — wait it out before interacting,
  // or a submit racing that reload looks like a silent auth failure.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

/** Signs in and opens a saved strategy by name, landing on its Backtest tab. */
export async function openStrategyBacktestTab(page: Page, name = STRATEGY_NAME): Promise<void> {
  await signIn(page);
  const card = page.getByRole("heading", { name, exact: true });
  await expect(
    card,
    `Strategy "${name}" was not found in the signed-in account's dashboard.`,
  ).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page).toHaveURL(/\/strategies\/.+/);
  await page.getByRole("tab", { name: "Backtest" }).click();
  await expect(page.getByLabel("Long entry")).toBeVisible();
}

export async function setDateWindow(page: Page, from = FIXED_FROM, to = FIXED_TO): Promise<void> {
  await page.getByLabel("From date").fill(from);
  await page.getByLabel("To date").fill(to);
}

export async function setRuleField(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(value);
}

/** Reads a Stat tile's value by its label (the tiles render label then value as adjacent <p>s). */
export function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
}

export async function readStats(page: Page) {
  return {
    netPnl: (await statValue(page, "Net P&L").textContent())?.trim() ?? "",
    trades: (await statValue(page, "Trades").textContent())?.trim() ?? "",
    winRate: (await statValue(page, "Win rate").textContent())?.trim() ?? "",
    profitFactor: (await statValue(page, "Profit factor").textContent())?.trim() ?? "",
  };
}

/** Reads the "<bars> bars simulated · <start> → <end>" line above the result stats. */
export async function readDateRangeLine(page: Page): Promise<string> {
  const line = page.locator("p.text-xs.text-muted-foreground", { hasText: "→" }).first();
  return ((await line.textContent()) ?? "").trim();
}

/** Clicks Run backtest and waits for the result panel (never for a spinner to vanish). */
export async function runAndWaitForResult(page: Page, timeoutMs = 150_000): Promise<void> {
  await page.getByRole("button", { name: "Run backtest" }).click();
  await expect(page.getByText(/^Trades \(\d+\)$/)).toBeVisible({ timeout: timeoutMs });
}

export function previousRunsPanel(page: Page) {
  return page.locator("div.rounded-lg", { hasText: "Previous runs" }).last();
}

export async function previousRunsCount(page: Page): Promise<number> {
  const panel = previousRunsPanel(page);
  if (!(await panel.isVisible().catch(() => false))) return 0;
  return panel.locator("ul > li").count();
}

/**
 * Asserts a bad input never produces a run: either the Run button is disabled with a
 * blocker banner naming the field, or clicking Run surfaces a toast naming the field —
 * and either way, no new row appears in "Previous runs". Returns the message shown.
 */
export async function expectBlocked(page: Page, fieldSubstring: string): Promise<string> {
  const before = await previousRunsCount(page);
  const runButton = page.getByRole("button", { name: "Run backtest" });
  let message: string;

  if (await runButton.isDisabled()) {
    const banner = page.getByText("This specification is not yet executable").locator("..");
    await expect(banner).toContainText(fieldSubstring, { timeout: 5_000 });
    message = (await banner.textContent()) ?? "";
  } else {
    await runButton.click();
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    message = (await toast.textContent()) ?? "";
    expect(
      message,
      `Toast did not name the blocked field ("${fieldSubstring}"): ${message}`,
    ).toContain(fieldSubstring);
  }

  // Give a queued job a moment to land, so a false pass isn't just "we checked too early".
  await page.waitForTimeout(3_000);
  const after = await previousRunsCount(page);
  expect(
    after,
    `A new run appeared in "Previous runs" even though this input should have been blocked (before=${before}, after=${after}).`,
  ).toBe(before);
  return message;
}
