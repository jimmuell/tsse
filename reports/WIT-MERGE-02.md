# WIT-MERGE-02-guards — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed.

## 2. Merge commit hash and origin/main status

Merged `wit-sec-04` into `main` with `--no-ff`. No conflicts — 4 files changed
(2 new guard test files, `AppShell.tsx`, `reports/WIT-SEC-04.md`).

Merge commit: **`bdb7306`** — "Merge branch 'wit-sec-04' into main"

Pushed with a plain `git push origin main` (no force). `origin/main` now points
at `bdb7306`, identical to local `main` (`git rev-parse origin/main HEAD` returned
the same hash twice). Up to date, no push protection was needed.

## 3. bun test, tsc, published-health results

```
$ bun test
 12 pass
 0 fail
 22 expect() calls
 Ran 12 tests across 3 files.

$ bunx tsc --noEmit
(clean, exit 0)

$ bunx playwright test e2e/published-health.spec.ts --reporter=list
 ✓ GET / returns 200 with real HTML, not the error page (1.3s)
 ✓ GET /auth returns 200 with real HTML, not the error page (1.4s)
 ✓ cross-origin _serverFn POST is refused (403); same-origin is not (5.7s)
 3 passed (7.0s)
```

No regressions on any of the three checks.

## 4. What is now guarded (for a future session, without reading code)

Two automated regression guards now run on every `bun test`: the **service-role
auth guard** (`src/lib/security/server-fn-service-role-auth.test.ts`) fails the
build if any `createServerFn` export that reaches the Supabase service-role/admin
client is not wrapped in `requireSupabaseAuth` — this is the exact shape of the
`setPasswordDirect` back door (WIT-SEC-02), so any future unauthenticated
admin-power endpoint gets caught automatically instead of by hand. The
**credential-literal guard** (`src/lib/security/no-credential-literals.test.ts`)
fails the build if a hardcoded email/password literal (fallback via `??`, an
object-key literal, or any email-shaped quoted string) appears anywhere in `src/`
— this is the exact shape of the hardcoded `test@tsse.com` credential
(WIT-SEC-01) that shipped once already. Separately, the signed-in
`ChangePasswordDialog` in `AppShell.tsx` gives every user a legitimate,
admin-power-free way to rotate their own password, closing the gap that the
back door existed to plug in the first place.

## 5. Force-push confirmation

Nothing was force-pushed. `git push origin main` was a plain fast-forward push;
the merge commit was created locally first via `--no-ff` and pushed normally.
