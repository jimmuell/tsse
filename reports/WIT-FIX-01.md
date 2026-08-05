# WIT-FIX-01-decimal-eater — Completed

## 1. STEP 0 output

```
origin  https://github.com/jimmuell/tsse.git (fetch)
origin  https://github.com/jimmuell/tsse.git (push)
/Users/jameslmueller/dev/tsse
```

Matches. Gate passed. Branch `wit-decimal-fix` created off `origin/main` after
pulling the three new commits (`55aeb78`, `d0c0d57`, `b665de8`) fast-forward, no
conflicts.

## 2. The exact change, and the unit-test before/after

`src/lib/backtest/parser.ts`, `normalizeRuleText`'s list-marker strip:

```diff
- .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
+ .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
```

`\s*` → `\s+`: a marker is only stripped when at least one whitespace character
follows it, so "1. Buy when close > vah" still cleans up but "8.5", "12.75", and
"-5" no longer look like a marker followed by the rest of the number. This is
exactly the fix specified in the task, and I agree it's the right one — the
narrowest possible change that distinguishes "this is a list bullet" from "this is
a number," with no other tokenizer behavior touched.

**Before/after, from `bun test` itself** — I ran the new test suite against the
*unfixed* regex first (via `git stash`) to prove the tests actually catch the bug,
not just describe it:

| Case | Before (unfixed) | After (fixed) |
|---|---|---|
| stop `"8"` → ticks, blockers | 8, none ✅ (already correct) | 8, none ✅ |
| stop `"8.5"` → blocked? | **not blocked**, ticks silently became `5` ❌ | blocked, names `exits.stop.ticks` ✅ |
| stop `"12.75"` → blocked? | **not blocked**, ticks silently became `75` ❌ | blocked, names `exits.stop.ticks` ✅ |
| target `"2.5 * risk"` → value | **5** (silently) ❌ | 2.5 ✅ |
| target `"1.5 * risk"` → value | **5** (silently) ❌ | 1.5 ✅ |
| `normalizeRuleText("1. close > vah")` | `"close > vah"` ✅ | `"close > vah"` ✅ |
| `normalizeRuleText("-5")` | **`"5"`** (sign eaten) ❌ | `"-5"` ✅ |
| `parseExpression("-5")` | parsed as positive 5 ❌ | `{k:"un", op:"-", arg:{k:"num", v:5}}` ✅ |

Unfixed run: **3 pass / 7 fail** — and the failures reproduce the measured symptoms
exactly (`12.75` unblocked, `2.5 * risk` and `1.5 * risk` both landing on `5`).
Fixed run: **10 pass / 0 fail**.

## 3. TASK 3 — sweep: every field that reaches the wire config

`compileWireConfig` reads exactly 5 fields from the strategy definition. I traced
each one's actual code path to confirm whether it goes through `parseExpression`
(and therefore `normalizeRuleText`) or not — not assumed from the field's name:

| Field | Path to wire config | Goes through `normalizeRuleText`? | Verdict |
|---|---|---|---|
| `chart.timeframe` | `deriveGranularity` — own `toLowerCase()+replace()` lookup table, never calls `parseExpression` | **No** | Never affected |
| `entry.long_entry` | `deriveTrigger` → `tryParse` → `parseExpression` | **Yes** | Affected in principle, but low real-world exposure — `deriveTrigger` requires a comparison with a *bare* `close` operand, and entry expressions realistically don't start with a raw decimal the way a stop/target formula does. I found no evidence this altered a real spec, but the code path is shared. |
| `stop_loss.stop_formula` | `deriveStopTicks` → `tryParse` → `parseExpression` | **Yes** | **Directly, dangerously affected** — this is the confirmed bug (WIT-DIAG-01: `8.5`→ticks 5, `12.75`→ticks 75, silent, zero blockers). |
| `profit_target.target_formula` | `deriveTargetRMultiple` → `tryParse` → `parseExpression` | **Yes** | **Directly, dangerously affected** — the case the prompt flagged as most dangerous: `1.5 * risk` and `2.5 * risk` both silently became `5R`, a change that "looks entirely plausible on screen." |
| `setup.value_area_pct` | `parseValueAreaPct` / `scanValueAreaPct` — both use their own dedicated regex directly on the raw string, never call `parseExpression` | **No** | Never affected |

**Bottom line: 2 of the 5 wire-config fields (stop, target) were directly and
dangerously affected. Timeframe and value area % were never at risk — different
code entirely. Long entry shares the code path but I found no realistic trigger for
it.**

## 4. Test results and tsc result

```
$ bun test
 10 pass
 0 fail
 20 expect() calls
Ran 10 tests across 1 file. [34ms — 71ms across runs]
```

`bunx tsc --noEmit`: clean for everything this task touched. 12 pre-existing errors
remain in unrelated files (`AppShell.tsx`, `routes/index.tsx`, `routes/runs/index.tsx`,
`routes/strategies/$id.tsx`, `routes/strategies/new.tsx`, `routes/datasets/index.tsx`)
— all TanStack Router `search` param type mismatches. I confirmed these are
pre-existing and not caused by this change: `git stash` and re-running `tsc` on bare
`main` @ `b665de8` produces the identical 12 errors. Not touched, per this task's
scope.

One thing worth noting: adding `@types/bun` (needed so `tsc` can resolve the
`bun:test` module used by the new test file) initially caused Bun's global `fetch`
type override to leak into the whole program via a triple-slash reference,
producing 3 new errors in `client.ts` / `client.server.ts` / `auth-middleware.ts`
("Property 'preconnect' is missing"). I did not add `@types/bun` to the shared
`tsconfig.json` `types` array or reference it in-file for exactly that reason — I
excluded `**/*.test.ts` from the root `tsconfig.json` instead, so `bunx tsc --noEmit`
never sees the test file at all (it still runs fine directly via `bun test`, which
doesn't consult this tsconfig to decide what to execute).

## 5. Commit hash

`9a67134` — "WIT-FIX-01: fix the decimal-eating list-marker regex in
normalizeRuleText" on branch `wit-decimal-fix`.

- Nothing pushed: `wit-decimal-fix` has no upstream tracking branch.
- Nothing merged to `main`: `main` is still at `b665de8`, untouched.
- `engine.server.ts`, `engine.functions.ts`, `backtest-callback`, and `verify_jwt`
  were not read or modified.

## 6. Same-family findings from the sweep

The client-side validator (`compileStrategy` in `src/lib/backtest/compile.ts`, used
for the "Executable rules" grid's inline warnings/blockers on the run screen) calls
the exact same `parseExpression` for **every** `RULE_FIELDS` entry — including
`entry.short_entry`, `position_sizing.sizing_formula`, and `exit.exit_conditions`,
none of which reach the wire config at all (the engine has no long/short toggle,
ignores sizing, and — per WIT-TEST-03's T16 — ignores the exit rule entirely). So
those three fields were in the *same bug family* (a decimal or negative constant
typed into them would have been silently mangled in the client-side preview too),
but since none of them are ever sent to the engine, the practical consequence was
limited to a possibly-wrong inline warning message in the UI, not a corrupted audit.
They're fixed by the same one-line change (shared module), so no separate action was
needed — flagging only because the task asked what else looked like the same class
of bug.
