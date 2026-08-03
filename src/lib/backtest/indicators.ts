/** Indicator series helpers. All return arrays aligned with the bar array; leading values are NaN. */

export function sma(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i] as number;
    if (i >= period) sum -= src[i - period] as number;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = NaN;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i] as number;
    if (i < period - 1) {
      sum += v;
      continue;
    }
    if (i === period - 1) {
      sum += v;
      prev = sum / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function rma(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (period <= 0) return out;
  let prev = NaN;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i] as number;
    if (i < period - 1) {
      sum += v;
      continue;
    }
    if (i === period - 1) {
      sum += v;
      prev = sum / period;
    } else {
      prev = (prev * (period - 1) + v) / period;
    }
    out[i] = prev;
  }
  return out;
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const out = new Array<number>(high.length).fill(NaN);
  for (let i = 0; i < high.length; i++) {
    const h = high[i] as number;
    const l = low[i] as number;
    if (i === 0) {
      out[i] = h - l;
      continue;
    }
    const pc = close[i - 1] as number;
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], period: number): number[] {
  return rma(trueRange(high, low, close), period);
}

export function rsi(src: number[], period: number): number[] {
  const gains: number[] = new Array(src.length).fill(0);
  const losses: number[] = new Array(src.length).fill(0);
  for (let i = 1; i < src.length; i++) {
    const diff = (src[i] as number) - (src[i - 1] as number);
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }
  const avgGain = rma(gains.slice(1), period);
  const avgLoss = rma(losses.slice(1), period);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < avgGain.length; i++) {
    const g = avgGain[i] as number;
    const l = avgLoss[i] as number;
    if (Number.isNaN(g) || Number.isNaN(l)) continue;
    out[i + 1] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function highest(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    if (i < period - 1) continue;
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) max = Math.max(max, src[j] as number);
    out[i] = max;
  }
  return out;
}

export function lowest(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    if (i < period - 1) continue;
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) min = Math.min(min, src[j] as number);
    out[i] = min;
  }
  return out;
}

export function stdev(src: number[], period: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  const mean = sma(src, period);
  for (let i = period - 1; i < src.length; i++) {
    const m = mean[i] as number;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += ((src[j] as number) - m) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}
