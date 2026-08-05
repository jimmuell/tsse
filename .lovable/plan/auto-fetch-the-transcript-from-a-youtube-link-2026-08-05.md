# Auto-fetch the transcript from a YouTube link

## What changes

On the New strategy screen, pasting a valid YouTube link fetches the video details and captions automatically — no button press needed. The transcript lands in the transcript field as it does today.

The button stays as a manual fallback (for retries or links typed slowly) and is relabelled **Fetch transcript**, with **Fetching transcript…** while it runs.

## Behaviour

- As soon as the link field contains a recognisable YouTube URL (`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/live/`), the fetch runs automatically after a short pause in typing (about 600 ms), so a paste triggers it immediately and mid-typing keystrokes do not.
- Each URL is fetched only once per session; editing the link to a different video triggers a new fetch. The same link is not refetched on every keystroke or re-render.
- Auto-fetch never overwrites transcript text the user already typed or pasted — if the transcript box has content, the auto run fills only title/metadata and warns that the existing transcript was kept. Pressing the button explicitly still replaces it.
- Existing behaviour is unchanged otherwise: canonical URL replaces what was typed, the strategy name is filled from the video title when blank, and a video with no public captions shows the "paste the transcript below" warning.
- Failures from auto-fetch show a quieter message than a manual press, so a half-typed link does not produce a red error while typing.
- Auto-fetch only applies when Source type is "Video link (YouTube)".

## Technical notes

Single file: `src/routes/strategies/new.tsx`.

- Extract the current `loadVideo` body into a shared routine taking a `{ silent, preserveExistingTranscript }` flag; the button calls it in loud/replace mode, the effect in quiet/preserve mode.
- Add a debounced `useEffect` on `sourceUrl` + `sourceType` with a `lastFetchedUrl` ref for de-duplication and a cleanup that clears the timer.
- No server changes: `resolveVideoSource` and `fetchYouTubeVideoSource` already return the transcript.
