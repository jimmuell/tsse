# WIT-SEC-02-close-the-back-door — Completed (superseded mid-task) + incident response

## What actually happened, in order

1. I started WIT-SEC-02 (remove the unauthenticated `setPasswordDirect` back door,
   add a signed-in "Change password" control, add a service-role/auth guard test)
   on branch `wit-sec-02`, working locally.
2. Mid-task, a full e2e run against the published app hung across every test.
   Investigation showed the *published app itself* was returning HTTP 500 on
   every route — a live production outage, unrelated to my local branch (nothing
   from it had been pushed or deployed).
3. Independently, Lovable diagnosed and fixed the outage, and **also independently
   fixed both WIT-SEC-01 (hardcoded credential) and WIT-SEC-02 (the
   `setPasswordDirect` back door)** directly on `main` — more completely than
   either of my branches, via a real `supabase.auth.resetPasswordForEmail` flow.
   See `.lovable/plan/restore-the-app-and-secure-test-authentication-2026-08-05.md`
   and `.lovable/plan/email-based-password-reset-with-backdoors-removed-2026-08-05.md`.
4. This request asked me to verify the restore, clean up two now-orphaned files
   from an intermediate fix attempt, and add durable published-app health checks
   so this specific class of outage (a whole route tree silently 500ing) gets
   caught in minutes, not hours.

Work for this request is on a new branch, **`wit-sec-03-incident-response`**, off
current `main` — not `wit-sec-02`, whose core fix is superseded (see the branch
status section below).

## 1. Confirmed: the decimal fix and e2e suite survived on `main`

```
$ grep -n '\\s+/' src/lib/backtest/parser.ts
59:    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())

$ grep -n "Number.isInteger" src/lib/wit/wire-config.ts
286:  } else if (!Number.isInteger(stopTicks)) {

$ ls e2e/
README.md  bad-inputs.spec.ts  baseline.spec.ts  edits-reach-engine.spec.ts
exit-rule-noop.spec.ts  helpers.ts  honest-fields.spec.ts  run-screen.smoke.spec.ts
valid-variant.spec.ts

$ bun test
 10 pass, 0 fail — Ran 10 tests across 1 file.
```

Both intact, untouched by the incident or its fix.

## 2. Full suite against the published app: 18/18 passed, 101 seconds

(15 pre-existing tests + 3 new published-health checks, described below.)

| Test | Result | Time |
|---|---|---|
| T7 (stop 8.5 blocked) | ✅ | 7.9s |
| T8 (15min timeframe blocked) | ✅ | 7.5s |
| T9 (crossover entry blocked) | ✅ | 7.0s |
| T1 (baseline numbers) | ✅ | 5.1s |
| T2 (run twice, identical) | ✅ | 6.6s |
| T3 (Previous runs row matches) | ✅ | 5.5s |
| T4 (stop 8→40 differs) | ✅ | 5.7s |
| T5 (target 2×→4× differs) | ✅ | 4.7s |
| T6 (stop 8 vs 32 differ) | ✅ | 13.4s |
| T16 (exit rule no-op, pinned) | ✅ | 9.1s |
| T13 (no Symbol/capital/qty/Long-Short) | ✅ | 3.8s |
| T14 (Stop/Position size labels) | ✅ | 3.7s |
| T15 (Exit rule label) | ✅ | 3.6s |
| **GET / returns 200** | ✅ | 0.6s |
| **GET /auth returns 200** | ✅ | 0.09s |
| **cross-origin `_serverFn` POST refused** | ✅ | 3.5s |
| smoke (sign in, reach run form) | ✅ | 3.4s |
| T12 (1min timeframe runs) | ✅ | 6.8s |

This timing (101s) matches every healthy run before the outage (~100–108s) —
confirming the restore is solid, not just "not currently 500ing."

## 3. Deleted the two orphaned middleware files

`src/lib/csrf-middleware.ts` and `src/lib/error-middleware.ts` were leftovers
from an intermediate fix attempt: a hand-written same-origin CSRF check and a
standalone error-boundary middleware, written to work around
`createCsrfMiddleware` resolving to `undefined` in the deployed bundle. Once
framework versions were pinned, `src/start.ts` went back to importing
`createCsrfMiddleware` directly from `@tanstack/react-start` and defines its own
inline error-handling middleware — neither of the two files above is referenced
anywhere. Verified with a repo-wide grep before deleting (zero matches), and
confirmed `tsc --noEmit` stays clean afterward.

## 4. Added `e2e/published-health.spec.ts` — three checks, three findings this
would have caught in minutes

All three use **absolute URLs to the published app**, independent of the
suite's configurable `E2E_BASE_URL` — the point is that they catch a production
outage even if someone runs the rest of the suite against localhost.

1. **`GET /` returns 200**, and the body does not contain "This page didn't
   load" (the app's own generic error boundary — exactly what every route
   rendered during the outage).
2. **`GET /auth` returns 200**, same check, plus confirms real sign-in markup
   ("Sign in") is present.
3. **Cross-origin `_serverFn` POST is refused (403); same-origin is not.**
   Rather than hardcoding a `_serverFn/<hash>` URL (that hash is a content hash
   of the function's build output and changes on rebuild — a hardcoded one
   would eventually 404 and rot silently), the test signs in, opens the E2E
   Test ORB strategy's Backtest tab (which calls the real `engineStatus`
   function on load), and captures the actual live request URL from network
   traffic. It then POSTs to that same URL twice: once with a spoofed
   cross-origin `Origin` header (must get exactly `403`), once with the real
   origin (must **not** get `403` — it may still reject for its own reasons,
   e.g. wrong HTTP method for a GET-typed function, but not by CSRF).

Manually verified with `curl` before writing the Playwright version, against
the real endpoint: cross-origin POST → `403`; same-origin POST → `405`
(method mismatch, since `engineStatus` is GET-typed) — confirming the CSRF
layer runs first and blocks cross-origin regardless of what the underlying
handler would otherwise do.

## 5. `tsc`, commit hash, push/merge confirmation

```
$ bunx tsc --noEmit
(clean, exit 0)
```

Commit `a2c7ef2` — "Incident response: remove orphaned middleware, add
published-health e2e checks" — on branch `wit-sec-03-incident-response`, off
current `main`. Nothing pushed (no upstream tracking branch). Nothing merged.

## Status of `wit-sec-01` and `wit-sec-02`

**Neither is safe to merge as-is.** Both predate the outage and Lovable's fix,
and both would regress `main` if merged directly — `wit-sec-01` re-adds
`src/lib/dev-auth.functions.ts`, `csrf-middleware.ts`, and `error-middleware.ts`
(all now correctly deleted); `wit-sec-02`'s (stashed, uncommitted) `auth.tsx`
changes conflict with Lovable's more complete rebuild. Their core security fixes
are **superseded** — `main` already fixes both the hardcoded-credential issue and
the unauthenticated password-reset back door, via a different and more complete
implementation (real email-based reset with rate limiting) than either branch
attempted.

- **`wit-sec-01`** (2 commits: `e4b21bf`, `62eae9c`): the credential-literal fix
  itself is moot (`main` deleted the whole auto-sign-in button rather than
  env-gating it). One piece is still worth carrying forward: the regression
  guard `src/lib/security/no-credential-literals.test.ts`, which isn't on `main`
  and would still catch a hardcoded credential reappearing anywhere in `src/`.

- **`wit-sec-02`**: the branch pointer itself has **zero commits** — it's
  identical to old `main` (`1efd2ad`). All the actual work (back-door removal,
  a "Change password" dialog for signed-in users, a service-role/auth guard
  test) is **uncommitted and stashed** (`stash@{0}`, "WIT-SEC-02 in-progress
  work"), never pushed anywhere. The back-door removal is moot. Two pieces are
  still not on `main` and still valuable:
  - `src/lib/security/server-fn-service-role-auth.test.ts` — a guard that fails
    if any `createServerFn` reaching the service-role client isn't wrapped in
    `requireSupabaseAuth`. Verified both passing and failing (planted a fake
    unauthenticated admin function, confirmed it named the exact file/function,
    removed it) before the outage interrupted the task.
  - A "Change password" dialog in `AppShell.tsx`, available to any signed-in
    user, calling `supabase.auth.updateUser({password})` — no admin API, no
    email round-trip. Verified end-to-end against the real test account
    (changed password, signed in with the new one, reverted, signed in with
    the original again) before the outage.

**Recommendation**: don't merge either branch. If you want the two guard tests
and the change-password dialog, I can cherry-pick just those three pieces onto
a fresh branch off current `main` in a follow-up — say so and I'll do it. I
did not do this unprompted since it's additional scope beyond what was asked
in this message.
