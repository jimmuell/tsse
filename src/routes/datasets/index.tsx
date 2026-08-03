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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv } from "@/lib/backtest/csv";

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

/** jsonb payload guard — keeps the most recent slice of very large intraday files. */
const MAX_BARS = 200_000;

/** Reading a multi-GB file whole fails in the browser; only the tail is ever kept anyway. */
const MAX_READ_BYTES = 48 * 1024 * 1024;

/**
 * Reads a file as text. Huge files are read as a head chunk (to keep any header row)
 * plus the most recent tail bytes, avoiding browser "file could not be read" failures.
 */
async function readImportText(file: File): Promise<string> {
  async function slice(blob: Blob): Promise<string> {
    try {
      return await blob.text();
    } catch {
      throw new Error(
        "The browser could not read that file. It may have moved, or it is too large to open — try re-selecting it, or split it into a smaller file.",
      );
    }
  }

  if (file.size <= MAX_READ_BYTES) return slice(file);

  const headText = await slice(file.slice(0, 64 * 1024));
  const firstLine = headText.split(/\r?\n/, 1)[0] ?? "";
  const hasHeader = /[a-z]{2,}/i.test(firstLine.replace(/[^\x20-\x7e]/g, ""));

  const tailText = await slice(file.slice(file.size - MAX_READ_BYTES));
  // Drop the first (likely partial) line of the tail chunk.
  const tailBody = tailText.slice(tailText.indexOf("\n") + 1);
  return hasHeader ? `${firstLine}\n${tailBody}` : tailBody;
}

function formatDate(value: string | null): string {

  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}


function DatasetsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);


  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, name, symbol, timeframe, bar_count, start_at, end_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleFile(file: File) {
    if (!user) return;
    setUploading(true);
    setReport(null);
    try {
      const text = await readImportText(file);
      const parsed = parseCsv(text);
      const { errors, skipped, rowErrors, layout } = parsed;
      let bars = parsed.bars;
      if (bars.length === 0) {
        setReport({
          fileName: file.name,
          imported: 0,
          skipped,
          rowErrors,
          layout,
          fatal: errors[0] ?? "No usable rows found in that file.",
        });
        toast.error(errors[0] ?? "No usable rows found in that file.");
        return;
      }
      let trimmed = 0;
      if (bars.length > MAX_BARS) {
        trimmed = bars.length - MAX_BARS;
        bars = bars.slice(-MAX_BARS);
      }

      // Very large intraday files can exceed the request payload limit; retry with
      // progressively smaller (most recent) slices before giving up.
      let lastError: string | null = null;
      let inserted = 0;
      for (const size of [bars.length, 100_000, 50_000, 25_000]) {
        if (size > bars.length) continue;
        const slice = bars.slice(-size);
        const { error } = await supabase.from("datasets").insert({
          user_id: user.id,
          name: file.name.replace(/\.(csv|txt)$/i, ""),
          symbol: symbol.trim() || "—",
          timeframe: timeframe.trim() || "—",
          bars: slice as unknown as never,
          bar_count: slice.length,
          start_at: new Date(slice[0]!.t).toISOString(),
          end_at: new Date(slice[slice.length - 1]!.t).toISOString(),
        });
        if (!error) {
          trimmed += bars.length - slice.length;
          inserted = slice.length;
          break;
        }
        lastError = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
      }
      if (inserted === 0) throw new Error(lastError ?? "Could not save that data set.");

      setReport({ fileName: file.name, imported: inserted, skipped, rowErrors, layout });
      toast.success(
        `Imported ${inserted.toLocaleString()} bars${skipped ? ` (${skipped} rows skipped)` : ""}${
          trimmed ? ` — kept the most recent ${inserted.toLocaleString()}, dropped ${trimmed.toLocaleString()} older bars` : ""
        }`,
      );
      setSymbol("");
      setTimeframe("");
      await queryClient.invalidateQueries({ queryKey: ["datasets"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReport((prev) => ({
        fileName: file.name,
        imported: 0,
        skipped: prev?.skipped ?? 0,
        rowErrors: prev?.rowErrors ?? [],
        layout: prev?.layout ?? null,
        fatal: message || "Could not import that file.",
      }));
      toast.error(message || "Could not import that file.");

    } finally {
      setUploading(false);
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
          (date,time,o,h,l,c,v) from Kinetick / FirstRate work as-is. Very large intraday files keep
          the most recent {MAX_BARS.toLocaleString()} bars.
        </p>

        {report ? <ImportErrorPanel report={report} onDismiss={() => setReport(null)} /> : null}



        {uploading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Importing…
          </p>
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
