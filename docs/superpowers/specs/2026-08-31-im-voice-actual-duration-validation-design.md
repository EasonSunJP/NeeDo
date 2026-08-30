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
4. Require a finite positive duration, at least one audio track, and no video track.
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

The default probe permits at most two active workers. Additional requests enter a bounded FIFO queue; when the queue is full, the probe fails closed with the same stable validation error. Each worker has a two-second timeout and conservative V8 resource limits.

## Media samples and tests

Committed fixtures are short, synthetic silence only. They contain no user speech or private content. Tests never invoke ffmpeg; ffmpeg may be used once during development to generate fixtures.

Coverage includes:

- valid short WebM/Opus, MP4/AAC, and Ogg/Opus parsing;
- malformed signature-only files that the current storage layer accepts but a real parser must reject;
- audio-plus-video rejection;
- over-59.5-second rejection and 59-second metadata clamp;
- client/server duration mismatch rejection;
- timeout, malformed worker result, queue bound, and worker cleanup;
- ordering proof that eligibility precedes probing, probing precedes storage, and transaction-time message creation remains last;
- API success and rejection without filesystem or message side effects.

## Documentation and compatibility

The existing endpoint shape remains:

```text
POST /api/v1/im/conversations/:conversationId/voice?fileName=<name>&durationSeconds=<1..59>
```

OpenAPI and Step 13 documentation will state that `durationSeconds` is a client hint and the server-parsed duration is authoritative. Existing clients remain wire-compatible.

