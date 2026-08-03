import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CsvLayout, CsvRowError } from "@/lib/backtest/csv";

export type ImportReport = {
  fileName: string;
  imported: number;
  skipped: number;
  rowErrors: CsvRowError[];
  layout: CsvLayout | null;
  fatal?: string;
};

function delimiterLabel(d: string): string {
  if (d === "\t") return "tab";
  if (d === ",") return "comma";
  if (d === ";") return "semicolon";
  if (d === "|") return "pipe";
  return d;
}

function col(index: number): string {
  return index >= 0 ? `#${index + 1}` : "none";
}

/** Detailed diagnostics for a price-data import: layout detected plus the first skipped rows. */
export function ImportErrorPanel({
  report,
  onDismiss,
}: {
  report: ImportReport;
  onDismiss: () => void;
}) {
  const { layout, rowErrors } = report;
  return (
    <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Import report — {report.fileName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.fatal
              ? report.fatal
              : `${report.imported.toLocaleString()} rows imported, ${report.skipped.toLocaleString()} skipped.`}
          </p>

          {layout ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              delimiter: {delimiterLabel(layout.delimiter)} · header row:{" "}
              {layout.headerless ? "none detected" : "detected"} · date {col(layout.columns.time)}
              {layout.columns.timeOnly >= 0 ? ` · time ${col(layout.columns.timeOnly)}` : ""} · open{" "}
              {col(layout.columns.open)} · high {col(layout.columns.high)} · low{" "}
              {col(layout.columns.low)} · close {col(layout.columns.close)} · volume{" "}
              {col(layout.columns.volume)}
            </p>
          ) : null}

          {rowErrors.length > 0 ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                First {rowErrors.length} skipped row{rowErrors.length === 1 ? "" : "s"}:
              </p>
              {rowErrors.map((row) => (
                <div key={row.line} className="rounded border border-border bg-card p-3">
                  <p className="text-xs font-medium">
                    Line {row.line}
                    <span className="ml-2 font-normal text-destructive">{row.reason}</span>
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                    {row.raw}
                  </pre>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full font-mono text-[11px]">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="pr-3 font-normal">time</th>
                          <th className="pr-3 font-normal">open</th>
                          <th className="pr-3 font-normal">high</th>
                          <th className="pr-3 font-normal">low</th>
                          <th className="pr-3 font-normal">close</th>
                          <th className="pr-3 font-normal">volume</th>
                          <th className="font-normal">cols</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="pr-3">{row.parsed.time}</td>
                          <td className="pr-3">{row.parsed.open}</td>
                          <td className="pr-3">{row.parsed.high}</td>
                          <td className="pr-3">{row.parsed.low}</td>
                          <td className="pr-3">{row.parsed.close}</td>
                          <td className="pr-3">{row.parsed.volume}</td>
                          <td>{row.cells.length}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Dismiss import report" onClick={onDismiss}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
