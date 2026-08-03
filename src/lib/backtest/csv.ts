import type { Bar } from "./types";

export type CsvRowError = {
  /** 1-based line number in the source file. */
  line: number;
  reason: string;
  raw: string;
  cells: string[];
  parsed: { time: string; open: string; high: string; low: string; close: string; volume: string };
};

export type CsvLayout = {
  delimiter: string;
  headerless: boolean;
  columns: { time: number; timeOnly: number; open: number; high: number; low: number; close: number; volume: number };
  totalRows: number;
};

export type CsvParseResult = {
  bars: Bar[];
  errors: string[];
  skipped: number;
  rowErrors: CsvRowError[];
  layout: CsvLayout | null;
};

const MAX_ROW_ERRORS = 10;

const ALIASES: Record<string, string[]> = {
  t: ["time", "timestamp", "date", "datetime", "date_time", "opentime", "open_time", "bar_time"],
  o: ["open", "o", "openprice"],
  h: ["high", "h", "highprice"],
  l: ["low", "l", "lowprice"],
  c: ["close", "c", "closeprice", "last", "adjclose", "adj_close"],
  v: ["volume", "v", "vol", "quantity"],
};

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
continue;
    }
    if (ch === delimiter && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim());
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseTime(raw: string, dateOnly?: string): number | null {
  let value = raw.trim();
  if (dateOnly) {
    let time = value;
    // "0930" / "093000" style time columns
    if (/^\d{4}$/.test(time)) time = `${time.slice(0, 2)}:${time.slice(2)}`;
    else if (/^\d{6}$/.test(time)) time = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}`;
    value = `${dateOnly.trim()} ${time}`;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && /^\d+$/.test(value)) {
    // seconds vs milliseconds
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const iso = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (!Number.isNaN(iso)) return iso;
  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? null : fallback;
}

function looksNumeric(s: string): boolean {
  return s !== "" && Number.isFinite(Number(s));
}

/** Parses OHLCV CSV/TXT text into sorted bars, tolerating common column namings and headerless exports. */
export function parseCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 1)
    return { bars: [], errors: ["The file has no data rows."], skipped: 0, rowErrors: [], layout: null };

  const headerLine = lines[0] as string;
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: headerLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]?.d as string;

  const headers = splitLine(headerLine, delimiter).map(normalizeHeader);
  const indexOf = (key: keyof typeof ALIASES): number =>
    headers.findIndex((h) => (ALIASES[key] as string[]).includes(h));

  let iT = indexOf("t");
  let iO = indexOf("o");
  let iH = indexOf("h");
  let iL = indexOf("l");
  let iC = indexOf("c");
  let iV = indexOf("v");
  let iTimeOnly = -1;
  let firstDataRow = 1;

  const headerless = iO < 0 || iH < 0 || iL < 0 || iC < 0;
  if (headerless) {
    // Headerless exports (Kinetick / FirstRate style):
    // date,time,o,h,l,c,v  |  datetime,o,h,l,c,v  |  date,o,h,l,c,v
    const cells = splitLine(headerLine, delimiter);
    const numericTail = cells.filter(looksNumeric).length;
    if (cells.length < 5 || numericTail < 4) {
      return {
        bars: [],
        errors: [
          "Could not read this file. Expected columns like date, open, high, low, close, volume — with or without a header row.",
        ],
        skipped: 0,
        rowErrors: [
          {
            line: 1,
            reason: `First line has ${cells.length} column(s) and ${numericTail} numeric value(s); expected at least 5 columns with 4 numeric prices.`,
            raw: headerLine,
            cells,
            parsed: { time: "—", open: "—", high: "—", low: "—", close: "—", volume: "—" },
          },
        ],
        layout: null,
      };
    }
    firstDataRow = 0;
    const first = (cells[0] ?? "").trim();
    const second = (cells[1] ?? "").trim();
    // A separate time column looks like 09:30, 09:30:00, 0930 or 093000 — never a price.
    const isTimeCell = /^\d{1,2}:\d{2}(:\d{2})?$/.test(second) || /^(\d{4}|\d{6})$/.test(second);
    const firstHasTime = /\d{1,2}:\d{2}/.test(first);
    const dateThenTime = !looksNumeric(first) && !firstHasTime && isTimeCell;
    iT = 0;
    if (dateThenTime) {
      iTimeOnly = 1;
      iO = 2;
    } else {
      iO = 1;
    }

    iH = iO + 1;
    iL = iO + 2;
    iC = iO + 3;
    iV = cells.length > iO + 4 ? iO + 4 : -1;
  } else if (iT < 0) {
    return {
      bars: [],
      errors: ["Missing required column: date/time."],
      skipped: 0,
      rowErrors: [],
      layout: null,
    };
  } else {
    const timeCol = headers.findIndex((h) => h === "time");
    if (timeCol >= 0 && timeCol !== iT) iTimeOnly = timeCol;
  }

  const layout: CsvLayout = {
    delimiter,
    headerless,
    columns: { time: iT, timeOnly: iTimeOnly, open: iO, high: iH, low: iL, close: iC, volume: iV },
    totalRows: lines.length - firstDataRow,
  };

  const bars: Bar[] = [];
  const rowErrors: CsvRowError[] = [];
  let skipped = 0;
  for (let i = firstDataRow; i < lines.length; i++) {
    const line = lines[i] as string;
    const cells = splitLine(line, delimiter);
    const rawTime = cells[iT] ?? "";
    const t =
      iTimeOnly >= 0 ? parseTime(cells[iTimeOnly] ?? "", rawTime) : parseTime(rawTime);
    const o = Number(cells[iO]);
    const h = Number(cells[iH]);
    const l = Number(cells[iL]);
    const c = Number(cells[iC]);
    const v = iV >= 0 ? Number(cells[iV]) : 0;
    if (t === null || [o, h, l, c].some((n) => !Number.isFinite(n))) {
      skipped++;
      if (rowErrors.length < MAX_ROW_ERRORS) {
        const bad: string[] = [];
        if (t === null)
          bad.push(
            `unreadable date/time ${JSON.stringify(
              iTimeOnly >= 0 ? `${rawTime} ${cells[iTimeOnly] ?? ""}`.trim() : rawTime,
            )}`,
          );
        const priceLabels: Array<[string, number, number]> = [
          ["open", iO, o],
          ["high", iH, h],
          ["low", iL, l],
          ["close", iC, c],
        ];
        for (const [label, idx, num] of priceLabels) {
          if (!Number.isFinite(num))
            bad.push(
              cells[idx] === undefined
                ? `missing ${label} (column ${idx + 1} of ${cells.length})`
                : `non-numeric ${label} ${JSON.stringify(cells[idx])}`,
            );
        }
        rowErrors.push({
          line: i + 1,
          reason: bad.join("; ") || "row could not be read",
          raw: line.length > 240 ? `${line.slice(0, 240)}…` : line,
          cells,
          parsed: {
            time: t === null ? "invalid" : new Date(t).toISOString(),
            open: cells[iO] ?? "—",
            high: cells[iH] ?? "—",
            low: cells[iL] ?? "—",
            close: cells[iC] ?? "—",
            volume: iV >= 0 ? cells[iV] ?? "—" : "—",
          },
        });
      }
      if (errors.length < 3) errors.push(`Row ${i + 1} could not be read and was skipped.`);
      continue;
    }
    bars.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }

  bars.sort((a, b) => a.t - b.t);
  return { bars, errors, skipped, rowErrors, layout };
}

