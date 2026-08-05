# WIT-TEST-03-finalize — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed.

## 2. Commit hashes on wit-tests, in order

1. `6465952` — **WIT-TEST-03: full Playwright suite (T1-T16) against the published app**
   Configurable base URL (`E2E_BASE_URL`, defaults to the published app; `webServer`
   only starts for localhost); `baseline.spec.ts` (T1-T3); `edits-reach-engine.spec.ts`
   (T4-T6); `bad-inputs.spec.ts` (T7-T9); `valid-variant.spec.ts` (T12);
   `honest-fields.spec.ts` +T15; `exit-rule-noop.spec.ts` (T16); two harness-race fixes
   in `helpers.ts` (engine-status loading, "Previous runs" query not yet resolved).

2. `1514565` — **WIT-TEST-03: env hygiene — track .env again, .env.e2e for test creds**
   Re-tracked `.env` (verified identical to `main`'s copy, public values only, no
   `TEST_` vars, no secrets). Narrowed `.gitignore` to ignore only `.env.e2e` and
   `.env.local`. `playwright.config.ts` now loads `.env.e2e` before `.env` so it wins
   on any overlapping name. Added tracked `.env.e2e.example`.

## 3. Tracked-file / gitignore verification

```
$ git ls-files | grep -E '^\.env'
.env
.env.e2e.example

$ git check-ignore -v .env.e2e
.gitignore:47:.env.e2e  .env.e2e
```

`.env` is tracked (matches `main` exactly — diffed byte-for-byte, six public Supabase
values only). `.env.e2e` is not tracked and is gitignored. `.env.e2e.example` is
tracked with empty placeholder values.

## 4. Confirmation: `bun run e2e` ran with no credentials in the shell

```
$ env | grep -i "TEST_EMAIL\|TEST_PASSWORD"
(no output — nothing exported)

$ bun run e2e -- e2e/run-screen.smoke.spec.ts --workers=1
  ✓  1 [chromium] › sign in and reach the backtest run form (8.2s)
  1 passed (9.2s)
```

Confirmed: the suite signs in successfully sourcing credentials from `.env.e2e` alone.

## 5. Per-test results (final clean run against the published app)

Total wall-clock for the full suite: **88 seconds** (14 passed, 1 failed).

| Test | Result | Notes |
|---|---|---|
| smoke | ✅ pass | 7.9s |
| T1 | ✅ pass | 5.2s — exact baseline numbers |
| T2 | ✅ pass | 7.4s — two runs identical |
| T3 | ✅ pass | 5.9s — Previous-runs row matches result panel |
| T4 | ✅ pass | 5.0s — stop 8→40 changes result |
| T5 | ✅ pass | 5.3s — target 2×→4× changes result |
| T6 | ✅ pass | 7.9s — stop 8 vs stop 32 differ |
| **T7** | ❌ **FAIL** | 5.2s — see below |
| T8 | ✅ pass | 7.2s — 15min timeframe blocked, names `granularity` |
| T9 | ✅ pass | 6.7s — crossover entry blocked, names `trigger` |
| T12 | ✅ pass | 6.0s — 1min timeframe runs, returns a result |
| T13 | ✅ pass | 3.4s — no Symbol/capital/quantity/Long-Short controls |
| T14 | ✅ pass | 3.4s — "Stop (ticks)" / "Position size (not applied)" |
| T15 | ✅ pass | 3.4s — "Exit rule (not applied)" label is live |
| T16 | ✅ pass | 6.2s — exit rule pinned as a no-op, confirmed live |

**T7 (Stop (ticks) = 8.5 → should block, message about whole ticks): still FAILS after
Jim's fresh publish. Not assuming this is fixed — reporting the actual behavior:**

- **Expected**: run blocked before submit, toast/banner naming the stop-ticks field.
- **Actual**: toast reads `"Queued on the engine — results will appear here when it
  finishes."` — the run is accepted and a real job is queued. Earlier in this session
  (before the fresh publish), letting an identical `8.5`-ticks run complete returned
  `netPnl: -27,153.75, trades: 326, winRate: 7.1%, profitFactor: 0.07` — a real,
  different-from-baseline result computed from a non-integer tick count.
- Current `main` source (`src/lib/wit/wire-config.ts:286`) **does** have the
  `!Number.isInteger(stopTicks)` blocker — verified by reading the file directly on
  this branch. T15 passing in this same run confirms the *client* bundle (the relabeled
  "Exit rule (not applied)" field) is current. The blocker that fails to fire lives in
  a *server* function (`submitEngineBacktest` → `compileWireConfig`), which on this
  stack may deploy on a different path/cadence than the client bundle Lovable's
  "Publish" updates. I can't inspect Lovable's deploy pipeline from here to confirm
  that theory — flagging it as the most likely explanation, not a verified cause.

## 6. Tests not written, and why

- **T10** (bad exit rule → should block): dropped per your decision #2 — the exit rule
  field has no effect on the engine at all (confirmed live: `bars_in_trade >= 1` vs the
  saved `time >= 16:00` produced byte-identical results), so there's nothing for a bad
  value in that field to block. Writing a "must block" test for a field the engine
  never reads would be testing fiction.
- **T11** (value area % = "seventy" → should block): dropped per your decision #3 — the
  run screen has no override field for value area % at all; it only exists on the
  strategy's Specification tab, and editing+saving that would mutate the shared "E2E
  Test ORB" fixture that every other test in this suite depends on.

## 7. Real product bugs seen

- **T7 above is the one live finding**: `Stop (ticks) = 8.5` is accepted and run by the
  published app instead of being blocked, even though the blocking check is present in
  current `main` source and the honest-label change from the same commit range (T15) is
  confirmably live. This is exactly the "wrong input ran instead of blocking" pattern —
  a non-integer tick count silently produced a real, different P&L number rather than
  being rejected.
- No case of two different inputs producing identical numbers, other than the
  *expected and pinned* one (T16 — exit rule truly has no engine effect, which is
  disclosed to the user via the "(not applied)" label, not hidden).

## 8. Push/merge/secrets confirmation

- `git status --short` on `wit-tests`: clean.
- `git branch -vv` shows `wit-tests` with no upstream tracking branch — nothing pushed.
- No merge to `main` was performed.
- No credential file is tracked: `git ls-files | grep -E '^\.env'` shows only `.env`
  (public values, verified identical to `main`) and `.env.e2e.example` (empty
  placeholders). `.env.e2e`, the file that actually holds `TEST_EMAIL`/`TEST_PASSWORD`,
  is gitignored and was never staged.
