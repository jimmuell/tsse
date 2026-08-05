# WIT-TEST-08-rerun-after-credential-fix — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed. On `main` @ `0f6953e`, clean working tree.

## 2. Task 1 — did sign-in succeed?

**Yes.** `e2e/run-screen.smoke.spec.ts` passed — signed in with the corrected
`.env.e2e` credentials and landed on `/` as expected, in 5.5s.

## 3. Task 2 — per-test results and total wall-clock time

Full suite run against the published app, 18 tests, 6 workers:

| Test | Result | Time |
|---|---|---|
| T1 (baseline run returns known-good numbers) | ✅ | 10.0s |
| T2 (same inputs run twice → identical numbers) | ✅ | 10.6s |
| T3 (run appears in "Previous runs", matches) | ✅ | 10.0s |
| T4 (Stop 8→40 changes result vs. baseline) | ✅ | 5.5s |
| T5 (Profit target 2×→4× changes result vs. baseline) | ✅ | 5.8s |
| T6 (stop 8 vs. 32 differ — ticks not read as points) | ✅ | 8.7s |
| T7 (Stop 8.5 → blocked, whole-ticks message) | ✅ | 8.5s |
| T8 (15min timeframe → blocked) | ✅ | 7.5s |
| T9 (crossover entry → blocked) | ✅ | 8.1s |
| T12 (1min timeframe runs and returns a result) | ✅ | 6.7s |
| T13 (no Symbol/capital/qty/Long-Short fields) | ✅ | 3.4s |
| T14 (Stop/Position-size field labels) | ✅ | 3.1s |
| T15 (Exit rule field label) | ✅ | 4.9s |
| T16 (exit rule genuinely a no-op, pinned) | ✅ | 8.4s |
| smoke (sign in, reach run form) | ✅ | 4.9s |
| GET / returns 200, real HTML | ✅ | 0.66s |
| GET /auth returns 200, real HTML | ✅ | 0.60s |
| cross-origin `_serverFn` POST refused (403) | ✅ | 6.7s |

**18 passed, 0 failed. Total wall-clock: 22.8s** (per Playwright's own summary
line; parallelized across 6 workers, so this is materially faster than the
sum of individual test times above).

## 4. What failed

Nothing. No assertions were weakened to make anything pass — this is the
suite as committed on `main`.

## 5. Task 3 — is the ChangePasswordDialog now proven end to end?

**Yes.** Sign-in succeeded against the published app using the password value
Jim set via the signed-in `ChangePasswordDialog` and recorded in `.env.e2e`
(after correcting the transcription error that caused WIT-TEST-07's
failure). That's the complete round trip: a real user, on a real account,
used the in-app control to set a new password, and that exact new password
authenticates against the live Supabase backend. The dialog is proven
end-to-end, not just by code review.

## 6. Commit hash, force-push confirmation

Report committed on `main` (this file, added in the same commit as this
report). Pushed with a plain `git push origin main` — no force-push used or
needed. See the accompanying printed summary for the exact commit hash.
