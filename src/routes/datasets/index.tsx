import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ImportErrorPanel, type ImportReport } from "@/components/ImportErrorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv, type CsvLayout, type CsvRowError } from "@/lib/backtest/csv";
import type { Bar } from "@/lib/backtest/types";

export const Route = createFileRoute("/datasets/")({
  head: () => ({
    meta: [
      { title: "Market data sets — TSSE" },
      {
        name: "description",
        content:
          "Upload and manage OHLCV price data sets used to backtest your deterministic trading strategy specifications.",
      },
      { property: "og:title", content: "Market data sets — TSSE" },
      {
        property: "og:description",
        content: "Upload CSV price history and reuse it across strategy backtests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DatasetsPage,
});

/** Bytes read from the file per pass — small enough for any browser, big enough to be fast. */
const READ_CHUNK = 8 * 1024 * 1024;
/** Bars sent to the database per request. */
const INSERT_BATCH = 20_000;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

function looksLikeHeader(line: string): boolean {
  const cells = line.split(/[,;\t|]/);
  const numeric = cells.filter((c) => c.trim() !== "" && Number.isFinite(Number(c))).length;
  return numeric < 4;
}

type Progress = { bytes: number; total: number; rows: number } | null;

function DatasetsPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Data sets are admin-curated: a non-admin typing the URL is sent home.
  useEffect(() => {
    if (!loading && user && !roleLoading && !isAdmin) navigate({ to: "/" });
  }, [loading, user, roleLoading, isAdmin, navigate]);

  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, name, symbol, timeframe, bar_count, start_at, end_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (!roleLoading && user && !isAdmin) {
    return (
      <AppShell email={user.email ?? null}>
        <p className="text-sm text-muted-foreground">
          Data sets are managed by an administrator.
        </p>
      </AppShell>
    );
  }


  /**
   * Reads the file in slices, parses each slice, and streams bars into the
   * dataset_bars table in batches — so a multi-gigabyte export imports in full.
   */
  async function handleFile(file: File) {
    if (!user) return;
    setUploading(true);
    setReport(null);
    setProgress({ bytes: 0, total: file.size, rows: 0 });

    const name = file.name.replace(/\.(csv|txt)$/i, "");
    let datasetId: string | null = null;
    let imported = 0;
    let skipped = 0;
    let firstT: number | null = null;
    let lastT: number | null = null;
    let layout: CsvLayout | null = null;
    const rowErrors: CsvRowError[] = [];

    try {
      const { data: created, error: createError } = await supabase
        .from("datasets")
        .insert({
          user_id: user.id,
          name,
          symbol: symbol.trim() || "—",
          timeframe: timeframe.trim() || "—",
          storage: "rows",
          bars: [] as unknown as never,
          bar_count: 0,
        })
        .select("id")
        .single();
      if (createError || !created) throw new Error(createError?.message ?? "Could not create the data set.");
      datasetId = created.id;

      let offset = 0;
      let leftover = "";
      let header: string | null = null;
      let buffer: Bar[] = [];

      const flush = async (force: boolean) => {
        if (buffer.length === 0 || (!force && buffer.length < INSERT_BATCH)) return;
        const rows = buffer.map((b) => ({ dataset_id: datasetId as string, ...b }));
        buffer = [];
        const { error } = await supabase
          .from("dataset_bars")
          .upsert(rows, { onConflict: "dataset_id,t", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        imported += rows.length;
        setProgress((p) => (p ? { ...p, rows: imported } : p));
      };

      while (offset < file.size) {
        const end = Math.min(offset + READ_CHUNK, file.size);
        let text: string;
        try {
          text = await file.slice(offset, end).text();
        } catch {
          throw new Error(
            "The browser could not read that file — it may have moved or been changed while importing.",
          );
        }
        offset = end;

        let body = leftover + text;
        if (offset < file.size) {
          const cut = body.lastIndexOf("\n");
          leftover = cut >= 0 ? body.slice(cut + 1) : body;
          body = cut >= 0 ? body.slice(0, cut) : "";
        } else {
          leftover = "";
        }
        if (!body.trim()) {
          setProgress((p) => (p ? { ...p, bytes: offset } : p));
          continue;
        }

        if (header === null) {
          const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
          header = looksLikeHeader(firstLine) ? firstLine : "";
        } else if (header) {
          body = `${header}\n${body}`;
        }

        const parsed = parseCsv(body);
        if (!layout) layout = parsed.layout;
        skipped += parsed.skipped;
        for (const e of parsed.rowErrors) if (rowErrors.length < 10) rowErrors.push(e);

        for (const bar of parsed.bars) {
          if (firstT === null || bar.t < firstT) firstT = bar.t;
          if (lastT === null || bar.t > lastT) lastT = bar.t;
          buffer.push(bar);
        }
        await flush(false);
        setProgress((p) => (p ? { ...p, bytes: offset } : p));
      }

      if (leftover.trim()) {
        const parsed = parseCsv(header ? `${header}\n${leftover}` : leftover);
        for (const bar of parsed.bars) buffer.push(bar);
      }
      await flush(true);

      if (imported === 0) {
        await supabase.from("datasets").delete().eq("id", datasetId);
        datasetId = null;
        setReport({
          fileName: file.name,
          imported: 0,
          skipped,
          rowErrors,
          layout,
          fatal: "No usable rows found in that file.",
        });
        toast.error("No usable rows found in that file.");
        return;
      }

      await supabase
        .from("datasets")
        .update({
          bar_count: imported,
          start_at: firstT === null ? null : new Date(firstT).toISOString(),
          end_at: lastT === null ? null : new Date(lastT).toISOString(),
        })
        .eq("id", datasetId);

      setReport({ fileName: file.name, imported, skipped, rowErrors, layout });
      toast.success(
        `Imported ${imported.toLocaleString()} bars${skipped ? ` (${skipped.toLocaleString()} rows skipped)` : ""}`,
      );
      setSymbol("");
      setTimeframe("");
      await queryClient.invalidateQueries({ queryKey: ["datasets"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (datasetId && imported === 0) await supabase.from("datasets").delete().eq("id", datasetId);
      else if (datasetId) await queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setReport({
        fileName: file.name,
        imported,
        skipped,
        rowErrors,
        layout,
        fatal: message || "Could not import that file.",
      });
      toast.error(message || "Could not import that file.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("datasets").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["datasets"] });
  }

  return (
    <AppShell email={user?.email ?? null}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market data sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload OHLCV CSV files to backtest your specifications against your own history.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              placeholder="ES, AAPL, BTCUSD…"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeframe">Timeframe</Label>
            <Input
              id="timeframe"
              placeholder="5m, 1h, 1D…"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv">CSV / TXT file</Label>
            <input
              ref={fileInputRef}
              id="csv"
              type="file"
              className="sr-only"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start font-normal"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" /> Choose file…
            </Button>
          </div>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`mt-4 rounded-md border border-dashed p-6 text-center text-sm ${
            dragging ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          Drag a data file here, or use “Choose file…” above.
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          date/time, open, high, low, close, volume — header row optional. Headerless exports
          (date,time,o,h,l,c,v) from Kinetick / FirstRate work as-is. Files are streamed in full, so
          multi-million-bar histories import completely.
        </p>

        {report ? <ImportErrorPanel report={report} onDismiss={() => setReport(null)} /> : null}

        {uploading ? (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Importing… {progress ? `${progress.rows.toLocaleString()} bars saved` : ""}
            </p>
            <Progress
              value={progress && progress.total > 0 ? (progress.bytes / progress.total) * 100 : 0}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-8 space-y-2">
        {datasetsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (datasetsQuery.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-10 text-center">
            <Upload className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No data sets yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Import a CSV above to run your first backtest.
            </p>
          </div>
        ) : (
          (datasetsQuery.data ?? []).map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card px-4 py-3"
            >
              <Database className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {d.symbol} · {d.timeframe} · {d.bar_count.toLocaleString()} bars ·{" "}
                  {formatDate(d.start_at)} → {formatDate(d.end_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${d.name}`}
                onClick={() => void remove(d.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
