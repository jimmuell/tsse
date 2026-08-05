# E2E (Playwright)

## How a test signs in

`/auth` is real Supabase email/password auth (`supabase.auth.signInWithPassword`) — the
same form a real user fills in. There is no dev/test login bypass on the published app
(a dev-only "Auto sign in" button exists but is stripped from production builds).

Tests source credentials from env, never hardcode them:

- `TEST_EMAIL`
- `TEST_PASSWORD`

Put these in `.env.e2e` (gitignored, loaded automatically by `playwright.config.ts` —
copy `.env.e2e.example` to start). `.env` is Lovable-managed and tracked in git, with
public values only (Supabase project id/URL and publishable key) — never put test
credentials there.

## The fixture strategy

Tests open the strategy named **"E2E Test ORB"** by name (not "whichever strategy is
first") — a fixed reference spec on the `TEST_EMAIL` account with known saved values
(5min timeframe, `close > vah` / `close < val` entries, 8-tick stop, `2 * risk` target,
70% value area). Tests only ever change run-screen _overrides_; none may edit and save
the strategy's own specification — the fixture must survive the suite unchanged.

## Running

```
bun run e2e
```

Defaults to the published app (`https://trade-spec-scribe.lovable.app`), which has the
engine secrets — no local server is started. Set `E2E_BASE_URL=http://localhost:8080` to
run against a local `bun run dev` instead (started automatically); that mode also needs
`ENGINE_URL` / `WIT_ENGINE_SERVICE_KEY` configured locally to actually reach the engine.

Run serially (`--workers=1`) — the suite writes real rows to the shared test account's
run history and reads "Previous runs" counts, so concurrent tests would race each other.

## Known gaps (see WIT-TEST-03 report for the full reasoning)

- **Value area %** has no override field on the run screen at all — it's only editable
  on the strategy's Specification tab, and editing that would mutate the shared
  fixture. No test covers blocking a bad value area % from the run screen.
- **Bad exit rule blocking** isn't tested — the exit rule field has no effect on the
  engine at all (see `exit-rule-noop.spec.ts`), so there's nothing for a bad value in
  that field to block.
