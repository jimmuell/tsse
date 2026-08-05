# WIT-TEST-06-seed-the-fixture — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed. Branch `wit-test-06` off `main` @ `a42f1a8`.

## 2. Task 1 — sign-in works

Ran the smoke test against the published app. It signed in successfully with the
new account (`jamesmueller5220@gmail.com`, credentials already in `.env.e2e`) and
failed only on the next step — "Strategy 'E2E Test ORB' was not found" — exactly
as expected before seeding. Sign-in itself is confirmed working.

## 3. Task 2 — seeding mechanism and idempotency

**Chose: inserting the `strategies` row directly as the signed-in user, under RLS
— not driving the UI.** Two reasons:

1. It's the *same* path the app's own UI uses. `src/routes/strategies/new.tsx`
   creates a strategy with `supabase.from("strategies").insert({ user_id: user.id,
   ... })` using the caller's own authenticated client — no service-role key
   involved there either. I'm not bypassing anything; I'm using the identical,
   already-supported mechanism.
2. The UI's "New strategy" flow is built for AI extraction from source text/video
   — non-deterministic, and not the shape of what's needed here (an exact,
   hand-specified 17-section spec with precise values). A direct insert lets me
   write those exact values with zero risk of an LLM paraphrasing them.

`scripts/seed-fixture.ts` signs in, queries `strategies` for
`name = "E2E Test ORB"` scoped to the caller's own `user_id`, and does nothing if
found. **Verified idempotent by running it twice**:
```
$ bun run seed-fixture
Created fixture "E2E Test ORB" — id d3f72261-d6cf-4f85-9398-891dc55b793f.

$ bun run seed-fixture
Fixture "E2E Test ORB" already exists (id d3f72261-d6cf-4f85-9398-891dc55b793f, ...) — doing nothing.
```

## 4. Task 3 — proved by running it, not by reading it

Ran T1 (`baseline.spec.ts`) against the freshly seeded fixture, over
01/01/2025 → 08/04/2026, 5min, commission 0, slippage 0:

| | Expected | Actual |
|---|---|---|
| Net P&L | -28,526.25 | -28,526.25 |
| Trades | 326 | 326 |
| Win rate | 6.4% | 6.4% |
| Profit factor | 0.06 | 0.06 |
| Date range | 2025-01-02 → 2026-04-09 | 2025-01-02 → 2026-04-09 |

**Exact match.** No adjustment was needed or made to the expected numbers.

## 5. Task 4 — old identifiers removed

Grepped `e2e/`, `scripts/`, `reports/`, and `e2e/README.md` for the old strategy
id (`208f677d-799c-47f9-938c-d8260560987c`) and the old email (`test@tsse.com`).
**Only one file had either**: `scripts/inspect-jobs.ts`, which hardcoded the old
strategy id in a `STRATEGY_ID` constant used to filter `backtest_jobs`. Replaced
it with a by-name lookup (`FIXTURE_NAME = "E2E Test ORB"` → query `strategies` for
that name under the signed-in user, then use the resulting id) — the same pattern
the seeding script and the e2e suite itself already use. Verified by running it
against the new account/fixture; it correctly found and printed the one job from
the Task 3 verification run.

Every other file already referred to the fixture by name only — nothing else
needed changing, including every past report in `reports/`, which mention "E2E
Test ORB" but never embed the literal id or the old email as current fact.

## 6. Task 5 — full suite

**18/18 passed, 83 seconds** — the fastest clean run of this suite yet, against
the published app with the new account and freshly seeded fixture.

| Test | Result | Time |
|---|---|---|
| T7 (stop 8.5 blocked) | ✅ | 7.9s |
| T8 (15min timeframe blocked) | ✅ | 6.3s |
| T9 (crossover entry blocked) | ✅ | 6.8s |
| T1 (baseline numbers) | ✅ | 4.8s |
| T2 (run twice, identical) | ✅ | 6.8s |
| T3 (Previous runs row matches) | ✅ | 4.8s |
| T4 (stop 8→40 differs) | ✅ | 5.8s |
| T5 (target 2×→4× differs) | ✅ | 4.8s |
| T6 (stop 8 vs 32 differ) | ✅ | 6.5s |
| T16 (exit rule no-op, pinned) | ✅ | 6.4s |
| T13 (no Symbol/capital/qty/Long-Short) | ✅ | 3.7s |
| T14 (Stop/Position size labels) | ✅ | 2.6s |
| T15 (Exit rule label) | ✅ | 2.8s |
| GET / returns 200 | ✅ | 0.6s |
| GET /auth returns 200 | ✅ | 0.08s |
| cross-origin `_serverFn` POST refused | ✅ | 3.0s |
| smoke (sign in, reach run form) | ✅ | 3.2s |
| T12 (1min timeframe runs) | ✅ | 4.9s |

## 7. Commit and push/merge confirmation

Commit `70964fe` — "WIT-TEST-06: seed the E2E Test ORB fixture programmatically,
remove old identifiers" — on branch `wit-test-06`. Nothing pushed (no upstream
tracking branch). Nothing merged. `tsc --noEmit` and `bun test` both clean.
No password value was ever printed or logged.
