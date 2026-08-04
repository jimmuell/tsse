# Deploy the backtest-callback function (and fix a schema gap first)

## What I found

The function code exists at `supabase/functions/backtest-callback/index.ts`, and `supabase/config.toml` already pins `verify_jwt = false` for it. No invocation logs exist yet — that only means it has never been called.

But the project currently does not build. The callback code reads and writes columns on `backtest_jobs` that the database does not have:

- `engine_run_id` — the engine's own run identifier, which is the only way a callback can find the job it belongs to
- `symbol` and `timeframe` — used to label the stored result

Without `engine_run_id` the callback can never match an incoming result to a job, so deploying as-is would fail at runtime even if it deployed cleanly.

## Plan

1. **Migration** — add the missing columns to `backtest_jobs`: `engine_run_id` (text, unique so a repeated callback can't create ambiguity), `symbol`, and `timeframe`. Existing access rules stay as they are: a user only ever sees their own jobs.
2. **Fix the two type errors** in `src/lib/engine.functions.ts` and the public callback route so the build is green again. No behaviour change beyond writing `engine_run_id` when a job is submitted.
3. **Deploy** `backtest-callback`. Its code and `config.toml` stay exactly as they are (`verify_jwt` remains false).
4. **Report the callback URL** — `https://<project>.supabase.co/functions/v1/backtest-callback` — and confirm an unsigned request is rejected with 401, which proves signature checking is live.

## Then: the shared secret

`WIT_CALLBACK_HMAC_SECRET`, `ENGINE_URL` and `WIT_ENGINE_SERVICE_KEY` are already stored here. The engine must hold the identical callback secret. Stored secret values can't be read back out, so if the engine side doesn't have it, we generate a fresh one and set it in both places.
