import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// App config (.env) and/or e2e-only secrets (.env.e2e, e.g. TEST_EMAIL/TEST_PASSWORD) —
// both gitignored, neither auto-loaded by `playwright test` itself, so load them
// explicitly. .env.e2e loads second so it can supply e2e-only keys without touching
// .env. No-op when a file is absent (CI injects these as real env vars instead).
for (const envFile of [".env", ".env.e2e"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

// Defaults to the published app, which has the engine secrets this laptop doesn't carry.
// Set E2E_BASE_URL=http://localhost:8080 to run against a local dev server instead — that
// mode still needs ENGINE_URL / WIT_ENGINE_SERVICE_KEY configured locally to reach the engine.
const BASE_URL = process.env["E2E_BASE_URL"] || "https://trade-spec-scribe.lovable.app";
const isLocal = /^https?:\/\/localhost(:|\/|$)/.test(BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  ...(process.env["CI"] ? { workers: 1 } : {}),
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only manage a local dev server when actually testing against localhost — pointed at the
  // published app, there is nothing local to start.
  ...(isLocal
    ? {
        webServer: {
          command: "bun run dev",
          url: BASE_URL,
          reuseExistingServer: !process.env["CI"],
          timeout: 60_000,
        },
      }
    : {}),
});
