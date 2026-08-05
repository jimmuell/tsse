# WIT-TEST-04 — Full suite re-run against the published app, post-fix

## Context

Re-ran the full Playwright suite against `https://trade-spec-scribe.lovable.app`
after the WIT-FIX-01 decimal-eater fix (`normalizeRuleText`'s list-marker regex)
merged to `main` (`3b1972a`) and was published live.

Before running, `wit-tests` needed to catch up to `main` — pulling produced real
merge conflicts in `package.json`, `tsconfig.json`, and `bun.lock`, since both
branches had independently added tooling (main: `@types/bun` + a `*.test.ts`
tsconfig exclude, from WIT-FIX-01; wit-tests: Playwright + `scripts/**/*.ts`
tooling, from WIT-TEST-03/WIT-DIAG-01). Both sides were purely additive with no
semantic overlap, so I combined them (union of `package.json` scripts/deps, union
of `tsconfig.json` `include` + `exclude`) and regenerated `bun.lock` via
`bun install` rather than hand-merging the lockfile. Merge commit: `d474f64`.

That merge also surfaced a real tooling collision worth noting: with both the
`bun:test` unit test and the Playwright `e2e/*.spec.ts` files now present in the
same tree, bare `bun test` was picking up the Playwright specs too (via its
default file-discovery glob) and failing to run them with the wrong runner. Fixed
by adding a `[test] root = "src"` scope to `bunfig.toml`, so `bun test` only ever
looks at `src/**/*.test.ts`.

## Results

**15/15 passed. Total wall-clock: 102 seconds (1m42s).**

| Test | Result | Time | Notes |
|---|---|---|---|
| smoke | ✅ pass | 4.0s | |
| T1 | ✅ pass | 8.8s | exact baseline numbers |
| T2 | ✅ pass | 7.8s | two runs identical |
| T3 | ✅ pass | 5.7s | Previous-runs row matches result panel |
| T4 | ✅ pass | 6.6s | stop 8→40 changes result |
| T5 | ✅ pass | 8.9s | target 2×→4× changes result |
| T6 | ✅ pass | 7.7s | stop 8 vs stop 32 differ |
| **T7** | **✅ pass** | **9.7s** | **stop 8.5 → blocked before submit, message names the field, no new run row** |
| T8 | ✅ pass | 7.0s | 15min timeframe blocked, names `granularity` |
| T9 | ✅ pass | 7.1s | crossover entry blocked, names `trigger` |
| T12 | ✅ pass | 7.0s | 1min timeframe runs, returns a result |
| T13 | ✅ pass | 3.9s | no Symbol/capital/quantity/Long-Short controls |
| T14 | ✅ pass | 3.9s | "Stop (ticks)" / "Position size (not applied)" |
| T15 | ✅ pass | 3.7s | "Exit rule (not applied)" label |
| T16 | ✅ pass | 7.3s | exit rule pinned as a no-op |

## T7 — confirming it passed for the right reason

T7's assertion (`expectBlocked`, `e2e/helpers.ts`) requires one of two things and
then checks a third, regardless of which: either the Run button is disabled with a
blocker banner naming the field, or clicking Run surfaces a toast naming the
field — and either way, no new row may appear in "Previous runs" afterward. It
passed via the toast path, with the toast text containing "ticks", and the
Previous-runs count unchanged after a 3-second settle wait. That's exactly "blocks
before submit, names the field, produces no run" — not a weaker or coincidental
pass. This is the same test, unmodified, that failed on every prior run in this
project (WIT-TEST-03, and again just before the fix in WIT-DIAG-01/WIT-FIX-01) —
it flipped from a real, reproducible failure to a real, reproducible pass with
only the source fix in between.

## Commit

`d474f64` — merge commit on `wit-tests` syncing in `main`'s decimal fix (see
above for conflict resolution details). No test expectations were changed to make
this pass.
