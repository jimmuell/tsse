# WIT-TEST-07-verify-password-change — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed.

## 2. Commit, tsc, bun test

Pulled `origin/main` — already up to date, no new commits since the last
session's merge. Landed on:

```
bdb730637eee4bcd8b7003c254322cb6d7e873c2
```

```
$ bunx tsc --noEmit
(clean, exit 0)

$ bun test
 12 pass
 0 fail
 22 expect() calls
 Ran 12 tests across 3 files.
```

Both clean.

## 3. Task 2 — did sign-in succeed with the rotated password?

**No — sign-in failed.** Ran `e2e/run-screen.smoke.spec.ts` against the
published app using the credentials currently in `.env.e2e`. The form
submitted (email and password fields filled, "Sign in" clicked), but the page
never navigated away from `/auth` — it stayed on `/auth` for the full 15s
timeout instead of landing on `/`. That's the app's behavior on a rejected
sign-in (Supabase returns an auth error and the page does not redirect); it is
not a timing or harness issue.

Per the task's explicit instruction, I stopped here — no recovery, reset, or
workaround attempted, and no full-suite run, since every other test in the
suite signs in the same way and would fail on the same root cause. No
password value was printed or logged at any point.

## 4. Task 3 — per-test results

**Not run.** Skipped per the STOP instruction in Task 2 — the whole suite
(T1–T16 plus the three published-health checks) depends on the same
`signIn()` helper that just failed, so running it would only reproduce the
identical failure 16+ times without new information. Deferred until the
credential issue is resolved.

## 5. What failed, actual vs. expected

| | Expected | Actual |
|---|---|---|
| URL after clicking "Sign in" | `https://trade-spec-scribe.lovable.app/` | `https://trade-spec-scribe.lovable.app/auth` (unchanged) |

Playwright error:
```
Error: expect(page).toHaveURL(expected) failed
Expected: "https://trade-spec-scribe.lovable.app/"
Received: "https://trade-spec-scribe.lovable.app/auth"
Timeout:  15000ms
  at helpers.ts:34 (signIn)
  at helpers.ts:39 (openStrategyBacktestTab)
  at run-screen.smoke.spec.ts:12
```

This means one of: the value now in `.env.e2e` doesn't match what the
password was actually rotated to, or the rotation via `ChangePasswordDialog`
didn't take effect on the account being signed into. I did not attempt to
distinguish between these — that's a credential-side question for Jim to
resolve.

## 6. Commit hashes, force-push confirmation

- `56faf5b` — "Add WIT-MERGE-02 report" (tidies the previously-untracked
  `reports/WIT-MERGE-02.md`, committed directly to `main` per this task's
  instructions).
- This report, `reports/WIT-TEST-07.md`, committed separately below.

Both pushed with a plain `git push origin main` — no force-push used or
needed.
