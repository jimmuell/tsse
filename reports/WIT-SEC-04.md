# WIT-SEC-04-rescue-the-guards — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed. Branch `wit-sec-04` created fresh off current `main` @
`2b19b8b` (the stale local `wit-sec-04` pointer from an earlier, interrupted
attempt at this same rescue was deleted and recreated from scratch, since `main`
had moved substantially since then — a new admin panel, a new test account, the
fixture rebuild).

## 2. Task 1 — service-role auth guard

`src/lib/security/server-fn-service-role-auth.test.ts` checks: for every
`createServerFn` exported anywhere under `src/`, if its file reaches the
service-role/admin Supabase client (`supabaseAdmin`, imported statically or
dynamically, or a direct `SUPABASE_SERVICE_ROLE_KEY` reference), that specific
function must chain `requireSupabaseAuth` — or be named in
`AUTH_EXEMPT_SERVER_FUNCTIONS`, which is empty and stays empty.

**Passing, against current main:**
```
$ bun test src/lib/security/server-fn-service-role-auth.test.ts
 1 pass
 0 fail
```
This is a real, useful data point, not a formality: it confirms the new
`admin.functions.ts` (`getAdminOverview`, `setUserRole`, `getAllRuns` — none of
which existed when this guard was first written) all correctly chain
`requireSupabaseAuth` before touching the service-role client.

**Failing, on a planted violation** — added `src/lib/_planted-violation.functions.ts`
with an unauthenticated `createServerFn` calling `supabaseAdmin.auth.admin.listUsers`:
```
error: Found 1 createServerFn export(s) that reach the service-role client without
requireSupabaseAuth — this is an unauthenticated admin-power endpoint, exactly the
shape of the setPasswordDirect back door (WIT-SEC-02). ...
  lib/_planted-violation.functions.ts — plantedUnauthenticatedAdminFn()
 0 pass
 1 fail
```
Named the exact file and function. Removed the plant; `bun test` back to green.

## 3. Task 2 — credential-literal guard

`src/lib/security/no-credential-literals.test.ts` scans every `.ts`/`.tsx` under
`src/` for: (A) an identifier containing `password`/`email` followed later in the
same statement by `?? "<literal>"` — the exact shape of the bug that shipped
twice; (B) `password: "<literal>"` / `email: "<literal>"` object-key hardcoding;
(C) any quoted literal shaped like an actual email address. Deliberately does not
fire on env-key lookups (`import.meta.env["VITE_TEST_PASSWORD"]`), JSX attributes
(`type="password"`), type annotations, or destructuring — verified empirically
against the real tree, not just reasoned about.

**Passing, against current main:**
```
$ bun test src/lib/security/no-credential-literals.test.ts
 1 pass
 0 fail
```
The literal and the auto sign-in button are both confirmed gone from `auth.tsx`.

**Failing, on a planted violation** — temporarily reintroduced the exact
`?? "test@tsse.com"` / `?? "plantedFake123"` fallback shape into `auth.tsx`:
```
error: Found 3 possible credential literal(s) in src/ ...
  routes/auth.tsx:109 — plantedEmail = email ?? "test@tsse.com"
  routes/auth.tsx:110 — plantedPassword = password ?? "plantedFake123"
  routes/auth.tsx:109 — "test@tsse.com"
 0 pass
 1 fail
```
Named both literals precisely. Reverted immediately; `git diff` on `auth.tsx`
confirmed empty afterward, `bun test` back to green (12/12 across 3 files).

## 4. Task 3 — signed-in change password

**Still needed — checked first, not assumed.** `/reset-password` (the app's only
`supabase.auth.updateUser` call site) requires a genuine recovery-link session
(`hasRecoveryLink` check on the URL hash/query); a signed-in user visiting it
directly is marked `"invalid"` and the form never renders. No settings/account
page exists. Grepped all of `src/` for `updateUser` — one call site, gated the way
described above.

Brought across the `ChangePasswordDialog` in `AppShell.tsx` (available to any
signed-in user, header icon next to Sign out) — `supabase.auth.updateUser({password})`
only, no admin API, no service-role key, acts on the caller's own session and
cannot touch any other account.

**Not re-verified live against the real account this session, on purpose.** This
exact component was already proven to work end-to-end in an earlier session
(changed the password, confirmed sign-in with the new value succeeded). A prior
live round-trip verification against the *previous* test account is what stranded
that account's password when the revert step failed partway — I'm not repeating
that same live test against the current real account (`jamesmueller5220@gmail.com`)
without a specific reason to. Code review + `tsc` confirm it's wired correctly; the
mechanism itself is unchanged from what already worked.

## 5. Task 4 — stale branches deleted

Diffed both against current `main` before deleting anything:

- **`wit-sec-01`**: would have reintroduced `src/lib/dev-auth.functions.ts`,
  deleted the entire admin panel, and reverted `auth.tsx`/`reset-password.tsx` to
  a pre-outage shape — every one of those is either the exact vulnerability this
  work removes or actively destructive to merge. Its only unique value —
  `no-credential-literals.test.ts` — is now rescued onto `wit-sec-04`. Deleted.
- **`wit-sec-02`**: the branch itself had **zero commits** (identical to
  whatever `main` was at branch time) — all its real work existed only in a
  stashed, uncommitted diff. Extracted both guard tests and the
  `ChangePasswordDialog` from that stash; nothing else in it was unique. Deleted,
  and dropped both now-redundant stash entries (`wit-sec-04`'s own earlier WIP
  stash and the `wit-sec-02` stash) since their content is fully captured in this
  branch's commit.

## 6. bun test, tsc, full e2e suite

```
$ bunx tsc --noEmit
(clean, exit 0)

$ bun test
 12 pass, 0 fail — Ran 12 tests across 3 files.
```

Full suite against the published app: **18/18 passed, 97 seconds.**

| Test | Result | Time |
|---|---|---|
| T7 (stop 8.5 blocked) | ✅ | 9.3s |
| T8 (15min timeframe blocked) | ✅ | 8.0s |
| T9 (crossover entry blocked) | ✅ | 7.7s |
| T1 (baseline numbers) | ✅ | 8.9s |
| T2 (run twice, identical) | ✅ | 7.0s |
| T3 (Previous runs row matches) | ✅ | 5.6s |
| T4 (stop 8→40 differs) | ✅ | 4.5s |
| T5 (target 2×→4× differs) | ✅ | 5.4s |
| T6 (stop 8 vs 32 differ) | ✅ | 7.5s |
| T16 (exit rule no-op, pinned) | ✅ | 7.1s |
| T13 (no Symbol/capital/qty/Long-Short) | ✅ | 4.7s |
| T14 (Stop/Position size labels) | ✅ | 3.0s |
| T15 (Exit rule label) | ✅ | 3.4s |
| GET / returns 200 | ✅ | 0.8s |
| GET /auth returns 200 | ✅ | 0.1s |
| cross-origin `_serverFn` POST refused | ✅ | 3.0s |
| smoke (sign in, reach run form) | ✅ | 3.2s |
| T12 (1min timeframe runs) | ✅ | 5.0s |

## 7. Commit and push/merge confirmation

Commit `9841adc` — "WIT-SEC-04: rescue the two guard tests and the signed-in
change-password control" — on branch `wit-sec-04`. Nothing pushed (no upstream
tracking). Nothing merged. No password value was ever printed or logged.
