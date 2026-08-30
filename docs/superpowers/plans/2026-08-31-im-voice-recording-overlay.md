# IM Voice Recording Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared formal chat voice button open a blurred recording dialog, record for at most 59 seconds, automatically preview the stopped recording, and send the confirmed audio through a durable formal voice-message endpoint.

**Architecture:** Replace the page-owned press/drag/data-URL flow with a reusable `useImVoiceRecording` lifecycle hook and a presentational `ImVoiceRecordingOverlay`. Add a raw-audio backend route that performs read-only send eligibility preflight, validates and stores the audio, then delegates authoritative message creation and SSE publication to `RealtimeService`; retain the existing transaction-time friendship gate and compensate the stored file if message creation loses a race or otherwise fails.

**Tech Stack:** React 19, TypeScript 5.9, MediaRecorder/HTMLAudioElement, Vitest 4 + jsdom, Express 4, Zod, Prisma 7, Jest/Supertest, existing NeeDo formal IM Store/SSE/OpenAPI/i18n infrastructure.

## Global Constraints

- Implement only this Step 13 voice-message microstep; do not refactor other IM, Social, Booking, Schedule, NDP, or portal flows.
- Click starts the permission/recording flow. Remove the chat-only `voiceMode`, press-and-hold, release-to-send, and swipe-to-cancel behavior.
- The maximum is exactly 59 elapsed seconds. Reaching the limit stops and previews; it never auto-sends.
- Recording UI has cancel and stop only. Preview UI has cancel, replay, and paper-plane send only. Do not add transcription or a bottom semicircle.
- The overlay blurs/dims the current conversation without navigation and restores focus/scroll context after close.
- Never persist or send a data URL, `blob:` URL, or raw audio bytes in `Message.content`/metadata. The formal message stores `content: "语音"` plus a configured public media URL and safe metadata.
- Use existing `TEXT + metadata.needoMessageType = "voice"`; add no Prisma model, enum, table, or migration.
- Keep `message:create`, current identity scope, participant membership, recipient-blocked, friendship/business/group access policy, unread count, SSE, and response-message authority intact.
- Run eligibility preflight before file storage, then re-run the existing authoritative checks during `RealtimeService.createMessage`; the latter remains the race-safe gate.
- Accept only validated WebM, MP4, or Ogg raw audio up to 8 MiB. Derive the stored extension from validated MIME/signature, not from the client filename.
- A failed message create must remove the just-written file. A failed frontend send must retain the local Blob and preview controls for replay/retry/cancel.
- All new user-visible copy and `aria-label` text must use the existing five-language translation path.
- Preserve unrelated dirty files. Stage and commit only the files named in each task.
- Do not claim browser acceptance unless the actual 5180 listener is proven to serve this checkout and the two-account formal flow is exercised.

## File and Responsibility Map

**Backend data/security path**

- Create `backend/src/services/im-voice.storage.ts`: audio signature validation, opaque filename, bounded write, validated remove.
- Modify `backend/src/repositories/realtime.repository.ts`: read-only `checkMessageSendEligibility` matching membership, recipient block, and access-policy rules.
- Modify `backend/src/services/realtime.service.ts`: reusable error-mapping preflight, still followed by transactional `createMessage`.
- Create `backend/src/services/im-voice-message.service.ts`: preflight, storage, metadata construction, authoritative message creation, compensation delete.
- Create `backend/src/validators/im-voice-message.validator.ts`: path/query schemas for conversation, filename, and 1–59 second duration.
- Create `backend/src/controllers/im-voice-message.controller.ts`: parse content type/body and return the unified response.
- Create `backend/src/routes/im-voice-message.routes.ts`: auth, `message:create`, Zod, raw-body 8 MiB gate.
- Modify `backend/src/app.ts`: dependency wiring, route registration, and audio static-file allowlist.
- Modify `backend/src/api/openapi.ts`: formal voice-message endpoint contract.

**Frontend API/state path**

- Modify `src/features/realtime/api.ts`: raw Blob request returning one authoritative `RealtimeMessage`.
- Modify `src/features/im/contract.ts`: formal `sendVoiceMessage` contract.
- Modify `src/features/im/formal-api.ts`: call voice endpoint and map the returned message.
- Modify `src/features/im/store.ts`: insert the authoritative returned voice message only after success; no data-URL or optimistic voice bubble.

**Frontend interaction/view path**

- Create `src/features/im/useImVoiceRecording.ts`: permission, MediaRecorder, 59-second timer, preview playback, and cleanup state machine.
- Create `src/features/im/ImVoiceRecordingOverlay.tsx`: dialog visuals and accessible controls only.
- Modify `src/features/im/components.tsx`: voice icon becomes a direct open action; remove inline hold-to-talk UI/props.
- Modify `src/features/im/pages.tsx`: connect the shared hook, overlay, and formal Store send path.
- Modify `src/i18n/translations.ts` and `src/i18n/translations.test.ts`: new dialog, permission, preview, and error copy.
- Modify `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`: record the completed formal contract only after verification.

---

### Task 1: Add validated, removable voice-file storage

**Files:**
- Create: `backend/src/services/im-voice.storage.ts`
- Create: `backend/tests/im-voice.storage.test.ts`

**Interfaces:**
- Produces `ImVoiceMimeType`, `StoredImVoice`, and `ImVoiceStoragePort.save/remove`.
- Does not know about authentication, conversations, messages, public URLs, or Express.

- [ ] **Step 1: Write the failing storage tests**

Create `backend/tests/im-voice.storage.test.ts` with one valid minimal signature per supported container and explicit rejection/cleanup checks:

```ts
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImVoiceFileStorage } from "../src/services/im-voice.storage";

const samples = [
  ["audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01])],
  ["audio/mp4", Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])],
  ["audio/ogg", Buffer.from("OggS\u0000", "binary")],
] as const;

describe("ImVoiceFileStorage", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "needo-im-voice-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each(samples)("stores validated %s with a trusted extension", async (mimeType, bytes) => {
    const storage = new ImVoiceFileStorage(directory);
    const stored = await storage.save(bytes, mimeType);

    expect(stored.fileKey).toMatch(/^[a-f0-9]{64}\.(?:webm|mp4|ogg)$/);
    expect(stored).toMatchObject({ mimeType, size: bytes.length });
    await expect(access(join(directory, stored.fileKey))).resolves.toBeUndefined();
  });

  it("rejects spoofed, empty, and oversized audio before writing", async () => {
    const storage = new ImVoiceFileStorage(directory, 8);

    await expect(storage.save(Buffer.from("fake"), "audio/webm")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
      statusCode: 400,
    });
    await expect(storage.save(Buffer.alloc(0), "audio/ogg")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
    await expect(storage.save(Buffer.alloc(9), "audio/mp4")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it("removes only a validated opaque key and treats an absent file as cleaned", async () => {
    const storage = new ImVoiceFileStorage(directory);
    const stored = await storage.save(samples[0][1], samples[0][0]);

    await storage.remove(stored.fileKey);
    await storage.remove(stored.fileKey);
    await expect(readdir(directory)).resolves.toEqual([]);
    await expect(storage.remove("../escape.webm")).rejects.toMatchObject({
      message: "error.im.voice_invalid",
    });
  });
});
```

- [ ] **Step 2: Run the storage test and verify RED**

Run:

```bash
npm --prefix backend test -- im-voice.storage.test.ts
```

Expected: FAIL because `im-voice.storage.ts` does not exist.

- [ ] **Step 3: Implement the bounded storage port**

Create `backend/src/services/im-voice.storage.ts` around these exact rules:

```ts
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const voiceMetadata = {
  "audio/webm": {
    extension: "webm",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  },
  "audio/mp4": {
    extension: "mp4",
    matches: (bytes: Buffer) => bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp",
  },
  "audio/ogg": {
    extension: "ogg",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).toString("ascii") === "OggS",
  },
} as const;

export type ImVoiceMimeType = keyof typeof voiceMetadata;
export type StoredImVoice = { fileKey: string; mimeType: ImVoiceMimeType; size: number };
export interface ImVoiceStoragePort {
  save(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<StoredImVoice>;
  remove(fileKey: string): Promise<void>;
}

export class ImVoiceFileStorage implements ImVoiceStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly maxBytes = DEFAULT_MAX_BYTES,
  ) {}

  public async save(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<StoredImVoice> {
    const metadata = voiceMetadata[mimeType];
    if (!metadata || bytes.length === 0 || bytes.length > this.maxBytes || !metadata.matches(bytes)) {
      throw this.invalid();
    }
    const fileKey = `${randomBytes(32).toString("hex")}.${metadata.extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(fileKey), bytes, { flag: "wx" });
    return { fileKey, mimeType, size: bytes.length };
  }

  public async remove(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:webm|mp4|ogg)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
      throw this.invalid();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}/`)) throw this.invalid();
    return path;
  }

  private invalid() {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_invalid",
      statusCode: 400,
    });
  }
}
```

- [ ] **Step 4: Run the focused test and commit**

Run:

```bash
npm --prefix backend test -- im-voice.storage.test.ts
npm --prefix backend run build
```

Expected: PASS; build exits 0.

Commit:

```bash
git add backend/src/services/im-voice.storage.ts backend/tests/im-voice.storage.test.ts
git commit -m "feat(im): validate voice message files"
```

---

### Task 2: Add a reusable pre-storage message-send eligibility check

**Files:**
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/tests/realtime-identity-scope.test.ts`

**Interfaces:**
- Adds repository outcome `allowed | not_found | recipient_blocked | not_friends`.
- Adds public `RealtimeService.assertMessageSendAllowed(auth, conversationId)` returning the resolved personal identity scope.
- `RealtimeService.createMessage` calls the preflight and still maps the transaction-time `createMessage` outcome.

- [ ] **Step 1: Write failing service tests for every pre-storage outcome**

Add a focused `describe("RealtimeService message-send preflight", ...)` block:

```ts
it.each([
  ["not_found", "error.realtime.conversation_not_found", 404],
  ["recipient_blocked", "error.im.recipient_blocked", 403],
  ["not_friends", "error.im.not_friends", 403],
] as const)("maps %s before createMessage", async (status, message, statusCode) => {
  const repository = {
    checkMessageSendEligibility: jest.fn().mockResolvedValue(status),
    createMessage: jest.fn(),
  };
  const service = new RealtimeService(repository as never, {
    publish: jest.fn(),
    subscribe: jest.fn(),
  });

  await expect(
    service.createMessage(
      { userId: 41 } as never,
      { conversationId: 91, type: "text", content: "hello" },
    ),
  ).rejects.toMatchObject({ message, statusCode });
  expect(repository.createMessage).not.toHaveBeenCalled();
});

it("keeps the transaction-time friendship result as the final race-safe gate", async () => {
  const repository = {
    checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
    createMessage: jest.fn().mockResolvedValue({ status: "not_friends" }),
  };
  const gateway = { publish: jest.fn(), subscribe: jest.fn() };
  const service = new RealtimeService(repository as never, gateway);

  await expect(
    service.createMessage(
      { userId: 41 } as never,
      { conversationId: 91, type: "text", content: "hello" },
    ),
  ).rejects.toMatchObject({ message: "error.im.not_friends", statusCode: 403 });
  expect(gateway.publish).not.toHaveBeenCalled();
});
```

Update the in-memory repository fixtures in `realtime-api.test.ts` and `realtime-identity-scope.test.ts` to provide `checkMessageSendEligibility: jest.fn(async () => "allowed")`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm --prefix backend test -- realtime-service.test.ts realtime-api.test.ts realtime-identity-scope.test.ts
```

Expected: FAIL because the port and service preflight do not exist.

- [ ] **Step 3: Add the read-only repository contract and implementation**

Add beside `CreateMessageOutcome`:

```ts
export type MessageSendEligibility =
  | "allowed"
  | "not_found"
  | "recipient_blocked"
  | "not_friends";

export interface CheckMessageSendEligibilityInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId?: number;
}
```

Add to `RealtimeRepositoryPort`:

```ts
checkMessageSendEligibility(
  input: CheckMessageSendEligibilityInput,
): Promise<MessageSendEligibility>;
```

Implement it immediately before `createMessage`. Reuse `isMessageSenderBlocked` for the block query, but explicitly read membership/access policy and reciprocal contacts before returning `allowed`:

```ts
public async checkMessageSendEligibility(
  input: CheckMessageSendEligibilityInput,
): Promise<MessageSendEligibility> {
  const senderIdentityId = input.senderIdentityId ?? input.senderUserId;
  const participant = await this.client.conversationParticipant.findFirst({
    where: {
      conversationId: input.conversationId,
      identityId: senderIdentityId,
      deletedAt: null,
      conversation: { deletedAt: null },
    },
    select: {
      conversation: {
        select: {
          accessPolicy: true,
          participants: {
            where: { deletedAt: null },
            select: { identityId: true },
          },
        },
      },
    },
  });
  if (!participant) return "not_found";
  if (await this.isMessageSenderBlocked(input.conversationId, input.senderUserId, senderIdentityId)) {
    return "recipient_blocked";
  }
  if (participant.conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED) {
    const identityIds = participant.conversation.participants.map(({ identityId }) => identityId);
    if (identityIds.length !== 2) return "not_friends";
    const reciprocalCount = await this.client.contact.count({
      where: {
        deletedAt: null,
        OR: [
          { ownerIdentityId: identityIds[0], contactIdentityId: identityIds[1] },
          { ownerIdentityId: identityIds[1], contactIdentityId: identityIds[0] },
        ],
      },
    });
    if (reciprocalCount !== 2) return "not_friends";
  }
  return "allowed";
}
```

Do not remove the identical access-policy check inside repository `createMessage`; it protects the write transaction from a friendship race after preflight.

- [ ] **Step 4: Centralize service error mapping and use it in text sends**

Add:

```ts
public async assertMessageSendAllowed(
  auth: AuthenticatedAccessContext,
  conversationId: number,
) {
  const scope = await this.resolvePersonalIdentityScope(auth);
  const eligibility = await this.repository.checkMessageSendEligibility({
    conversationId,
    senderUserId: auth.userId,
    senderIdentityId: scope.identityId,
  });
  if (eligibility === "not_found") {
    throw this.notFoundError("error.realtime.conversation_not_found");
  }
  if (eligibility === "recipient_blocked") {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.recipient_blocked",
      statusCode: 403,
    });
  }
  if (eligibility === "not_friends") {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.im.not_friends",
      statusCode: 403,
    });
  }
  return scope;
}
```

Replace the old direct `isMessageSenderBlocked` call at the start of `createMessage` with:

```ts
const scope = await this.assertMessageSendAllowed(auth, input.conversationId);
```

- [ ] **Step 5: Run regression tests and commit**

Run:

```bash
npm --prefix backend test -- realtime-service.test.ts realtime-api.test.ts realtime-identity-scope.test.ts
npm --prefix backend run build
```

Expected: PASS; existing blocked and friendship tests remain green.

Commit:

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts backend/tests/realtime-identity-scope.test.ts
git commit -m "refactor(im): preflight message send eligibility"
```

---

### Task 3: Create the atomic voice-message application service

**Files:**
- Create: `backend/src/services/im-voice-message.service.ts`
- Create: `backend/tests/im-voice-message.service.test.ts`

**Interfaces:**
- Consumes Task 1 storage and Task 2 `RealtimeService.assertMessageSendAllowed/createMessage`.
- Produces one authoritative existing `MessagePayload`; no separate upload result is exposed.

- [ ] **Step 1: Write failing service tests**

Cover success, blocked/not-friend before save, trusted metadata, and compensation:

```ts
it("preflights, stores once, and creates one formal voice message", async () => {
  const realtime = {
    assertMessageSendAllowed: jest.fn().mockResolvedValue({ identityId: 71 }),
    createMessage: jest.fn().mockResolvedValue({ id: 501 }),
  };
  const storage = {
    save: jest.fn().mockResolvedValue({
      fileKey: `${"a".repeat(64)}.webm`,
      mimeType: "audio/webm",
      size: 128,
    }),
    remove: jest.fn(),
  };
  const service = new ImVoiceMessageService(
    realtime as never,
    storage,
    "https://media.needo.test/media/im",
  );

  await expect(service.send({ userId: 41 } as never, {
    bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    conversationId: 91,
    durationSeconds: 6,
    fileName: "../../spoof.mp4",
    mimeType: "audio/webm",
  })).resolves.toEqual({ id: 501 });

  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(realtime.createMessage).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      conversationId: 91,
      type: "text",
      content: "语音",
      metadata: {
        needoMessageType: "voice",
        needoMessageExt: expect.objectContaining({
          duration: 6,
          fileName: "spoof.webm",
          mimeType: "audio/webm",
          url: expect.stringMatching(/\/media\/im\/[a-f0-9]{64}\.webm$/),
        }),
      },
    }),
  );
  expect(storage.remove).not.toHaveBeenCalled();
});

it("does not save when preflight rejects", async () => {
  const realtime = {
    assertMessageSendAllowed: jest.fn().mockRejectedValue(new Error("error.im.not_friends")),
    createMessage: jest.fn(),
  };
  const storage = { save: jest.fn(), remove: jest.fn() };
  const service = new ImVoiceMessageService(realtime as never, storage as never, "/media/im");

  await expect(service.send({ userId: 41 } as never, validInput)).rejects.toThrow("error.im.not_friends");
  expect(storage.save).not.toHaveBeenCalled();
  expect(realtime.createMessage).not.toHaveBeenCalled();
});

it("removes the stored file when authoritative message creation fails", async () => {
  const storage = {
    save: jest.fn().mockResolvedValue({
      fileKey: `${"b".repeat(64)}.ogg`, mimeType: "audio/ogg", size: 64,
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = {
    assertMessageSendAllowed: jest.fn().mockResolvedValue({ identityId: 71 }),
    createMessage: jest.fn().mockRejectedValue(new Error("error.im.not_friends")),
  };
  const service = new ImVoiceMessageService(realtime as never, storage, "/media/im");

  await expect(service.send({ userId: 41 } as never, validInput)).rejects.toThrow("error.im.not_friends");
  expect(storage.remove).toHaveBeenCalledWith(`${"b".repeat(64)}.ogg`);
});
```

Define `validInput` in the test with `conversationId: 91`, `durationSeconds: 6`, `fileName: "voice.webm"`, WebM bytes, and `mimeType: "audio/webm"`.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
npm --prefix backend test -- im-voice-message.service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement preflight, trusted metadata, and compensation**

Create `ImVoiceMessageService` with this core:

```ts
export class ImVoiceMessageService {
  public constructor(
    private readonly realtime: Pick<RealtimeService, "assertMessageSendAllowed" | "createMessage">,
    private readonly storage: ImVoiceStoragePort,
    private readonly publicBaseUrl: string,
  ) {}

  public async send(auth: AuthenticatedAccessContext, input: SendImVoiceMessageInput) {
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 59) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.im.voice_duration_invalid",
        statusCode: 400,
      });
    }

    await this.realtime.assertMessageSendAllowed(auth, input.conversationId);
    const stored = await this.storage.save(input.bytes, input.mimeType);
    const extension = stored.fileKey.split(".").at(-1)!;
    const originalBase = basename(input.fileName, extname(input.fileName)).trim().slice(0, 240) || "voice";
    const fileName = `${originalBase}.${extension}`;
    const url = `${this.publicBaseUrl.replace(/\/$/u, "")}/${stored.fileKey}`;

    try {
      return await this.realtime.createMessage(auth, {
        conversationId: input.conversationId,
        type: "text",
        content: "语音",
        metadata: {
          needoMessageType: "voice",
          needoMessageExt: {
            duration: input.durationSeconds,
            fileName,
            fileSize: stored.size,
            mimeType: stored.mimeType,
            url,
          },
        },
      });
    } catch (error) {
      await this.storage.remove(stored.fileKey);
      throw error;
    }
  }
}
```

The test must also verify that a message-create failure caused by the transaction-time friendship gate is compensated, proving preflight is not being treated as the final authority.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm --prefix backend test -- im-voice-message.service.test.ts realtime-service.test.ts
npm --prefix backend run build
```

Expected: PASS.

Commit:

```bash
git add backend/src/services/im-voice-message.service.ts backend/tests/im-voice-message.service.test.ts
git commit -m "feat(im): create atomic voice message service"
```

---

### Task 4: Expose the protected raw-audio route and OpenAPI contract

**Files:**
- Create: `backend/src/validators/im-voice-message.validator.ts`
- Create: `backend/src/controllers/im-voice-message.controller.ts`
- Create: `backend/src/routes/im-voice-message.routes.ts`
- Create: `backend/tests/im-voice-message-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Adds `POST /api/v1/im/conversations/:conversationId/voice?fileName=...&durationSeconds=1..59`.
- Accepts `audio/webm`, `audio/mp4`, or `audio/ogg`; returns an existing `RealtimeMessage` in the standard success envelope.

- [ ] **Step 1: Write failing API and OpenAPI tests**

In `im-voice-message-api.test.ts`, use `createApp` with an injected `imVoiceMessageService` and formal auth fixtures. Assert:

```ts
expect(await authorizedVoiceRequest({ durationSeconds: 0 })).toMatchObject({ status: 400 });
expect(await authorizedVoiceRequest({ durationSeconds: 60 })).toMatchObject({ status: 400 });
expect(await authorizedVoiceRequest({ contentType: "audio/mpeg" })).toMatchObject({ status: 415 });
expect(await authorizedVoiceRequest({ bytes: Buffer.alloc(8 * 1024 * 1024 + 1) })).toMatchObject({ status: 413 });

const forbidden = await voiceRequestWithPermissions([]);
expect(forbidden.status).toBe(403);
expect(voiceService.send).not.toHaveBeenCalled();

const response = await authorizedVoiceRequest({
  bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  contentType: "audio/webm;codecs=opus",
  durationSeconds: 59,
});
expect(response.status).toBe(201);
expect(response.body).toMatchObject({
  code: 0,
  data: { id: 501, conversationId: 91 },
});
expect(voiceService.send).toHaveBeenCalledWith(
  expect.objectContaining({ userId: expect.any(Number) }),
  expect.objectContaining({
    conversationId: 91,
    durationSeconds: 59,
    mimeType: "audio/webm",
  }),
);
```

Add to `openapi.test.ts`:

```ts
const voicePath = response.body.paths["/api/v1/im/conversations/{conversationId}/voice"].post;
expect(voicePath.security).toEqual([{ bearerAuth: [] }]);
expect(voicePath.requestBody.content).toEqual(expect.objectContaining({
  "audio/webm": expect.any(Object),
  "audio/mp4": expect.any(Object),
  "audio/ogg": expect.any(Object),
}));
expect(voicePath.parameters).toEqual(expect.arrayContaining([
  expect.objectContaining({ name: "durationSeconds", schema: expect.objectContaining({ minimum: 1, maximum: 59 }) }),
]));
expect(voicePath.responses).toEqual(expect.objectContaining({
  "201": expect.any(Object),
  "400": expect.any(Object),
  "403": expect.any(Object),
  "404": expect.any(Object),
  "413": expect.any(Object),
  "415": expect.any(Object),
}));
```

- [ ] **Step 2: Run API/OpenAPI tests and verify RED**

Run:

```bash
npm --prefix backend test -- im-voice-message-api.test.ts openapi.test.ts
```

Expected: FAIL because route, dependencies, and OpenAPI path are absent.

- [ ] **Step 3: Implement schemas, controller, and route**

Schemas:

```ts
export const imVoiceMessageParamSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

export const imVoiceMessageQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  durationSeconds: z.coerce.number().int().min(1).max(59),
});
```

Controller MIME parsing must strip parameters but preserve the raw request body:

```ts
const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
if (!mimeType || !supportedMimeTypes.has(mimeType as ImVoiceMimeType) || !Buffer.isBuffer(request.body)) {
  throw new AppError({
    code: ERROR_CODES.VALIDATION,
    message: "error.im.voice_invalid",
    statusCode: 415,
  });
}

response.status(201).json(successResponse(await service.send(
  getAuthenticatedAccess(response),
  { bytes: request.body, conversationId, durationSeconds, fileName, mimeType: mimeType as ImVoiceMimeType },
)));
```

Route middleware order:

```ts
router.post(
  "/im/conversations/:conversationId/voice",
  authenticate(),
  createAuthorizeMiddleware("message:create"),
  validateRequest({ params: imVoiceMessageParamSchema, query: imVoiceMessageQuerySchema }),
  express.raw({ type: ["audio/webm", "audio/mp4", "audio/ogg"], limit: "8mb" }),
  controller.send,
);
```

- [ ] **Step 4: Wire dependencies, static serving, and API order**

In `AppDependencies`, add optional `imVoiceStorage` and `imVoiceMessageService`. Build defaults from the already-resolved `realtimeService`, `IM_MEDIA_STORAGE_DIR`, and the same configured `IM_MEDIA_PUBLIC_BASE_URL` fallback as image media.

Register `createImVoiceMessageRoutes` next to `createImMediaRoutes`, before generic realtime routes. Expand only the IM static filename allowlist:

```ts
const imMediaFilenamePattern = /^\/[a-f0-9]{64}\.(?:jpg|png|webp|webm|mp4|ogg)$/;
```

Do not change customer-avatar or content-media allowlists.

- [ ] **Step 5: Add the OpenAPI path**

Document the two query parameters, three binary content types, `message:create`/Bearer behavior in the description, existing `RealtimeMessage` success schema, 8 MiB limit, and the status set asserted above. Do not introduce a second message schema.

- [ ] **Step 6: Run backend gates and commit**

Run:

```bash
npm --prefix backend test -- im-voice.storage.test.ts im-voice-message.service.test.ts im-voice-message-api.test.ts realtime-service.test.ts realtime-api.test.ts openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all PASS.

Commit:

```bash
git add backend/src/validators/im-voice-message.validator.ts backend/src/controllers/im-voice-message.controller.ts backend/src/routes/im-voice-message.routes.ts backend/tests/im-voice-message-api.test.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts
git commit -m "feat(im): expose formal voice message endpoint"
```

---

### Task 5: Connect the formal frontend adapter and Store to the voice endpoint

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/contract.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/store.test.ts`

**Interfaces:**
- `ImApi.sendVoiceMessage(conversationId, blob, { durationSeconds, fileName })` returns `{ message }`.
- Store exposes the same method and merges only the returned authoritative message.

- [ ] **Step 1: Write failing adapter and Store tests**

Adapter test:

```ts
it("sends voice bytes through the formal endpoint instead of message content", async () => {
  const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
  const send = vi.spyOn(realtimeApi, "createVoiceMessage").mockResolvedValue(formalVoiceMessage);
  const api = createFormalImApi({ currentUser, scope: "user" });

  await expect(api.sendVoiceMessage("91", blob, {
    durationSeconds: 6,
    fileName: "voice.webm",
  })).resolves.toEqual({ message: expect.objectContaining({ type: "voice", content: "语音" }) });
  expect(send).toHaveBeenCalledWith(91, blob, {
    durationSeconds: 6,
    fileName: "voice.webm",
  });
  expect(realtimeApi.createMessage).not.toHaveBeenCalled();
});
```

Store test must assert: failed API leaves `messagesByConversation[conversationId]` unchanged; successful API adds the returned message exactly once and returns it.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/store.test.ts
```

Expected: FAIL because the methods do not exist.

- [ ] **Step 3: Add the raw Blob realtime API**

```ts
createVoiceMessage(
  conversationId: number,
  voice: Blob,
  metadata: { durationSeconds: number; fileName: string },
) {
  return httpClient.request<RealtimeMessage>(
    `/im/conversations/${conversationId}/voice`,
    {
      body: voice,
      headers: { "Content-Type": voice.type || "audio/webm" },
      method: "POST",
      query: metadata,
    },
  );
},
```

The request body remains a Blob because `httpClient.createRequestBody` already passes Blob through without JSON serialization.

- [ ] **Step 4: Extend the IM contract and formal adapter**

Add to `ImApi`:

```ts
sendVoiceMessage(
  conversationId: string,
  voice: Blob,
  metadata: { durationSeconds: number; fileName: string },
): Promise<{ message: ConversationMessage }>;
```

Formal implementation:

```ts
async sendVoiceMessage(conversationId, voice, metadata) {
  const message = await realtimeApi.createVoiceMessage(
    toNumericId(conversationId),
    voice,
    metadata,
  );
  return { message: toConversationMessage(message) };
},
```

- [ ] **Step 5: Add non-optimistic authoritative Store insertion**

```ts
async function sendVoiceMessage(
  conversationId: string,
  voice: Blob,
  metadata: { durationSeconds: number; fileName: string },
) {
  await hydrateStore();
  const response = await api.sendVoiceMessage(conversationId, voice, metadata);
  upsertMessage(response.message);
  const conversation = getConversationById({ conversations: snapshot.conversations }, conversationId);
  if (conversation) {
    upsertConversation({
      ...conversation,
      lastMessagePreview: buildMessagePreview(response.message, snapshot.currentUserId ?? "", snapshot.usersById),
      lastMessageTime: response.message.sentAt,
      updatedAt: response.message.sentAt,
    });
  }
  emit();
  return response.message;
}
```

Expose it from the Store hook return. Do not call `createOptimisticMessage`; the overlay itself is the retry surface.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/store.test.ts
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/features/realtime/api.ts src/features/im/contract.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts src/features/im/store.ts src/features/im/store.test.ts
git commit -m "feat(im): send voice through formal adapter"
```

---

### Task 6: Extract the 59-second recording and preview lifecycle hook

**Files:**
- Create: `src/features/im/useImVoiceRecording.ts`
- Create: `src/features/im/useImVoiceRecording.test.tsx`

**Interfaces:**
- Produces phases `idle | acquiring_permission | recording | preview_playing | preview_paused | sending | send_error`.
- Exposes `open`, `cancel`, `stop`, `replay`, `beginSending`, `finishSending`, `failSending`, `audioRef`, Blob, object URL, duration/progress, and error key.

- [ ] **Step 1: Write failing fake-MediaRecorder lifecycle tests**

Use the repository's existing `createRoot`/`act` pattern rather than adding a testing-library dependency. Render a small `HookProbe` that stores the latest hook return in a test variable and mounts `<audio ref={voice.audioRef} src={voice.previewUrl} />`. Combine it with fake timers, a fake stream track, a deterministic `MediaRecorder`, and audio `play/pause` spies. Cover:

```ts
it("starts on click and counts down from 59", async () => {
  await latest.open();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(latest.phase).toBe("recording");
  expect(latest.remainingSeconds).toBe(59);
});

it("stops at 59 seconds, creates a Blob URL, and auto-plays once without sending", async () => {
  await latest.open();
  await vi.advanceTimersByTimeAsync(59_000);
  fakeRecorder.emitData(webmChunk);
  fakeRecorder.finishStop();

  expect(fakeRecorder.stop).toHaveBeenCalledTimes(1);
  expect(latest.phase).toMatch(/^preview_/);
  expect(latest.blob).toBeInstanceOf(Blob);
  expect(audioPlay).toHaveBeenCalledTimes(1);
  expect(latest.phase).not.toBe("sending");
});

it("stops late permission tracks after cancellation", async () => {
  const permission = deferred<MediaStream>();
  getUserMedia.mockReturnValue(permission.promise);
  const open = latest.open();
  latest.cancel();
  permission.resolve(stream);
  await open;
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(latest.phase).toBe("idle");
});

it("retains the Blob after send failure and releases everything after success/unmount", async () => {
  await buildPreview();
  const blob = latest.blob;
  const previewUrl = latest.previewUrl;

  await act(async () => latest.beginSending());
  await act(async () => latest.failSending("语音发送失败，请重试"));
  expect(latest.phase).toBe("send_error");
  expect(latest.blob).toBe(blob);
  expect(latest.previewUrl).toBe(previewUrl);

  await act(async () => latest.beginSending());
  await act(async () => latest.finishSending());
  expect(latest.phase).toBe("idle");
  expect(audioPause).toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl);
});
```

Also test manual stop, replay resetting `currentTime = 0`, autoplay rejection becoming `preview_paused`, and recorder error cleanup.

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement a single owned lifecycle**

Use `MAX_VOICE_RECORDING_SECONDS = 59`, a start timestamp, a 250ms interval for display only, and a separate 59,000ms stop timeout for the hard boundary:

```ts
export const MAX_VOICE_RECORDING_SECONDS = 59;

export type ImVoiceRecordingPhase =
  | "idle"
  | "acquiring_permission"
  | "recording"
  | "preview_playing"
  | "preview_paused"
  | "sending"
  | "send_error";

const stopAtLimit = window.setTimeout(() => stop("limit"), MAX_VOICE_RECORDING_SECONDS * 1_000);
const tick = window.setInterval(() => {
  const elapsed = Math.min(
    MAX_VOICE_RECORDING_SECONDS,
    Math.floor((Date.now() - startedAt) / 1_000),
  );
  setRemainingSeconds(MAX_VOICE_RECORDING_SECONDS - elapsed);
}, 250);
```

Required cleanup sequence:

```ts
audioRef.current?.pause();
streamRef.current?.getTracks().forEach((track) => track.stop());
if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
window.clearInterval(tickRef.current);
window.clearTimeout(limitRef.current);
```

Guard `MediaRecorder.stop()` so manual stop, limit timeout, `Escape`, route change, and recorder error cannot call it twice. On `onstop`, build the Blob, stop tracks immediately, create one object URL, enter preview, and attempt `audio.play()`. If `play()` rejects, retain preview and set the explanatory error key.

- [ ] **Step 4: Run hook tests and commit**

Run:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
npm run lint
```

Expected: PASS with no React `act` or unhandled-play rejection warnings.

Commit:

```bash
git add src/features/im/useImVoiceRecording.ts src/features/im/useImVoiceRecording.test.tsx
git commit -m "feat(im): manage voice recording preview lifecycle"
```

---

### Task 7: Build the accessible overlay and make the composer voice icon a direct action

**Files:**
- Create: `src/features/im/ImVoiceRecordingOverlay.tsx`
- Create: `src/features/im/ImVoiceRecordingOverlay.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.composer.test.tsx`

**Interfaces:**
- Overlay remains presentational and receives state/callbacks/audio ref through props.
- `ImChatComposer` replaces all recording gesture props with `onOpenVoiceRecording` and optional `voiceButtonRef`.

- [ ] **Step 1: Write failing overlay and composer tests**

Overlay assertions:

```ts
expect(dialog?.getAttribute("role")).toBe("dialog");
expect(dialog?.getAttribute("aria-modal")).toBe("true");
expect(dialog?.className).toContain("backdrop-blur");
expect(container.querySelector("[data-im-voice-bubble='true']")?.className).toContain("bg-[#91ed63]");
expect(container.textContent).toContain('59″ 后将停止录音');
expect(container.querySelector("button[aria-label='取消录音']")).not.toBeNull();
expect(container.querySelector("button[aria-label='停止录音']")).not.toBeNull();
expect(container.textContent).not.toContain("转文字");
expect(container.querySelector("[data-im-voice-semicircle]")).toBeNull();
```

Preview rerender assertions:

```ts
expect(container.querySelector("button[aria-label='删除录音']")).not.toBeNull();
expect(container.querySelector("button[aria-label='重放录音']")).not.toBeNull();
expect(container.querySelector("button[aria-label='发送录音']")).not.toBeNull();
expect(container.querySelector("button[aria-label='停止录音']")).toBeNull();
```

Composer test:

```ts
const onOpenVoiceRecording = vi.fn();
await act(async () => {
  root.render(
    <ImChatComposer
      draft=""
      isNight={false}
      onDraftChange={vi.fn()}
      onOpenVoiceRecording={onOpenVoiceRecording}
      onPanelChange={vi.fn()}
      onSend={vi.fn()}
      panel={null}
    />,
  );
});
await act(async () => {
  container.querySelector<HTMLButtonElement>("[data-im-composer-control='voice-input']")?.click();
});
expect(onOpenVoiceRecording).toHaveBeenCalledTimes(1);
expect(container.textContent).not.toContain("按住说话");
```

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
npm test -- src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/components.composer.test.tsx
```

Expected: FAIL because the overlay and direct callback do not exist.

- [ ] **Step 3: Implement the visual dialog**

Use a fixed, safe-area-aware layer above existing conversation controls:

```tsx
<section
  aria-labelledby="im-voice-recording-title"
  aria-modal="true"
  className="fixed inset-0 z-[80] flex flex-col bg-black/55 px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[max(72px,env(safe-area-inset-top))] backdrop-blur-[10px]"
  data-im-voice-recording-overlay="true"
  onKeyDown={handleEscape}
  role="dialog"
>
  <div
    className="relative mx-auto mt-[8vh] flex min-h-[112px] w-full max-w-[420px] items-center justify-center rounded-[28px] bg-[#91ed63] px-6 text-center text-[#245629] shadow-[0_18px_54px_rgba(0,0,0,0.28)]"
    data-im-voice-bubble="true"
  >
    <span aria-hidden="true" className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 bg-[#91ed63]" />
    <p aria-live="polite" className="relative text-xl font-black" id="im-voice-recording-title">
      {bubbleText}
    </p>
  </div>
  {/* Recording: cancel + stop. Preview: delete + replay + send. */}
  <audio onEnded={onPreviewEnded} onTimeUpdate={onTimeUpdate} ref={audioRef} src={previewUrl} />
</section>
```

Keep each control at least `h-12 w-12`, put `autoFocus` on the current cancel/delete control so focus enters the dialog, disable all three preview controls while `sending`, show a busy paper plane, and use `motion-reduce:transition-none`.

- [ ] **Step 4: Simplify `ImChatComposer`**

Remove `ImChatComposerRecordingState`, `maxVoiceRecordingSeconds`, `recording`, `onStartRecording`, `onMoveRecording`, `onEndRecording`, `onCancelRecording`, `onToggleVoice`, and `voiceMode` props/branches. The voice button becomes:

```tsx
<button
  aria-label="录制语音"
  className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
  data-im-composer-control="voice-input"
  disabled={disabled || blocked}
  onClick={() => {
    onPanelChange(null);
    onOpenVoiceRecording?.();
  }}
  ref={voiceButtonRef}
  type="button"
>
  <ImIcon className="h-[18px] w-[18px]" name="voice-input" />
</button>
```

Always render `ImComposerRichInput`; Social's `leadingAccessory` branch remains unchanged.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/components.composer.test.tsx
npm run lint
```

Expected: PASS; no `按住说话`, `松开发送`, or gesture handler remains in `components.tsx`.

Commit:

```bash
git add src/features/im/ImVoiceRecordingOverlay.tsx src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/components.tsx src/features/im/components.composer.test.tsx
git commit -m "feat(im): add voice recording overlay"
```

---

### Task 8: Integrate the overlay into the shared conversation page and complete acceptance

**Files:**
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Shared user/technician/merchant conversation room owns no MediaRecorder details.
- Successful send closes and cleans the overlay; failed send stays in preview with the same Blob.

- [ ] **Step 1: Add failing page source/interaction and i18n tests**

Assert the conversation page:

```ts
expect(componentSource).toContain("useImVoiceRecording(");
expect(componentSource).toContain("<ImVoiceRecordingOverlay");
expect(componentSource).toContain("store.sendVoiceMessage(");
expect(componentSource).toContain("MAX_VOICE_RECORDING_SECONDS");
expect(componentSource).not.toContain("readBlobAsDataUrl");
expect(componentSource).not.toContain("recordingGestureStartYRef");
expect(componentSource).not.toContain("setVoiceMode");
expect(componentSource).not.toContain('store.sendMessage(conversationId, "voice"');
expect(componentSource).not.toContain("已自动发送");
```

In the rendered page test, mock the hook or MediaRecorder and verify clicking the composer voice icon mounts the dialog; manual stop moves to preview; a rejected `store.sendVoiceMessage` leaves preview controls visible; resolved send removes the dialog and focuses the voice button.

Add translation assertions for at least these Simplified Chinese source strings:

```ts
const voiceKeys = [
  "录制语音",
  "正在连接麦克风",
  "后将停止录音",
  "取消录音",
  "停止录音",
  "删除录音",
  "重放录音",
  "发送录音",
  "请允许麦克风权限后重试",
  "自动播放已暂停，请点击重放",
  "语音发送失败，请重试",
];
for (const key of voiceKeys) {
  expect(translateText(key, "zh-Hant")).not.toBe(key);
  expect(translateText(key, "ja")).not.toBe(key);
  expect(translateText(key, "en")).not.toBe(key);
  expect(translateText(key, "ko")).not.toBe(key);
}
```

- [ ] **Step 2: Run page/i18n tests and verify RED**

Run:

```bash
npm test -- src/features/im/pages.test.ts src/features/im/pages.test.tsx src/i18n/translations.test.ts
```

Expected: FAIL because the page still owns the 60-second press gesture and the new translation rows are missing.

- [ ] **Step 3: Replace the page-owned recording implementation**

Delete the old `voiceMode`, `VoiceRecordingState`, gesture refs/handlers, `readBlobAsDataUrl`, `recordingHintClass`, timeout auto-send notice, and all 60-second constants.

Wire the hook and send path:

```tsx
const voiceButtonRef = useRef<HTMLButtonElement | null>(null);
const voiceRecording = useImVoiceRecording({
  maxSeconds: MAX_VOICE_RECORDING_SECONDS,
  onError: (message) => setActionNotice(message),
});

const sendVoiceRecording = async () => {
  if (!voiceRecording.blob || voiceRecording.phase === "sending") return;
  voiceRecording.beginSending();
  try {
    await store.sendVoiceMessage(conversationId, voiceRecording.blob, {
      durationSeconds: voiceRecording.durationSeconds,
      fileName: `voice-${Date.now()}`,
    });
    voiceRecording.finishSending();
  } catch (error) {
    voiceRecording.failSending(resolveVoiceSendError(error));
  }
};

const previousVoicePhaseRef = useRef(voiceRecording.phase);
useEffect(() => {
  const previous = previousVoicePhaseRef.current;
  previousVoicePhaseRef.current = voiceRecording.phase;
  if (previous !== "idle" && voiceRecording.phase === "idle") {
    window.requestAnimationFrame(() => voiceButtonRef.current?.focus());
  }
}, [voiceRecording.phase]);
```

On the existing `ImChatComposer` invocation, add:

```tsx
onOpenVoiceRecording={() => {
  setPanel(null);
  void voiceRecording.open();
}}
voiceButtonRef={voiceButtonRef}
```

Then render the overlay as a sibling above the conversation page's closing container:

```tsx

{voiceRecording.phase !== "idle" ? (
  <ImVoiceRecordingOverlay
    audioRef={voiceRecording.audioRef}
    durationSeconds={voiceRecording.durationSeconds}
    error={voiceRecording.error}
    onCancel={voiceRecording.cancel}
    onPreviewEnded={voiceRecording.markPreviewEnded}
    onReplay={() => void voiceRecording.replay()}
    onSend={() => void sendVoiceRecording()}
    onStop={voiceRecording.stop}
    onTimeUpdate={voiceRecording.updatePlaybackProgress}
    phase={voiceRecording.phase}
    playbackSeconds={voiceRecording.playbackSeconds}
    previewUrl={voiceRecording.previewUrl}
    remainingSeconds={voiceRecording.remainingSeconds}
  />
) : null}
```

Add an effect keyed by `conversationId` and component cleanup to call `voiceRecording.cancel()`. Do not clear the text draft or quoted message when voice recording opens or fails; this endpoint does not claim to attach the voice message to the current quote.

- [ ] **Step 4: Add exact five-language copy**

Add translations beside the existing IM recording rows. Remove the obsolete source rows only after confirming they have no other callers:

- `语音已录满 60 秒，已自动发送。`
- hold/release copy if it exists only as JSX interpolation and not as a translation row.

Run `rg` before deletion; do not remove a shared key still used elsewhere.

- [ ] **Step 5: Run the entire focused frontend/backend matrix**

Run:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/components.composer.test.tsx src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx src/i18n/translations.test.ts
npm --prefix backend test -- im-voice.storage.test.ts im-voice-message.service.test.ts im-voice-message-api.test.ts realtime-service.test.ts realtime-api.test.ts realtime-identity-scope.test.ts openapi.test.ts
npm run i18n:audit
npm run lint
npm --prefix backend run lint
npm --prefix backend run build
npm run verify:production-build
```

Expected: every command exits 0. If `npm run verify:production-build` exposes an unrelated dirty-file failure, record it separately and do not weaken or skip the formal safety gate.

- [ ] **Step 6: Perform static scope and placeholder checks**

Run:

```bash
rg -n "readBlobAsDataUrl|按住说话|松开发送|上滑取消|已自动发送|recordingGestureStartYRef|maxVoiceRecordingSeconds = 60" src/features/im src/i18n
rg -n "TODO|FIXME|not implemented|placeholder" backend/src/services/im-voice* backend/src/controllers/im-voice* backend/src/routes/im-voice* backend/src/validators/im-voice* src/features/im/ImVoiceRecordingOverlay.tsx src/features/im/useImVoiceRecording.ts
git diff --check
git status --short
```

Expected: first two searches return no task-owned legacy behavior/placeholders; diff check is clean; unrelated dirty files remain untouched.

- [ ] **Step 7: Run real formal browser acceptance**

Before interacting, identify the worktree that owns 5180 and verify backend readiness:

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

If 5180 is not this checkout, do not judge the implementation through it; start the intended checkout on a free port or safely restart only the proven task-owned listener.

Using mobile width and two formal accounts, verify:

1. User, technician, and merchant shared chat entries all open the same overlay on one click.
2. The current header/messages/composer are visibly blurred/dimmed; no message text remains clearly readable.
3. Green speech bubble starts at `59″ 后将停止录音`; recording controls are only cancel/stop.
4. There is no transcription control, hold instruction, swipe instruction, or semicircle.
5. Manual stop and the 59-second limit both auto-play once and show only delete/replay/send.
6. Replay starts at 0; cancel releases the microphone and creates neither Message nor media file.
7. Simulated send failure preserves the preview; retry succeeds without duplicate clicks.
8. Successful send creates one voice bubble, receiver gets one SSE event, both accounts can play it, and reload still plays the configured `/media/im/<opaque>.<audio-ext>` URL.
9. Recipient-blocked and removed-friend requests create no message and no new media file.
10. Day/night themes, iPhone safe area, desktop width, keyboard `Escape`, focus return, console errors, and horizontal overflow all pass.

Use `domcontentloaded` rather than `networkidle` because the formal page keeps SSE open.

- [ ] **Step 8: Update Step 13 documentation with proven facts only**

Add `## 6.21 点击录音、自动试听与正式语音消息（2026-08-31）` to `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, recording:

- click-to-record overlay and exact 59-second rule;
- stop-to-auto-preview and explicit confirmed send;
- raw audio endpoint, three MIME types, 8 MiB limit, `message:create`, configured storage URL;
- preflight + transaction-time authorization and compensation delete;
- no schema/migration/mock/polling/transcription/semicircle;
- the exact automated and browser acceptance actually completed.

Do not describe unrun browser scenarios as passed.

- [ ] **Step 9: Commit the integrated slice**

```bash
git add src/features/im/pages.tsx src/features/im/pages.test.ts src/features/im/pages.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "feat(im): complete voice recording confirmation flow"
```

---

## Final Review Checklist

- [ ] `git diff origin/main...HEAD --stat` contains only voice-flow, targeted formal authorization reuse, tests, i18n, OpenAPI, and Step 13 documentation.
- [ ] No task commit includes the unrelated contact timeline or technician schedule working-tree changes.
- [ ] Frontend contains no data-URL voice send, hold/release gesture, 60-second cap, auto-send timeout, transcription control, or semicircle.
- [ ] Backend rejects unsupported/spoofed/empty/oversized audio, invalid duration, nonmember, blocked recipient, removed friendship, and missing permission.
- [ ] A message-create failure removes its stored file; a frontend failure keeps its local Blob.
- [ ] Successful API response, sender Store, receiver SSE, history reload, and static media playback all refer to the same authoritative Message/media URL.
- [ ] All new Simplified Chinese source strings have Traditional Chinese, Japanese, English, and Korean translations.
- [ ] Focus, Escape, safe-area, reduced-motion, day/night, console, and overflow acceptance is recorded.
- [ ] Backend/frontend focused tests, type checks, lint, OpenAPI, i18n audit, formal production build, health/readiness, and actual browser acceptance have explicit results.
