# Full-history data sets (18 years, 1-minute included)

Goal: import your complete ES history — both the 5-minute file (~1.1M bars) and the 1-minute file (~7M bars) — and backtest across all of it.

## Where things stand today

- The importer already streams the file in 8MB chunks and writes bars into row storage in batches of 20,000, so file size itself is no longer the blocker.
- Two real limits remain:
  1. An import is one long browser session. A 7M-bar file means ~350 sequential write batches; one network hiccup or a closed tab loses the run, and there is no way to resume or to add more history to an existing data set.
  2. A backtest run loads every bar into memory on the server and is hard-capped at 1,000,000 bars, so a 1-minute full history would silently truncate.

## What to build

### 1. Resumable, appendable imports
- Let an upload target an existing data set instead of always creating a new one ("Add to existing data set"), so history can be loaded in several passes and across sessions.
- Duplicate bars are already ignored on write, so re-running the same file is safe — the importer will report how many rows were new vs. already present.
- Add retry with backoff on each batch, and a pause/resume + cancel control on the progress bar.
- Show a live estimate: rows written, percent of file read, elapsed and estimated remaining time.

### 2. Remove the 1M-bar backtest ceiling
- Change the server runner to feed bars into the engine page by page instead of collecting them all in an array first, so memory stays flat regardless of history length.
- Raise the cap to the full data set; keep a generous safety ceiling only to protect against runaway runs, and keep reporting bars simulated and the date range covered.

### 3. Timeframe roll-up for the 1-minute file
- Add an optional "aggregate to" choice on the backtest panel (1m → 5m / 15m / 1h), built server-side from the 1-minute rows.
- This means one 1-minute import can power every higher timeframe, and long-range studies run far faster than bar-by-bar over 7M rows.

### 4. Import guidance in the UI
- On the Data sets page, show per-data-set coverage (first bar, last bar, bar count) and a hint when a file appears to extend beyond what is already stored.

## Technical notes

- `src/routes/datasets/index.tsx`: add target-dataset selection, batch retry/backoff, pause/cancel, and duplicate-vs-new row accounting; keep the existing chunked reader and `upsert ... ignoreDuplicates`.
- `src/lib/backtest-run.server.ts`: replace `loadRowBars` array accumulation with a paged generator consumed by the engine; retire `MAX_RUN_BARS = 1_000_000` in favour of a much higher guard.
- `src/lib/backtest/engine.ts`: accept an async iterable of bars in addition to an array (indicator warm-up uses a rolling window, so no full-history array is required).
- Add a server-side roll-up step that folds N one-minute rows into a single bar before the engine sees them.
- No schema change is required; `dataset_bars` already has the unique `(dataset_id, t)` key the resumable path relies on.

## Order of work

1. Streaming server run + cap removal (unblocks the 5-minute full history immediately).
2. Resumable/appendable import with retries.
3. Timeframe roll-up.
4. Data set coverage hints.
