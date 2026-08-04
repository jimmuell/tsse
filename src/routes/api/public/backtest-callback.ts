import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const TradeSchema = z.object({
  index: z.number().optional(),
  side: z.enum(["long", "short"]),
  entryTime: z.number(),
  entryPrice: z.number(),
  exitTime: z.number(),
  exitPrice: z.number(),
  quantity: z.number(),
  stopPrice: z.number().nullable().optional(),
  targetPrice: z.number().nullable().optional(),
  reason: z.string(),
  grossPnl: z.number().optional(),
  commission: z.number().optional(),
  pnl: z.number(),
  barsHeld: z.number().optional(),
});

const CallbackSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  engineVersion: z.string().optional(),
  error: z.string().optional(),
  datasetName: z.string().optional(),
  barsUsed: z.number().optional(),
  rangeStart: z.number().nullable().optional(),
  rangeEnd: z.number().nullable().optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  equity: z.array(z.object({ t: z.number(), equity: z.number() })).max(5000).optional(),
  trades: z.array(TradeSchema).max(5000).optional(),
});

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

export const Route = createFileRoute("/api/public/backtest-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BACKTEST_CALLBACK_SECRET"];
        if (!secret) return new Response("Callback not configured", { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("x-signature");
        const shared = request.headers.get("x-callback-secret");
        const signatureOk = signature
          ? timingSafeEqual(signature.replace(/^sha256=/, ""), await hmacHex(secret, raw))
          : false;
        const sharedOk = shared ? timingSafeEqual(shared, secret) : false;
        if (!signatureOk && !sharedOk) {
          console.warn("[backtest-callback] rejected an unsigned or mis-signed request");
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: job, error: jobError } = await supabaseAdmin
          .from("backtest_jobs")
          .select("id, user_id, strategy_id, symbol, timeframe, config, status")
          .eq("id", parsed.jobId)
          .single();
        if (jobError || !job) return new Response("Unknown job", { status: 404 });

        if (parsed.status === "failed") {
          await supabaseAdmin
            .from("backtest_jobs")
            .update({
              status: "failed",
              error: parsed.error ?? "The engine reported a failure.",
              engine_version: parsed.engineVersion ?? null,
            })
            .eq("id", job.id);
          console.log(`[backtest-callback] job ${job.id} failed`);
          return Response.json({ ok: true });
        }

        const { data: run, error: runError } = await supabaseAdmin
          .from("backtest_runs")
          .insert({
            user_id: job.user_id,
            strategy_id: job.strategy_id,
            dataset_name: parsed.datasetName ?? `${job.symbol} ${job.timeframe}`.trim(),
            config: {
              ...(job.config as Record<string, unknown>),
              barsUsed: parsed.barsUsed ?? null,
              engineVersion: parsed.engineVersion ?? null,
            } as never,
            compiled: {
              rangeStart: parsed.rangeStart ?? null,
              rangeEnd: parsed.rangeEnd ?? null,
            } as never,
            stats: (parsed.stats ?? {}) as never,
            equity: (parsed.equity ?? []) as never,
            trades: (parsed.trades ?? []) as never,
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
          .update({
            status: "done",
            run_id: run.id,
            engine_version: parsed.engineVersion ?? null,
            error: null,
          })
          .eq("id", job.id);

        console.log(`[backtest-callback] job ${job.id} stored as run ${run.id}`);
        return Response.json({ ok: true, runId: run.id });
      },
    },
  },
});
