import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Columns2, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { BacktestStats, EquityPoint } from "@/lib/backtest/types";

export const Route = createFileRoute("/runs/")({
  head: () => ({
    meta: [
      { title: "Backtest run history — TSSE" },
      {
        name: "description",
        content:
          "Review, compare and delete saved backtest runs across every strategy specification, with side-by-side stats and overlaid equity curves.",
      },
      { property: "og:title", content: "Backtest run history — TSSE" },
      {
        property: "og:description",
        content: "Compare saved backtest runs side by side and keep your history tidy.",
      },
    ],
  }),
  component: RunsPage,
});

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

const MAX_COMPARE = 4;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type RunRow = {
  id: string;
  strategy_id: string;
  dataset_name: string;
  created_at: string;
  stats: Partial<BacktestStats> | null;
  config: unknown;
  compiled: unknown;
  strategies: { name: string } | null;
};


function RunsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);
  // The list intentionally omits the heavy `equity` JSON column: 200 runs of
  // curve points is megabytes of payload and was making this page take seconds.
  const runsQuery = useQuery({
    queryKey: ["all-backtest-runs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id, strategy_id, dataset_name, created_at, stats, config, compiled, strategies(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as RunRow[];
    },
  });

  const runs = runsQuery.data ?? [];

  const compared = runs.filter((r) => selected.includes(r.id)).slice(0, MAX_COMPARE);
  const comparedIds = compared.map((r) => r.id);

  // Equity curves are only needed once the user actually opens the comparison,
  // and only for the handful of runs they ticked.
  const equityQuery = useQuery({
    queryKey: ["backtest-run-equity", [...comparedIds].sort()],
    enabled: showCompare && comparedIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id, equity")
        .in("id", comparedIds);
      if (error) throw error;
      const map = new Map<string, EquityPoint[]>();
      for (const row of data ?? []) {
        map.set(row.id, (row.equity ?? []) as unknown as EquityPoint[]);
      }
      return map;
    },
  });



  function toggle(id: string) {
    setShowCompare(false);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? (toast.error(`Compare up to ${MAX_COMPARE} runs at a time.`), prev)
          : [...prev, id],
    );
  }

  async function deleteSelected() {
    setDeleting(true);
    try {
      const { error } = await supabase.from("backtest_runs").delete().in("id", selected);
      if (error) throw error;
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["all-backtest-runs", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["backtest-runs"] });
      toast.success("Runs deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete those runs.");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  /** Merge each compared run's equity into one time-keyed series set. */
  const equityById = equityQuery.data;
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    compared.forEach((run, i) => {
      const key = `run${i}`;
      for (const point of equityById?.get(run.id) ?? []) {
        const date = new Date(point.t).toISOString().slice(0, 10);
        const row = byDate.get(date) ?? { t: date };
        row[key] = Math.round(point.equity * 100) / 100;
        byDate.set(date, row);
      }
    });
    return [...byDate.values()].sort((a, b) => String(a["t"]).localeCompare(String(b["t"])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityById, comparedIds.join(",")]);


  const metrics: { label: string; value: (s: Partial<BacktestStats>) => string }[] = [
    { label: "Net P&L", value: (s) => money(num(s.netPnl)) },
    { label: "Return", value: (s) => `${num(s.returnPct).toFixed(2)}%` },
    { label: "Trades", value: (s) => String(s.trades ?? 0) },
    { label: "Win rate", value: (s) => `${num(s.winRate).toFixed(1)}%` },
    {
      label: "Profit factor",
      value: (s) => (s.profitFactor == null ? "—" : Number(s.profitFactor).toFixed(2)),
    },
    { label: "Expectancy", value: (s) => money(num(s.expectancy)) },
    { label: "Avg win", value: (s) => money(num(s.avgWin)) },
    { label: "Avg loss", value: (s) => money(num(s.avgLoss)) },
    {
      label: "Max drawdown",
      value: (s) => `${money(num(s.maxDrawdown))} (${num(s.maxDrawdownPct).toFixed(1)}%)`,
    },
  ];

  const backtestStrategyId =
    runs.find((r) => selected.includes(r.id))?.strategy_id ?? runs[0]?.strategy_id ?? null;

  return (
    <AppShell email={user?.email ?? null}>
      {backtestStrategyId ? (
        <Button variant="ghost" size="sm" className="-ml-2 mb-3 gap-1.5" asChild>
          <Link to="/strategies/$id" params={{ id: backtestStrategyId }}>
            <ArrowLeft className="size-4" />
            Back to backtest
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Run history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every saved backtest across your specifications. Tick up to {MAX_COMPARE} runs to
            compare them side by side.
          </p>
        </div>
        {selected.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={selected.length < 2}
              onClick={() => setShowCompare(true)}
            >
              <Columns2 className="size-4" />
              Compare {selected.length}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete {selected.length}
            </Button>
          </div>
        ) : null}
      </div>

      {runsQuery.isLoading ? (
        <Skeleton className="mt-8 h-64 rounded-md" />
      ) : runs.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border bg-card p-12 text-center">
          <History className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No runs saved yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run a backtest from a strategy&apos;s Backtest tab and it will be archived here.
          </p>
        </div>
      ) : (
        <>
          {showCompare && compared.length >= 2 ? (
            <div className="mt-8 space-y-4">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1.5"
                onClick={() => setShowCompare(false)}
              >
                <ArrowLeft className="size-4" />
                Back to runs
              </Button>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-3 text-sm font-medium">Equity curves</p>
                <div className="h-64">
                  {equityQuery.isPending ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">

                    <LineChart data={chartData}>
                      <CartesianGrid strokeOpacity={0.15} vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 11 }} width={70} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Legend />
                      {compared.map((run, i) => (
                        <Line
                          key={run.id}
                          type="monotone"
                          dataKey={`run${i}`}
                          name={`${run.strategies?.name ?? "Strategy"} · ${new Date(
                            run.created_at,
                          ).toLocaleDateString()}`}
                          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  )}

                </div>
              </div>

              <div className="overflow-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      {compared.map((run, i) => (
                        <TableHead key={run.id} className="text-right">
                          <span
                            className="mr-1 inline-block size-2 rounded-full align-middle"
                            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                          />
                          {run.strategies?.name ?? "Strategy"}
                          <span className="block font-normal text-muted-foreground">
                            {new Date(run.created_at).toLocaleString()}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((m) => (
                      <TableRow key={m.label}>
                        <TableCell className="text-xs font-medium">{m.label}</TableCell>
                        {compared.map((run) => (
                          <TableCell key={run.id} className="text-right font-mono text-xs">
                            {m.value(run.stats ?? {})}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <RunSettingsPanel
                runs={compared.map((run) => ({
                  id: run.id,
                  dataset_name: run.dataset_name,
                  created_at: run.created_at,
                  config: run.config,
                  compiled: run.compiled,
                  label: `${run.strategies?.name ?? "Strategy"} · ${new Date(
                    run.created_at,
                  ).toLocaleString()}`,
                }))}
              />
            </div>
          ) : null}

          <div className="mt-8 overflow-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Strategy</TableHead>
                  <TableHead>Data set</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                  <TableHead className="text-right">Max DD</TableHead>
                  <TableHead>Run at</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const stats = run.stats ?? {};
                  return (
                    <TableRow key={run.id} data-state={selected.includes(run.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(run.id)}
                          onCheckedChange={() => toggle(run.id)}
                          aria-label="Compare this run"
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        <Link
                          to="/strategies/$id"
                          params={{ id: run.strategy_id }}
                          className="underline-offset-4 hover:underline"
                        >
                          {run.strategies?.name ?? "Strategy"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {run.dataset_name || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {stats.trades ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {num(stats.winRate).toFixed(1)}%
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs ${
                          num(stats.netPnl) >= 0 ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {money(num(stats.netPnl))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {num(stats.maxDrawdownPct).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete run"
                          onClick={() => {
                            setSelected([run.id]);
                            setConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.length} run{selected.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The stored stats, equity curve and trade list for the selected runs are removed
              permanently. Your specifications and data sets are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void deleteSelected()}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>
    </AppShell>
  );
}
