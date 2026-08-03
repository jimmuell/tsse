import type { Bar } from "./types";

export type CsvParseResult = {
  bars: Bar[];
  errors: string[];
  skipped: number;
};

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
  const value = dateOnly ? `${dateOnly} ${raw}` : raw;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && /^\d+$/.test(value.trim())) {
    // seconds vs milliseconds
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const iso = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (!Number.isNaN(iso)) return iso;
  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? null : fallback;
}

/** Parses OHLCV CSV text into sorted bars, tolerating common column namings. */
export function parseCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return { bars: [], errors: ["The file has no data rows."], skipped: 0 };

  const headerLine = lines[0] as string;
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: headerLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]?.d as string;

  const headers = splitLine(headerLine, delimiter).map(normalizeHeader);
  const indexOf = (key: keyof typeof ALIASES): number =>
    headers.findIndex((h) => (ALIASES[key] as string[]).includes(h));

  const iT = indexOf("t");
  const iO = indexOf("o");
  const iH = indexOf("h");
  const iL = indexOf("l");
  const iC = indexOf("c");
  const iV = indexOf("v");
  const iTimeOnly = headers.findIndex((h) => h === "time" && iT !== headers.indexOf("time"));

  const missing: string[] = [];
  if (iT < 0) missing.push("date/time");
  if (iO < 0) missing.push("open");
  if (iH < 0) missing.push("high");
  if (iL < 0) missing.push("low");
  if (iC < 0) missing.push("close");
  if (missing.length > 0) {
    return {
      bars: [],
      errors: [
        `Missing required column(s): ${missing.join(", ")}. Expected headers like date, open, high, low, close, volume.`,
      ],
      skipped: 0,
    };
  }

  const bars: Bar[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i] as string, delimiter);
    const rawTime = cells[iT] ?? "";
    const t = parseTime(
      iTimeOnly > 0 ? (cells[iTimeOnly] ?? "") : rawTime,
      iTimeOnly > 0 ? rawTime : undefined,
    );
    const o = Number(cells[iO]);
    const h = Number(cells[iH]);
    const l = Number(cells[iL]);
    const c = Number(cells[iC]);
    const v = iV >= 0 ? Number(cells[iV]) : 0;
    if (t === null || [o, h, l, c].some((n) => !Number.isFinite(n))) {
      skipped++;
      if (errors.length < 3) errors.push(`Row ${i + 1} could not be read and was skipped.`);
      continue;
    }
    bars.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }

  bars.sort((a, b) => a.t - b.t);
  return { bars, errors, skipped };
}
