import {
  atr,
  ema,
  highest,
  lowest,
  rma,
  rsi,
  sma,
  stdev,
  trueRange,
} from "./indicators";
import { collectIdentifiers, nodeKey, type Node } from "./parser";
import type { Bar } from "./types";

export class EvalError extends Error {}

/** Identifiers resolved from the bar series. */
const SERIES_FIELDS: Record<string, (b: Bar) => number> = {
  open: (b) => b.o,
  high: (b) => b.h,
  low: (b) => b.l,
  close: (b) => b.c,
  price: (b) => b.c,
  volume: (b) => b.v,
  hl2: (b) => (b.h + b.l) / 2,
  hlc3: (b) => (b.h + b.l + b.c) / 3,
  ohlc4: (b) => (b.o + b.h + b.l + b.c) / 4,
  range: (b) => b.h - b.l,
};

const SERIES_FUNCTIONS = new Set([
  "sma",
  "ema",
  "rma",
  "wma",
  "atr",
  "rsi",
  "highest",
  "lowest",
  "stdev",
  "tr",
  "true_range",
  "crosses_above",
  "crosses_below",
]);

const SCALAR_FUNCTIONS = new Set(["abs", "min", "max", "round", "floor", "ceil", "sqrt"]);

export const KNOWN_IDENTIFIERS = [
  ...Object.keys(SERIES_FIELDS),
  "bar_index",
  "day_of_week",
  "hour",
  "minute",
  "time",
  "tick_size",
  "poc",
  "vah",
  "val",
  "percent",
  "entry_price",
  "stop_price",
  "target_price",
  "risk",
  "risk_per_unit",
  "capital",
  "equity",
  "balance",
  "bars_in_trade",
  "quantity",
  "atr_value",
];


export const KNOWN_FUNCTIONS = [...SERIES_FUNCTIONS, ...SCALAR_FUNCTIONS];

export type Vars = Record<string, number>;

/** Evaluates parsed rule trees against a bar series. Indicator arrays are cached. */
export class EvalContext {
  private readonly cache = new Map<string, number[]>();
  readonly open: number[];
  readonly high: number[];
  readonly low: number[];
  readonly close: number[];
  readonly volume: number[];

  readonly tickSize: number;
  private profile: { poc: number[]; vah: number[]; val: number[] } | null = null;

  constructor(readonly bars: Bar[]) {
    this.open = bars.map((b) => b.o);
    this.high = bars.map((b) => b.h);
    this.low = bars.map((b) => b.l);
    this.close = bars.map((b) => b.c);
    this.volume = bars.map((b) => b.v);
    this.tickSize = inferTickSize(this.close);
  }

  /**
   * Prior-session volume profile. Bars are grouped by UTC calendar day, volume
   * is spread across each bar's range in tick buckets, and every bar of a day
   * sees the previous day's POC / value-area high / value-area low.
   */
  private sessionProfile(): { poc: number[]; vah: number[]; val: number[] } {
    if (this.profile) return this.profile;
    const n = this.bars.length;
    const poc = new Array<number>(n).fill(NaN);
    const vah = new Array<number>(n).fill(NaN);
    const val = new Array<number>(n).fill(NaN);
    const tick = this.tickSize;

    let dayStart = 0;
    type Levels = { poc: number; vah: number; val: number };
    let prior: Levels | null = null;
    const dayKey = (t: number) => Math.floor(t / 86_400_000);

    const flush = (from: number, to: number) => {
      const buckets = new Map<number, number>();
      for (let i = from; i < to; i++) {
        const bar = this.bars[i] as Bar;
        const lo = Math.round(bar.l / tick);
        const hi = Math.round(bar.h / tick);
        const steps = Math.max(1, hi - lo + 1);
        const share = (bar.v || 1) / steps;
        for (let b = lo; b <= hi; b++) buckets.set(b, (buckets.get(b) ?? 0) + share);
      }
      if (buckets.size === 0) return;
      const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
      const total = sorted.reduce((s, e) => s + e[1], 0);
      let pocIdx = 0;
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] as [number, number])[1] > (sorted[pocIdx] as [number, number])[1]) pocIdx = i;
      }
      let lo = pocIdx;
      let hi = pocIdx;
      let covered = (sorted[pocIdx] as [number, number])[1];
      while (covered < total * 0.7 && (lo > 0 || hi < sorted.length - 1)) {
        const below = lo > 0 ? (sorted[lo - 1] as [number, number])[1] : -1;
        const above = hi < sorted.length - 1 ? (sorted[hi + 1] as [number, number])[1] : -1;
        if (above >= below) {
          hi += 1;
          covered += above;
        } else {
          lo -= 1;
          covered += below;
        }
      }
      prior = {
        poc: (sorted[pocIdx] as [number, number])[0] * tick,
        vah: (sorted[hi] as [number, number])[0] * tick,
        val: (sorted[lo] as [number, number])[0] * tick,
      };
    };

    for (let i = 0; i < n; i++) {
      const t = (this.bars[i] as Bar).t;
      if (i > 0 && dayKey(t) !== dayKey((this.bars[i - 1] as Bar).t)) {
        flush(dayStart, i);
        dayStart = i;
      }
      if (prior) {
        poc[i] = prior.poc;
        vah[i] = prior.vah;
        val[i] = prior.val;
      }
    }
    this.profile = { poc, vah, val };
    return this.profile;
  }


  private constArg(node: Node, fnName: string): number {
    if (node.k === "num") return node.v;
    if (node.k === "un" && node.op === "-" && node.arg.k === "num") return -node.arg.v;
    throw new EvalError(`${fnName}() needs a fixed number for its period`);
  }

  /** Full array for a series-producing node. */
  series(node: Node): number[] {
    const key = nodeKey(node);
    const hit = this.cache.get(key);
    if (hit) return hit;

    let out: number[];
    if (node.k === "ident" && SERIES_FIELDS[node.name]) {
      const pick = SERIES_FIELDS[node.name] as (b: Bar) => number;
      out = this.bars.map(pick);
    } else if (node.k === "call") {
      out = this.seriesCall(node);
    } else {
      out = this.bars.map((_, i) => this.at(node, i, {}));
    }
    this.cache.set(key, out);
    return out;
  }

  private seriesCall(node: Extract<Node, { k: "call" }>): number[] {
    const name = node.name;
    const arg0 = node.args[0];
    switch (name) {
      case "sma":
      case "ema":
      case "rma":
      case "wma":
      case "stdev": {
        if (!arg0 || !node.args[1]) throw new EvalError(`${name}() needs a source and a period`);
        const src = this.series(arg0);
        const period = this.constArg(node.args[1], name);
        if (name === "ema" || name === "wma") return ema(src, period);
        if (name === "rma") return rma(src, period);
        if (name === "stdev") return stdev(src, period);
        return sma(src, period);
      }
      case "highest":
      case "lowest": {
        if (!arg0) throw new EvalError(`${name}() needs a source and a period`);
        const twoArgs = node.args.length > 1;
        const src = twoArgs ? this.series(arg0) : name === "highest" ? this.high : this.low;
        const periodNode = twoArgs ? (node.args[1] as Node) : arg0;
        const period = this.constArg(periodNode, name);
        return name === "highest" ? highest(src, period) : lowest(src, period);
      }
      case "atr": {
        const period = arg0 ? this.constArg(arg0, "atr") : 14;
        return atr(this.high, this.low, this.close, period);
      }
      case "rsi": {
        if (!arg0) return rsi(this.close, 14);
        const twoArgs = node.args.length > 1;
        const src = twoArgs ? this.series(arg0) : this.close;
        const period = this.constArg(twoArgs ? (node.args[1] as Node) : arg0, "rsi");
        return rsi(src, period);
      }
      case "tr":
      case "true_range":
        return trueRange(this.high, this.low, this.close);
      default:
        return this.bars.map((_, i) => this.at(node, i, {}));
    }
  }

  /** Value of a node at bar index `i`. Booleans come back as 1 or 0. */
  at(node: Node, i: number, vars: Vars): number {
    switch (node.k) {
      case "num":
        return node.v;
      case "ident": {
        if (node.name in vars) return vars[node.name] as number;
        if (node.name === "percent") return 0.01;
        if (node.name === "bar_index") return i;
        const bar = this.bars[i];
        if (!bar) return NaN;
        if (node.name === "day_of_week") return new Date(bar.t).getUTCDay();
        if (node.name === "hour") return new Date(bar.t).getUTCHours();
        if (node.name === "minute") return new Date(bar.t).getUTCMinutes();
        const pick = SERIES_FIELDS[node.name];
        if (pick) return pick(bar);
        throw new EvalError(`Unknown value "${node.name}"`);
      }
      case "offset": {
        const j = i - node.n;
        if (j < 0) return NaN;
        return this.at(node.base, j, vars);
      }
      case "un": {
        const v = this.at(node.arg, i, vars);
        return node.op === "-" ? -v : v ? 0 : 1;
      }
      case "call": {
        if (SCALAR_FUNCTIONS.has(node.name)) {
          const args = node.args.map((a) => this.at(a, i, vars));
          switch (node.name) {
            case "abs":
              return Math.abs(args[0] as number);
            case "min":
              return Math.min(...args);
            case "max":
              return Math.max(...args);
            case "round":
              return Math.round(args[0] as number);
            case "floor":
              return Math.floor(args[0] as number);
            case "ceil":
              return Math.ceil(args[0] as number);
            case "sqrt":
              return Math.sqrt(args[0] as number);
            default:
              break;
          }
        }
        if (node.name === "crosses_above" || node.name === "crosses_below") {
          const a = node.args[0];
          const b = node.args[1];
          if (!a || !b) throw new EvalError(`${node.name}() needs two values`);
          return this.cross(a, b, i, vars, node.name === "crosses_above");
        }
        if (!SERIES_FUNCTIONS.has(node.name)) {
          throw new EvalError(`Unknown function "${node.name}()"`);
        }
        const arr = this.series(node);
        return (arr[i] ?? NaN) as number;
      }
      case "bin":
        return this.binary(node, i, vars);
    }
  }

  private cross(a: Node, b: Node, i: number, vars: Vars, above: boolean): number {
    if (i < 1) return 0;
    const nowA = this.at(a, i, vars);
    const nowB = this.at(b, i, vars);
    const prevA = this.at(a, i - 1, vars);
    const prevB = this.at(b, i - 1, vars);
    if ([nowA, nowB, prevA, prevB].some((v) => Number.isNaN(v))) return 0;
    return above ? (nowA > nowB && prevA <= prevB ? 1 : 0) : nowA < nowB && prevA >= prevB ? 1 : 0;
  }

  private binary(node: Extract<Node, { k: "bin" }>, i: number, vars: Vars): number {
    if (node.op === "crosses_above" || node.op === "crosses_below") {
      return this.cross(node.l, node.r, i, vars, node.op === "crosses_above");
    }
    if (node.op === "and") {
      return this.at(node.l, i, vars) && this.at(node.r, i, vars) ? 1 : 0;
    }
    if (node.op === "or") {
      return this.at(node.l, i, vars) || this.at(node.r, i, vars) ? 1 : 0;
    }
    const l = this.at(node.l, i, vars);
    const r = this.at(node.r, i, vars);
    switch (node.op) {
      case "+":
        return l + r;
      case "-":
        return l - r;
      case "*":
        return l * r;
      case "/":
        return r === 0 ? NaN : l / r;
      case ">":
        return l > r ? 1 : 0;
      case "<":
        return l < r ? 1 : 0;
      case ">=":
        return l >= r ? 1 : 0;
      case "<=":
        return l <= r ? 1 : 0;
      case "==":
        return l === r ? 1 : 0;
      case "!=":
        return l !== r ? 1 : 0;
      default:
        return NaN;
    }
  }

  /** True when every value the node needs is available at bar `i`. */
  ready(node: Node, i: number, vars: Vars): boolean {
    const v = this.at(node, i, vars);
    return !Number.isNaN(v);
  }
}

/** Names used by a rule that the engine cannot resolve at all. */
export function unknownNames(node: Node, extraVars: string[] = []): string[] {
  const allowed = new Set([...KNOWN_IDENTIFIERS, ...extraVars]);
  const fns = new Set(KNOWN_FUNCTIONS);
  const out: string[] = [];
  for (const name of collectIdentifiers(node)) {
    if (name.endsWith("()")) {
      if (!fns.has(name.slice(0, -2))) out.push(name);
    } else if (!allowed.has(name)) {
      out.push(name);
    }
  }
  return [...new Set(out)];
}
