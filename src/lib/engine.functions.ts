import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitSchema = z.object({
  strategyId: z.string().uuid(),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  config: z.object({
    capital: z.number(),
    commission: z.number(),
    slippage: z.number(),
    defaultQuantity: z.number(),
    allowLong: z.boolean(),
    allowShort: z.boolean(),
  }),
  overrides: z.record(z.string(), z.string()),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type SubmitEngineResult = {
  jobId: string;
  engineVersion: string | null;
};

/** True when the engine URL and key are present, so the UI can explain what is missing. */
export const engineStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["BACKTEST_ENGINE_URL"] && process.env["BACKTEST_ENGINE_API_KEY"]),
}));

export const submitEngineBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }): Promise<SubmitEngineResult> => {
    const { SPEC_VERSION, compiledRules, submitToEngine } = await import("./engine.server");
    const supabase = context.supabase;

    const { data: strategy, error: strategyError } = await supabase
      .from("strategies")
      .select("id, name, definition")
      .eq("id", data.strategyId)
      .single();
    if (strategyError || !strategy) throw new Error("Strategy not found");

    const definition = (strategy.definition ?? {}) as never;
    const { rules, blockers } = compiledRules(definition, data.overrides);
    if (blockers.length > 0) {
      throw new Error(`The rules are not executable: ${blockers.join("; ")}`);
    }

    const { data: job, error: jobError } = await supabase
      .from("backtest_jobs")
      .insert({
        user_id: context.userId,
        strategy_id: data.strategyId,
        source: "engine",
        symbol: data.symbol,
        timeframe: data.timeframe,
        range_from: data.from ? new Date(`${data.from}T00:00:00Z`).toISOString() : null,
        range_to: data.to ? new Date(`${data.to}T23:59:59Z`).toISOString() : null,
        config: data.config as never,
        payload: { rules, specVersion: SPEC_VERSION } as never,
        spec_version: SPEC_VERSION,
        status: "queued",
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Could not queue the run.");

    const base = (process.env["PUBLIC_SITE_URL"] ?? getRequestUrl().origin).replace(/\/+$/, "");
    const callbackUrl = `${base}/api/public/backtest-callback`;

    try {
      const outcome = await submitToEngine({
        jobId: job.id,
        callbackUrl,
        specVersion: SPEC_VERSION,
        symbol: data.symbol,
        timeframe: data.timeframe,
        from: data.from ?? null,
        to: data.to ?? null,
        config: data.config,
        strategy: { id: strategy.id, name: strategy.name, rules, definition },
      });
      await supabase
        .from("backtest_jobs")
        .update({ status: "running", engine_version: outcome.engineVersion })
        .eq("id", job.id);
      return { jobId: job.id, engineVersion: outcome.engineVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from("backtest_jobs").update({ status: "failed", error: message }).eq("id", job.id);
      throw new Error(message);
    }
  });
