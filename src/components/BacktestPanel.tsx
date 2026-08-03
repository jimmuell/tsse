import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Loader2, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { compileStrategy } from "@/lib/backtest/compile";
import { runBacktestOnServer } from "@/lib/backtest.functions";
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
  type ServerRunResult,
} from "@/lib/backtest/types";
import type { StrategyDefinition } from "@/lib/strategy-schema";

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
  const [datasetId, setDatasetId] = useState<string>("");
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [running, setRunning] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<ServerRunResult | null>(null);
  const [overrides, setOverrides] = useState<RuleOverrides>(() =>
    initialOverrides(strategyId, definition),
  );

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

  const compiled = useMemo(
    () => compileStrategy(applyOverrides(definition, overrides)),
    [definition, overrides],
  );
  const blockers = compiled.issues.filter((i) => i.level === "blocker");
  const warnings = compiled.issues.filter((i) => i.level === "warning");

  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, name, symbol, timeframe, bar_count")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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

  async function run() {
    if (!datasetId) {
      toast.error("Choose a data set first.");
      return;
    }
    setRunning(true);
    try {
      const outcome = await runBacktestOnServer({
        data: {
          strategyId,
          datasetId,
          config,
          overrides,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      setResult(outcome);
      await queryClient.invalidateQueries({ queryKey: ["backtest-runs", strategyId] });
      toast.success(
        `${outcome.stats.trades} trades over ${outcome.barsUsed.toLocaleString()} bars`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The backtest could not be run.");
    } finally {
      setRunning(false);
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
          <Button variant="ghost" size="sm" onClick={resetRules}>
            Reset to spec
          </Button>
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
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label>Data set</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose price data" />
              </SelectTrigger>
              <SelectContent>
                {(datasetsQuery.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.symbol} {d.timeframe} ({d.bar_count.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(datasetsQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                <Link to="/datasets" className="underline">
                  Upload a CSV data set
                </Link>{" "}
                to get started.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capital">Starting capital</Label>
            <Input
              id="capital"
              type="number"
              value={config.capital}
              onChange={(e) => setConfig({ ...config, capital: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Default quantity</Label>
            <Input
              id="qty"
              type="number"
              value={config.defaultQuantity}
              onChange={(e) =>
                setConfig({ ...config, defaultQuantity: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission">Commission per unit</Label>
            <Input
              id="commission"
              type="number"
              value={config.commission}
              onChange={(e) => setConfig({ ...config, commission: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slippage">Slippage per fill</Label>
            <Input
              id="slippage"
              type="number"
              value={config.slippage}
              onChange={(e) => setConfig({ ...config, slippage: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">From date (optional)</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To date (optional)</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="long"
                checked={config.allowLong}
                onCheckedChange={(v) => setConfig({ ...config, allowLong: v })}
              />
              <Label htmlFor="long">Long</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="short"
                checked={config.allowShort}
                onCheckedChange={(v) => setConfig({ ...config, allowShort: v })}
              />
              <Label htmlFor="short">Short</Label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void run()} disabled={running || !compiled.runnable} className="gap-1.5">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run backtest
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Net P&L"
              value={money(result.stats.netPnl)}
              tone={result.stats.netPnl >= 0 ? "up" : "down"}
            />
            <Stat label="Return" value={`${result.stats.returnPct.toFixed(2)}%`} />
            <Stat label="Trades" value={String(result.stats.trades)} />
            <Stat label="Win rate" value={`${result.stats.winRate.toFixed(1)}%`} />
            <Stat
              label="Profit factor"
              value={result.stats.profitFactor === null ? "—" : result.stats.profitFactor.toFixed(2)}
            />
            <Stat label="Expectancy" value={money(result.stats.expectancy)} />
            <Stat label="Avg win" value={money(result.stats.avgWin)} />
            <Stat
              label="Max drawdown"
              value={`${money(result.stats.maxDrawdown)} (${result.stats.maxDrawdownPct.toFixed(1)}%)`}
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
          <p className="border-b border-border px-4 py-3 text-sm font-medium">Previous runs</p>
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
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
