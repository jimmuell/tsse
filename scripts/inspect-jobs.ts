import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

// Bun already auto-loads .env natively but has no process.loadEnvFile (Node-only) and
// doesn't know about .env.e2e — parse both by hand instead, so this runs the same under
// `bun run` or plain `node`/`tsx`. Never overrides an already-set var, so loading
// .env.e2e first makes it win over .env on any overlapping name (same contract as
// playwright.config.ts).
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
const FIXTURE_NAME = "E2E Test ORB";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set (.env).");
}
if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error("TEST_EMAIL / TEST_PASSWORD are not set (.env.e2e).");
}

type WireConfig = {
  exits?: { stop?: { ticks?: number }; target?: { value?: number } };
  setup_entry?: { params?: { granularity?: string } };
};

type Stats = { netPnl?: number; trades?: number; winRate?: number };

function money(value: number | undefined): string {
  return typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";
}

async function main() {
  // Read-only diagnostic: authenticates as the test user with the publishable key
  // already in .env — no service-role key, no new secrets.
  const supabase = createClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_PUBLISHABLE_KEY as string,
  );

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL as string,
    password: TEST_PASSWORD as string,
  });
  if (authError) throw authError;

  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("name", FIXTURE_NAME)
    .maybeSingle();
  if (strategyError) throw strategyError;
  if (!strategy) throw new Error(`No strategy named "${FIXTURE_NAME}" found for this account.`);

  const { data: jobs, error: jobsError } = await supabase
    .from("backtest_jobs")
    .select("id, created_at, status, run_id, payload")
    .eq("strategy_id", strategy.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (jobsError) throw jobsError;

  const runIds = (jobs ?? []).map((j) => j.run_id).filter((id): id is string => !!id);
  const { data: runs, error: runsError } =
    runIds.length > 0
      ? await supabase.from("backtest_runs").select("id, stats").in("id", runIds)
      : { data: [] as { id: string; stats: unknown }[], error: null };
  if (runsError) throw runsError;
  const runsById = new Map((runs ?? []).map((r) => [r.id, r.stats as Stats]));

  console.log(
    [
      "created_at".padEnd(24),
      "status".padEnd(9),
      "stop_ticks".padEnd(10),
      "target".padEnd(8),
      "granularity".padEnd(11),
      "net_pnl".padEnd(12),
      "trades".padEnd(7),
      "win_rate",
    ].join(" | "),
  );

  for (const job of jobs ?? []) {
    const wireConfig = (job.payload as { wireConfig?: WireConfig } | null)?.wireConfig ?? {};
    const stopTicks = wireConfig.exits?.stop?.ticks;
    const targetValue = wireConfig.exits?.target?.value;
    const granularity = wireConfig.setup_entry?.params?.granularity;
    const stats = job.run_id ? runsById.get(job.run_id) : undefined;

    console.log(
      [
        String(job.created_at).padEnd(24),
        String(job.status).padEnd(9),
        String(stopTicks ?? "—").padEnd(10),
        String(targetValue ?? "—").padEnd(8),
        String(granularity ?? "—").padEnd(11),
        money(stats?.netPnl).padEnd(12),
        String(stats?.trades ?? "—").padEnd(7),
        stats?.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—",
      ].join(" | "),
    );
  }

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
