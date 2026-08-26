# IM Message Lifecycle, Retention, Recall, and Local Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver formal, server-enforced IM retention, ordinary and traceless recall, group privacy expiry, durable deletion synchronization, expiring image/video storage, and encrypted per-account local cache.

**Architecture:** Keep the existing Express/Prisma REST and SSE boundaries, add normalized lifecycle policy/media/sync persistence, and use small idempotent workers for destructive expiry. The frontend keeps its existing unified IM UI and replaces capability-gated formal adapter methods with typed APIs plus an encrypted IndexedDB cache; SSE is the low-latency path and `/im/sync` is the reconnect source of truth.

**Tech Stack:** Node.js 22, Express 4, TypeScript strict mode, Prisma 7/MySQL 8, Zod, Jest/Supertest, React 19, Vite 7, Vitest, IndexedDB, Web Crypto AES-GCM, SSE.

**Design authority:** `docs/superpowers/specs/2026-08-26-im-message-lifecycle-retention-recall-design.md`

## Global Constraints

- Work only inside Step 13 IM; do not modify affiliate marketing, Social, Booking, NDP, or unrelated UI.
- Do not add mock, fake, demo, stub, or unfinished-work-marker behavior.
- Text server retention defaults to indefinite; image/video server retention defaults to exactly `259200` seconds.
- Recall is server-enforced for exactly `180` seconds from authoritative message creation time.
- Privacy mode is available only to `GROUP` conversations, including groups with exactly two participants.
- Remove the `read_by_all` mode from formal types, legacy compatibility, UI controls, tests, and translations.
- Policy changes apply only to messages sent after the change; this plan exposes no retroactive-apply action.
- Standard recall retains a content-free visible placeholder; traceless recall has no participant-visible placeholder.
- Traceless eligibility defaults to all paid levels and is checked from server-side membership data plus the active operations policy.
- Recall and privacy deletion must purge frontend memory, IndexedDB, Cache Storage entries, and object URLs.
- Every API uses `/api/v1`, Zod, OpenAPI, the standard response envelope, authentication, RBAC, and stable error keys.
- Every new table has `id`, `createdAt`, `updatedAt`, and `deletedAt`; every relation and due-row scan has an index.
- Controller code handles only request/response mapping; business rules remain in services and Prisma access remains in repositories.
- Use TDD for every task and pass focused tests before running the broader gate.
- Commit only task-owned files; never include pre-existing changes in `backend/src/server.ts`, `src/api/httpClient.ts`, `src/api/httpClient.test.ts`, `.brooks-lint-history.json`, `backend/src/server-shutdown.ts`, or `backend/tests/server-shutdown.test.ts` unless a task explicitly names them.

---

## File Structure

### Backend lifecycle and policy

- `backend/src/services/im-policy.service.ts`: policy defaults, validation, version conflict handling, and membership allowlist decisions.
- `backend/src/repositories/im-policy.repository.ts`: active policy persistence and customer membership lookup.
- `backend/src/validators/im-policy.validator.ts`: operations policy request validation.
- `backend/src/controllers/im-policy.controller.ts`: operations policy HTTP mapping.
- `backend/src/routes/im-policy.routes.ts`: policy RBAC routes.
- `backend/src/services/im-message-lifecycle.service.ts`: recall and expiry business orchestration.
- `backend/src/repositories/im-message-lifecycle.repository.ts`: recall transactions, lifecycle mutations, audit, unread/summary repair, and deletion-sync persistence.
- `backend/src/workers/im-message-lifecycle.worker.ts`: non-overlapping scheduled expiry runner.

### Backend group privacy and sync

- `backend/src/services/im-deletion-sync.service.ts`: authenticated sync-feed pagination.
- `backend/src/repositories/im-deletion-sync.repository.ts`: participant-scoped cursor reads.
- Existing realtime controller/routes/service/repository files: send-time snapshots, group privacy, recall, sync, SSE fanout.

### Backend media

- `backend/src/services/im-media.storage.ts`: validated filesystem storage port/adapter with idempotent deletion.
- `backend/src/services/im-media.service.ts`: authenticated raw upload and message creation orchestration.
- `backend/src/repositories/im-media.repository.ts`: `MessageMedia` transaction persistence and due-row claims.
- `backend/src/controllers/im-media.controller.ts`: binary HTTP mapping.
- `backend/src/routes/im-media.routes.ts`: protected image/video message route and protected media read route.
- `backend/src/workers/im-media-purge.worker.ts`: image/video expiry worker.

### Frontend formal IM

- `src/features/realtime/api.ts`: lifecycle, privacy, sync, and media API types/methods.
- `src/features/im/formal-api.ts`: formal payload-to-existing-view-model mapping.
- `src/features/im/model.ts`: remove read-by-all and add explicit lifecycle/media states.
- `src/features/im/store.ts`: delete/update message handling and cache coordination.
- `src/features/im/pages.tsx`: recall-mode chooser, real media picker, privacy controls, and expired-media rendering.
- `src/features/im/local-cache/crypto.ts`: AES-GCM envelope functions.
- `src/features/im/local-cache/database.ts`: account-scoped IndexedDB adapter.
- `src/features/im/local-cache/service.ts`: cache policy, sync cursor, deletion application, and usage/clear operations.
- `src/features/im/CachedImMedia.tsx`: open-time caching and local fallback rendering.
- `src/features/settings/ImCacheSettingsSection.tsx`: usage and clear-cache UI.

### Operations frontend

- `src/api/im-policy.ts`: typed operations policy client.
- `src/pages/admin/ImPolicyPage.tsx`: versioned policy editor.
- `src/components/admin/AdminLayout.tsx`: IM policy navigation entry.
- `src/App.tsx`: permission-protected route.
- `src/i18n/translations.ts`: Chinese source plus Japanese, English, Traditional Chinese, and Korean rows used by touched UI.

---

### Task 1: Message Lifecycle Policy Schema and Send-Time Snapshot

**Files:**
- Modify: `backend/prisma/schema.prisma:1101`
- Create: `backend/prisma/migrations/20260826132000_im_message_lifecycle_policy/migration.sql`
- Create: `backend/src/repositories/im-policy.repository.ts`
- Create: `backend/src/services/im-policy.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts:35-115,450-544`
- Test: `backend/tests/im-policy.service.test.ts`
- Test: `backend/tests/im-message-lifecycle-schema.test.ts`
- Test: `backend/tests/realtime-message-policy.test.ts`

**Interfaces:**
- Produces: `ImPolicyPayload`, `ImPolicyRepositoryPort.getActive()`, `ImPolicyService.getActivePolicy()`, `ImPolicyService.calculateMessageLifecycle(input)`.
- Produces lifecycle response fields: `expiresAt`, `recallDeadlineAt`, `recalledAt`, `recallMode`, `contentPurgedAt`, `lifecycleVersion`.
- Consumes: existing `RealtimeRepository.createMessage` transaction and `CustomerProfile.membershipLevel` only in later tasks.

- [ ] **Step 1: Write failing policy and schema tests**

```ts
// backend/tests/im-policy.service.test.ts
import { ImPolicyService } from "../src/services/im-policy.service";

describe("ImPolicyService", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  const repository = {
    getActive: jest.fn(async () => null),
    updateActive: jest.fn()
  };

  it("defaults text to indefinite, media to three days, and recall to 180 seconds", async () => {
    const service = new ImPolicyService(repository);
    const policy = await service.getActivePolicy();

    expect(policy.textRetentionSeconds).toBeNull();
    expect(policy.imageRetentionSeconds).toBe(259200);
    expect(policy.videoRetentionSeconds).toBe(259200);
    expect(policy.recallWindowSeconds).toBe(180);
    expect(policy.tracelessRecallMembershipLevels).toEqual([
      "silver",
      "gold",
      "platinum",
      "diamond",
      "black"
    ]);
  });

  it("snapshots a text message without a server expiry", async () => {
    const service = new ImPolicyService(repository);
    await expect(service.calculateMessageLifecycle({ kind: "text", now })).resolves.toEqual({
      expiresAt: null,
      recallDeadlineAt: new Date("2026-08-26T12:03:00.000Z")
    });
  });
});
```

```ts
// backend/tests/im-message-lifecycle-schema.test.ts
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

describe("IM lifecycle schema", () => {
  it("indexes lifecycle expiry and stores one active policy", () => {
    expect(schema).toContain("model ImPolicy");
    expect(schema).toContain("recallDeadlineAt");
    expect(schema).toContain("@@index([expiresAt, expiredAt, deletedAt])");
    expect(schema).toContain("activeKey");
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- im-policy.service.test.ts im-message-lifecycle-schema.test.ts --runInBand`  
Expected: FAIL because `ImPolicyService`, `ImPolicy`, and lifecycle fields do not exist.

- [ ] **Step 3: Add the lifecycle schema and migration**

```prisma
enum MessageRecallMode {
  STANDARD
  TRACELESS
}

model ImPolicy {
  id                              Int       @id @default(autoincrement())
  activeKey                       String?   @unique @map("active_key") @db.VarChar(20)
  textRetentionSeconds            Int?      @map("text_retention_seconds")
  imageRetentionSeconds           Int       @default(259200) @map("image_retention_seconds")
  videoRetentionSeconds           Int       @default(259200) @map("video_retention_seconds")
  recallWindowSeconds             Int       @default(180) @map("recall_window_seconds")
  tracelessRecallMembershipLevels Json      @map("traceless_recall_membership_levels")
  version                         Int       @default(1)
  updatedByUserId                 Int?      @map("updated_by_user_id")
  createdAt                       DateTime  @default(now()) @map("created_at")
  updatedAt                       DateTime  @updatedAt @map("updated_at")
  deletedAt                       DateTime? @map("deleted_at")

  updatedBy User? @relation("ImPolicyUpdater", fields: [updatedByUserId], references: [id], onDelete: SetNull)

  @@index([updatedByUserId])
  @@index([deletedAt])
  @@map("im_policies")
}
```

Add these fields to `Message` and add `imPoliciesUpdated ImPolicy[] @relation("ImPolicyUpdater")` to `User`:

```prisma
  expiresAt        DateTime?         @map("expires_at")
  expiredAt        DateTime?         @map("expired_at")
  recallDeadlineAt DateTime          @map("recall_deadline_at")
  recalledAt       DateTime?         @map("recalled_at")
  recallMode       MessageRecallMode? @map("recall_mode")
  contentPurgedAt  DateTime?         @map("content_purged_at")
  lifecycleVersion Int               @default(0) @map("lifecycle_version")

  @@index([expiresAt, expiredAt, deletedAt])
  @@index([senderUserId, recallDeadlineAt])
```

The SQL migration must add `recall_deadline_at` as nullable, backfill it with `DATE_ADD(created_at, INTERVAL 180 SECOND)`, then alter it to `NOT NULL`. Insert one active policy row with `active_key = 'active'` and the exact defaults from the design.

- [ ] **Step 4: Implement policy defaults and send-time calculation**

```ts
// backend/src/services/im-policy.service.ts
export type ImPolicyPayload = {
  activeKey: "active";
  id: number;
  imageRetentionSeconds: number;
  recallWindowSeconds: number;
  textRetentionSeconds: number | null;
  tracelessRecallMembershipLevels: string[];
  version: number;
  videoRetentionSeconds: number;
};

export type UpdateImPolicyInput = {
  actorUserId: number;
  expectedVersion: number;
  imageRetentionSeconds?: number;
  recallWindowSeconds?: number;
  textRetentionSeconds?: number | null;
  tracelessRecallMembershipLevels?: string[];
  videoRetentionSeconds?: number;
};

export interface ImPolicyRepositoryPort {
  getActive(): Promise<ImPolicyPayload | null>;
  updateActive(input: UpdateImPolicyInput): Promise<ImPolicyPayload | null>;
}

export const DEFAULT_IM_POLICY: ImPolicyPayload = {
  id: 0,
  activeKey: "active",
  textRetentionSeconds: null,
  imageRetentionSeconds: 259200,
  videoRetentionSeconds: 259200,
  recallWindowSeconds: 180,
  tracelessRecallMembershipLevels: ["silver", "gold"],
  version: 1
};

export type ImMessagePolicyKind = "text" | "image" | "video";

export class ImPolicyService {
  public constructor(private readonly repository: ImPolicyRepositoryPort) {}

  public async getActivePolicy(): Promise<ImPolicyPayload> {
    return (await this.repository.getActive()) ?? DEFAULT_IM_POLICY;
  }

  public async calculateMessageLifecycle(input: { kind: ImMessagePolicyKind; now: Date }) {
    const policy = await this.getActivePolicy();
    const retention = input.kind === "image"
      ? policy.imageRetentionSeconds
      : input.kind === "video"
        ? policy.videoRetentionSeconds
        : policy.textRetentionSeconds;

    return {
      expiresAt: retention === null ? null : new Date(input.now.getTime() + retention * 1000),
      recallDeadlineAt: new Date(input.now.getTime() + policy.recallWindowSeconds * 1000)
    };
  }
}
```

Wire the policy service into `RealtimeRepository.createMessage`, pass one `now` value through the transaction, and return all lifecycle fields from `mapMessage`.

- [ ] **Step 5: Run focused and repository tests**

Run: `npm --prefix backend test -- im-policy.service.test.ts im-message-lifecycle-schema.test.ts realtime-message-policy.test.ts --runInBand`  
Expected: PASS; the text fixture has `expiresAt: null` and an exact `+180s` recall deadline.

- [ ] **Step 6: Run migration/build gate**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:dev -- --name im_message_lifecycle_policy`  
Expected: Prisma reports the migration applied successfully.  
Run: `npm --prefix backend run prisma:generate && npm --prefix backend run lint && npm --prefix backend run build`  
Expected: all commands exit `0`.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826132000_im_message_lifecycle_policy backend/src/repositories/im-policy.repository.ts backend/src/services/im-policy.service.ts backend/src/repositories/realtime.repository.ts backend/tests/im-policy.service.test.ts backend/tests/im-message-lifecycle-schema.test.ts backend/tests/realtime-message-policy.test.ts
git commit -m "feat: add IM message lifecycle policy"
```

### Task 2: Versioned Operations IM Policy API

**Files:**
- Create: `backend/src/validators/im-policy.validator.ts`
- Create: `backend/src/controllers/im-policy.controller.ts`
- Create: `backend/src/routes/im-policy.routes.ts`
- Modify: `backend/src/services/im-policy.service.ts`
- Modify: `backend/src/repositories/im-policy.repository.ts`
- Modify: `backend/src/app.ts:100-240`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts:298-305,1028-1045`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/im-policy-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: `ImPolicyRepositoryPort.getActive()` from Task 1 and `AuditLogService`.
- Produces: `GET /api/v1/backoffice/im-policy`, `PATCH /api/v1/backoffice/im-policy`.
- Produces: `OperationsImPolicyPayload = ImPolicyPayload & { membershipLevelOptions: string[] }`, where options are the sorted union of configured values and distinct server-side customer membership codes.
- Produces permissions: `im-policy:read`, `im-policy:update`, `page:im-policy`.

- [ ] **Step 1: Write failing validator/service/API tests**

```ts
// backend/tests/im-policy-api.test.ts
it("rejects a stale operations policy version", async () => {
  const repository = {
    getActive: jest.fn(async () => ({
      id: 1,
      activeKey: "active",
      textRetentionSeconds: null,
      imageRetentionSeconds: 259200,
      videoRetentionSeconds: 259200,
      recallWindowSeconds: 180,
      tracelessRecallMembershipLevels: ["gold"],
      version: 4
    })),
    updateActive: jest.fn(async () => null)
  };
  const service = new ImPolicyService(repository);

  await expect(service.updatePolicy({
    actorUserId: 1,
    expectedVersion: 3,
    imageRetentionSeconds: 86400
  })).rejects.toMatchObject({ statusCode: 409, message: "error.im.policy_version_conflict" });
});
```

Add Supertest coverage proving missing `im-policy:update` returns `403`, a valid admin update returns the standard envelope, and the response never exposes deleted policy versions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- im-policy-api.test.ts --runInBand`  
Expected: FAIL because the validator, route, controller, permissions, and update method do not exist.

- [ ] **Step 3: Implement strict policy validation**

```ts
// backend/src/validators/im-policy.validator.ts
import { z } from "zod";

const retentionSeconds = z.number().int().min(60).max(315360000);

export const imPolicyUpdateBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  textRetentionSeconds: retentionSeconds.nullable().optional(),
  imageRetentionSeconds: retentionSeconds.optional(),
  videoRetentionSeconds: retentionSeconds.optional(),
  recallWindowSeconds: z.number().int().min(30).max(900).optional(),
  tracelessRecallMembershipLevels: z.array(z.string().trim().min(1).max(50)).max(50).optional()
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
  message: "At least one policy field is required"
});
```

- [ ] **Step 4: Implement optimistic policy update and audit**

`ImPolicyRepository.updateActive` must use one Prisma transaction to read the prior row, call `updateMany({ where: { activeKey: "active", version: expectedVersion, deletedAt: null } })`, increment `version`, write the audit row, and reread the active row. `ImPolicyService.updatePolicy` throws `error.im.policy_version_conflict` when the update count is not exactly one. Record `im.policy.updated` with old/new durations and membership level codes only; never include message content.

```ts
public async updatePolicy(input: UpdateImPolicyInput): Promise<ImPolicyPayload> {
  const updated = await this.repository.updateActive(input);
  if (!updated) {
    throw new AppError({
      code: ERROR_CODES.IM_POLICY_CONFLICT,
      message: "error.im.policy_version_conflict",
      statusCode: 409
    });
  }
  return updated;
}
```

- [ ] **Step 5: Wire routes, RBAC, dependency injection, and OpenAPI**

Add `IM_POLICY_CONFLICT: 40927` to `ERROR_CODES`; do not reuse a non-existent generic conflict constant.

```ts
router.get(
  "/backoffice/im-policy",
  authenticate(),
  authorize("im-policy:read"),
  controller.getPolicy
);
router.patch(
  "/backoffice/im-policy",
  authenticate(),
  authorize("im-policy:update"),
  validateRequest({ body: imPolicyUpdateBodySchema }),
  controller.updatePolicy
);
```

Add all three permissions to `SYSTEM_PERMISSIONS`; grant API permissions to admin/operator policy managers and route the page permission only to roles intended to see the editor.
The GET/PATCH response obtains membership options from the repository rather than a frontend constant. The seeded default allowlist is `silver` and `gold`, the currently known paid codes; operators can add later paid codes without a release.

- [ ] **Step 6: Run API/OpenAPI and full backend gates**

Run: `npm --prefix backend test -- im-policy-api.test.ts openapi.test.ts --runInBand`  
Expected: PASS and OpenAPI contains both policy methods with bearer security.  
Run: `npm --prefix backend run lint && npm --prefix backend run build`  
Expected: both exit `0`.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/validators/im-policy.validator.ts backend/src/controllers/im-policy.controller.ts backend/src/routes/im-policy.routes.ts backend/src/services/im-policy.service.ts backend/src/repositories/im-policy.repository.ts backend/src/app.ts backend/src/constants/error-codes.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/im-policy-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: add operations IM policy API"
```

### Task 3: Server-Enforced Standard and Traceless Recall

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826133000_im_deletion_sync/migration.sql`
- Create: `backend/src/repositories/im-message-lifecycle.repository.ts`
- Create: `backend/src/services/im-message-lifecycle.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/im-message-recall.service.test.ts`
- Test: `backend/tests/im-message-recall.repository.test.ts`
- Test: `backend/tests/realtime-api.test.ts`

**Interfaces:**
- Consumes: active policy and server-side customer membership level.
- Produces: `RecallMode = "standard" | "traceless"`, `RecallMessageResult`, `message:recall` permission.
- Produces: `POST /api/v1/im/conversations/:conversationId/messages/:messageId/recall`.
- Produces content-free `ImDeletionSync` rows used by Tasks 4 and 6.

- [ ] **Step 1: Write failing exact-boundary and entitlement tests**

```ts
it.each([
  ["2026-08-26T12:02:59.999Z", true],
  ["2026-08-26T12:03:00.000Z", true],
  ["2026-08-26T12:03:00.001Z", false]
])("enforces the recall boundary at %s", async (iso, allowed) => {
  const result = service.canRecall({
    now: new Date(iso),
    recallDeadlineAt: new Date("2026-08-26T12:03:00.000Z")
  });
  expect(result).toBe(allowed);
});

it("rejects traceless recall for a non-allowlisted level", async () => {
  await expect(service.recall(auth, {
    conversationId: 7,
    messageId: 41,
    mode: "traceless",
    now: new Date("2026-08-26T12:01:00.000Z")
  })).rejects.toMatchObject({ message: "error.im.traceless_recall_not_entitled" });
});
```

Repository tests must prove the transaction clears `content` and `metadata`, deletes reactions, decrements unread counts only for unread recipients, writes exactly one sync row, and writes audit metadata without content/URL fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- im-message-recall.service.test.ts im-message-recall.repository.test.ts --runInBand`  
Expected: FAIL because recall lifecycle classes and sync persistence do not exist.

- [ ] **Step 3: Add content-free deletion sync persistence**

```prisma
enum ImDeletionAction {
  STANDARD_RECALL
  TRACELESS_RECALL
  PRIVACY_EXPIRED
  MEDIA_EXPIRED
  SERVER_RETENTION_EXPIRED
}

model ImDeletionSync {
  id             Int              @id @default(autoincrement())
  conversationId Int              @map("conversation_id")
  messageId      Int              @map("message_id")
  action         ImDeletionAction
  mediaKind      String?          @map("media_kind") @db.VarChar(20)
  occurredAt     DateTime         @map("occurred_at")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  deletedAt      DateTime?        @map("deleted_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Restrict)

  @@unique([messageId, action])
  @@index([conversationId, id])
  @@index([occurredAt])
  @@index([deletedAt])
  @@map("im_deletion_sync")
}
```

Add `deletionSync ImDeletionSync[]` to `Conversation`. Do not relate `messageId` to `Message`, because traceless and privacy deletion physically remove the message row.

- [ ] **Step 4: Implement recall service validation**

```ts
export type RecallMode = "standard" | "traceless";

export type RecallMessageResult = {
  action: "standard_recall" | "traceless_recall";
  conversationId: number;
  message: RealtimeMessagePayload | null;
  messageId: number;
  participantUserIds: number[];
  syncCursor: number;
};

public canRecall(input: { now: Date; recallDeadlineAt: Date }): boolean {
  return input.now.getTime() <= input.recallDeadlineAt.getTime();
}

public async recall(
  auth: AuthenticatedAccessContext,
  input: { conversationId: number; messageId: number; mode: RecallMode; now: Date }
) {
  const candidate = await this.repository.findRecallCandidate(input, auth.userId);
  if (!candidate) throw this.notFound("error.im.message_not_found");
  if (candidate.senderUserId !== auth.userId) throw this.forbidden("error.im.message_not_owned");
  if (!this.canRecall({ now: input.now, recallDeadlineAt: candidate.recallDeadlineAt })) {
    throw this.conflict("error.im.recall_window_expired");
  }
  if (input.mode === "traceless") {
    const entitled = await this.policyService.canUseTracelessRecall(auth.userId);
    if (!entitled) throw this.forbidden("error.im.traceless_recall_not_entitled");
  }
  return this.repository.recall({ ...input, actorUserId: auth.userId });
}
```

- [ ] **Step 5: Implement the atomic repository mutation**

For standard recall, retain the row with `content = null`, `metadata = null`, `recallMode = STANDARD`, `contentPurgedAt = now`, `recalledAt = now`, and delete reactions. For traceless recall, write sync/audit first in the same transaction, clear participant `lastReadMessageId` references through the existing `onDelete: SetNull`, delete reactions, and physically delete the message. Recompute the conversation `updatedAt` from the newest remaining visible message.

```ts
await transaction.auditLog.create({
  data: {
    actorId: input.actorUserId,
    action: "im.message.recalled",
    targetType: "Message",
    targetId: input.messageId,
    ip: null,
    userAgent: null,
    metadata: {
      conversationId: input.conversationId,
      recallMode: input.mode
    },
    createdAt: input.now
  }
});
```

- [ ] **Step 6: Add route, validation, permissions, and OpenAPI**

```ts
export const messageRecallBodySchema = z.object({
  mode: z.enum(["standard", "traceless"])
}).strict();
```

Use `messageReactionParamSchema` for the two numeric path IDs and authorize `message:recall`. Map race-lost/expired states to stable `404`, `403`, or `409` errors without returning Prisma exceptions.
Add `IM_RECALL_WINDOW_EXPIRED: 40928` and `IM_MESSAGE_ALREADY_DELETED: 40929` to `ERROR_CODES`; keep ownership and entitlement failures on the existing `FORBIDDEN` code and missing messages on `NOT_FOUND`.

- [ ] **Step 7: Run migration, recall tests, and backend gate**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:dev -- --name im_deletion_sync`  
Expected: migration applies successfully.  
Run: `npm --prefix backend test -- im-message-recall.service.test.ts im-message-recall.repository.test.ts realtime-api.test.ts openapi.test.ts --runInBand`  
Expected: PASS, including repeated/concurrent recall idempotency.  
Run: `npm --prefix backend run lint && npm --prefix backend run build`  
Expected: both exit `0`.

- [ ] **Step 8: Commit Task 3**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826133000_im_deletion_sync backend/src/repositories/im-message-lifecycle.repository.ts backend/src/services/im-message-lifecycle.service.ts backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/validators/realtime.validator.ts backend/src/app.ts backend/src/constants/error-codes.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/im-message-recall.service.test.ts backend/tests/im-message-recall.repository.test.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: enforce IM message recall"
```

### Task 4: Formal Frontend Recall and Participant-Visible Semantics

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/pages.tsx:4112,5274-5375`
- Modify: `src/features/im/components.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `src/features/realtime/api.test.ts`
- Test: `src/features/im/formal-api.test.ts`
- Test: `src/features/im/model.test.ts`
- Test: `src/features/im/pages.test.ts`

**Interfaces:**
- Consumes: recall endpoint and lifecycle message fields from Task 3.
- Produces: `realtimeApi.recallMessage(conversationId, messageId, mode)` and `store.recallMessage(conversationId, messageId, mode)`.
- Produces: ordinary/traceless action chooser without changing the shared IM visual system.

- [ ] **Step 1: Write failing adapter and source-contract tests**

```ts
it("requests formal traceless recall and removes the returned message", async () => {
  const recall = vi.spyOn(realtimeApi, "recallMessage").mockResolvedValue({
    action: "traceless_recall",
    conversationId: 91,
    messageId: 700,
    syncCursor: 44
  });
  const api = createFormalImApi({
    currentUser: { id: 100, username: "customer", avatarUrl: null },
    scope: "user"
  });

  await api.recallMessage("91", "700", "traceless");
  expect(recall).toHaveBeenCalledWith(91, 700, "traceless");
});
```

Add source assertions proving `messageRecallTraceThresholdMs`, `isQuickRecallMessage`, and the local-only `setHiddenMessageIds` quick-recall branch are absent.

- [ ] **Step 2: Run frontend focused tests and verify RED**

Run: `npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/pages.test.ts`  
Expected: FAIL because formal recall remains capability-gated and the UI still locally hides recent messages.

- [ ] **Step 3: Add typed recall API and view-model fields**

```ts
export type RealtimeRecallResult = {
  action: "standard_recall" | "traceless_recall";
  conversationId: number;
  message: RealtimeMessage | null;
  messageId: number;
  syncCursor: number;
};

recallMessage(conversationId: number, messageId: number, mode: "standard" | "traceless") {
  return httpClient.request<RealtimeRecallResult>(
    `/im/conversations/${conversationId}/messages/${messageId}/recall`,
    { body: { mode }, method: "POST" }
  );
}
```

Extend `ConversationMessage` with `recallDeadlineAt?: string`, `availableRecallModes?: Array<"standard" | "traceless">`, and a local `serverState?: "active" | "recalled" | "deleted" | "expired"` discriminator.

- [ ] **Step 4: Replace the formal capability gate and store mutation**

```ts
async recallMessage(conversationId: string, messageId: string, mode: "standard" | "traceless") {
  const result = await realtimeApi.recallMessage(
    toNumericId(conversationId),
    toNumericId(messageId),
    mode
  );
  return {
    conversationId,
    messageId,
    message: result.message ? toConversationMessage(result.message) : undefined,
    mode
  };
}
```

The store must replace standard recall with the server placeholder and remove traceless recall from `messagesByConversation`; it must not infer success before the response.
Update legacy `createImApi.recallMessage` to accept the same `(conversationId, messageId, mode)` signature so `ReturnType<typeof createImApi>` remains compatible with the formal adapter; its legacy request may ignore `conversationId` but must pass `{ mode }` in the request body.

- [ ] **Step 5: Replace the current local quick recall with a server-backed chooser**

Use the existing bottom-sheet primitives. Show `普通撤回` for every server-recallable own message and `无痕撤回` only when `availableRecallModes` contains `traceless`. Disable recall when the server deadline has passed, but still display backend rejection if the local clock is stale.

```ts
const recallMessage = (message: ConversationMessage, mode: "standard" | "traceless") => {
  if (!isOwnRecallableMessage(message)) return;
  void store.recallMessage(message.conversationId, message.id, mode)
    .catch((error) => setActionError(error instanceof Error ? error.message : String(error)));
  closeMessageMenu();
};
```

- [ ] **Step 6: Add translations and run frontend gates**

Add rows for `普通撤回`, `无痕撤回`, `消息已撤回`, `撤回时间已超过3分钟`, and `当前会员无法使用无痕撤回` with explicit `zh-Hant`, `ja`, `en`, and `ko` values.

Run: `npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/model.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts`  
Expected: PASS.  
Run: `npm run lint && npm run build -- --mode formal`  
Expected: both exit `0`.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/features/realtime/api.ts src/features/im/model.ts src/features/im/api.ts src/features/im/formal-api.ts src/features/im/store.ts src/features/im/pages.tsx src/features/im/components.tsx src/i18n/translations.ts src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/model.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
git commit -m "feat: connect formal IM recall"
```

### Task 5: Group-Only Privacy Settings and Send-Time Expiry

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826134000_group_privacy_mode/migration.sql`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/pages.tsx:6073-6635,6891-7600`
- Modify: `src/i18n/translations.ts`
- Test: `backend/tests/im-conversation-privacy.service.test.ts`
- Test: `backend/tests/realtime-api.test.ts`
- Test: `src/features/im/model.test.ts`
- Test: `src/features/im/formal-api.test.ts`
- Test: `src/features/im/pages.test.ts`

**Interfaces:**
- Produces: `UpdateConversationPrivacyInput { privacyModeEnabled, disappearingTtlSeconds, expectedVersion }`.
- Produces: `PATCH /api/v1/im/conversations/:conversationId/privacy`.
- Removes: `ConversationDisappearingStartMode` and every `read_by_all` value.

- [ ] **Step 1: Write failing group/privacy tests**

```ts
it("rejects privacy settings on a direct conversation", async () => {
  await expect(service.updateConversationPrivacy(auth, {
    conversationId: 8,
    privacyModeEnabled: true,
    disappearingTtlSeconds: 180,
    expectedVersion: 0
  })).rejects.toMatchObject({ message: "error.im.direct_privacy_not_supported" });
});

it("allows an owner to enable privacy in a two-member group", async () => {
  repository.updateConversationPrivacy.mockResolvedValue(groupConversation);
  await expect(service.updateConversationPrivacy(ownerAuth, {
    conversationId: 9,
    privacyModeEnabled: true,
    disappearingTtlSeconds: 180,
    expectedVersion: 0
  })).resolves.toMatchObject({ privacyModeEnabled: true });
});
```

Add frontend source tests that fail if `read_by_all`, `全员看过后`, or `disappearingStartMode` remains under `src/features/im`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- im-conversation-privacy.service.test.ts --runInBand`  
Expected: FAIL because formal privacy persistence is absent.  
Run: `npm test -- src/features/im/model.test.ts src/features/im/pages.test.ts`  
Expected: FAIL because the read-by-all option still exists.

- [ ] **Step 3: Add conversation privacy fields and migration**

```prisma
  privacyModeEnabled    Boolean   @default(false) @map("privacy_mode_enabled")
  disappearingTtlSeconds Int?      @map("disappearing_ttl_seconds")
  privacyPolicyVersion  Int       @default(0) @map("privacy_policy_version")
  privacyUpdatedAt      DateTime? @map("privacy_updated_at")
  privacyUpdatedByUserId Int?      @map("privacy_updated_by_user_id")
```

Add the updater relation and indexes. The migration must leave every existing direct/group conversation disabled with no TTL.

- [ ] **Step 4: Implement backend authorization and optimistic update**

```ts
export const conversationPrivacyBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  privacyModeEnabled: z.boolean(),
  disappearingTtlSeconds: z.number().int().min(60).max(31536000).nullable()
}).strict().superRefine((value, context) => {
  if (value.privacyModeEnabled && value.disappearingTtlSeconds === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["disappearingTtlSeconds"], message: "TTL is required" });
  }
});
```

The service must read the authenticated participant role and accept only `owner` or `admin`. The repository update predicate includes `type: GROUP`, `privacyPolicyVersion: expectedVersion`, and `deletedAt: null`, then increments the version.

- [ ] **Step 5: Snapshot group privacy expiry during message creation**

Inside the existing message transaction, read the conversation privacy fields together with participant membership. For enabled groups, set `expiresAt = now + disappearingTtlSeconds`; otherwise use the active global text policy calculated in Task 1. Never recalculate existing messages after a settings update.

```ts
const expiresAt = conversation.type === ConversationType.GROUP && conversation.privacyModeEnabled
  ? new Date(now.getTime() + conversation.disappearingTtlSeconds! * 1000)
  : lifecycle.expiresAt;
```

- [ ] **Step 6: Remove read-by-all and connect the formal UI**

Replace the frontend structured countdown with a single `disappearingTtlSeconds` value at the formal API boundary. Keep the existing months/days/hours/minutes editor as a presentation helper if desired, but it must always serialize to seconds and show only `发送后开始倒计时`. Direct conversations do not render privacy controls. Two-person `group` conversations do.

- [ ] **Step 7: Run migration and cross-stack tests**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:dev -- --name group_privacy_mode`  
Expected: migration applies successfully.  
Run: `npm --prefix backend test -- im-conversation-privacy.service.test.ts realtime-api.test.ts openapi.test.ts --runInBand`  
Expected: PASS.  
Run: `npm test -- src/features/im/model.test.ts src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts`  
Expected: PASS and `rg -n "read_by_all|全员看过后|disappearingStartMode" src/features/im` returns no matches.

- [ ] **Step 8: Commit Task 5**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826134000_group_privacy_mode backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/validators/realtime.validator.ts backend/src/api/openapi.ts backend/tests/im-conversation-privacy.service.test.ts backend/tests/realtime-api.test.ts src/features/realtime/api.ts src/features/im/model.ts src/features/im/api.ts src/features/im/formal-api.ts src/features/im/pages.tsx src/i18n/translations.ts src/features/im/model.test.ts src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
git commit -m "feat: add group IM privacy expiry settings"
```

### Task 6: Durable Deletion Sync and Text/Privacy Expiry Worker

**Files:**
- Create: `backend/src/repositories/im-deletion-sync.repository.ts`
- Create: `backend/src/services/im-deletion-sync.service.ts`
- Modify: `backend/src/services/im-message-lifecycle.service.ts`
- Modify: `backend/src/repositories/im-message-lifecycle.repository.ts`
- Create: `backend/src/workers/im-message-lifecycle.worker.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/server-shutdown.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`
- Test: `backend/tests/im-message-expiry.service.test.ts`
- Test: `backend/tests/im-message-lifecycle.worker.test.ts`
- Test: `backend/tests/im-deletion-sync-api.test.ts`
- Test: `backend/tests/server-shutdown.test.ts`
- Test: `src/features/realtime/api.test.ts`
- Test: `src/features/im/formal-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/im/sync?after=<id>&pageSize=<n>`.
- Produces: `ImDeletionDirective` and `applyDeletionDirective` behavior.
- Produces: `ImMessageLifecycleWorker.start/stop/runOnce` and `IM_MESSAGE_LIFECYCLE_INTERVAL_MS` default `1000`.

- [ ] **Step 1: Write failing worker, sync authorization, and client replay tests**

```ts
it("physically deletes a due privacy message but only marks ordinary retention expiry", async () => {
  repository.listDue.mockResolvedValue([
    { id: 10, conversationId: 2, expiryKind: "privacy", lifecycleVersion: 1 },
    { id: 11, conversationId: 3, expiryKind: "server_retention", lifecycleVersion: 2 }
  ]);

  await expect(service.expireDue({ now, batchSize: 50, maxBatches: 1 })).resolves.toEqual({
    expired: 2,
    failed: 0
  });
  expect(repository.expirePrivacyMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: 10 }));
  expect(repository.expireServerCopy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 11 }));
});
```

Add API tests proving a user sees directives only for conversations they participate in and pagination advances by sync `id`. Add frontend tests proving duplicate cursor application is idempotent.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- im-message-expiry.service.test.ts im-message-lifecycle.worker.test.ts im-deletion-sync-api.test.ts --runInBand`  
Expected: FAIL because the worker and sync endpoint do not exist.

- [ ] **Step 3: Implement participant-scoped sync pagination**

```ts
export const imDeletionSyncQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().positive().max(100).default(100)
});
```

The repository query filters `id > after`, `deletedAt: null`, and `conversation.participants.some({ userId, deletedAt: null })`, orders ascending, and returns `nextCursor` equal to the last returned ID or the input cursor when empty.

- [ ] **Step 4: Implement privacy and ordinary-retention expiry paths**

Privacy expiry transaction:

1. claim exact `lifecycleVersion` and due `expiresAt`;
2. capture active participant IDs for SSE fanout;
3. write `PRIVACY_EXPIRED` sync row;
4. delete reactions;
5. clear dependent read markers;
6. physically delete the message;
7. repair participant unread counts and conversation summary.

Ordinary server-retention expiry transaction:

1. write `SERVER_RETENTION_EXPIRED` sync row;
2. set `content = null`, `metadata = null`, `expiredAt = now`, `contentPurgedAt = now`;
3. delete reactions;
4. keep the row excluded from server history so a client can label its encrypted copy as local-only.

Every server history/read query must independently exclude `expiresAt <= now`, so an expired privacy message is inaccessible at the exact deadline even if the physical worker is delayed. The frontend schedules removal from memory and encrypted cache at `expiresAt`, then reconciles the durable directive; startup prunes already-due privacy entries before rendering. The one-second worker interval bounds healthy-path physical deletion latency without making correctness depend on a timer firing exactly on time.

- [ ] **Step 5: Implement non-overlapping worker and shutdown integration**

```ts
interface LifecycleWorkerLogger {
  error(context: Record<string, unknown>, message: string): void;
  info(context: Record<string, unknown>, message: string): void;
}

export class ImMessageLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<ImMessageLifecycleService, "expireDue">,
    private readonly logger: LifecycleWorkerLogger,
    private readonly intervalMs: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.service.expireDue({ now: this.now() });
      this.logger.info(result, "IM message lifecycle expiry completed");
    } catch (error) {
      this.logger.error({ error }, "IM message lifecycle expiry failed");
    } finally {
      this.running = false;
    }
  }
}
```

Extend the existing shutdown handler input from one `stopWorker` callback to a `stopWorkers: Array<() => void>` contract, update its existing test, and stop both identity and IM workers before disconnecting Prisma/Redis.

- [ ] **Step 6: Publish directives through SSE after commit**

The service receives the committed directive and participant IDs, then publishes `message.deleted` for privacy/traceless deletion or the specific content-free event. The SSE event `id` must be `im-sync-<cursor>` so it can be correlated with `/im/sync`; no message content appears in the payload.

- [ ] **Step 7: Apply sync directives in the formal frontend**

```ts
export type ImDeletionDirective = {
  action: "standard_recall" | "traceless_recall" | "privacy_expired" | "media_expired" | "server_retention_expired";
  conversationId: number;
  id: number;
  mediaKind: "image" | "video" | null;
  messageId: number;
  occurredAt: string;
};
```

On formal IM hydration and every SSE reconnect, call `/im/sync` after the last applied cursor and apply ascending directives. Standard recall replaces content; traceless/privacy removes; ordinary retention marks local-only; media expiry is completed in Task 7. Persist the cursor only after all effects succeed.

- [ ] **Step 8: Run expiry/sync/shutdown and frontend tests**

Run: `npm --prefix backend test -- im-message-expiry.service.test.ts im-message-lifecycle.worker.test.ts im-deletion-sync-api.test.ts server-shutdown.test.ts realtime-event-gateway.test.ts --runInBand`  
Expected: PASS.  
Run: `npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts`  
Expected: PASS.  
Run: `npm --prefix backend run lint && npm --prefix backend run build && npm run lint`  
Expected: all exit `0`.

- [ ] **Step 9: Commit Task 6**

```bash
git add backend/src/repositories/im-deletion-sync.repository.ts backend/src/services/im-deletion-sync.service.ts backend/src/services/im-message-lifecycle.service.ts backend/src/repositories/im-message-lifecycle.repository.ts backend/src/workers/im-message-lifecycle.worker.ts backend/src/config/env.ts backend/.env.dev.example backend/src/server.ts backend/src/server-shutdown.ts backend/src/app.ts backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/validators/realtime.validator.ts backend/src/api/openapi.ts backend/tests/im-message-expiry.service.test.ts backend/tests/im-message-lifecycle.worker.test.ts backend/tests/im-deletion-sync-api.test.ts backend/tests/server-shutdown.test.ts backend/tests/realtime-event-gateway.test.ts src/features/realtime/api.ts src/features/im/formal-api.ts src/features/im/store.ts src/features/realtime/api.test.ts src/features/im/formal-api.test.ts
git commit -m "feat: synchronize IM message expiry"
```

### Task 7: Formal Image/Video Storage and Three-Day Expiry

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826135000_im_message_media/migration.sql`
- Create: `backend/src/services/im-media.storage.ts`
- Create: `backend/src/services/im-media-access-token.service.ts`
- Create: `backend/src/services/im-media.service.ts`
- Create: `backend/src/repositories/im-media.repository.ts`
- Create: `backend/src/controllers/im-media.controller.ts`
- Create: `backend/src/routes/im-media.routes.ts`
- Create: `backend/src/workers/im-media-purge.worker.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/im-message-lifecycle.service.ts`
- Modify: `backend/src/repositories/im-message-lifecycle.repository.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `backend/tests/im-media.storage.test.ts`
- Test: `backend/tests/im-media-access-token.service.test.ts`
- Test: `backend/tests/im-media.service.test.ts`
- Test: `backend/tests/im-media-purge.worker.test.ts`
- Test: `backend/tests/im-media-api.test.ts`
- Test: `backend/tests/im-message-recall.repository.test.ts`
- Test: `src/features/im/formal-api.test.ts`
- Test: `src/features/im/pages.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/im/conversations/:conversationId/media-messages?kind=image|video` with raw binary body.
- Produces: authenticated `POST /api/v1/im/media/:mediaId/access`, a 60-second signed access path, and `GET /api/v1/im/media/:mediaId/content?token=...`; never a permanent public file URL.
- Produces: `MessageMediaPayload`, durable `ImMediaPurgeJob`, `ImMediaStoragePort`, and `ImMediaPurgeWorker`.

- [ ] **Step 1: Write failing signature, authorization, and expiry tests**

```ts
it("rejects a JPEG content type whose bytes are not JPEG", async () => {
  const storage = new ImMediaFileStorage(tempDirectory);
  await expect(storage.save({
    bytes: Buffer.from("not-a-jpeg"),
    kind: "image",
    mimeType: "image/jpeg"
  })).rejects.toMatchObject({ message: "error.im.media_invalid" });
});

it("purges original and thumbnail idempotently at the exact expiry", async () => {
  repository.listDue.mockResolvedValue([{ id: 3, storageKey: "a.jpg", thumbnailStorageKey: null, version: 1 }]);
  await worker.runOnce();
  expect(storage.delete).toHaveBeenCalledWith("a.jpg");
  expect(repository.completePurge).toHaveBeenCalledTimes(1);
});
```

API tests must prove a non-participant cannot upload or mint an access token; a signed token stops working immediately after recall/expiry even before its 60-second deadline; and `blob:`, remote URL, and client-supplied storage keys are never accepted.

- [ ] **Step 2: Run media tests and verify RED**

Run: `npm --prefix backend test -- im-media.storage.test.ts im-media-access-token.service.test.ts im-media.service.test.ts im-media-purge.worker.test.ts im-media-api.test.ts --runInBand`  
Expected: FAIL because formal IM media persistence and routes do not exist.

- [ ] **Step 3: Add normalized media schema and migration**

```prisma
// Extend the existing enum; keep existing values unchanged.
enum MessageType {
  TEXT         @map("text")
  SYSTEM       @map("system")
  ORDER_STATUS @map("order_status")
  IMAGE        @map("image")
  VIDEO        @map("video")

  @@map("message_type")
}

enum MessageMediaKind {
  IMAGE
  VIDEO
}

model MessageMedia {
  id                  Int              @id @default(autoincrement())
  messageId           Int              @map("message_id")
  kind                MessageMediaKind
  storageKey          String?          @map("storage_key") @db.VarChar(255)
  thumbnailStorageKey String?          @map("thumbnail_storage_key") @db.VarChar(255)
  mimeType            String           @map("mime_type") @db.VarChar(100)
  fileSize            Int              @map("file_size")
  width               Int?
  height              Int?
  durationMs          Int?             @map("duration_ms")
  checksumSha256      String            @map("checksum_sha256") @db.Char(64)
  expiresAt           DateTime          @map("expires_at")
  purgeStartedAt      DateTime?         @map("purge_started_at")
  purgedAt            DateTime?         @map("purged_at")
  version             Int               @default(0)
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")
  deletedAt           DateTime?         @map("deleted_at")

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([messageId])
  @@index([expiresAt, purgedAt, deletedAt])
  @@index([purgeStartedAt])
  @@index([deletedAt])
  @@map("message_media")
}

model ImMediaPurgeJob {
  id                  Int       @id @default(autoincrement())
  jobKey              String    @unique @map("job_key") @db.VarChar(100)
  storageKey          String?   @map("storage_key") @db.VarChar(255)
  thumbnailStorageKey String?   @map("thumbnail_storage_key") @db.VarChar(255)
  attempts            Int       @default(0)
  leaseUntil          DateTime? @map("lease_until")
  lastError           String?   @map("last_error") @db.VarChar(500)
  completedAt         DateTime? @map("completed_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  deletedAt           DateTime? @map("deleted_at")

  @@index([completedAt, leaseUntil, deletedAt])
  @@index([deletedAt])
  @@map("im_media_purge_jobs")
}
```

Extend backend `MessageTypePayload`, its Prisma mappers, OpenAPI, and frontend formal payload mapping with `image | video`; do not encode formal media as a text message plus client-owned URL metadata.

- [ ] **Step 4: Implement secure storage and raw upload**

Allow only explicit image signatures (`image/jpeg`, `image/png`, `image/webp`) and explicit video signatures (`video/mp4`, `video/webm`) with separate byte limits. Hash bytes with SHA-256, generate a server-owned random storage key, reject path separators, and use exclusive creation. The media service saves the object, creates `Message` and `MessageMedia` transactionally with the active policy expiry, and deletes the object if persistence fails. Add a dedicated `IM_MEDIA_ACCESS_SIGNING_SECRET` (minimum 32 bytes) and never reuse or return storage keys.

```ts
router.post(
  "/im/conversations/:conversationId/media-messages",
  authenticate(),
  authorize("message:create"),
  validateRequest({ params: conversationIdParamSchema, query: imMediaUploadQuerySchema }),
  express.raw({ type: ["image/*", "video/*"], limit: config.IM_MEDIA_MAX_UPLOAD_BYTES }),
  controller.createMediaMessage
);
```

- [ ] **Step 5: Implement authorized reads and expiry placeholders**

Access issuance verifies active conversation participation before signing `{ mediaId, userId, expiresAt }`. Content reads verify the signature, deadline, user/media binding, and current non-purged database row before reading bytes; therefore recall/expiry revokes an otherwise unexpired token. Responses set `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. A purged record returns `error.im.media_expired` without touching storage.

Add `IM_MEDIA_EXPIRED: 41001` to `ERROR_CODES`. Invalid signatures use the existing token-invalid code; unauthorized participants receive the existing not-found response so media existence is not disclosed.

At natural expiry, one transaction denies future reads, copies the original/thumbnail keys into an idempotent `ImMediaPurgeJob`, clears both keys on `MessageMedia`, marks `purgedAt`, writes `MEDIA_EXPIRED` sync, and publishes `message.media.expired` after commit. The purge worker claims jobs by lease, deletes both files idempotently, then marks the job complete.

Integrate recall with the same queue: standard recall keeps the content-free message/media placeholder, traceless recall may cascade-delete `MessageMedia`, and both first persist a purge job containing the server-owned keys. After commit, the recall path attempts the job immediately before responding; a failure leaves an inaccessible object plus a durable retry job, never a live access route or a lost cleanup key.

- [ ] **Step 6: Replace the chat media presets with a real picker**

The conversation composer must use an `<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">`, upload the selected `File` as the raw body, and insert only the server response. Remove the `example.com` video/file URLs and album-image preset from the formal path.

```ts
createMediaMessage(conversationId: number, kind: "image" | "video", file: File) {
  return httpClient.request<RealtimeMessage>(
    `/im/conversations/${conversationId}/media-messages`,
    {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST",
      query: { kind }
    }
  );
},

async getMediaDataUrl(mediaId: number, variant: "original" | "thumbnail") {
  const access = await httpClient.request<{ expiresAt: string; path: string }>(
    `/im/media/${mediaId}/access`,
    { body: { variant }, method: "POST" }
  );
  return httpClient.requestDataUrl(access.path, {
    auth: false,
    retryOnUnauthorized: false
  });
}
```

`httpClient.request` already treats `File` as a `Blob` and keeps the JSON envelope response. The access-issuance call preserves the existing one-time 401 refresh; the signed binary request explicitly disables auth refresh so an expired media token cannot clear the user's login session.

- [ ] **Step 7: Render server-expired media correctly**

Map purged image/video records to `mediaState: "expired"` while retaining the original kind. Render `图片已过期` or `视频已过期`; do not render an empty image element, stale URL, or retry loop.

- [ ] **Step 8: Run migration, media tests, and cross-stack gates**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:dev -- --name im_message_media`  
Expected: migration applies successfully.  
Run: `npm --prefix backend test -- im-media.storage.test.ts im-media-access-token.service.test.ts im-media.service.test.ts im-media-purge.worker.test.ts im-media-api.test.ts openapi.test.ts --runInBand`  
Expected: PASS.  
Run: `npm test -- src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts`  
Expected: PASS.  
Run: `npm --prefix backend run lint && npm --prefix backend run build && npm run lint && npm run build -- --mode formal`  
Expected: all exit `0`.

- [ ] **Step 9: Commit Task 7**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826135000_im_message_media backend/src/services/im-media.storage.ts backend/src/services/im-media-access-token.service.ts backend/src/services/im-media.service.ts backend/src/repositories/im-media.repository.ts backend/src/controllers/im-media.controller.ts backend/src/routes/im-media.routes.ts backend/src/workers/im-media-purge.worker.ts backend/src/services/im-message-lifecycle.service.ts backend/src/repositories/im-message-lifecycle.repository.ts backend/src/config/env.ts backend/.env.dev.example backend/src/app.ts backend/src/server.ts backend/src/api/openapi.ts backend/src/constants/error-codes.ts backend/tests/im-media.storage.test.ts backend/tests/im-media-access-token.service.test.ts backend/tests/im-media.service.test.ts backend/tests/im-media-purge.worker.test.ts backend/tests/im-media-api.test.ts backend/tests/im-message-recall.repository.test.ts src/features/realtime/api.ts src/features/im/formal-api.ts src/features/im/model.ts src/features/im/pages.tsx src/features/im/components.tsx src/i18n/translations.ts src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
git commit -m "feat: add expiring IM media storage"
```

### Task 8: Encrypted IndexedDB Message and Opened-Media Cache

**Files:**
- Create: `src/features/im/local-cache/crypto.ts`
- Create: `src/features/im/local-cache/database.ts`
- Create: `src/features/im/local-cache/service.ts`
- Create: `src/features/im/CachedImMedia.tsx`
- Create: `src/features/settings/ImCacheSettingsSection.tsx`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `src/features/im/local-cache/crypto.test.ts`
- Test: `src/features/im/local-cache/service.test.ts`
- Test: `src/features/im/CachedImMedia.test.tsx`
- Test: `src/features/im/store.test.ts`
- Test: `src/features/settings/ImCacheSettingsSection.test.tsx`

**Interfaces:**
- Produces: `ImLocalCacheService.hydrateMessages`, `cacheOpenedMedia`, `applyDirective`, `getUsage`, `clearAccount`, `lock`, and the single account-aware `getImLocalCacheService()` accessor.
- Consumes: deletion directives from Task 6 and authorized media bytes from Task 7.
- Produces account-scoped IndexedDB stores: `keys`, `messages`, `media`, `state`.

- [ ] **Step 1: Write failing encryption and deletion-precedence tests**

```ts
it("round-trips content with AES-GCM and rejects the wrong account AAD", async () => {
  const key = await createImCacheKey();
  const envelope = await encryptImCacheValue(key, "account:7", new TextEncoder().encode("secret"));
  await expect(decryptImCacheValue(key, "account:8", envelope)).rejects.toThrow();
  await expect(decryptImCacheValue(key, "account:7", envelope)).resolves.toEqual(
    new TextEncoder().encode("secret")
  );
});

it("deletes recalled content before advancing the sync cursor", async () => {
  await service.applyDirective({
    action: "traceless_recall",
    conversationId: 2,
    id: 44,
    mediaKind: null,
    messageId: 9,
    occurredAt: "2026-08-26T12:00:00.000Z"
  });
  expect(database.deleteMessage).toHaveBeenCalledWith("7", "2", "9");
  expect(database.setSyncCursor).toHaveBeenCalledWith("7", 44);
  expect(database.deleteMessage.mock.invocationCallOrder[0]).toBeLessThan(
    database.setSyncCursor.mock.invocationCallOrder[0]
  );
});
```

- [ ] **Step 2: Run local-cache tests and verify RED**

Run: `npm test -- src/features/im/local-cache/crypto.test.ts src/features/im/local-cache/service.test.ts`  
Expected: FAIL because cache modules do not exist.

- [ ] **Step 3: Implement AES-GCM envelopes**

```ts
export type ImCacheEnvelope = {
  algorithm: "AES-GCM";
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  version: 1;
};

export function createImCacheKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptImCacheValue(key: CryptoKey, aad: string, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    bytes
  );
  return { algorithm: "AES-GCM" as const, ciphertext, iv, version: 1 as const };
}
```

`decryptImCacheValue` must use the same AAD and reject tampered ciphertext.

- [ ] **Step 4: Implement account-scoped IndexedDB persistence**

Database name: `needo.im.cache.v1`. Key every record with `[accountId, conversationId, messageId]`; store the non-extractable `CryptoKey` in the `keys` object store keyed by account ID. Do not store plaintext content, plaintext binary blobs, access tokens, refresh tokens, or media URLs.

All IndexedDB methods must accept an injected `IDBFactory` so unit tests can use a deterministic in-memory port without changing production globals.
Document the boundary: AES-GCM protects cached bytes at rest and against cross-account mixups; it does not make a compromised same-origin JavaScript runtime safe from XSS.

- [ ] **Step 5: Implement cache service and deletion rules**

`hydrateMessages` first deletes locally due privacy entries using their snapshotted `expiresAt`, then merges the remaining cached pages with formal server pages by message ID. `cacheOpenedMedia` runs only after an authenticated media response succeeds and the user opens it. `applyDirective` uses these rules:

- standard recall: delete cached content/media and write a content-free local placeholder;
- traceless/privacy: delete message and media;
- media expiry: keep an existing encrypted media blob, remove remote URL metadata, otherwise keep only expired kind;
- ordinary retention expiry: keep encrypted local content and mark `localOnly: true`.

- [ ] **Step 6: Integrate account lock/logout and reconnect ordering**

Export one lazily created `getImLocalCacheService()` instance from `service.ts`. When logout begins, call `getImLocalCacheService().lock(accountId)` before auth state is cleared; this drops the in-memory key and revokes active object URLs but preserves ciphertext. On formal IM startup, authenticate, unlock the current account key, apply `/im/sync`, and only then render cached history as current.

- [ ] **Step 7: Cache media only after open and provide local fallback**

`CachedImMedia` first checks encrypted cache. Inline display may request the authorized thumbnail without caching it; only an explicit user click that opens the media viewer may call `cacheOpenedMedia`. When the server record is expired, render the decrypted local blob if present; otherwise render the correct expired label. Revoke each generated object URL on unmount and directive deletion. Keep component tests dependency-free by testing an exported pure display-state resolver and source-contract assertions; do not introduce a new rendering-test library.

- [ ] **Step 8: Add cache usage and clear controls**

Embed `ImCacheSettingsSection` in the existing unified privacy settings page. Show encrypted message/media byte totals and a two-step clear action. Clearing affects only the current account and device; it must not call a server deletion endpoint. Test its exported byte-formatting and confirmation-state helpers directly, plus a source contract for the integration.

- [ ] **Step 9: Run cache, IM, auth, and i18n tests**

Run: `npm test -- src/features/im/local-cache/crypto.test.ts src/features/im/local-cache/service.test.ts src/features/im/CachedImMedia.test.tsx src/features/im/store.test.ts src/features/settings/ImCacheSettingsSection.test.tsx src/i18n/translations.test.ts`  
Expected: PASS.  
Run: `npm run lint && npm run build -- --mode formal`  
Expected: both exit `0`.

- [ ] **Step 10: Commit Task 8**

```bash
git add src/features/im/local-cache/crypto.ts src/features/im/local-cache/database.ts src/features/im/local-cache/service.ts src/features/im/CachedImMedia.tsx src/features/settings/ImCacheSettingsSection.tsx src/features/im/store.ts src/features/im/formal-api.ts src/features/im/components.tsx src/features/settings/UnifiedSettingsPages.tsx src/auth/AuthProvider.tsx src/i18n/translations.ts src/features/im/local-cache/crypto.test.ts src/features/im/local-cache/service.test.ts src/features/im/CachedImMedia.test.tsx src/features/im/store.test.ts src/features/settings/ImCacheSettingsSection.test.tsx src/i18n/translations.test.ts
git commit -m "feat: cache IM history securely on device"
```

### Task 9: Operations IM Policy Page

**Files:**
- Create: `src/api/im-policy.ts`
- Create: `src/pages/admin/imPolicyForm.ts`
- Create: `src/pages/admin/ImPolicyPage.tsx`
- Create: `src/pages/admin/ImPolicyPage.test.ts`
- Modify: `src/components/admin/AdminLayout.tsx:140-150`
- Modify: `src/App.tsx:1-150,1300-1360`
- Modify: `src/i18n/translations.ts`
- Test: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: policy GET/PATCH API and `page:im-policy` permission from Task 2.
- Produces: `/admin/im-policy` operations route and version-conflict recovery UI.

- [ ] **Step 1: Write failing page/API tests**

```ts
import { readFileSync } from "node:fs";
import { toImPolicyUpdate } from "./imPolicyForm";

it("submits the current version and converts days to seconds", () => {
  expect(toImPolicyUpdate({
    expectedVersion: 4,
    imageRetentionDays: "1",
    recallWindowSeconds: "180",
    textRetentionDays: "",
    textRetentionMode: "indefinite",
    tracelessRecallMembershipLevels: ["silver", "gold"],
    videoRetentionDays: "3"
  })).toEqual({
    expectedVersion: 4,
    imageRetentionSeconds: 86400,
    recallWindowSeconds: 180,
    textRetentionSeconds: null,
    tracelessRecallMembershipLevels: ["silver", "gold"],
    videoRetentionSeconds: 259200
  });
});

it("shows prospective-only policy copy and no historical apply action", () => {
  const source = readFileSync(new URL("./ImPolicyPage.tsx", import.meta.url), "utf8");
  expect(source).toContain("仅影响修改后发送的新消息");
  expect(source).not.toContain("应用到历史消息");
});
```

- [ ] **Step 2: Run page test and verify RED**

Run: `npm test -- src/pages/admin/ImPolicyPage.test.ts`  
Expected: FAIL because the API client/page/route do not exist.

- [ ] **Step 3: Implement typed operations API client**

```ts
export type ImPolicyPayload = {
  imageRetentionSeconds: number;
  membershipLevelOptions: string[];
  recallWindowSeconds: number;
  textRetentionSeconds: number | null;
  tracelessRecallMembershipLevels: string[];
  version: number;
  videoRetentionSeconds: number;
};

export type ImPolicyUpdateInput = {
  expectedVersion: number;
  imageRetentionSeconds?: number;
  recallWindowSeconds?: number;
  textRetentionSeconds?: number | null;
  tracelessRecallMembershipLevels?: string[];
  videoRetentionSeconds?: number;
};

export const imPolicyApi = {
  get: () => httpClient.request<ImPolicyPayload>("/backoffice/im-policy"),
  update: (input: ImPolicyUpdateInput) =>
    httpClient.request<ImPolicyPayload>("/backoffice/im-policy", { body: input, method: "PATCH" })
};
```

- [ ] **Step 4: Implement the versioned editor**

The page must include:

- text retention: `无限期` or bounded day count;
- separate image and video day counts, initially `3`;
- recall window seconds, initially `180`;
- selectable membership-level codes for traceless recall;
- current version and last update state;
- explicit `仅影响修改后发送的新消息` notice;
- loading, retryable error, success, validation, and `409` conflict refresh states;
- no historical apply button.

Use current admin page primitives and existing runtime translation instead of creating a second design system.

- [ ] **Step 5: Add protected route, navigation, and translations**

```tsx
<Route
  path="/admin/im-policy"
  element={protectPermission("admin", "page:im-policy", <ImPolicyPage />)}
/>
```

Add a system-settings navigation item guarded by `page:im-policy`. Add all touched UI source strings to `translations.ts` with explicit supported-language values.

- [ ] **Step 6: Run frontend policy and full frontend gates**

Run: `npm test -- src/pages/admin/ImPolicyPage.test.ts src/i18n/translations.test.ts`  
Expected: PASS.  
Run: `npm run lint && npm run i18n:audit && npm run verify:production-build`  
Expected: all exit `0`.

- [ ] **Step 7: Commit Task 9**

```bash
git add src/api/im-policy.ts src/pages/admin/imPolicyForm.ts src/pages/admin/ImPolicyPage.tsx src/pages/admin/ImPolicyPage.test.ts src/components/admin/AdminLayout.tsx src/App.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: add operations IM policy settings"
```

### Task 10: Documentation, Failure Injection, and End-to-End Acceptance

**Files:**
- Modify: `docs/realtime.md`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `README.md`
- Create: `backend/scripts/check-im-message-lifecycle-flow.ts`
- Create: `backend/tests/im-message-lifecycle-flow-script.test.ts`
- Modify: `backend/package.json`
- Test: all backend/frontend test suites named below

**Interfaces:**
- Consumes: every preceding task.
- Produces: `npm --prefix backend run check:im-message-lifecycle-flow` guarded local acceptance script and updated operator/developer documentation.

- [ ] **Step 1: Write a failing guarded-flow script contract test**

```ts
import { readFileSync } from "node:fs";

describe("IM lifecycle flow script", () => {
  const source = readFileSync(
    new URL("../scripts/check-im-message-lifecycle-flow.ts", import.meta.url),
    "utf8"
  );

  it("refuses production and verifies exact cleanup", () => {
    expect(source).toContain("NODE_ENV === \"production\"");
    expect(source).toContain("privacy message remained");
    expect(source).toContain("traceless recall retained content");
    expect(source).toContain("media object remained after expiry");
    expect(source).toContain("cleanup left IM lifecycle marker rows behind");
  });
});
```

- [ ] **Step 2: Run the script contract test and verify RED**

Run: `npm --prefix backend test -- im-message-lifecycle-flow-script.test.ts --runInBand`  
Expected: FAIL because the guarded flow script does not exist.

- [ ] **Step 3: Implement the local formal-flow acceptance script**

The script must:

1. reject production flags and remote database hosts;
2. create uniquely namespaced users, a direct conversation, a two-person group, and an ordinary group;
3. verify default indefinite text retention and exact `+180s` recall deadline;
4. verify ordinary recall clears content and leaves a placeholder;
5. verify free membership cannot use traceless recall;
6. update the operations allowlist, verify eligible paid membership can use traceless recall, then restore policy;
7. verify direct privacy rejection and two-person group privacy acceptance;
8. force a privacy expiry and verify physical message/reaction removal plus sync directive;
9. upload one image and one video fixture, force expiry, and verify object deletion plus expired placeholder state;
10. verify every sync/audit payload is content-free;
11. delete only marker-owned rows/files and fail if any marker remains.

Add this exact script entry:

```json
"check:im-message-lifecycle-flow": "tsx scripts/check-im-message-lifecycle-flow.ts"
```

- [ ] **Step 4: Update formal documentation**

Document:

- current policy defaults and prospective-only changes;
- recall modes and exact server boundary;
- group-only privacy behavior;
- media expiry/local-opened-copy behavior;
- sync cursor recovery semantics;
- worker configuration/metrics and safe failure handling;
- encrypted cache limitations and clear-cache control;
- exact API list, RBAC permissions, and local acceptance command.

- [ ] **Step 5: Run focused failure injection**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:im-message-lifecycle-flow`  
Expected: exits `0`, reports ordinary/traceless/privacy/media cases passed, and reports exact marker cleanup.  
Run the media purge worker test with storage deletion forced to fail once.  
Expected: first run increments failure/release; second run purges exactly once with no duplicate sync row.

- [ ] **Step 6: Run full automated verification**

Run: `npm --prefix backend run prisma:status`  
Expected: database schema is up to date.  
Run: `npm --prefix backend run lint && npm --prefix backend test && npm --prefix backend run build`  
Expected: all backend checks pass; existing intentional skips remain documented.  
Run: `npm run lint && npm test && npm run i18n:audit && npm run verify:production-build`  
Expected: all frontend checks pass and the formal bundle audit reports no mock/backend leakage.

- [ ] **Step 7: Perform three-session manual acceptance**

Use separate authenticated user/technician/merchant sessions against the formal local backend:

1. ordinary recall removes content in every online session and leaves the placeholder;
2. traceless recall removes the row with no placeholder;
3. disconnect one session, delete a privacy message, reconnect, and verify sync purges its local cache;
4. open one image before server expiry and leave one unopened;
5. after expiry, verify the opened image uses the local encrypted copy and the unopened image shows `图片已过期`;
6. verify the equivalent video label;
7. inspect database, runtime media directory, application logs, and browser IndexedDB to confirm purged content is absent where required;
8. edit eligible membership levels in `/admin/im-policy` and verify the recall chooser changes after a fresh server response.

- [ ] **Step 8: Commit Task 10**

```bash
git add docs/realtime.md docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md README.md backend/scripts/check-im-message-lifecycle-flow.ts backend/tests/im-message-lifecycle-flow-script.test.ts backend/package.json
git commit -m "docs: verify IM message lifecycle"
```

---

## Final Acceptance Gate

- [ ] No new mock/demo/fake API or browser business database was introduced.
- [ ] `rg -n "read_by_all|全员看过后|disappearingStartMode" src/features/im backend/src backend/prisma` returns no matches.
- [ ] The task-owned files contain no unfinished-work markers or stub bodies.
- [ ] Standard recall, traceless recall, privacy expiry, media expiry, and ordinary server-retention expiry have distinct tested semantics.
- [ ] Recall and privacy deletion remove local plaintext/object URLs before advancing the sync cursor.
- [ ] Operations policy changes use optimistic locking and do not mutate historical message expiry.
- [ ] Logs, audit metadata, sync directives, and SSE deletion events contain no message content or media URL/storage key.
- [ ] All new routes have Zod, OpenAPI, authentication, and explicit permission declarations.
- [ ] All workers are bounded, non-overlapping, idempotent, retryable, stopped during shutdown, and covered by failure tests.
- [ ] Backend migration status, lint, full tests, and build pass.
- [ ] Frontend lint, full tests, i18n audit, formal production build, and production-bundle audit pass.
- [ ] Manual acceptance is recorded with route, account role, browser/session, exact message ID, policy version, and observed storage state.
