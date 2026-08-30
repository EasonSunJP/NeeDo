# IM Voice Actual Duration Validation Design

## Goal

Make the backend, rather than the client query parameter, authoritative for the duration of uploaded IM voice messages. The server must reject malformed, non-audio, video-bearing, or materially over-limit WebM, MP4, and Ogg uploads before file storage or message creation.

This is one Step 13 hardening microstep. It does not change the recording overlay, add a new API, alter Prisma schema, or send/persist a browser acceptance recording.

## Approved approach

Use `music-metadata` as a pure-JavaScript parser inside a short-lived Node worker thread.

- `music-metadata` parses the complete bounded in-memory upload with `parseBuffer(bytes, { mimeType, size }, { duration: true, skipCovers: true })`.
- The worker isolates parser CPU and memory from the Express event loop.
- The parent terminates the worker after two seconds and applies worker resource limits.
- The existing raw-body limit and storage validation retain the 8 MiB bound and MIME/signature allowlist.
- No `ffprobe`, external process, Docker package, schema, migration, or parallel media service is introduced.

## Validation order

1. Keep the existing integer client hint validation at `1..59` for request compatibility and cheap rejection.
2. Run the existing read-only authoritative send-eligibility preflight.
3. Probe the uploaded bytes in the worker.
4. Require a finite positive duration, `format.hasAudio === true`, and `format.hasVideo === false`.
5. Accept actual duration up to `59.5` seconds. The 500 ms margin covers MediaRecorder/container finalization jitter; it is not exposed as user-visible recording time.
6. Derive the authoritative message duration as `clamp(ceil(actualDuration), 1, 59)`.
7. Reject when the client hint differs from that authoritative integer by more than one second.
8. Only after all checks pass, save the file and enter the existing transaction-time `RealtimeService.createMessage` gate.

Probe/track/timeout/boundary/mismatch failures return the existing stable `400 / error.im.voice_duration_invalid`. They create no file, message, unread increment, audit success, or SSE publication.

## Worker boundary

`ImVoiceDurationProbePort` exposes one method returning normalized metadata:

```ts
probe(bytes, mimeType): Promise<{
  durationSeconds: number;
  hasAudio: boolean;
  hasVideo: boolean;
}>
```

The production adapter uses a dedicated worker. The service depends on the port so message tests can use deterministic probes without starting threads. The worker result is treated as untrusted and validated again by the parent.

Track policy uses the documented `IFormat.hasAudio` and `IFormat.hasVideo` booleans, not experimental `trackInfo` and not codec/name guesses. The library's WebM/Matroska and MP4 parsers derive these flags from container tracks; its supported Ogg stream parsers set them for audio/video streams. If parsing fails, either flag is absent/non-boolean, or the flags do not prove audio-only media, the parent fails closed. Tests contain pure-audio and valid audio-plus-video samples for every accepted MIME so a library upgrade cannot silently weaken this contract. A video-bearing container may be rejected either by a successful parse with `hasVideo === true` or by a safe parser failure; it must never produce an accepted audio-only result.

The worker entry is an inline CommonJS script created with `eval: true`. It calls `require("music-metadata")`, which is supported by the repository's Node 22 runtime, and therefore does not depend on a `.ts` worker path under tsx/Jest or a different `.js` path under `dist`.

The default probe permits exactly two active workers and eight queued requests. A ninth queued request fails closed immediately. The queue is FIFO. Every task settles exactly once; message, error, invalid result, and timeout paths terminate the worker and release its slot exactly once before starting the next queued task. Any worker exit before a successful message fails immediately regardless of exit code; an exit emitted after settlement is ignored.

Each worker has a two-second timeout and these V8 limits:

```ts
{
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8,
  stackSizeMb: 2
}
```

The adapter accepts an internal worker-factory seam used only by unit tests. Controlled workers exercise FIFO order, queue overflow, message/error/exit/timeout races, exactly-once settlement, termination, and slot release without relying on parser timing.

## Media samples and tests

Committed fixtures are short, synthetic silence only. They contain no user speech or private content. Tests never invoke ffmpeg; ffmpeg may be used once during development to generate fixtures.

Coverage includes:

- valid short WebM/Opus, MP4/AAC, and Ogg/Opus parsing;
- valid audio-plus-video WebM, MP4, and Ogg rejection through strict flags or fail-closed parser errors;
- malformed signature-only files that the current storage layer accepts but a real parser must reject;
- exact 59.5-second acceptance, just-over-59.5-second rejection, and 59-second metadata clamp;
- client/server duration difference of exactly one second acceptance and greater-than-one rejection;
- timeout, malformed worker result, FIFO queue bound, and exactly-once worker cleanup;
- source-mode probe tests plus a post-build smoke test that loads the compiled CommonJS probe and runs its real inline worker;
- ordering proof that eligibility precedes probing, probing precedes storage, and transaction-time message creation remains last;
- API success and rejection without filesystem or message side effects.

## Documentation and compatibility

The existing endpoint shape remains:

```text
POST /api/v1/im/conversations/:conversationId/voice?fileName=<name>&durationSeconds=<1..59>
```

OpenAPI and Step 13 documentation will state that `durationSeconds` is a client hint and the server-parsed duration is authoritative. Existing clients remain wire-compatible.
