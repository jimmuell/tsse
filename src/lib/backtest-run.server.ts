import type { SupabaseClient } from "@supabase/supabase-js";
import { compileStrategy } from "./backtest/compile";
import { runBacktest } from "./backtest/engine";
import { applyOverrides, type RuleOverrides } from "./backtest/rules";
import type {
  Bar,
  BacktestConfig,
  EquityPoint,
  ServerRunResult,
  Trade,
} from "./backtest/types";
import type { StrategyDefinition } from "./strategy-schema";

/** Worker memory ceiling: a run loads bars into memory, so cap how many we pull. */
export const MAX_RUN_BARS = 1_000_000;
const PAGE = 100_000;
const MAX_EQUITY_POINTS = 2_000;
const MAX_TRADES_RETURNED = 2_000;

export type RunInput = {
  strategyId: string;
  datasetId: string;
  config: BacktestConfig;
  overrides: RuleOverrides;
  from?: string | undefined;
  to?: string | undefined;
};

function downsample(points: EquityPoint[], max: number): EquityPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: EquityPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i] as EquityPoint);
  const last = points[points.length - 1] as EquityPoint;
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

async function loadRowBars(
  supabase: SupabaseClient,
  datasetId: string,
  fromMs: number | null,
  toMs: number | null,
): Promise<{ bars: Bar[]; truncated: boolean }> {
  const bars: Bar[] = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    let query = supabase
      .from("dataset_bars")
      .select("t,o,h,l,c,v")
      .eq("dataset_id", datasetId)
      .order("t", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (fromMs !== null) query = query.gte("t", fromMs);
    if (toMs !== null) query = query.lte("t", toMs);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Bar[];
    for (const r of rows) bars.push({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 });
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (bars.length >= MAX_RUN_BARS) {
      truncated = true;
      break;
    }
  }
  return { bars: bars.slice(0, MAX_RUN_BARS), truncated };
}

/** Loads a data set's bars (row-stored or legacy inline), runs the engine, saves the run. */
export async function executeBacktest(
  supabase: SupabaseClient,
  userId: string,
  input: RunInput,
): Promise<ServerRunResult> {
  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .select("id, definition")
    .eq("id", input.strategyId)
    .single();
  if (strategyError || !strategy) throw new Error("Strategy not found");

  const compiled = compileStrategy(
    applyOverrides((strategy.definition ?? {}) as StrategyDefinition, input.overrides),
  );
  const blockers = compiled.issues.filter((i) => i.level === "blocker");
  if (!compiled.runnable) {
    throw new Error(
      `The rules are not executable: ${blockers.map((b) => `${b.field} — ${b.message}`).join("; ")}`,
    );
  }

  const { data: dataset, error: datasetError } = await supabase
    .from("datasets")
    .select("id, name, storage, bar_count, bars")
    .eq("id", input.datasetId)
    .single();
  if (datasetError || !dataset) throw new Error("Data set not found");

  const fromMs = input.from ? Date.parse(input.from) : NaN;
  const toMs = input.to ? Date.parse(`${input.to}T23:59:59Z`) : NaN;
  const lo = Number.isNaN(fromMs) ? null : fromMs;
  const hi = Number.isNaN(toMs) ? null : toMs;

  let bars: Bar[];
  let barsTruncated = false;
  if ((dataset as { storage?: string }).storage === "rows") {
    const loaded = await loadRowBars(supabase, input.datasetId, lo, hi);
    bars = loaded.bars;
    barsTruncated = loaded.truncated;
  } else {
    const inline = ((dataset as { bars?: unknown }).bars ?? []) as Bar[];
    bars = inline.filter((b) => (lo === null || b.t >= lo) && (hi === null || b.t <= hi));
  }

  if (bars.length < 2) throw new Error("That data set has no usable bars in the selected range.");

  const outcome = runBacktest(bars, compiled, input.config);
  const equity = downsample(outcome.equity, MAX_EQUITY_POINTS);
  const trades: Trade[] = outcome.trades.slice(0, MAX_TRADES_RETURNED);

  const { error: insertError } = await supabase.from("backtest_runs").insert({
    user_id: userId,
    strategy_id: input.strategyId,
    dataset_id: input.datasetId,
    dataset_name: (dataset as { name: string }).name,
    config: { ...input.config, from: input.from ?? null, to: input.to ?? null, barsUsed: bars.length },
    compiled: { issues: compiled.issues },
    stats: outcome.stats,
    trades,
    equity,
  } as never);
  if (insertError) throw new Error(insertError.message);

  return {
    stats: outcome.stats,
    equity,
    trades,
    datasetName: (dataset as { name: string }).name,
    barsUsed: bars.length,
    barsTruncated,
    tradesTruncated: outcome.trades.length > trades.length,
    totalTrades: outcome.trades.length,
    issues: compiled.issues,
    rangeStart: bars[0]?.t ?? null,
    rangeEnd: bars[bars.length - 1]?.t ?? null,
  };
}
