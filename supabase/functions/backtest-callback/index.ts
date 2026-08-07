// Supabase Edge Function — the WIT callback receiver.
//
// The engine (jimmuell/mes-orb-strategy) refuses to call back to any host that doesn't end in
// *.supabase.co, so this receiver has to live here rather than in the TanStack app (see
// src/lib/engine.functions.ts, which points callback_url at this function).
//
// Ports the verification + mapping logic from src/routes/api/public/backtest-callback.ts
// (WIT-SEAM-02/03), adapted to the Deno runtime and to this task's explicit status vocabulary
// (running | succeeded | failed) and idempotency requirement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { z } from "https://esm.sh/zod@3.25.76";

/**
 * Result shape verified against the engine's own result builder
 * (api/server.py:_backtest_result, jimmuell/mes-orb-strategy, fetched 2026-08-04). v1 emits
 * only aggregate metrics and a daily equity curve — no per-trade data (trades_url is always
 * null; "no signed-URL infra" per that source).
 */
const BacktestResultSchema = z.object({
  kind: z.literal("backtest"),
  metrics: z.object({
    trades: z.number().nullable(),
    net_pnl: z.number().nullable(),
    profit_factor: z.number().nullable(),
    max_drawdown: z.number().nullable(),
    win_rate: z.number().nullable(),
    avg_trade: z.number().nullable(),
    expectancy_r: z.number().nullable(),
  }),
  equity_curve: z.array(z.object({ t: z.string(), equity: z.number().nullable() })),
  equity_curve_resolution: z.string(),
  verdict: z.object({ code: z.string(), label: z.string(), reason: z.string() }),
  trades_url: z.string().nullable(),
  provenance: z.object({
    engine_version: z.string().nullable(),
    dataset_version: z.string().nullable(),
    config_hash: z.string().nullable(),
    completed_at: z.string().nullable(),
    // Sent by the engine on the backtest path; optional because older runs and the
    // event-study path do not send it. Declared so it is kept, not silently stripped.
    dataset_id: z.string().nullable().optional(),
  }),
});

// Verified against api/server.py:_wit_terminal + WITCallbackWriter.post — the engine's real
// status vocabulary is running | succeeded | failed (never "complete"/"done"/"queued" on the
// callback path).
const CallbackSchema = z.object({
  run_id: z.string().min(1),
  status: z.enum(["running", "succeeded", "failed"]),
  result: BacktestResultSchema.optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  progress: z.unknown().optional(),
});

const TERMINAL_JOB_STATUSES = new Set(["done", "failed"]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("WIT_CALLBACK_HMAC_SECRET");
  if (!secret) return new Response("Callback not configured", { status: 503 });

  // Raw bytes FIRST — the signature is computed over the exact bytes the engine sent, before
  // any JSON parsing. No shared-secret fallback: an invalid or missing signature is a hard 401.
  const raw = await req.text();
  const signature = req.headers.get("x-wit-signature");
  if (!signature || !timingSafeEqual(signature.replace(/^sha256=/i, ""), await hmacHex(secret, raw))) {
    console.warn("[wit-callback] rejected a request with a missing or invalid X-WIT-Signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let parsed: z.infer<typeof CallbackSchema>;
  try {
    parsed = CallbackSchema.parse(JSON.parse(raw));
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Invalid payload" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    // Auto-injected by Supabase for every Edge Function — their absence means the function
    // isn't actually running in a Supabase deployment, not a config gap TSSE can fix here.
    console.error("[wit-callback] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not injected");
    return new Response("Environment not configured", { status: 500 });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: job, error: jobError } = await supabaseAdmin
    .from("backtest_jobs")
    .select("id, user_id, strategy_id, symbol, timeframe, config, payload, status")
    .eq("engine_run_id", parsed.run_id)
    .single();
  if (jobError || !job) return new Response("Unknown run", { status: 404 });

  if (parsed.status === "running") {
    // Idempotent: a late "running" heartbeat that arrives after the terminal callback already
    // landed must never regress the job back out of done/failed.
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      return Response.json({ ok: true, ignored: "job already terminal" });
    }
    await supabaseAdmin.from("backtest_jobs").update({ status: "running" }).eq("id", job.id);
    return Response.json({ ok: true });
  }

  if (parsed.status === "failed") {
    await supabaseAdmin
      .from("backtest_jobs")
      .update({
        status: "failed",
        error: parsed.error?.message ?? "The engine reported a failure.",
      })
      .eq("id", job.id);
    console.log(`[wit-callback] run ${parsed.run_id} via callback`);
    return Response.json({ ok: true });
  }

  // parsed.status === "succeeded"
  if (!parsed.result) {
    await supabaseAdmin
      .from("backtest_jobs")
      .update({ status: "failed", error: "The engine reported success without a result." })
      .eq("id", job.id);
    return new Response("Missing result", { status: 400 });
  }
  const result = parsed.result;
  const equity = result.equity_curve.map((p) => ({
    t: Date.parse(`${p.t}T00:00:00Z`),
    equity: p.equity ?? 0,
  }));
  const rangeStart = equity.length > 0 ? equity[0].t : null;
  const rangeEnd = equity.length > 0 ? equity[equity.length - 1].t : null;

  const { data: run, error: runError } = await supabaseAdmin
    .from("backtest_runs")
    .insert({
      user_id: job.user_id,
      strategy_id: job.strategy_id,
      dataset_name: `${job.symbol} ${job.timeframe}`.trim(),
      config: {
        ...(job.config as Record<string, unknown>),
        engineVersion: result.provenance.engine_version,
      },
      compiled: {
        rangeStart,
        rangeEnd,
        verdict: result.verdict,
        provenance: result.provenance,
        equityCurveResolution: result.equity_curve_resolution,
      },
      // WIT v1 emits only aggregate metrics. Fields TSSE's BacktestStats type expects but the
      // engine does not return (wins, losses, returnPct, grossProfit, grossLoss, avgWin,
      // avgLoss, maxDrawdownPct, longTrades, shortTrades, startAt, endAt) are intentionally
      // absent, not zeroed — see the WIT-SEAM-02 report for the full field-by-field gap.
      stats: {
        trades: result.metrics.trades,
        netPnl: result.metrics.net_pnl,
        profitFactor: result.metrics.profit_factor,
        maxDrawdown: result.metrics.max_drawdown,
        winRate: result.metrics.win_rate,
        avgTrade: result.metrics.avg_trade,
        expectancyR: result.metrics.expectancy_r,
      },
      equity,
      // WIT v1 never returns trade-level data (trades_url is always null in v1) — parked as an
      // empty array rather than guessed.
      trades: [],
    })
    .select("id")
    .single();
  if (runError || !run) {
    await supabaseAdmin
      .from("backtest_jobs")
      .update({ status: "failed", error: runError?.message ?? "Could not save results." })
      .eq("id", job.id);
    return new Response("Could not save results", { status: 500 });
  }

  await supabaseAdmin
    .from("backtest_jobs")
    .update({ status: "done", run_id: run.id, error: null })
    .eq("id", job.id);

  console.log(`[wit-callback] run ${parsed.run_id} via callback`);
  return Response.json({ ok: true, runId: run.id });
});
