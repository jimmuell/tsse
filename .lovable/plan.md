# Deploy the backtest-callback function

## What's true right now

The function code exists in this project at `supabase/functions/backtest-callback/index.ts`, and `supabase/config.toml` already pins `verify_jwt = false` for it. No invocation logs exist yet, which only means it has never been called — not that it is missing.

In this setup backend functions deploy automatically, so no clicking is needed on your side.

## What I'll do (one action, no code changes)

1. Trigger a deploy of `backtest-callback` so we know for certain it is live. Its code and `config.toml` stay exactly as they are.
2. Report back its callback URL, which is the value the engine must be configured with:
   `https://<project>.supabase.co/functions/v1/backtest-callback`
3. Confirm it responds (an unsigned request should be rejected with 401 — that is the correct, healthy answer and proves signature checking is on).

## Then: the secret

The engine and this app must hold the same callback secret. `WIT_CALLBACK_HMAC_SECRET` is already stored here, along with `ENGINE_URL` and `WIT_ENGINE_SERVICE_KEY`. If the engine side does not yet have the identical secret value, you will need to set it there — I cannot read the stored value back out, so if it was lost we generate a new one and set it in both places.

Nothing else in the app changes.
