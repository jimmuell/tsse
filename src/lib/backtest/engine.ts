import { EvalContext } from "./evaluate";
import type { CompiledStrategy } from "./compile";
import { computeStats } from "./stats";
import type {
  Bar,
  BacktestConfig,
  BacktestResult,
  EquityPoint,
  Trade,
  TradeSide,
} from "./types";

type OpenPosition = {
  side: TradeSide;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  quantity: number;
  stopPrice: number | null;
  targetPrice: number | null;
};

function fill(price: number, slippage: number, side: TradeSide, entering: boolean): number {
  const adverse = entering ? (side === "long" ? 1 : -1) : side === "long" ? -1 : 1;
  return price + adverse * slippage;
}

/**
 * Bar-by-bar simulator. Signals are read on the close of a bar and filled at the
 * next bar's open; stops and targets are checked intrabar with stop priority.
 */
export function runBacktest(
  bars: Bar[],
  compiled: CompiledStrategy,
  config: BacktestConfig,
): BacktestResult {
  const ctx = new EvalContext(bars);
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  let cash = config.capital;
  let position: OpenPosition | null = null;
  let pending: TradeSide | null = null;

  const truthy = (v: number) => !Number.isNaN(v) && v !== 0;

  const closeTrade = (
    exitIndex: number,
    rawPrice: number,
    reason: Trade["reason"],
  ): void => {
    if (!position) return;
    const bar = bars[exitIndex] as Bar;
    const exitPrice = fill(rawPrice, config.slippage, position.side, false);
    const direction = position.side === "long" ? 1 : -1;
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity * direction;
    const commission = config.commission * position.quantity * 2;
    const pnl = grossPnl - commission;
    cash += pnl;
    trades.push({
      index: trades.length + 1,
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime: bar.t,
      exitPrice,
      quantity: position.quantity,
      stopPrice: position.stopPrice,
      targetPrice: position.targetPrice,
      reason,
      grossPnl,
      commission,
      pnl,
      barsHeld: exitIndex - position.entryIndex,
    });
    position = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i] as Bar;

    // 1. Fill a pending entry at this bar's open.
    if (!position && pending) {
      const side = pending;
      pending = null;
      const entryPrice = fill(bar.o, config.slippage, side, true);
      const vars: Record<string, number> = {
        entry_price: entryPrice,
        capital: config.capital,
        equity: cash,
        bars_in_trade: 0,
      };

      const stopRule =
        side === "short" && compiled.stop?.short ? compiled.stop.short : compiled.stop;
      let stopPrice: number | null = null;
      if (stopRule) {
        const value = ctx.at(stopRule.node, i, vars);
        if (!Number.isNaN(value)) {
          stopPrice =
            stopRule.kind === "price"
              ? value
              : side === "long"
                ? entryPrice - Math.abs(value)
                : entryPrice + Math.abs(value);
        }
      }

      const riskPerUnit = stopPrice === null ? NaN : Math.abs(entryPrice - stopPrice);
      vars['stop_price'] = stopPrice ?? NaN;
      vars['risk'] = riskPerUnit;
      vars['risk_per_unit'] = riskPerUnit;

      const targetRule =
        side === "short" && compiled.target?.short ? compiled.target.short : compiled.target;
      let targetPrice: number | null = null;
      if (targetRule) {
        const value = ctx.at(targetRule.node, i, vars);
        if (!Number.isNaN(value)) {
          if (targetRule.kind === "price") targetPrice = value;
          else
            targetPrice =
              side === "long" ? entryPrice + Math.abs(value) : entryPrice - Math.abs(value);
        }
      }

      vars['target_price'] = targetPrice ?? NaN;

      let quantity = config.defaultQuantity;
      if (compiled.sizing) {
        const value = ctx.at(compiled.sizing, i, vars);
        if (Number.isFinite(value) && value > 0) quantity = value;
      }
      quantity = Math.max(0, quantity);

      if (quantity > 0 && (stopPrice !== null || targetPrice !== null)) {
        position = {
          side,
          entryIndex: i,
          entryTime: bar.t,
          entryPrice,
          quantity,
          stopPrice,
          targetPrice,
        };
      }
    }

    // 2. Manage an open position intrabar.
    if (position) {
      const isLong = position.side === "long";
      const stopHit =
        position.stopPrice !== null &&
        (isLong ? bar.l <= position.stopPrice : bar.h >= position.stopPrice);
      const targetHit =
        position.targetPrice !== null &&
        (isLong ? bar.h >= position.targetPrice : bar.l <= position.targetPrice);

      if (stopHit && i > position.entryIndex - 1) {
        closeTrade(i, position.stopPrice as number, "stop");
      } else if (targetHit) {
        closeTrade(i, position.targetPrice as number, "target");
      }
    }

    // 3. Rule and time exits, evaluated on the close.
    if (position) {
      const barsInTrade = i - position.entryIndex;
      const vars: Record<string, number> = {
        entry_price: position.entryPrice,
        stop_price: position.stopPrice ?? NaN,
        target_price: position.targetPrice ?? NaN,
        risk: position.stopPrice === null ? NaN : Math.abs(position.entryPrice - position.stopPrice),
        risk_per_unit:
          position.stopPrice === null ? NaN : Math.abs(position.entryPrice - position.stopPrice),
        capital: config.capital,
        equity: cash,
        bars_in_trade: barsInTrade,
        quantity: position.quantity,
      };
      if (compiled.timeExitBars !== null && barsInTrade >= compiled.timeExitBars) {
        closeTrade(i, bar.c, "time");
      } else if (compiled.exitRule && barsInTrade > 0 && truthy(ctx.at(compiled.exitRule, i, vars))) {
        closeTrade(i, bar.c, "rule");
      }
    }

    // 4. Look for a new signal on this close.
    if (!position && !pending && i < bars.length - 1) {
      const vars: Record<string, number> = { capital: config.capital, equity: cash };
      if (config.allowLong && compiled.longEntry && truthy(ctx.at(compiled.longEntry, i, vars))) {
        pending = "long";
      } else if (
        config.allowShort &&
        compiled.shortEntry &&
        truthy(ctx.at(compiled.shortEntry, i, vars))
      ) {
        pending = "short";
      }
    }

    // 5. Mark to market.
    let openPnl = 0;
    if (position) {
      const direction = position.side === "long" ? 1 : -1;
      openPnl = (bar.c - position.entryPrice) * position.quantity * direction;
    }
    equity.push({ t: bar.t, equity: cash + openPnl });
  }

  if (position) closeTrade(bars.length - 1, (bars[bars.length - 1] as Bar).c, "end of data");

  return { trades, equity, stats: computeStats(trades, equity, config.capital) };
}
