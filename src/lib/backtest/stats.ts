import type { BacktestStats, EquityPoint, Trade } from "./types";

export function computeStats(
  trades: Trade[],
  equity: EquityPoint[],
  capital: number,
): BacktestStats {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const netPnl = trades.reduce((a, t) => a + t.pnl, 0);

  let peak = capital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.equity);
    const dd = peak - point.equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netPnl,
    returnPct: capital > 0 ? (netPnl / capital) * 100 : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    expectancy: trades.length ? netPnl / trades.length : 0,
    maxDrawdown,
    maxDrawdownPct,
    longTrades: trades.filter((t) => t.side === "long").length,
    shortTrades: trades.filter((t) => t.side === "short").length,
    startAt: equity[0]?.t ?? null,
    endAt: equity[equity.length - 1]?.t ?? null,
  };
}
