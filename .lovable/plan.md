# Review: TradingGYM two-repo architecture, applied to this app

## Verdict

The architecture is sound and it also answers the open question from the last message ("how do we upload 18 years and a 1-minute dataset?"). If the engine owns the market data, this app stops trying to push millions of bars through the browser at all — that whole problem moves to the engine's own storage.

Three corrections are needed before it maps onto this codebase.

### 1. There are no "edge functions" here

This app is TanStack Start, not the classic Supabase-functions stack. The equivalents are:

- Front desk (browser -> our server, holds the engine key): a server function, `runBacktestOnServer`-style, already the pattern in `src/lib/backtest.functions.ts`.
- Callback (engine -> us): a public HTTP route under `src/routes/api/public/`, because the engine is an external caller that needs a fixed URL. It must verify a signature or shared secret before writing anything.

Same shape as the diagram, different names. No new Supabase edge functions should be created.

### 2. The "master key never leaves the platform" reasoning is only half right

The real reason the engine calls back rather than writing directly is that we should not hand a database service key to a third-party service — not that it is technically impossible. Worth stating correctly, because it makes the rule portable: the engine gets one narrow callback URL and one shared secret, nothing else.

### 3. Spinner -> results needs a fallback from day one

The document already identifies the failure mode (write succeeded, reader never heard). Live subscriptions are the fast path; a poll on the job row is the slow path. Ship both, plus the "how did this screen get its answer" log line, in the same change rather than after the next incident.

## What changes in this app

### Job table and status
A `backtest_jobs` row per run: strategy id, config, date range, status (queued / running / done / failed), engine version, error text, and a link to the resulting `backtest_runs` row. Owner-scoped access rules so a user only ever sees their own jobs.

### Submit path
A server function that validates input, compiles the strategy spec to the engine's payload, creates the job row, calls the engine with the secret key attached, and returns the job id. The browser never sees the engine URL or key.

### Callback path
`/api/public/backtest-callback`: verify the shared secret over the raw body, validate the payload, write stats/equity/trades into `backtest_runs`, flip the job to done. Reject anything unsigned.

### Screen
The Backtest tab subscribes to its job row, falls back to polling every few seconds, and logs which path delivered the result. On failure it shows the engine's error rather than a stuck spinner.

### Data sets
With the engine owning 18 years of ES (5-minute and 1-minute), the browser CSV importer and `dataset_bars` row storage stop being the primary path. Keep them for user-supplied files, but the default backtest source becomes "engine catalogue" — pick symbol, timeframe, date range, no upload.

### One definition of a strategy
The 17-section spec in this repo should be the single source of truth. The engine and the WIT lab both consume a versioned compiled payload derived from it, and every stored run records both the spec version and the engine version — otherwise numbers drift between the two sides and nobody can tell why.

## Secrets required

- Engine base URL and engine API key (used only inside server handlers).
- A callback shared secret, identical here and in the engine's config.

## Open questions for you

1. Does the engine already expose an async submit + callback API, or does that contract still need to be defined together?
2. Should the existing uploaded data sets stay available as a backtest source, or be retired once the engine catalogue is live?
3. Does the engine accept our compiled rule format, or does it only run the fixed MES ORB strategy today?

## Suggested order of work

1. Agree the engine's request/response and callback contract.
2. Job table + submit server function + public callback route with secret verification.
3. Backtest tab switched to job-based flow with live updates, polling fallback, and the delivery-path log line.
4. Engine catalogue as a data source; local uploads demoted to secondary.
