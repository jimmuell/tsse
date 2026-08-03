# Metadata extraction + YouTube source links

## What's actually happening

Metadata is being extracted — it isn't blank. For your current strategy the Metadata section holds:

- Name: "90% of Trading Strategies Are Garbage (Use This One Instead)" (the video title you typed)
- Author: "Unknown"
- Source: "Manual"
- Version: "1.0", Confidence: 90, plus a full description

So the weak part is provenance: the transcript alone contains no channel name, no URL, no publish date, so the model fills Author/Source with placeholders. That's correct behaviour for a raw transcript paste, but it's not useful metadata.

Yes — if you give the engine the YouTube link alongside the transcript, we can populate real metadata.

## What to build

### 1. Source link field
Add an optional "Source URL" input on the New Strategy page and on the strategy header, stored on the strategy record.

### 2. YouTube metadata lookup
When the URL is a YouTube link, fetch its public metadata server-side (oEmbed: title, channel/author name, canonical URL, thumbnail). No API key needed. Non-YouTube URLs still get stored and passed through as the source reference.

### 3. Feed it into extraction
Pass the fetched title/author/URL to the extraction prompt as authoritative provenance, and pre-fill Metadata:
- strategy_name — video title (unless you named it yourself)
- author — channel name
- source — the canonical URL
- version — leave empty rather than inventing "1.0"

Rule stays intact: nothing invented. If no link is provided, Author/Source stay empty and become clarifying questions instead of "Unknown"/"Manual".

### 4. Fix the stuck "extracting" state
One older strategy is still sitting in `extracting` with an empty spec because the auto-run after creation failed silently and nothing retried. Add: mark status `failed` on error, show a visible "Extraction failed — retry" banner on the strategy page, and auto-run extraction on load whenever status is `extracting`/`failed` and the spec is empty.

## Technical notes

- Migration: add `source_url text` to `strategies`.
- New `src/lib/source-metadata.server.ts`: parse YouTube video IDs (watch, youtu.be, shorts, embed) and call `https://www.youtube.com/oembed?url=...&format=json`; return null on failure (never block extraction).
- `strategy.functions.ts` selects `source_url`, resolves metadata, passes `sourceMeta` into `runExtraction`.
- `extraction.server.ts`: add a provenance block to the user prompt and a system rule — use provided provenance verbatim for metadata fields; leave unknown provenance empty, never placeholder text.
- `$id.tsx`: retry banner + broadened auto-extract condition; `new.tsx`: URL field with light validation.

## Not included

Automatic transcript pulling from a YouTube URL — you'd still paste the transcript. That can come later if you want it.
