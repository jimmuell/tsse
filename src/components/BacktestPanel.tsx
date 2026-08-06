import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { compileStrategy } from "@/lib/backtest/compile";
import { engineDatasets, engineStatus, submitEngineBacktest } from "@/lib/engine.functions";
import { useBacktestJob } from "@/hooks/useBacktestJob";
import {
  RULE_FIELDS,
  applyOverrides,
  initialOverrides,
  overrideKeyOf,
  type RuleOverrides,
} from "@/lib/backtest/rules";
import {
  DEFAULT_CONFIG,
  type BacktestConfig,
  type EquityPoint,
  type ServerRunResult,
  type Trade,
} from "@/lib/backtest/types";
import type { StrategyDefinition } from "@/lib/strategy-schema";

/** Default audit window: start of 2025 through today (still editable). */
const DEFAULT_FROM = "2025-01-01";
const DEFAULT_TO = new Date().toISOString().slice(0, 10);

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-sm font-semibold ${
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}


export function BacktestPanel({
  strategyId,
  definition,
}: {
  strategyId: string;
  userId: string;
  definition: StrategyDefinition;
}) {
  const queryClient = useQueryClient();
  // The engine bakes ES/MES in v1 — the symbol is not user-selectable, and the run-screen
  // timeframe is the spec's chart.timeframe (carried in `overrides`), not a second field.
  const symbol = "ES";
  const [jobId, setJobId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string>("");
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [running, setRunning] = useState(false);
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [result, setResult] = useState<ServerRunResult | null>(null);
  const [overrides, setOverrides] = useState<RuleOverrides>(() =>
    initialOverrides(strategyId, definition),
  );

  const engineQuery = useQuery({
    queryKey: ["engine-status"],
    queryFn: () => engineStatus(),
    staleTime: 5 * 60 * 1000,
  });
  const engineReady = engineQuery.data?.configured ?? false;
  const { job, delivery } = useBacktestJob(jobId);

  function setRule(key: string, value: string) {
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(`tsse:rules:${strategyId}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function resetRules() {
    try {
      window.localStorage.removeItem(`tsse:rules:${strategyId}`);
    } catch {
      /* ignore */
    }
    setOverrides(initialOverrides(strategyId, { ...definition }));
  }

  /** One-click ORB/value-area verification setup used for full-history audit runs. */
  function applyVerificationDefaults() {
    const next: RuleOverrides = {
      "entry.long_entry": "close > vah",
      "entry.short_entry": "close < val",
      "stop_loss.stop_formula": "8",
      "profit_target.target_formula": "2 * risk",
      "position_sizing.sizing_formula": "",
      "exit.exit_conditions": "",
      "chart.timeframe": "5m",
      "setup.value_area_pct": "70",
    };
    setOverrides(next);
    try {
      window.localStorage.setItem(`tsse:rules:${strategyId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setConfig(DEFAULT_CONFIG);
    setFrom("2008-01-02");
    setTo(new Date().toISOString().slice(0, 10));
    toast.success("Verification defaults loaded.");
  }


  const compiled = useMemo(
    () => compileStrategy(applyOverrides(definition, overrides)),
    [definition, overrides],
  );
  const blockers = compiled.issues.filter((i) => i.level === "blocker");
  const warnings = compiled.issues.filter((i) => i.level === "warning");

  function resetAll() {
    setConfig(DEFAULT_CONFIG);
    setFrom(DEFAULT_FROM);
    setTo(DEFAULT_TO);
    resetRules();
    toast.success("Settings reset to defaults.");
  }

  const invertedRange = Boolean(from && to && from > to);

  const datasetsQuery = useQuery({
    queryKey: ["engine-datasets"],
    queryFn: () => engineDatasets(),
    staleTime: 5 * 60 * 1000,
  });
  const datasets = datasetsQuery.data ?? [];
  const selectedDataset = datasets.find((d) => d.id === datasetId) ?? null;

  useEffect(() => {
    if (datasetId || datasets.length === 0) return;
    const preferred = datasets.find((d) => d.economics_supported) ?? datasets[0];
    if (preferred) setDatasetId(preferred.id);
  }, [datasets.length]);

  /** Re-open an archived run in the results area below. */
  async function loadRun(runId: string) {
    const { data, error } = await supabase
      .from("backtest_runs")
      .select("id, dataset_name, stats, equity, trades, config, compiled")
      .eq("id", runId)
      .single();
    if (error || !data) {
      toast.error("Could not load that run.");
      return;
    }
    const cfg = (data.config ?? {}) as Record<string, unknown>;
    const meta = (data.compiled ?? {}) as Record<string, unknown>;
    const trades = (data.trades ?? []) as unknown as Trade[];
    setResult({
      stats: data.stats as never,
      equity: (data.equity ?? []) as unknown as EquityPoint[],
      trades,
      datasetName: data.dataset_name,
      barsUsed: typeof cfg["barsUsed"] === "number" ? (cfg["barsUsed"] as number) : null,
      barsTruncated: false,
      tradesTruncated: false,
      totalTrades: trades.length,
      issues: [],
      rangeStart: (meta["rangeStart"] as number | null) ?? null,
      rangeEnd: (meta["rangeEnd"] as number | null) ?? null,
    });
  }

  async function deleteRun(runId: string) {
    const { error } = await supabase.from("backtest_runs").delete().eq("id", runId);
    if (error) {
      toast.error("Could not delete that run.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["backtest-runs", strategyId] });
    toast.success("Run deleted.");
  }


  const runsQuery = useQuery({
    queryKey: ["backtest-runs", strategyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id, dataset_name, stats, created_at")
        .eq("strategy_id", strategyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  // Engine jobs finish asynchronously: the callback writes the run, we load it here.
  useEffect(() => {
    if (!job) return;
    if (job.status === "failed") {
      setRunning(false);
      setJobId(null);
      toast.error(job.error ?? "The engine could not complete that run.");
      return;
    }
    if (job.status !== "done" || !job.run_id) return;
    void (async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id, dataset_name, stats, equity, trades, config, compiled")
        .eq("id", job.run_id as string)
        .single();
      setRunning(false);
      setJobId(null);
      if (error || !data) {
        toast.error("The results were saved but could not be loaded.");
        return;
      }
      const cfg = (data.config ?? {}) as Record<string, unknown>;
      const meta = (data.compiled ?? {}) as Record<string, unknown>;
      const trades = (data.trades ?? []) as unknown as Trade[];
      setResult({
        stats: data.stats as never,
        equity: (data.equity ?? []) as unknown as EquityPoint[],
        trades,
        datasetName: data.dataset_name,
        barsUsed: typeof cfg["barsUsed"] === "number" ? (cfg["barsUsed"] as number) : null,
        barsTruncated: false,
        tradesTruncated: false,
        totalTrades: trades.length,
        issues: [],
        rangeStart: (meta["rangeStart"] as number | null) ?? null,
        rangeEnd: (meta["rangeEnd"] as number | null) ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["backtest-runs", strategyId] });
      toast.success(`Engine run complete (${delivery === "poll" ? "polled" : "live"})`);
    })();
  }, [job?.status, job?.run_id]);

  // A WIT audit has one source of truth: the engine. There is no local-backtester
  // fallback in the result path — see WIT-SEAM-02.
  async function run() {
    const timeframe = (overrides["chart.timeframe"] ?? "").trim();
    if (!timeframe) {
      toast.error("Set the chart timeframe first (1m or 5m).");
      return;
    }
    if (!from || !to) {
      toast.error("Set a from and to date first.");
      return;
    }
    if (invertedRange) {
      toast.error("From date is after To date.");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { jobId: id } = await submitEngineBacktest({
        data: {
          strategyId,
          symbol,
          timeframe,
          config,
          from,
          to,
          // The engine audits exactly what is on screen, not the saved copy.
          rules: overrides,
        },
      });
      setJobId(id);
      toast.success("Queued on the engine — results will appear here when it finishes.");

    } catch (err) {
      setRunning(false);
      toast.error(err instanceof Error ? err.message : "The engine could not accept that run.");
    }
  }

  const equityData = useMemo(
    () =>
      (result?.equity ?? []).map((p) => ({
        t: new Date(p.t).toISOString().slice(0, 10),
        equity: Math.round(p.equity * 100) / 100,
      })),
    [result],
  );

  return (
    <div className="space-y-6">
      {blockers.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-destructive" />
            This specification is not yet executable
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {blockers.map((issue, i) => (
              <li key={i} className="font-mono">
                {issue.section}.{issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          {warnings.map((issue, i) => (
            <li key={i} className="font-mono">
              {issue.section}.{issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Executable rules</p>
            <p className="text-xs text-muted-foreground">
              Expressions the engine runs. Bars: open, high, low, close, volume. Indicators: sma,
              ema, atr, rsi, highest, lowest. Prior-session volume profile: poc, vah, val. Also
              time (24h, e.g. 09:30), tick_size, entry_price, risk, balance, bars_in_trade. Use
              "long_x = …; short_x = …" for side-specific stops and targets.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button variant="ghost" size="sm" onClick={resetRules}>
              Reset to spec
            </Button>
            <Button variant="outline" size="sm" onClick={applyVerificationDefaults}>
              Load verification defaults
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {RULE_FIELDS.map((f) => {
            const k = overrideKeyOf(f);
            const issue = compiled.issues.find((i) => i.section === f.section && i.field === f.key);
            return (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{f.label}</Label>
                <Input
                  id={k}
                  className="font-mono text-xs"
                  value={overrides[k] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setRule(k, e.target.value)}
                />
                {issue ? (
                  <p
                    className={`text-[11px] ${
                      issue.level === "blocker" ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {issue.message}
                  </p>
                ) : null}
                {f.key === "exit_conditions" ? (
                  <p className="text-[11px] text-muted-foreground">
                    The engine exits on the stop, the target, or the end of available data. This
                    expression is recorded with the run but is not applied.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">What the engine actually applies</p>
          <p className="mt-1">
            The audit runs on ES/MES at a fixed <strong>1 contract</strong> per trade — position
            sizing, starting capital and long/short toggles are not applied. Commission, slippage,
            the date window, the chart timeframe and the executable rules above are honoured.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="dataset">Data set</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger id="dataset">
                <SelectValue
                  placeholder={
                    datasets.length ? "Select a data set" : "No data sets imported yet"
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.symbol} {d.timeframe} ·{" "}
                    {(d.bar_count ?? 0).toLocaleString()} bars
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* NOTE: the 2026-04-10 end date is hardcoded. It is only accurate because
                the price-data subscription has lapsed and the dataset is frozen.
                Replace with the engine-reported range when the datasets work lands. */}
            <p className="font-mono text-[11px] text-muted-foreground">
              Engine price history: ES — 2008-01-02 to 2026-04-10
            </p>


            {selectedDataset ? (
              <p className="text-[11px] text-muted-foreground">
                Imported set coverage (reference only, not used by the audit):{" "}
                {coverageFrom ?? "—"} → {coverageTo ?? "—"}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Import price history on the Data sets page to see its date range here.
              </p>
            )}
          </div>
          <div className="space-y-1.5">

            <Label htmlFor="timeframe">Chart timeframe</Label>
            <Input
              id="timeframe"
              value={overrides["chart.timeframe"] ?? ""}
              onChange={(e) => setRule("chart.timeframe", e.target.value)}
              placeholder="1m or 5m"
            />
            <p className="text-[11px] text-muted-foreground">
              Writes the spec&apos;s Chart timeframe. The engine accepts 1-minute or 5-minute only.
            </p>
          </div>
          {!engineReady ? (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-destructive">
                The engine is not connected yet — add its URL and service key in project settings.
              </p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="commission">Commission per side</Label>
            <Input
              id="commission"
              type="number"
              value={config.commission}
              onChange={(e) => setConfig({ ...config, commission: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slippage">Slippage per fill (price)</Label>
            <Input
              id="slippage"
              type="number"
              value={config.slippage}
              onChange={(e) => setConfig({ ...config, slippage: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">From date</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={invertedRange ? "border-destructive" : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To date</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={invertedRange ? "border-destructive" : undefined}
            />
          </div>
          {invertedRange && (
            <div className="sm:col-span-2 lg:col-span-3 -mt-1">
              <p className="text-xs text-destructive">From date is after To date.</p>
            </div>
          )}
        </div>


        <div className="mt-5 flex items-center gap-3">
          <Button
            onClick={() => void run()}
            disabled={running || !compiled.runnable || !engineReady}
            className="gap-1.5"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run backtest
          </Button>
          {running && jobId ? (
            <p className="text-xs text-muted-foreground">
              Engine is working on this run{job?.status ? ` (${job.status})` : ""} — the results
              land here automatically.
            </p>
          ) : null}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetAll}>
            <RotateCcw className="size-4" />
            Reset to defaults
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/datasets">
              <Database className="size-4" />
              Manage data
            </Link>
          </Button>
          {!compiled.runnable ? (
            <p className="text-xs text-muted-foreground">
              Fix the highlighted rules above to enable the run.
            </p>
          ) : null}
        </div>
      </div>

      {result ? (
        <>
          <p className="text-xs text-muted-foreground">
            {result.barsUsed !== null ? `${result.barsUsed.toLocaleString()} bars simulated` : ""}
            {result.rangeStart && result.rangeEnd
              ? `${result.barsUsed !== null ? " · " : ""}${new Date(result.rangeStart).toISOString().slice(0, 10)} → ${new Date(
                  result.rangeEnd,
                ).toISOString().slice(0, 10)}`
              : ""}
            {result.barsTruncated ? " · range capped at 1,000,000 bars — narrow the dates to test an earlier window" : ""}
            {result.tradesTruncated
              ? ` · showing first ${result.trades.length.toLocaleString()} of ${result.totalTrades.toLocaleString()} trades`
              : ""}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Net P&L"
              value={money(num(result.stats?.netPnl))}
              tone={num(result.stats?.netPnl) >= 0 ? "up" : "down"}
            />
            <Stat label="Return" value={`${num(result.stats?.returnPct).toFixed(2)}%`} />
            <Stat label="Trades" value={String(result.stats?.trades ?? result.trades.length)} />
            <Stat label="Win rate" value={`${num(result.stats?.winRate).toFixed(1)}%`} />
            <Stat
              label="Profit factor"
              value={
                result.stats?.profitFactor == null
                  ? "—"
                  : Number(result.stats.profitFactor).toFixed(2)
              }
            />
            <Stat label="Expectancy" value={money(num(result.stats?.expectancy))} />
            <Stat label="Avg win" value={money(num(result.stats?.avgWin))} />
            <Stat
              label="Max drawdown"
              value={`${money(num(result.stats?.maxDrawdown))} (${num(
                result.stats?.maxDrawdownPct,
              ).toFixed(1)}%)`}
              tone="down"
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">Equity curve</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 11 }} width={70} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Trades ({result.trades.length})
            </p>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.trades.map((t) => (
                    <TableRow key={t.index}>
                      <TableCell className="font-mono text-xs">{t.index}</TableCell>
                      <TableCell className="text-xs uppercase">{t.side}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {new Date(t.entryTime).toISOString().slice(0, 16).replace("T", " ")} @{" "}
                        {t.entryPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {new Date(t.exitTime).toISOString().slice(0, 16).replace("T", " ")} @{" "}
                        {t.exitPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.quantity}</TableCell>
                      <TableCell className="text-xs">{t.reason}</TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs ${
                          t.pnl >= 0 ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {money(t.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}

      {(runsQuery.data ?? []).length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Previous runs</p>
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/runs">Compare all runs</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {(runsQuery.data ?? []).map((r) => {
              const stats = r.stats as { netPnl?: number; trades?: number; winRate?: number };
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                  <span className="font-medium">{r.dataset_name}</span>
                  <span className="font-mono text-muted-foreground">
                    {stats.trades ?? 0} trades · {(stats.winRate ?? 0).toFixed(1)}% win ·{" "}
                    {money(stats.netPnl ?? 0)}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => void loadRun(r.id)}
                  >
                    Load
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Delete run"
                    onClick={() => void deleteRun(r.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

    </div>
  );
}
