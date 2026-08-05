# WIT-DIAG-01-what-was-sent — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed.

## 2. What was actually sent — the table

`bun run inspect-jobs` (last 10 `backtest_jobs` for E2E Test ORB, newest first):

```
created_at               | status | stop_ticks | target | granularity | net_pnl      | trades | win_rate
2026-08-04T23:47:52 UTC  | done   | 5          | 2      | 5min        | -27,153.75   | 326    | 7.1%
2026-08-04T23:38:37 UTC  | done   | 8          | 2      | 1min        | -29,645      | 326    | 5.5%
2026-08-04T23:38:14 UTC  | done   | 8          | 2      | 5min        | -28,526.25   | 326    | 6.4%
2026-08-04T23:38:13 UTC  | done   | 8          | 2      | 5min        | -28,526.25   | 326    | 6.4%
2026-08-04T23:38:08 UTC  | done   | 32         | 2      | 5min        | -34,865      | 326    | 9.8%
2026-08-04T23:38:06 UTC  | done   | 8          | 2      | 5min        | -28,526.25   | 326    | 6.4%
2026-08-04T23:38:00 UTC  | done   | 8          | 4      | 5min        | -28,410      | 326    | 6.1%
2026-08-04T23:37:55 UTC  | done   | 40         | 2      | 5min        | -35,728.75   | 326    | 11.0%
2026-08-04T23:37:49 UTC  | done   | 8          | 2      | 5min        | -28,526.25   | 326    | 6.4%
2026-08-04T23:37:44 UTC  | done   | 8          | 2      | 5min        | -28,526.25   | 326    | 6.4%
```

Widening the window to 25 rows (temporary, for this investigation only — the
committed script stays at the spec'd 10) surfaced **six separate jobs**, spread
across a 22-minute span (23:25–23:47 UTC), all landing on the exact same triple:
`stop_ticks = 5, net_pnl = -27,153.75, win_rate = 7.1%`. Every one of those six is a
non-integer input (the hand-tested 8.5 and 8.1 among them) — repeated enough times
that this isn't a one-off fluke.

**Typed value → tick count actually sent → result:**

| Typed on screen | Ticks actually sent | Result |
|---|---|---|
| `8` | **8** | -28,526.25 / 326 / 6.4% (matches trusted baseline, confirmed 8× across the window) |
| `8.5` | **5** | -27,153.75 / 326 / 7.1% |
| `8.1` | **5** | -27,153.75 / 326 / 7.1% (same as 8.5 — matches what was observed by hand) |
| `32` | 32 | -34,865 / 326 / 9.8% (my own T6 test run) |
| `40` | 40 | -35,728.75 / 326 / 11.0% (my own T4 test run) |

## 3. Conclusion — which case is live, from the data

**Neither of the two named cases.**

- Not "8 → 32" (old points-to-ticks conversion still live): the plain-8 baseline
  consistently sends **8**, not 32, across every one of the 8+ baseline jobs in this
  window.
- Not "conversion gone but the guard is not running, so the literal float value
  passes through": if that were true, `8.5` would be sent as `8.5` (or an engine-side
  round of *that specific* value — 8 or 9). It is not. Every non-integer input in
  this data — both 8.5 and 8.1 — was sent as **5**, an integer unrelated to either
  typed value by any simple rounding, floor, or ceiling of the number itself.

The data does confirm one half of the second hypothesis: the `!Number.isInteger`
guard (present in current `main` source, `src/lib/wit/wire-config.ts:286`) is **not
running live** — a non-integer input is not blocked. But what replaces it isn't a
pass-through or a simple conversion of the typed value; it looks like a fixed
fallback (`5`) substituted whenever the stop input fails whatever validation the live
server is actually running. I read the current parser (`src/lib/backtest/parser.ts`)
to check for an obvious tokenizer bug that could produce this — it tokenizes "8.5"
and "8.1" correctly as `8.5`/`8.1`, so this isn't explained by anything in the source
on `main`. That means the server actually executing these submissions is running
code that differs from `main` in more than just "the guard is missing" — I can't
identify the exact mechanism without being able to inspect what's actually deployed,
which is outside this diagnosis.

## 4. Plain 8-tick baseline: 8, not 32

**8.** Every stored `wireConfig` for a plain `Stop (ticks) = 8` run in this window —
8 separate jobs across a 13-minute span, at both 5min and 1min granularity — has
`exits.stop.ticks = 8`. None show 32. The specific worry that motivated this
diagnosis (that the trusted baseline might secretly be a 32-tick run) is ruled out by
direct measurement.

## 5. What this means for T1 and the "known-good" baseline

**T1's baseline stands. No re-baselining needed, and no expected value was touched.**
The stored request for the exact scenario T1 exercises (`Stop (ticks) = 8`, saved
target/timeframe/value-area) genuinely sends `ticks: 8` to the engine, and
consistently returns `-28,526.25 / 326 trades / 6.4% win / 0.06 profit factor` — this
is confirmed by direct inspection of what was actually sent and returned, not by
re-deriving it from source.

**T7 remains a confirmed, real bug**, now better characterized than before: a
non-integer `Stop (ticks)` input is not blocked, and instead of being rejected or
passed through as typed, it silently becomes a fixed fallback value (`5` in every
observed case) and produces a real, different result. This is worse than "the guard
is missing" alone — the number a user sees on screen (`8.5`) is not the number that
gets audited (`5`), with no error, warning, or indication that a substitution
happened. Whoever picks up the fix for T7 needs to know it's not just "add back the
integer check" — something else is generating that `5`, and it isn't in
`src/lib/wit/wire-config.ts` or `src/lib/backtest/parser.ts` as they exist on `main`
today.

## 6. Commit hash and confirmations

- Commit: `b26ee6d` — "WIT-DIAG-01: read-only diagnostic for what was actually sent
  to the engine" (`scripts/inspect-jobs.ts`, `package.json` script alias,
  `tsconfig.json` include) on branch `wit-tests`.
- Nothing pushed: `wit-tests` has no upstream tracking branch.
- Nothing merged to `main`.
- No test expected values were edited — `e2e/baseline.spec.ts`'s T1 assertions are
  unchanged; this task only added a read-only diagnostic script.
- No changes to `wire-config.ts`, `engine.functions.ts`, `engine.server.ts`,
  `backtest-callback/index.ts`, or any submit path.
