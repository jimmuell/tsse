import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeDefinition } from "@/lib/strategy-schema";
import { applyOverrides } from "@/lib/backtest/rules";
import { compileWireConfig } from "./wit/wire-config";

const SubmitSchema = z.object({
  strategyId: z.string().uuid(),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  dataset: z.string().min(1),
  config: z.object({
    capital: z.number(),
    commission: z.number(),
    slippage: z.number(),
    defaultQuantity: z.number(),
    allowLong: z.boolean(),
    allowShort: z.boolean(),
  }),
  from: z.string().min(1),
  to: z.string().min(1),
  /** Current on-screen edits, keyed "section.key". The engine must audit what the user sees. */
  rules: z.record(z.string(), z.string()).optional(),
});


export type SubmitEngineResult = {
  jobId: string;
};

/** True when the engine URL and WIT service key are present, so the UI can explain what is missing. */
export const engineStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["ENGINE_URL"] && process.env["WIT_ENGINE_SERVICE_KEY"]),
}));

/** The engine's own dataset catalog — the run screen must never hand-type or cache a list. */
export const engineDatasets = createServerFn({ method: "GET" }).handler(async () => {
  const { listEngineDatasets } = await import("./engine.server");
  return listEngineDatasets();
});


export const submitEngineBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }): Promise<SubmitEngineResult> => {
    const { submitToEngine } = await import("./engine.server");
    const supabase = context.supabase;

    const { data: strategy, error: strategyError } = await supabase
      .from("strategies")
      .select("id, definition")
      .eq("id", data.strategyId)
      .single();
    if (strategyError || !strategy) throw new Error("Strategy not found");
    // The run screen's rule edits are the audited spec — apply them before compiling the
    // wire config so the engine never runs a stale saved copy.
    const definition = data.rules
      ? applyOverrides(normalizeDefinition(strategy.definition), data.rules)
      : normalizeDefinition(strategy.definition);

    const { config: wireConfig, blockers } = compileWireConfig({
      from: data.from,
      to: data.to,
      config: { commission: data.config.commission, slippage: data.config.slippage },
      definition,
    });
    if (blockers.length > 0 || !wireConfig) {
      throw new Error(
        `Not ready for the engine yet: ${blockers.map((b) => `${b.field} — ${b.message}`).join("; ")}`,
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("backtest_jobs")
      .insert({
        user_id: context.userId,
        strategy_id: data.strategyId,
        source: "engine",
        symbol: data.symbol,
        timeframe: data.timeframe,
        range_from: new Date(`${data.from}T00:00:00Z`).toISOString(),
        range_to: new Date(`${data.to}T23:59:59Z`).toISOString(),
        config: data.config as never,
        payload: { wireConfig } as never,
        status: "queued",
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Could not queue the run.");

    // The engine refuses any callback host that isn't *.supabase.co (SSRF guard) and won't
    // follow redirects, so this must be the Supabase functions domain, never the app origin.
    const supabaseUrl = process.env["SUPABASE_URL"];
    if (!supabaseUrl) {
      throw new Error(
        "SUPABASE_URL is not configured — the engine callback needs a *.supabase.co host.",
      );
    }
    const callbackUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/backtest-callback`;

    try {
      const outcome = await submitToEngine({
        evaluation_id: job.id,
        kind: "backtest",
        callback_url: callbackUrl,
        config: wireConfig,
        budget: { max_wall_seconds: 600 },
      });
      await supabase
        .from("backtest_jobs")
        .update({ status: "running", engine_run_id: outcome.runId })
        .eq("id", job.id);
      return { jobId: job.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from("backtest_jobs")
        .update({ status: "failed", error: message })
        .eq("id", job.id);
      throw new Error(message);
    }
  });
