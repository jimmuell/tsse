# E2E (Playwright)

## How a test signs in

`/auth` is real Supabase email/password auth (`supabase.auth.signInWithPassword`) — the
same form a real user fills in. There is no dev/test login bypass in this app.

Tests source credentials from env, never hardcode them:

- `TEST_EMAIL`
- `TEST_PASSWORD`

Set these in your shell or an untracked `.env.e2e` before running `bun run e2e`.

## Reaching the run screen

The "run screen" is the Backtest tab on a strategy's detail page
(`/strategies/$id`, `BacktestPanel`). It requires a strategy that:

- belongs to the signed-in test account (RLS-scoped), and
- has a saved, non-`failed` specification (`definition` populated) — the tab renders
  the form as soon as a definition exists, no validation/completeness threshold
  required.

The smoke test picks whichever strategy is first in the signed-in account's
dashboard list — it does not depend on a specific ID.

**Seeding**: this repo has no seed script and no local Supabase stack (this project
talks to the hosted Lovable Cloud project directly — see `supabase/config.toml`).
For now, the test account must already own at least one strategy, created the
normal way (sign in → "New strategy" → paste/extract a description). Provisioning
this automatically (a dedicated test account + a seeded strategy row) is left for a
follow-up — see WIT-TEST-01 report for why it wasn't done here.

## Running

```
bun run e2e
```

Runs headless Chromium against `bun run dev` (started automatically on :8080).
