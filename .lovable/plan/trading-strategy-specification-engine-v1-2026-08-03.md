# Trading Strategy Specification Engine — v1

Turn a pasted strategy description into a complete, deterministic Strategy Definition, with accounts, AI extraction, validation scoring, and Markdown export.

## Scope for this build

Inputs: manual entry, pasted transcript/article text, and pasted code (Pine Script, EasyLanguage, Python, NinjaScript). YouTube URL, website URL, and PDF ingestion are deferred.

## Look and feel

Clean light documentation aesthetic: white page, #F4F6FA surfaces, #2563EB accent, #0F172A text. Spec-sheet typography, generous whitespace, monospace for rules and code. No dark terminal styling.

## Screens

1. **Auth** — email/password sign up and sign in. Everything else is behind login.
2. **Dashboard** — recent strategies as cards with name, source type, completeness bar, validation status chip, last edited. Search and status filter. "New strategy" button.
3. **Strategy Wizard** — step-by-step flow with a progress rail:
   - Step 1: Source (choose manual / transcript / code, paste content, name it)
   - Step 2: AI extraction (runs the model, shows extracted rules per section)
   - Step 3: Clarifying questions (AI-generated questions the user answers inline; answers feed back into the spec)
   - Step 4: Review and validate
   - Autosave after every step.
4. **Strategy Definition Viewer** — all 17 sections as collapsible cards, each field editable inline, saved on blur. Assumptions and Ambiguities render as their own tables, ambiguities with status Resolved / Needs User Input / Unknown / Cannot Determine.
5. **AI Review Panel** — side panel on the viewer: extracted rules, open questions, warnings, per-section confidence.
6. **Validation Panel** — errors, warnings, missing required fields, contradictions, suggestions, plus the four scores (Completeness, Determinism, Ambiguity, Execution Confidence).
7. **Export** — download or copy the specification as Markdown.

## Spec sections covered

Metadata, Market, Chart, Setup, Market Bias, Entry Rules, Order Execution, Stop Loss, Profit Target, Position Sizing, Trade Management, Exit Rules, Filters, Trade Constraints, Assumptions, Ambiguities, Validation.

## AI behaviour

The model is instructed never to invent rules silently. For each section it either extracts a rule from the source, records an explicit assumption with its interpretation (e.g. "strong breakout" -> `close > previous_high`), or raises an ambiguity with a status. Entry/exit rules must come back as Boolean expressions. Every extracted item carries a confidence value.

## Validation engine

Runs client-side over the stored spec, independent of the AI:
- Completeness: filled required fields / total required fields
- Determinism: share of rules that are machine-evaluable expressions with no subjective wording (scans for a banned-phrase list: "strong", "confirmation", "weakens", "significant", etc.)
- Ambiguity: unresolved ambiguities against total
- Execution confidence: weighted blend of the three
Contradiction checks include: stop and target on the same side, exit rules without entry rules, position sizing referencing risk with no stop defined, timeframe missing while rules reference higher-timeframe bias.

## Technical notes

- Lovable Cloud for auth and storage. Tables: `profiles`, `strategies` (owner, name, source type, raw source, status, scores), `strategy_sections` or a single JSONB `definition` column on `strategies` — using JSONB keeps the 17-section shape flexible; plus `strategy_questions` for the clarifying-question loop. RLS scoped to `auth.uid()` on every table with matching grants.
- AI extraction via Lovable AI Gateway inside a TanStack server function, using a strict JSON schema for the Strategy Definition so output is parseable. Auth-protected, called from the component, not from a public loader.
- Routes: `/` (dashboard), `/auth`, `/strategies/new`, `/strategies/$id` (viewer + panels), all app routes under an authenticated layout.
- Markdown export generated client-side from the definition JSON; JSON/YAML/PDF export can be added later from the same source of truth.

## Not in this version

YouTube transcript fetch, website scraping, PDF upload, JSON/YAML/PDF export, version history, code generators.
