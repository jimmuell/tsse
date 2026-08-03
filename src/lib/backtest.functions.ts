import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ServerRunResult } from "./backtest/types";

const RunInputSchema = z.object({
  strategyId: z.string().uuid(),
  datasetId: z.string().uuid(),
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

export const runBacktestOnServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ServerRunResult> => {
    const { executeBacktest } = await import("./backtest-run.server");
    return executeBacktest(context.supabase as never, context.userId, data);
  });
