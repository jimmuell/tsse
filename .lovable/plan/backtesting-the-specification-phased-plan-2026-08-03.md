# Backtesting the Specification — Phased Plan

Turn a finished Strategy Definition into a runnable backtest inside the app, using your own OHLCV datasets. Built in three phases so each one is usable on its own.

## How it works end to end

1. Upload a dataset (CSV of OHLCV bars) and give it a name, symbol and timeframe.
2. Open a strategy, pick a dataset, set starting capital, commission and slippage.
3. The spec is compiled into an executable rule set. Anything that can't be compiled is listed up front as a blocker, with a link to the field that needs fixing.
4. The engine walks the bars in order, opening and closing trades by the rules.
5. Results page: equity curve, trade list, and stats (net P&L, win rate, profit factor, max drawdown, average win/loss, expectancy, number of trades).
6. Every run is saved so you can compare runs of the same strategy side by side.

## Why this fits the product

The spec already grades determinism — rules that are machine-evaluable Boolean expressions. Backtesting is the payoff for that: only a deterministic spec can run. A strategy that fails to compile tells you exactly which fields are still subjective, which reinforces the validation loop rather than sitting beside it.

## Phase 1 — Core engine

Supported: entry rules (long and short), stop loss, profit target, position sizing, time-based exit, trading hours, order type (market/limit/stop), commission and slippage.

Rule language: comparisons and boolean combinations over bar fields (`open`, `high`, `low`, `close`, `volume`), indicators (`sma`, `ema`, `atr`, `rsi`, `highest`, `lowest`, `crosses_above`, `crosses_below`), prior-bar references (`close[1]`), and numeric arithmetic. A parser turns the spec text into an expression tree; unparseable fields become compile errors, not silent skips.

Deliverables: datasets upload + management, backtest config panel, engine, results page, saved runs.

## Phase 2 — Filters

Adds volatility/ATR filter, volume filter, market regime filter, day-of-week and holiday filter, session filter, and trade constraints (max trades per day, daily loss limit, daily profit limit, cooldown, overnight allowed). Each filter shows how many trades it blocked so you can see its effect.

## Phase 3 — Full spec

Adds break-even moves, trailing stops, scale-in and scale-out, and discretionary-exit handling (modelled as a configurable assumption). Plus run comparison: two runs of the same strategy diffed on stats and equity curve.

## Technical notes

- New tables: `datasets` (name, symbol, timeframe, bar count, date range, owner) and `dataset_bars` or a compressed bar payload; `backtest_runs` (strategy, dataset, config, stats, equity curve, trades). RLS scoped to `auth.uid()` with matching grants.
- CSV parsing and validation on upload: required columns, timestamp ordering, gap detection, duplicate bars.
- New module `src/lib/backtest/` — `parser.ts` (spec text to expression AST), `indicators.ts`, `engine.ts` (bar loop, position state, fills), `stats.ts`. Pure and deterministic, so it runs and is unit-testable without a server round trip.
- Compilation runs client-side against the stored definition, same as the validation engine, so the blocker list appears instantly.
- Charts via the existing UI stack; equity curve and drawdown as line/area charts.
- No AI in the backtest path — the model is only used earlier to produce the spec. Results are reproducible for a given spec + dataset + config.

## Not in this plan

Live/paper trading, market data providers, walk-forward or Monte Carlo analysis, parameter optimisation, multi-symbol portfolio backtests.
