import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Test credentials (.env.e2e, e.g. TEST_EMAIL/TEST_PASSWORD) and app config (.env,
// Lovable-managed, public values only) — neither auto-loaded by `playwright test`
// itself, so load them explicitly. process.loadEnvFile() never overrides an
// already-set var, so load order IS precedence: .env.e2e first means it wins over
// .env for any name defined in both (and a shell-exported value always wins over
// either file). No-op when a file is absent (CI injects these as real env vars).
for (const envFile of [".env.e2e", ".env"]) {
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
