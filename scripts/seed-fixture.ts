import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { emptyDefinition, type StrategyDefinition } from "../src/lib/strategy-schema";

// Same loader as scripts/inspect-jobs.ts / playwright.config.ts: .env.e2e first
// (test creds), then .env (Lovable-managed, public values only).
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
for (const envFile of [".env.e2e", ".env"]) {
  loadEnvFile(envFile);
}

const SUPABASE_URL = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
const SUPABASE_PUBLISHABLE_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const TEST_EMAIL = process.env["TEST_EMAIL"];
const TEST_PASSWORD = process.env["TEST_PASSWORD"];

export const FIXTURE_NAME = "E2E Test ORB";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set (.env).");
}
if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error("TEST_EMAIL / TEST_PASSWORD are not set (.env.e2e).");
}

/** The fixed reference spec — every value here is what WIT-TEST-06 specified. */
function buildFixtureDefinition(): StrategyDefinition {
  const def = emptyDefinition();
  const set = (section: string, field: string, value: string) => {
    const bucket = def.sections[section];
    if (!bucket) throw new Error(`Unknown section "${section}" in strategy-schema.ts`);
    bucket[field] = value;
  };

  set("metadata", "strategy_name", FIXTURE_NAME);
  set("metadata", "author", "TSSE test suite");
  set("metadata", "source", "manual");
  set("metadata", "version", "1.0");
  set(
    "metadata",
    "description",
    "Fixed reference ORB strategy used by the automated Playwright test suite. Do not edit.",
  );

  set("market", "markets", "ES futures (E-mini S&P 500)");
  set("market", "exchange", "CME");
  set("market", "symbols", "ES");
  set("market", "asset_class", "Futures");

  set("chart", "timeframe", "5min");
  set("chart", "session", "Regular trading hours");
  set("chart", "timezone", "America/New_York");

  set("setup", "setup_type", "Value area breakout");
  set("setup", "setup_conditions", "close > vah or close < val");
  set("setup", "value_area_pct", "70");

  set("bias", "bias_method", "Value area position");
  set("bias", "long_condition", "close > vah");
  set("bias", "short_condition", "close < val");

  set("entry", "long_entry", "close > vah");
  set("entry", "short_entry", "close < val");

  set("execution", "order_type", "Market");
  set("execution", "slippage_assumption", "0");

  set("stop_loss", "stop_method", "Ticks");
  set("stop_loss", "stop_formula", "8");

  set("profit_target", "target_method", "R-multiple");
  set("profit_target", "target_formula", "2 * risk");

  set("position_sizing", "sizing_method", "Fixed contracts");
  set("position_sizing", "sizing_formula", "1");

  set("exit", "exit_conditions", "time >= 16:00");
  set("exit", "time_exit", "time >= 16:00");
  set("exit", "manual_exit", "None - all exits are mechanical");

  set("constraints", "max_trades", "No limit");
  set("constraints", "trading_hours", "09:30-16:00 America/New_York");
  set("constraints", "overnight", "No - flat at the close");

  return def;
}

async function main() {
  // Inserted directly as the signed-in user under RLS — the same path
  // src/routes/strategies/new.tsx itself uses (supabase.from("strategies").insert(...)
  // with the caller's own session). No service-role key, no admin API.
  const supabase = createClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_PUBLISHABLE_KEY as string,
  );

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL as string,
    password: TEST_PASSWORD as string,
  });
  if (authError) throw authError;
  const userId = authData.user.id;

  const { data: existing, error: findError } = await supabase
    .from("strategies")
    .select("id, updated_at")
    .eq("user_id", userId)
    .eq("name", FIXTURE_NAME)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    console.log(
      `Fixture "${FIXTURE_NAME}" already exists (id ${existing.id}, last updated ${existing.updated_at}) — doing nothing.`,
    );
    await supabase.auth.signOut();
    return;
  }

  const definition = buildFixtureDefinition();
  const { data: created, error: insertError } = await supabase
    .from("strategies")
    .insert({
      user_id: userId,
      name: FIXTURE_NAME,
      source_type: "manual",
      source_content:
        "Seeded programmatically by scripts/seed-fixture.ts — see that file for the exact spec values.",
      definition: definition as never,
      status: "complete",
      scores: { completeness: 100, determinism: 100, ambiguity: 100 } as never,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  console.log(`Created fixture "${FIXTURE_NAME}" — id ${created.id}.`);
  console.log("This id is not hardcoded anywhere in tests — the suite finds the strategy by name.");

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
