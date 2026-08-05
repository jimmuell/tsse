import { expect, test } from "@playwright/test";
import { requireCreds } from "./helpers";

/**
 * These checks always run against the PUBLISHED app, using absolute URLs — never
 * the configured baseURL/E2E_BASE_URL — because the whole point is to catch a
 * production outage even if the rest of the suite is being pointed at localhost.
 *
 * They exist because of the WIT-SEC-02 incident: `src/start.ts` called a
 * `createCsrfMiddleware` export that resolved to undefined in the deployed
 * bundle, and every single route 500'd for hours before anyone noticed — nothing
 * was actually checking. These three checks would have caught it in about two
 * minutes: two are literally "does the site return real HTML", and the third
 * checks the specific mechanism that broke (CSRF protection on server functions)
 * keeps working, not just that it was fixed once.
 */

const PUBLISHED_URL = "https://trade-spec-scribe.lovable.app";

test.describe("published app health", () => {
  test("GET / returns 200 with real HTML, not the error page", async ({ request }) => {
    const resp = await request.get(`${PUBLISHED_URL}/`);
    expect(resp.status(), "GET / did not return 200").toBe(200);
    const body = await resp.text();
    expect(body, "GET / rendered the app's own error boundary").not.toContain(
      "This page didn't load",
    );
  });

  test("GET /auth returns 200 with real HTML, not the error page", async ({ request }) => {
    const resp = await request.get(`${PUBLISHED_URL}/auth`);
    expect(resp.status(), "GET /auth did not return 200").toBe(200);
    const body = await resp.text();
    expect(body, "GET /auth rendered the app's own error boundary").not.toContain(
      "This page didn't load",
    );
    expect(body).toContain("Sign in");
  });

  test("cross-origin _serverFn POST is refused (403); same-origin is not", async ({
    page,
    request,
  }) => {
    // Discover a live _serverFn URL rather than hardcoding a content hash — that
    // hash is derived from the function's build output and changes on rebuild.
    // Sign in against the PUBLISHED app specifically (absolute URLs throughout,
    // not the shared helpers' baseURL-relative navigation) and open the Backtest
    // tab, which calls the real, harmless, no-auth-required engineStatus function
    // on load.
    const { email, password } = requireCreds();
    const serverFnUrls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/_serverFn/")) serverFnUrls.push(r.url());
    });

    await page.goto(`${PUBLISHED_URL}/auth`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${PUBLISHED_URL}/`, { timeout: 15_000 });

    // Landing on the dashboard alone doesn't call a server function — open a
    // strategy's Backtest tab, which calls engineStatus on load.
    await page.getByRole("heading", { name: "E2E Test ORB", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`^${PUBLISHED_URL}/strategies/.+`));
    await page.getByRole("tab", { name: "Backtest" }).click();

    await expect
      .poll(() => serverFnUrls.length, {
        message: "No _serverFn request observed to test the CSRF check against",
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    const serverFnUrl = serverFnUrls[0]!;

    const crossOrigin = await request.post(serverFnUrl, {
      headers: { Origin: "https://evil-attacker.example.com", "Content-Type": "application/json" },
      data: {},
    });
    expect(crossOrigin.status(), "Cross-origin POST to a _serverFn endpoint was not blocked").toBe(
      403,
    );

    const sameOrigin = await request.post(serverFnUrl, {
      headers: { Origin: PUBLISHED_URL, "Content-Type": "application/json" },
      data: {},
    });
    // Not asserting a specific success code — this particular endpoint may still
    // reject the request for its own reasons (declared as GET, so POST hits a
    // method mismatch; a different endpoint might reject on auth or input). What
    // this test cares about is specifically that it is not blocked BY CSRF.
    expect(
      sameOrigin.status(),
      "Same-origin POST was blocked with 403 — same-origin server-function traffic must pass the CSRF check",
    ).not.toBe(403);
  });
});
