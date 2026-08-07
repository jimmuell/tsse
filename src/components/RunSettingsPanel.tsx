import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Shows, verbatim, the settings that were stored on a backtest_runs row. Nothing here infers,
 * normalises or defaults a value: anything the stored row does not contain renders as
 * "not recorded" so a missing input can never be mistaken for a real one.
 */

export type RunSettingsRun = {
  id: string;
  dataset_name?: string | null;
  created_at?: string | null;
  config?: unknown;
  compiled?: unknown;
  /** Column heading; falls back to the run id. */
  label?: string;
};

export const NOT_RECORDED = "not recorded";

type Row = { label: string; values: string[] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return NOT_RECORDED;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function epochToIso(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString().slice(0, 10)
    : NOT_RECORDED;
}

/** Flattens nested config objects into dotted keys so every stored leaf is shown as-is. */
function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}) {
  const record = asRecord(value);
  for (const [key, val] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) flatten(val, path, out);
    else out[path] = val;
  }
  return out;
}

/** Keys shown in their own dedicated rows, so they are not repeated in the rule list. */
const DEDICATED_CONFIG_KEYS = new Set([
  "engineVersion",
  "data.dataset",
  "data.window.start",
  "data.window.end",
  "data.granularity_needed",
]);

/** True when the run recorded the exact wire config sent to the engine. Runs saved before
 *  WIT-FRONTEND-08 did not, and must never be back-filled with a guessed value. */
function wireConfigOf(run: RunSettingsRun): Record<string, unknown> | null {
  const wire = asRecord(run.config)["wireConfig"];
  const record = asRecord(wire);
  return Object.keys(record).length > 0 ? record : null;
}

function settingsFor(run: RunSettingsRun) {
  const config = asRecord(run.config);
  const compiled = asRecord(run.compiled);
  const provenance = asRecord(compiled["provenance"]);
  // Prefer the recorded wire config — it is literally what the engine was asked to run.
  // Everything else is only a fallback for runs recorded before it was captured.
  const wire = wireConfigOf(run);
  const source = wire ?? config;
  const data = asRecord(source["data"]);
  const window = asRecord(data["window"]);
  const flat = flatten(source);

  const core: Record<string, unknown> = {
    "Date window — from": window["start"] ?? (wire ? undefined : epochToIso(compiled["rangeStart"])),
    "Date window — to": window["end"] ?? (wire ? undefined : epochToIso(compiled["rangeEnd"])),
    "Data set id": data["dataset"] ?? (wire ? undefined : config["dataset"]),
    "Data set label": run.dataset_name,
    "Chart timeframe": data["granularity_needed"] ?? (wire ? undefined : config["timeframe"]),
  };

  const rules: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flat)) {
    if (DEDICATED_CONFIG_KEYS.has(key)) continue;
    if (key === "wireConfig" || key.startsWith("wireConfig.")) continue;
    rules[key] = val;
  }

  const provenanceRows: Record<string, unknown> = {
    "Engine version": provenance["engine_version"] ?? config["engineVersion"],
    "Dataset version": provenance["dataset_version"],
    "Dataset id (provenance)": provenance["dataset_id"],
    "Config hash": provenance["config_hash"],
    "Completed at": provenance["completed_at"],
  };

  return { core, rules, provenance: provenanceRows };
}

function buildGroups(runs: RunSettingsRun[]) {
  const per = runs.map(settingsFor);
  const group = (pick: (s: ReturnType<typeof settingsFor>) => Record<string, unknown>): Row[] => {
    const keys: string[] = [];
    for (const s of per) for (const k of Object.keys(pick(s))) if (!keys.includes(k)) keys.push(k);
    return keys.map((key) => ({
      label: key,
      values: per.map((s) => show(pick(s)[key])),
    }));
  };
  return [
    { title: "Run window and data set", rows: group((s) => s.core) },
    { title: "Executable rule values (stored config)", rows: group((s) => s.rules) },
    { title: "Provenance", rows: group((s) => s.provenance) },
  ];
}

function differs(row: Row): boolean {
  return row.values.length > 1 && row.values.some((v) => v !== row.values[0]);
}

export function RunSettingsPanel({
  runs,
  title = "Settings used",
}: {
  runs: RunSettingsRun[];
  title?: string;
}) {
  if (runs.length === 0) return null;
  const groups = buildGroups(runs);
  const multi = runs.length > 1;

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Shown exactly as stored on the run.{" "}
          {multi ? "Rows that are not identical across the compared runs are marked." : null}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">Setting</TableHead>
            {runs.map((run) => (
              <TableHead key={run.id} className="text-right">
                {run.label ?? run.id}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.title}>
              <TableRow>
                <TableCell
                  colSpan={runs.length + 1}
                  className="bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {group.title}
                </TableCell>
              </TableRow>
              {group.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={runs.length + 1}
                    className="text-xs italic text-muted-foreground"
                  >
                    {NOT_RECORDED}
                  </TableCell>
                </TableRow>
              ) : (
                group.rows.map((row) => {
                  const marked = differs(row);
                  return (
                    <TableRow key={row.label} className={marked ? "bg-destructive/10" : undefined}>
                      <TableCell className="text-xs font-medium">
                        {row.label}
                        {marked ? (
                          <span className="ml-2 rounded border border-destructive px-1 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                            differs
                          </span>
                        ) : null}
                      </TableCell>
                      {row.values.map((value, i) => (
                        <TableCell
                          key={`${runs[i]?.id}-${row.label}`}
                          className={`whitespace-pre-wrap break-all text-right font-mono text-xs ${
                            value === NOT_RECORDED ? "italic text-muted-foreground" : ""
                          }`}
                        >
                          {value}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
