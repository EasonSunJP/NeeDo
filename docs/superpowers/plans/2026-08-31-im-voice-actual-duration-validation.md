# IM Voice Actual Duration Validation Implementation Plan

> **Execution:** Use test-driven development and the previously approved subagent-driven workflow. Keep every task scoped to this Step 13 hardening microstep.

**Goal:** Reject voice uploads whose real media duration or tracks violate the 59-second voice-message contract, and persist only a server-derived duration.

**Architecture:** Add a worker-isolated `music-metadata` duration-probe port, inject it into `ImVoiceMessageService`, validate the normalized result before storage, and preserve the existing eligibility/storage/transaction/SSE ordering.

## Constraints

- No schema or migration.
- No new endpoint or mock/fake API.
- Preserve WebM/MP4/Ogg and 8 MiB limits.
- `durationSeconds` stays in the query only as a 1..59 compatibility hint.
- Actual duration accepts at most 59.5 seconds; message metadata remains an integer 1..59.
- Invalid media never reaches storage or message creation.
- Do not send or persist a browser voice message in this microstep.

## Task 1: Add real media fixtures and RED probe tests

**Files:**
- Add `backend/tests/fixtures/im-voice/*`
- Add `backend/tests/im-voice-duration-probe.test.ts`

- Generate small synthetic silent WebM, MP4, and Ogg fixtures, audio-plus-video fixtures for each accepted MIME, and an over-limit fixture; commit the outputs, not the generation dependency.
- Assert only stable `format.hasAudio` / `format.hasVideo`; never infer policy from experimental `trackInfo` or codec strings. Missing/non-boolean flags fail closed.
- Write tests for valid duration/track metadata, malformed data, all three video-bearing containers, timeout, two-active/eight-queued FIFO behavior, ninth-queued rejection, and exactly-once cleanup.
- Run the focused test and confirm RED because the probe does not exist.

## Task 2: Implement the worker-isolated duration probe

**Files:**
- Add `backend/src/services/im-voice-duration-probe.ts`
- Modify `backend/package.json`
- Modify `backend/package-lock.json`

- Add a pinned compatible `music-metadata` dependency through npm.
- Implement an inline `eval: true` CommonJS worker using Node 22 `require("music-metadata")`; do not use a source/dist-dependent worker filename.
- Implement the probe port, strict boolean result validation, two-second timeout, two-worker/eight-queued FIFO bounds, `32/8/2 MiB` old/young/stack resource limits, injectable worker factory, exactly-once slot release/termination, and stable error mapping.
- Run source-mode probe tests, backend build, a compiled-dist real-worker smoke test, lint, and dependency audit appropriate to this package.

## Task 3: Make the server-derived duration authoritative

**Files:**
- Modify `backend/src/services/im-voice-message.service.ts`
- Modify `backend/src/routes/im-voice-message.routes.ts`
- Modify `backend/src/app.ts`
- Modify `backend/tests/im-voice-message.service.test.ts`
- Modify `backend/tests/im-voice-message-api.test.ts`

- First write RED tests for ordering, exact `59.5` acceptance, just-over rejection, track/flag rejection, hint difference `=1` acceptance and `>1` rejection, metadata derivation, and zero-side-effect failure.
- Inject the probe into the service and default route wiring.
- Keep preflight first, probe second, storage third, transaction-time create fourth.
- Persist only the clamped server-derived duration.

## Task 4: Update contract documentation and verify

**Files:**
- Modify `backend/src/api/openapi.ts`
- Modify `backend/tests/openapi.test.ts`
- Modify `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify `README.md` only if the runtime/dependency contract needs an operator-facing note.

- Document the hint-versus-authority behavior, actual media checks, tolerance, and failure semantics.
- Run focused probe/service/API/OpenAPI tests.
- Run backend lint/build/full tests and the repository production-build verification.
- Inspect `git diff`, confirm no fixture contains user audio, and arrange an independent final code review.
