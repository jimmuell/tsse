import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// TEST_EMAIL / TEST_PASSWORD (and any other local test config) live in .env, which is
// gitignored and never auto-loaded by `playwright test` itself — load it explicitly so
// `bun run e2e` works the same way `bun run dev` does. No-op when .env is absent (CI
// injects these as real env vars instead).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

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
  webServer: {
    command: "bun run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
