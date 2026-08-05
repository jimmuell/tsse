import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type UserClient = ReturnType<typeof createClient<Database>>;

/** Throws unless the calling user holds the admin role (checked under RLS). */
export async function assertAdmin(supabase: UserClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Unable to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function countOf(table: string, filters: Record<string, string> = {}) {
  const db = await admin();
  let q = (db.from(table as never) as never as ReturnType<typeof db.from>).select("*", {
    count: "exact",
    head: true,
  });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export type AdminOverview = Awaited<ReturnType<typeof buildOverview>>;

export async function buildOverview() {
  const db = await admin();

  const [strategies, datasets, runs, jobs, questions] = await Promise.all([
    db.from("strategies").select("id, status, updated_at, user_id"),
    db.from("datasets").select("id, bar_count, user_id"),
    db.from("backtest_runs").select("id, created_at, user_id"),
    db.from("backtest_jobs").select("id, status, error, created_at, symbol, timeframe, user_id"),
    db.from("strategy_questions").select("id, status"),
  ]);

  for (const r of [strategies, datasets, runs, jobs, questions]) {
    if (r.error) throw r.error;
  }

  const { data: profiles, error: profileErr } = await db
    .from("profiles")
    .select("id, display_name, created_at")
    .order("created_at", { ascending: false });
  if (profileErr) throw profileErr;

  const { data: roleRows, error: roleErr } = await db.from("user_roles").select("user_id, role");
  if (roleErr) throw roleErr;

  const jobRows = jobs.data ?? [];
  const byStatus = (rows: { status: string }[]) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const failedJobs = jobRows
    .filter((j) => j.status === "failed" || j.status === "error")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 10);

  const countBy = <T extends { user_id: string }>(rows: T[]) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.user_id] = (acc[r.user_id] ?? 0) + 1;
      return acc;
    }, {});

  const strategyCounts = countBy(strategies.data ?? []);
  const runCounts = countBy(runs.data ?? []);
  const datasetCounts = countBy(datasets.data ?? []);
  const roleByUser = new Map((roleRows ?? []).map((r) => [r.user_id, r.role]));
  // Admin wins when a user holds both rows.
  for (const r of roleRows ?? []) if (r.role === "admin") roleByUser.set(r.user_id, "admin");

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    createdAt: p.created_at,
    role: (roleByUser.get(p.id) ?? "user") as "user" | "admin",
    strategies: strategyCounts[p.id] ?? 0,
    runs: runCounts[p.id] ?? 0,
    datasets: datasetCounts[p.id] ?? 0,
  }));

  return {
    totals: {
      users: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      strategies: (strategies.data ?? []).length,
      datasets: (datasets.data ?? []).length,
      bars: (datasets.data ?? []).reduce((n, d) => n + (d.bar_count ?? 0), 0),
      runs: (runs.data ?? []).length,
      jobs: jobRows.length,
      runsLast24h: (runs.data ?? []).filter((r) => Date.parse(r.created_at) > dayAgo).length,
      openQuestions: (questions.data ?? []).filter((q) => q.status !== "answered").length,
    },
    strategyStatus: byStatus(strategies.data ?? []),
    jobStatus: byStatus(jobRows),
    failedJobs: failedJobs.map((j) => ({
      id: j.id,
      symbol: j.symbol,
      timeframe: j.timeframe,
      error: j.error,
      createdAt: j.created_at,
    })),
    users,
  };
}

export async function setRole(targetUserId: string, role: "user" | "admin", actorId: string) {
  if (targetUserId === actorId && role === "user") {
    throw new Error("You cannot remove your own admin role");
  }
  const db = await admin();
  if (role === "admin") {
    const { error } = await db
      .from("user_roles")
      .upsert({ user_id: targetUserId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw error;
  } else {
    const { error } = await db
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", "admin");
    if (error) throw error;
  }
  const { error: baseErr } = await db
    .from("user_roles")
    .upsert({ user_id: targetUserId, role: "user" }, { onConflict: "user_id,role" });
  if (baseErr) throw baseErr;
  return { ok: true };
}

export { countOf };

export type AdminRun = {
  id: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  strategyName: string;
  datasetName: string;
  netProfit: number | null;
  trades: number | null;
  winRate: number | null;
};

/** Recent backtest runs across every account, newest first. */
export async function listAllRuns(limit = 25): Promise<AdminRun[]> {
  const db = await admin();
  const { data: runs, error } = await db
    .from("backtest_runs")
    .select("id, created_at, user_id, strategy_id, dataset_name, stats")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = runs ?? [];
  if (rows.length === 0) return [];

  const [{ data: profiles }, { data: strategies }] = await Promise.all([
    db.from("profiles").select("id, display_name").in("id", [...new Set(rows.map((r) => r.user_id))]),
    db.from("strategies").select("id, name").in("id", [...new Set(rows.map((r) => r.strategy_id))]),
  ]);
  const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const nameByStrategy = new Map((strategies ?? []).map((s) => [s.id, s.name]));

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return rows.map((r) => {
    const stats = (r.stats ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      userName: nameByUser.get(r.user_id) ?? null,
      strategyName: nameByStrategy.get(r.strategy_id) ?? "—",
      datasetName: r.dataset_name || "—",
      netProfit: num(stats['netProfit'] ?? stats['net_profit'] ?? stats['pnl']),
      trades: num(stats['trades'] ?? stats['totalTrades'] ?? stats['num_trades']),
      winRate: num(stats['winRate'] ?? stats['win_rate']),
    };
  });
}
