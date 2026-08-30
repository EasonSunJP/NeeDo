# Task 1 — Harden capture and preview playback

## Status

Implemented and committed the scoped IM voice-recording hardening on `main`.

## RED

Command:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
```

Result: exit 1. The new expectations failed against the old hook as intended:

- `getUserMedia` received `{ audio: true }` instead of the exact ideal constraints.
- A track that remained muted still created a Blob URL.
- Preview playback was neither prepared for audible output nor gated on media readiness.

Vitest summary: `1 failed` file; `9 failed | 13 passed` tests. The pre-fix autoplay race also surfaced the expected unhandled pending-playback rejection.

## GREEN

Command:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
```

Result: exit 0 — `1 passed` file, `22 passed` tests.

Additional type verification:

```bash
npm run lint
```

Result: exit 0 (`tsc -b --noEmit`).

## Changed files

- `src/features/im/useImVoiceRecording.ts`
  - Requests the specified ideal single-channel, echo-cancellation, noise-suppression, and auto-gain constraints.
  - Monitors the owned live audio track and rejects recordings that never unmute.
  - Prepares audio for audible playback, waits for media data, and invalidates readiness/playback work on cleanup paths.
- `src/features/im/useImVoiceRecording.test.tsx`
  - Covers default media readiness in jsdom while preserving the explicit `HAVE_NOTHING` readiness-race coverage.

## Commit

`59ff20d0 fix(im): restore audible voice preview`

## Self-review

- Verified the audio input listeners are removed through stream teardown, including stop, cancel, recorder error, recorder-start failure, and unmount paths.
- Verified muted input clears visible preview state, does not create a Blob URL, and cannot transition into sending.
- Verified all playback attempts set `defaultMuted=false`, `muted=false`, `volume=1`, and `playsinline` before `play()`.
- Verified `canplay`, `loadeddata`, media error, cancellation, send, URL cleanup, generation invalidation, and unmount cannot permit a stale `play()` call or overwrite a later phase.
- Ran `git diff --check` before the commit; it reported no whitespace errors.

## Concerns

No known scoped code concerns. The full repository test suite was not run because the task explicitly requested the focused hook suite and the baseline has an unrelated `scripts/i18n-quality-audit.test.ts` 5-second timeout. No browser/hardware microphone acceptance was performed in this frontend-only task.
