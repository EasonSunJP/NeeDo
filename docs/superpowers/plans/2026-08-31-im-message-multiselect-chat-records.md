# IM Message Multiselect and Chat Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver compact two-row message actions, formal message multiselect, immutable chat-record forwarding/favorites, per-user batch deletion, and replaceable DeepL-backed translation without weakening existing IM privacy or identity boundaries.

**Architecture:** Add isolated backend chat-record and translation modules with their own validators, controllers, services, repositories, persistence, permissions, and OpenAPI contracts. Extend the existing realtime module only for atomic batch deletion and realtime delivery publication. On the frontend, add typed API/store contracts, dedicated chat-record and multiselect components, then wire them into the existing shared IM pages for user, merchant, and technician scopes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma 7, MySQL 8, Jest/Supertest, Node 22 native `fetch`, DeepL API Free.

## Global Constraints

- Follow `/Users/eason/Documents/New project/AGENTS.md` and Step 13 in `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`.
- The approved design is `docs/superpowers/specs/2026-08-31-im-message-multiselect-chat-records-design.md`.
- Do not add mock/demo/placeholder business data or localStorage-backed chat records/favorites.
- Keep the action-menu glass surface, arrow, reaction catalog, `bg-black/20` underlay, and explicit no-filter backdrop rules unchanged.
- Freeze “common reactions” for the lifetime of each open Social/IM emoji panel and message action menu; usage updates persistence immediately but reordering appears only on the next open.
- Keep shared `Message` rows intact when deleting for the current user; only `MessageUserDeletion` tombstones change.
- Every list endpoint is paginated; all request bodies use Zod; all protected routes declare permissions; all writes produce body-free audit metadata.
- Every schema change has a new migration; never edit an applied migration.
- Maximum selected messages: 100. Maximum translation batch: 50. Chat-record item page size: 50.
- New user-facing copy must cover `zh`, `zh-Hant`, `ja`, `en`, and `ko`; Japanese “选择到这里” is exactly `ここまで`.
- Use TDD for every behavior: write the failing test, run it and observe the expected failure, then implement the minimum code.
- Do not claim live DeepL acceptance until a real API Free key is configured and a real request succeeds.

---

### Task 1: Persistence, Migration, Permissions, and Schema Contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260831160000_im_chat_records_translation/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/im-chat-record-migration.test.ts`
- Create: `backend/tests/im-chat-record-schema.test.ts`
- Create: `backend/tests/im-chat-record-permissions-migration.test.ts`

**Interfaces:**
- Produces Prisma models `ImChatRecordBundle`, `ImChatRecordItem`, `ImChatRecordDelivery`, `ImChatRecordFavorite`, `ImMessageTranslation`, and `ImMessageBatchDeleteCommand`.
- Produces permission codes `message:forward`, `message:favorite`, and `message:translate` in `SYSTEM_PERMISSIONS` and `REALTIME_USER_PERMISSION_CODES`.

- [ ] **Step 1: Write failing schema and migration tests**

```ts
// backend/tests/im-chat-record-schema.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("IM chat-record persistence", () => {
  it.each([
    "ImChatRecordBundle",
    "ImChatRecordItem",
    "ImChatRecordDelivery",
    "ImChatRecordFavorite",
    "ImMessageTranslation",
    "ImMessageBatchDeleteCommand"
  ])("defines %s with soft-delete timestamps", (model) => {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    expect(body).toContain("createdAt");
    expect(body).toContain("updatedAt");
    expect(body).toContain("deletedAt");
  });

  it("indexes identity ownership, source conversation, bundle position, and translation cache keys", () => {
    expect(schema).toContain("@@unique([createdByIdentityId, commandType, idempotencyKey]");
    expect(schema).toContain("@@unique([bundleId, position]");
    expect(schema).toContain("@@unique([messageId, sourceContentHash, targetLanguage, providerKey]");
    expect(schema).toContain("@@unique([ownerIdentityId, idempotencyKey]");
  });
});
```

```ts
// backend/tests/im-chat-record-permissions-migration.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260831160000_im_chat_records_translation/migration.sql"),
  "utf8"
);

it.each(["message:forward", "message:favorite", "message:translate"])(
  "deploys %s to every realtime user role",
  (permission) => {
    expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("'admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer'");
  }
);
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-schema.test.ts tests/im-chat-record-permissions-migration.test.ts
```

Expected: FAIL because the six models, migration, and permissions do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Add models with these exact keys and constraints; use relation arrays on `User`, `UserIdentity`, `Conversation`, and `Message` with the relation names shown here:

```prisma
model ImChatRecordBundle {
  id                  Int      @id @default(autoincrement())
  publicId            String   @unique @map("public_id") @db.Char(36)
  commandType         String   @map("command_type") @db.VarChar(24)
  idempotencyKey      String   @map("idempotency_key") @db.VarChar(191)
  requestFingerprint  String   @map("request_fingerprint") @db.Char(64)
  createdByUserId     Int      @map("created_by_user_id")
  createdByIdentityId Int      @map("created_by_identity_id")
  sourceConversationId Int    @map("source_conversation_id")
  senderCount         Int      @map("sender_count")
  itemCount           Int      @map("item_count")
  senderNamesSnapshot Json     @map("sender_names_snapshot")
  titleSnapshot       String   @map("title_snapshot") @db.VarChar(255)
  previewSnapshot     String   @map("preview_snapshot") @db.VarChar(500)
  contentVersion      Int      @default(1) @map("content_version")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
  deletedAt           DateTime? @map("deleted_at")

  createdByUser       User         @relation("ImChatRecordBundleCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
  createdByIdentity   UserIdentity @relation("ImChatRecordBundleIdentity", fields: [createdByIdentityId], references: [id], onDelete: Restrict)
  sourceConversation Conversation @relation("ImChatRecordSourceConversation", fields: [sourceConversationId], references: [id], onDelete: Restrict)
  items               ImChatRecordItem[]
  deliveries          ImChatRecordDelivery[]
  favorites           ImChatRecordFavorite[]

  @@unique([createdByIdentityId, commandType, idempotencyKey])
  @@index([sourceConversationId, deletedAt])
  @@index([createdByUserId, deletedAt])
  @@index([createdByIdentityId, deletedAt])
  @@map("im_chat_record_bundles")
}

model ImChatRecordItem {
  id                        Int      @id @default(autoincrement())
  bundleId                  Int      @map("bundle_id")
  position                  Int
  sourceMessageId           Int?     @map("source_message_id")
  senderUserId              Int?     @map("sender_user_id")
  senderIdentityId          Int?     @map("sender_identity_id")
  senderDisplayNameSnapshot String   @map("sender_display_name_snapshot") @db.VarChar(160)
  senderAvatarSnapshot      String?  @map("sender_avatar_snapshot") @db.VarChar(500)
  messageType               String   @map("message_type") @db.VarChar(40)
  contentSnapshot           String?  @map("content_snapshot") @db.Text
  metadataSnapshot          Json?    @map("metadata_snapshot")
  sentAtSnapshot            DateTime @map("sent_at_snapshot")
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")
  deletedAt                 DateTime? @map("deleted_at")

  bundle          ImChatRecordBundle @relation(fields: [bundleId], references: [id], onDelete: Restrict)
  sourceMessage   Message?            @relation("ImChatRecordSourceMessage", fields: [sourceMessageId], references: [id], onDelete: SetNull)
  senderUser      User?               @relation("ImChatRecordItemSender", fields: [senderUserId], references: [id], onDelete: SetNull)
  senderIdentity  UserIdentity?       @relation("ImChatRecordItemSenderIdentity", fields: [senderIdentityId], references: [id], onDelete: SetNull)

  @@unique([bundleId, position])
  @@index([sourceMessageId])
  @@index([senderUserId])
  @@index([senderIdentityId])
  @@index([bundleId, deletedAt])
  @@map("im_chat_record_items")
}

model ImChatRecordDelivery {
  id             Int      @id @default(autoincrement())
  bundleId       Int      @map("bundle_id")
  messageId      Int      @unique @map("message_id")
  conversationId Int     @map("conversation_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  bundle       ImChatRecordBundle @relation(fields: [bundleId], references: [id], onDelete: Restrict)
  message      Message            @relation(fields: [messageId], references: [id], onDelete: Restrict)
  conversation Conversation       @relation(fields: [conversationId], references: [id], onDelete: Restrict)

  @@index([bundleId, deletedAt])
  @@index([conversationId, deletedAt])
  @@map("im_chat_record_deliveries")
}

model ImChatRecordFavorite {
  id              Int      @id @default(autoincrement())
  bundleId        Int      @map("bundle_id")
  ownerUserId     Int      @map("owner_user_id")
  ownerIdentityId Int      @map("owner_identity_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  bundle        ImChatRecordBundle @relation(fields: [bundleId], references: [id], onDelete: Restrict)
  ownerUser     User               @relation("ImChatRecordFavoriteOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  ownerIdentity UserIdentity       @relation("ImChatRecordFavoriteIdentity", fields: [ownerIdentityId], references: [id], onDelete: Restrict)

  @@index([ownerUserId, deletedAt])
  @@index([ownerIdentityId, createdAt, deletedAt])
  @@index([bundleId, deletedAt])
  @@map("im_chat_record_favorites")
}

model ImMessageTranslation {
  id                Int      @id @default(autoincrement())
  messageId         Int      @map("message_id")
  sourceContentHash String   @map("source_content_hash") @db.Char(64)
  sourceLanguage    String?  @map("source_language") @db.VarChar(16)
  targetLanguage    String   @map("target_language") @db.VarChar(16)
  translatedContent String   @map("translated_content") @db.Text
  providerKey       String   @map("provider_key") @db.VarChar(40)
  providerRequestId String?  @map("provider_request_id") @db.VarChar(191)
  translatedAt      DateTime @map("translated_at")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")

  message Message @relation(fields: [messageId], references: [id], onDelete: Restrict)

  @@unique([messageId, sourceContentHash, targetLanguage, providerKey])
  @@index([messageId, targetLanguage, deletedAt])
  @@index([translatedAt, deletedAt])
  @@map("im_message_translations")
}

model ImMessageBatchDeleteCommand {
  id                 Int      @id @default(autoincrement())
  conversationId     Int      @map("conversation_id")
  ownerUserId        Int      @map("owner_user_id")
  ownerIdentityId    Int      @map("owner_identity_id")
  idempotencyKey     String   @map("idempotency_key") @db.VarChar(191)
  requestFingerprint String   @map("request_fingerprint") @db.Char(64)
  resultJson         Json     @map("result_json")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")
  deletedAt          DateTime? @map("deleted_at")

  conversation  Conversation @relation("ImMessageBatchDeleteConversation", fields: [conversationId], references: [id], onDelete: Restrict)
  ownerUser     User         @relation("ImMessageBatchDeleteOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  ownerIdentity UserIdentity @relation("ImMessageBatchDeleteIdentity", fields: [ownerIdentityId], references: [id], onDelete: Restrict)

  @@unique([ownerIdentityId, idempotencyKey])
  @@index([conversationId, ownerIdentityId, deletedAt])
  @@index([ownerUserId, deletedAt])
  @@map("im_message_batch_delete_commands")
}
```

Add these exact back-relations to the existing models so Prisma relation validation remains explicit:

```prisma
// User
createdImChatRecordBundles  ImChatRecordBundle[]            @relation("ImChatRecordBundleCreator")
sentImChatRecordItems       ImChatRecordItem[]              @relation("ImChatRecordItemSender")
imChatRecordFavorites       ImChatRecordFavorite[]          @relation("ImChatRecordFavoriteOwner")
imBatchDeleteCommands       ImMessageBatchDeleteCommand[]   @relation("ImMessageBatchDeleteOwner")

// UserIdentity
createdImChatRecordBundles  ImChatRecordBundle[]            @relation("ImChatRecordBundleIdentity")
sentImChatRecordItems       ImChatRecordItem[]              @relation("ImChatRecordItemSenderIdentity")
imChatRecordFavorites       ImChatRecordFavorite[]          @relation("ImChatRecordFavoriteIdentity")
imBatchDeleteCommands       ImMessageBatchDeleteCommand[]   @relation("ImMessageBatchDeleteIdentity")

// Conversation
sourceImChatRecordBundles   ImChatRecordBundle[]            @relation("ImChatRecordSourceConversation")
imChatRecordDeliveries      ImChatRecordDelivery[]
imBatchDeleteCommands       ImMessageBatchDeleteCommand[]   @relation("ImMessageBatchDeleteConversation")

// Message
sourceImChatRecordItems     ImChatRecordItem[]              @relation("ImChatRecordSourceMessage")
imChatRecordDelivery        ImChatRecordDelivery?
translations               ImMessageTranslation[]
```

- [ ] **Step 4: Add permissions and generate a create-only migration**

Add to `SYSTEM_PERMISSIONS` and `REALTIME_USER_PERMISSION_CODES`:

```ts
createPermission("message:forward", "转发聊天记录", "api", "im", "创建并投递正式聊天记录包"),
createPermission("message:favorite", "收藏聊天记录", "api", "创建、查看和移除自己的聊天记录收藏"),
createPermission("message:translate", "翻译消息", "api", "翻译当前身份可见的 IM 消息")
```

Run from `backend/`:

```bash
npm run prisma:migrate:dev -- --create-only --name im_chat_records_translation
npm run prisma:generate
```

Prisma creates a timestamped directory. Before applying it anywhere, verify there is exactly one new `*_im_chat_records_translation` directory and rename that unapplied directory to the planned `20260831160000_im_chat_records_translation` path; stop on any collision. Append idempotent `permissions` and `role_permissions` upserts to that migration using the exact five roles in the test.

- [ ] **Step 5: Run schema, migration, permission, and Prisma verification**

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-schema.test.ts tests/im-chat-record-migration.test.ts tests/im-chat-record-permissions-migration.test.ts
npm run prisma:generate
npm run build
```

Expected: all tests PASS; Prisma generation and backend build exit 0.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260831160000_im_chat_records_translation backend/src/constants/permissions.constants.ts backend/tests/im-chat-record-*.test.ts
git commit -m "feat(im): add chat record persistence"
```

---

### Task 2: Chat-Record Repository, Media Snapshot, and Domain Service

**Files:**
- Create: `backend/src/repositories/im-chat-record.repository.ts`
- Create: `backend/src/services/im-chat-record.service.ts`
- Create: `backend/src/services/im-chat-record-media.storage.ts`
- Create: `backend/tests/im-chat-record.repository.test.ts`
- Create: `backend/tests/im-chat-record.service.test.ts`
- Create: `backend/tests/im-chat-record-media.storage.test.ts`

**Interfaces:**
- Produces `ImChatRecordRepositoryPort` with `createDelivery`, `createFavorite`, `getBundle`, `listItems`, `listFavorites`, `removeFavorite`, and `resolveAuthorizedMedia`.
- Produces `ImChatRecordService` methods consumed by Task 3 routes.
- Consumes `PersonalIdentityScopeService.resolve`, `RealtimeEventGatewayPort`, Prisma, and protected media storage.

- [ ] **Step 1: Write failing service tests for ordering, policy, titles, and atomicity**

```ts
it.each([
  [["A"], "single"],
  [["A", "B"], "pair"],
  [["A", "B", "C"], "group"]
] as const)("derives %s sender title kind", async (names, titleKind) => {
  repository.readSourceMessages.mockResolvedValue(buildVisibleMessages(names));
  await service.createFavorite(auth, context, command(names.length));
  expect(repository.createFavorite).toHaveBeenCalledWith(
    expect.objectContaining({ titleKind, senderNamesSnapshot: names })
  );
});

it("rejects the entire command when any source message is recalled, expired, hidden, or disappearing", async () => {
  repository.readSourceMessages.mockResolvedValue([activeMessage(), disappearingMessage()]);
  await expect(service.createFavorite(auth, context, command(2))).rejects.toMatchObject({
    message: "error.im.chat_record_source_unavailable"
  });
  expect(repository.createFavorite).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the service test and verify RED**

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.service.test.ts
```

Expected: FAIL because the repository and service do not exist.

- [ ] **Step 3: Define the repository and service ports**

```ts
export type ChatRecordCommand = {
  idempotencyKey: string;
  messageIds: number[];
  sourceConversationId: number;
};

export interface ImChatRecordRepositoryPort {
  readSourceMessages(input: {
    conversationId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<ChatRecordSourceMessage[]>;
  createDelivery(input: CreateChatRecordDeliveryPersistenceInput): Promise<ChatRecordDeliveryPayload>;
  createFavorite(input: CreateChatRecordFavoritePersistenceInput): Promise<ChatRecordFavoritePayload>;
  getBundle(input: { publicId: string; userId: number; identityId: number }): Promise<ChatRecordBundlePayload | null>;
  listItems(input: { bundleId: number; beforePosition?: number; pageSize: number }): Promise<ChatRecordItemPage>;
  listFavorites(input: { identityId: number; page: number; pageSize: number }): Promise<ChatRecordFavoritePage>;
  removeFavorite(input: { favoriteId: number; userId: number; identityId: number; context: AuthRequestContext }): Promise<boolean>;
  resolveAuthorizedMedia(input: {
    publicId: string;
    checksumSha256: string;
    userId: number;
    identityId: number;
  }): Promise<AuthorizedChatRecordMedia | null>;
}
```

`ImChatRecordService` must sort by authoritative message ID/time, deduplicate IDs, enforce 1–100 items, derive first-seen sender names and `single | pair | group`, build a two-line preview, calculate a SHA-256 request fingerprint, and reject incomplete source reads. Bundle reads are allowed only when the current identity created the bundle, owns an active favorite, or can still see an active delivery message in a conversation where it is an active participant.

- [ ] **Step 4: Implement protected media cloning with rollback handles**

```ts
export interface ChatRecordMediaClone {
  created: boolean;
  fileKey: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
  url: string;
}

export interface ImChatRecordMediaStoragePort {
  clone(sourceUrl: string, mimeType: string): Promise<ChatRecordMediaClone>;
  delete(fileKey: string): Promise<void>;
}
```

Resolve only URLs owned by configured NeeDo IM/content media roots, validate the canonical path, MIME magic, and 8 MiB limit, and save under `runtime/im-chat-record-media` with checksum filenames. Reject external URLs and missing files with `error.im.chat_record_media_unavailable`.

- [ ] **Step 5: Implement Prisma transactions and compensation**

`createDelivery` must create bundle/items, item-owned `MediaAsset` rows (`entityType: "im_chat_record_item"`, `entityId: item.id`, `usageType: "im_chat_record"`), a `Message` whose metadata includes `needoMessageType: "chat-record"`, and `ImChatRecordDelivery` in one transaction. `createFavorite` creates the same immutable bundle/items/media snapshot plus one favorite in one transaction. Store only checksum/media descriptors in `metadataSnapshot`; never expose the storage file key. After a successful delivery transaction, the service publishes the returned message through the existing realtime gateway. On persistence failure, delete only files whose clone returned `created: true`; log a structured warning if compensation fails.

- [ ] **Step 6: Run repository, service, and storage tests**

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-media.storage.test.ts
npm run build
```

Expected: PASS; tests prove exact idempotency replay, changed-payload conflict, transaction rollback, media compensation, title kinds, and source policy.

- [ ] **Step 7: Commit the domain slice**

```bash
git add backend/src/repositories/im-chat-record.repository.ts backend/src/services/im-chat-record.service.ts backend/src/services/im-chat-record-media.storage.ts backend/tests/im-chat-record.*.test.ts
git commit -m "feat(im): add formal chat record domain"
```

---

### Task 3: Chat-Record HTTP API, Favorites, Batch Delete, RBAC, and OpenAPI

**Files:**
- Create: `backend/src/validators/im-chat-record.validator.ts`
- Create: `backend/src/controllers/im-chat-record.controller.ts`
- Create: `backend/src/routes/im-chat-record.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Create: `backend/tests/im-chat-record-api.test.ts`
- Create: `backend/tests/im-chat-record-openapi.test.ts`
- Create: `backend/tests/message-batch-delete.test.ts`

**Interfaces:**
- Produces the eight approved `/api/v1/im/...` routes.
- Produces atomic, replay-safe `deleteMessagesForUser(auth, { conversationId, messageIds, idempotencyKey })` in `RealtimeService`.

- [ ] **Step 1: Write failing validator and API tests**

```ts
export const messageIdsSchema = z.array(z.coerce.number().int().positive()).min(1).max(100)
  .refine((ids) => new Set(ids).size === ids.length, "error.im.message_ids_duplicate");

export const chatRecordCommandBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  messageIds: messageIdsSchema,
  sourceConversationId: z.coerce.number().int().positive()
}).strict();
```

API tests must cover 401, 403, 400 duplicate/101 IDs, 404 hidden bundle/media, 201 delivery/favorite, paginated items/favorites, idempotent replay, same-key changed-payload conflict, favorite removal, protected media bytes, and atomic batch-delete failure.

- [ ] **Step 2: Run the API tests and verify RED**

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-api.test.ts tests/message-batch-delete.test.ts
```

Expected: FAIL with missing routes/methods.

- [ ] **Step 3: Add the chat-record routes with explicit permissions**

```ts
router.post("/im/conversations/:targetConversationId/chat-records", authenticate(), authorize("message:forward"), validateRequest({ params: targetConversationParamSchema, body: chatRecordCommandBodySchema }), controller.createDelivery);
router.get("/im/chat-records/:publicId", authenticate(), authorize("message:list"), validateRequest({ params: chatRecordPublicIdParamSchema }), controller.getBundle);
router.get("/im/chat-records/:publicId/items", authenticate(), authorize("message:list"), validateRequest({ params: chatRecordPublicIdParamSchema, query: chatRecordItemsQuerySchema }), controller.listItems);
router.get("/im/chat-records/:publicId/media/:checksumSha256", authenticate(), authorize("message:list"), validateRequest({ params: chatRecordMediaParamSchema }), controller.getMedia);
router.post("/im/chat-record-favorites", authenticate(), authorize("message:favorite"), validateRequest({ body: chatRecordCommandBodySchema }), controller.createFavorite);
router.get("/im/chat-record-favorites", authenticate(), authorize("message:favorite"), validateRequest({ query: favoriteListQuerySchema }), controller.listFavorites);
router.delete("/im/chat-record-favorites/:favoriteId", authenticate(), authorize("message:favorite"), validateRequest({ params: favoriteIdParamSchema }), controller.removeFavorite);
```

Register `createImChatRecordRoutes(config, resolvedDependencies)` before `createRealtimeRoutes` in `backend/src/app.ts`; add injectable repository/service/media storage fields to `AppDependencies`. `getMedia` asks the service for an authorized descriptor, sets `Content-Type`, `Content-Length`, `ETag`, and `Cache-Control: private`, then streams the file without revealing its filesystem path.

- [ ] **Step 4: Add atomic batch delete to realtime**

Add `POST /im/conversations/:conversationId/messages/delete-for-me` with body `{ messageIds: number[], idempotencyKey: uuid }`. Repository behavior:

1. Load the current identity participant.
2. Load all unique requested messages in that conversation and visibility window.
3. If returned count differs, return `not_found` without writes.
4. Hash the canonical `{ conversationId, sortedMessageIds }` body and resolve `ImMessageBatchDeleteCommand` by current identity plus idempotency key.
5. For an existing command, return its stored result when the fingerprint matches or return 409 `error.idempotency_key_reused` when it differs.
6. Otherwise, upsert one `MessageUserDeletion` per ID, create the command result, and write one audit action `im.messages.deleted_for_user` with `{ conversationId, count, messageIds }` and no content in one transaction. On a unique-key race, reload and apply the same replay/conflict rule.

Keep the existing single-message DELETE route and implement it by calling the same repository method with one ID.

- [ ] **Step 5: Add OpenAPI schemas and route operations**

Define `ImChatRecordSummary`, `ImChatRecordItem`, `ImChatRecordItemPage`, `ImChatRecordFavoritePage`, `ImBatchDeleteRequest`, and all eight route operations. Every list response uses the standard `list/total/page/page_size` envelope; item pagination additionally returns `nextCursor`. Document the protected media response as binary with the supported snapshot MIME types.

- [ ] **Step 6: Run the API/RBAC/OpenAPI tests**

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts tests/realtime-api.test.ts tests/realtime-service.test.ts
npm run lint
npm run build
```

Expected: PASS with no controller-side Prisma access.

- [ ] **Step 7: Commit the API slice**

```bash
git add backend/src/validators/im-chat-record.validator.ts backend/src/controllers/im-chat-record.controller.ts backend/src/routes/im-chat-record.routes.ts backend/src/app.ts backend/src/validators/realtime.validator.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/services/realtime.service.ts backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/src/constants/error-codes.ts backend/tests/im-chat-record-api.test.ts backend/tests/im-chat-record-openapi.test.ts backend/tests/message-batch-delete.test.ts
git commit -m "feat(im): expose chat records and batch deletion"
```

---

### Task 4: Replaceable DeepL Translation Provider, Cache, and API

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`
- Create: `backend/src/services/im-translation.provider.ts`
- Create: `backend/src/services/deepl-translation.provider.ts`
- Create: `backend/src/repositories/im-message-translation.repository.ts`
- Create: `backend/src/services/im-message-translation.service.ts`
- Create: `backend/src/controllers/im-message-translation.controller.ts`
- Create: `backend/src/routes/im-message-translation.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/deepl-translation.provider.test.ts`
- Create: `backend/tests/im-message-translation.service.test.ts`
- Create: `backend/tests/im-message-translation-api.test.ts`
- Create: `backend/tests/im-translation-config.test.ts`

**Interfaces:**
- Produces `TranslationProvider.translate(input)` and `ImMessageTranslationService.translateVisibleMessages`.
- Produces `POST /api/v1/im/conversations/:conversationId/messages/translations` protected by `message:translate`.

- [ ] **Step 1: Write failing provider tests**

```ts
export interface TranslationProviderInput {
  texts: string[];
  targetLanguage: "zh" | "zh-Hant" | "ja" | "en" | "ko";
}

export interface TranslationProviderOutput {
  detectedSourceLanguages: Array<string | null>;
  providerRequestId: string | null;
  texts: string[];
}

export interface TranslationProvider {
  readonly key: string;
  translate(input: TranslationProviderInput): Promise<TranslationProviderOutput>;
}
```

Tests must assert DeepL target mapping (`ZH-HANS`, `ZH-HANT`, `JA`, `EN`, `KO`), `Authorization: DeepL-Auth-Key ...`, no key in logs/errors, timeout abort, 429 bounded exponential retry, 456 quota mapping, and 5xx unavailable mapping.

- [ ] **Step 2: Run provider tests and verify RED**

```bash
cd backend
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts
```

Expected: FAIL because config/provider do not exist.

- [ ] **Step 3: Add validated provider configuration**

```ts
IM_TRANSLATION_PROVIDER: z.enum(["disabled", "deepl"]).default("disabled"),
IM_TRANSLATION_API_BASE_URL: optionalUrlSchema,
IM_TRANSLATION_API_KEY: z.string().trim().min(1).optional(),
IM_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
IM_TRANSLATION_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT: z.coerce.number().int().positive().default(500_000)
```

In `superRefine`, require an HTTPS base URL and non-placeholder key only when provider is `deepl`; reject loopback or placeholder production values and never provide a production default domain or secret. Add documented empty/disabled values to the three example env files.

- [ ] **Step 4: Implement the provider and cache service**

`DeepLTranslationProvider` uses injected `fetch`, `AbortController`, `application/x-www-form-urlencoded`, limited retries with jitter, and typed `AppError` mappings. `ImMessageTranslationService`:

1. Resolves current identity.
2. Loads 1–50 authoritative visible messages by ID; never accepts raw text from the client.
3. Extracts only eligible user text/captions.
4. Hashes exact source content with SHA-256.
5. Reads successful cache entries.
6. Runs `detectObviousSourceLanguage` and short-circuits only confident same-language cases (Kana → Japanese, Hangul → Korean); ambiguous Han-only or short Latin content proceeds to the provider.
7. Sends only cache misses to the provider and validates output-array length before pairing results.
8. Converts provider-detected same-language results to `same_language`, writes successful translations, and returns results in request order.

Unit tests must prove obvious same-language content makes no provider call, ambiguous content still calls the provider, duplicate texts preserve message ordering, and a malformed provider output is rejected without cache writes.

- [ ] **Step 5: Add the protected translation route and OpenAPI**

Request body:

```ts
z.object({
  messageIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
  targetLanguage: z.enum(["zh", "zh-Hant", "ja", "en", "ko"])
}).strict()
```

Return each item as `{ messageId, status: "translated" | "same_language" | "ineligible", translatedContent?: string }`. Missing access to any requested message rejects the full request.

- [ ] **Step 6: Run translation tests and backend verification**

```bash
cd backend
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-translation-config.test.ts
npm run lint
npm run build
```

Expected: PASS without a real DeepL key because HTTP is injected; no real-call claim.

- [ ] **Step 7: Commit the translation backend**

```bash
git add backend/src/config/env.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example backend/src/services/im-translation.provider.ts backend/src/services/deepl-translation.provider.ts backend/src/repositories/im-message-translation.repository.ts backend/src/services/im-message-translation.service.ts backend/src/controllers/im-message-translation.controller.ts backend/src/routes/im-message-translation.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/deepl-translation.provider.test.ts backend/tests/im-message-translation.service.test.ts backend/tests/im-message-translation-api.test.ts backend/tests/im-translation-config.test.ts
git commit -m "feat(im): add replaceable message translation"
```

---

### Task 5: Frontend Contracts, API Adapter, Store, and Forward Selection

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/realtime/api.test.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/contract.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/store.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.tsx`
- Create: `src/features/im/chat-records.ts`
- Create: `src/features/im/chat-records.test.ts`

**Interfaces:**
- Produces frontend `ImChatRecordSummary`, `ImChatRecordItem`, `ImChatRecordFavorite`, and `ImMessageTranslationResult`.
- Produces store methods for forward/favorite/read/remove/batch-delete/translate and transient pending-forward selection.

- [ ] **Step 1: Write failing typed API tests**

```ts
await realtimeApi.createChatRecordDelivery(91, {
  idempotencyKey: commandId,
  messageIds: [501, 502],
  sourceConversationId: 41
});
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining("/im/conversations/91/chat-records"),
  expect.objectContaining({ method: "POST" })
);

await realtimeApi.batchDeleteMessagesForMe(41, { idempotencyKey: commandId, messageIds: [501, 502] });
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/messages/delete-for-me"), expect.anything());
```

- [ ] **Step 2: Run frontend API/store tests and verify RED**

```bash
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/chat-records.test.ts
```

Expected: FAIL with missing types and methods.

- [ ] **Step 3: Add message and chat-record types**

Add `"chat-record"` to `ImMessageType` and this `MessageExt` member:

```ts
chatRecord?: {
  publicId: string;
  itemCount: number;
  preview: string;
  senderNames: string[];
  titleKind: "single" | "pair" | "group";
};
```

In `chat-records.ts`, export `formatImChatRecordTitle`, `formatImChatRecordPreview`, `formatImSelectedMessagesForClipboard`, and API payload types. Titles use first-seen snapshot names, not live profiles.

- [ ] **Step 4: Extend `realtimeApi`, `ImApi`, and formal adapter**

Add exact methods:

```ts
createChatRecordDelivery(targetConversationId, command)
createChatRecordFavorite(command)
getChatRecord(publicId)
listChatRecordItems(publicId, query)
getChatRecordMedia(publicId, checksumSha256)
listChatRecordFavorites(query)
removeChatRecordFavorite(favoriteId)
batchDeleteMessagesForMe(conversationId, command)
translateMessages(conversationId, input)
```

`formal-api.ts` converts backend chat-record message metadata to `MessageExt.chatRecord` and never forwards client-provided source content.

- [ ] **Step 5: Replace the single-message forward copy path with one transient selection path**

Store state:

```ts
type PendingChatRecordForward = {
  messageIds: string[];
  sourceConversationId: string;
};
```

Store methods:

```ts
setPendingChatRecordForward(selection: PendingChatRecordForward | null): void;
forwardSelectedMessages(targetConversationId: string, idempotencyKey: string): Promise<ConversationMessage>;
favoriteSelectedMessages(sourceConversationId: string, messageIds: string[], idempotencyKey: string): Promise<ImChatRecordFavorite>;
batchDeleteMessages(conversationId: string, messageIds: string[], idempotencyKey: string): Promise<void>;
translateMessages(conversationId: string, messageIds: string[], targetLanguage: Language): Promise<ImMessageTranslationResult[]>;
```

Keep pending forwarding only in React/store memory. Refreshing the target picker clears it and shows a safe “转发内容已失效，请重新选择” state; do not persist message IDs in localStorage or a long query string.

Update `ImNewConversationPage` to consume the pending selection, display the selected count, and submit the bundle to the chosen existing conversation or the newly created conversation. Clear pending state only after a successful delivery or explicit cancel; on API failure, preserve it for retry. Add page tests for single/multi forwarding, existing/new target conversations, refresh-expired state, cancel, and failed-submit retry.

- [ ] **Step 6: Run contract/store tests and typecheck**

```bash
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/chat-records.test.ts src/features/im/pages.test.tsx
npm run lint
```

Expected: PASS; formal forwarding calls the new endpoint and the old `getForwardableMessagePayload` is used only by the legacy static adapter, never formal mode.

- [ ] **Step 7: Commit frontend data plumbing**

```bash
git add src/features/realtime/api.ts src/features/realtime/api.test.ts src/features/im/model.ts src/features/im/contract.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts src/features/im/store.ts src/features/im/store.test.ts src/features/im/pages.tsx src/features/im/pages.test.tsx src/features/im/chat-records.ts src/features/im/chat-records.test.ts
git commit -m "feat(im): wire chat record client contracts"
```

---

### Task 6: Chat-Record Card, Fullscreen Detail, Favorites Page, and Routes

**Files:**
- Reference: `src/components/mobile/MobileFullscreenHeader.tsx`
- Create: `src/features/im/ImChatRecordCard.tsx`
- Create: `src/features/im/ImChatRecordCard.test.tsx`
- Create: `src/features/im/ImChatRecordDetailPage.tsx`
- Create: `src/features/im/ImChatRecordDetailPage.test.tsx`
- Create: `src/pages/user/UserFavoritesPage.tsx`
- Create: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/role-config.ts`
- Modify: `src/features/im/route-pages.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes Task 5 store/API types.
- Produces scoped `chatRecord(publicId)` routes and user `/me/favorites`.

- [ ] **Step 1: Write failing card/detail/favorites tests**

```tsx
it("renders the immutable title, two-line preview, count, and chat-record caption", () => {
  render(<ImChatRecordCard record={record({ titleKind: "pair", senderNames: ["A", "B"] })} />);
  expect(screen.getByText("A和B的聊天记录")).toBeVisible();
  expect(screen.getByText("聊天记录")).toBeVisible();
  expect(screen.getByText("2条信息")).toBeVisible();
});

it("closes the fullscreen record and restores focus to its opener", async () => {
  // mount route, focus opener, open record, click the aria-labelled close button
  expect(document.activeElement).toBe(opener);
});
```

Also assert the detail uses `MobileFullscreenHeader`, exposes a right-row icon close control, keeps the title single-line, puts explanatory copy behind the shared info control, and renders no page-local subtitle or lower gradient mask.

- [ ] **Step 2: Run UI tests and verify RED**

```bash
npm test -- src/features/im/ImChatRecordCard.test.tsx src/features/im/ImChatRecordDetailPage.test.tsx src/pages/user/UserFavoritesPage.test.tsx
```

Expected: FAIL because pages/components/routes do not exist.

- [ ] **Step 3: Implement the card and read-only detail**

`ImChatRecordCard` uses the existing message-bubble surface but no reply affordance. `ImChatRecordDetailPage` renders `MobileFullscreenHeader` with the immutable record title, a shared circle-info explanation, and `onClose` so the existing right-side `MobileFullscreenCloseButton` is used. Do not create a page-local header, visible subtitle line, or lower gradient mask. The timeline is paginated and shows sender snapshot/avatar, timestamps, and existing read-only rich-message renderers. For snapshot media, it fetches the Task 3 protected endpoint through the authenticated API adapter, renders object URLs, revokes them on page/item disposal, and never places bearer credentials in a URL. It has no composer, reactions, action menu, or message mutation handlers.

- [ ] **Step 4: Add scoped routes before `:conversationId` routes**

Extend `ImScopeRoutes`:

```ts
chatRecord: (publicId: string) => `${prefix}/messages/chat-records/${encodeURIComponent(publicId)}`
```

Add user, merchant, and technician routes for `messages/chat-records/:publicId`, then keep existing `messages/:conversationId` routes afterward. Export `ImChatRecordDetailRoutePage` from `route-pages.tsx`.

- [ ] **Step 5: Implement `/me/favorites` and update User Center**

`UserFavoritesPage` paginates chat-record favorites, opens the same detail route, and removes a favorite only after the API succeeds. Change the existing “我的收藏” entry from `/categories?type=store` to `/me/favorites` and describe the currently formal content as “聊天记录”.

- [ ] **Step 6: Run UI route and page tests**

```bash
npm test -- src/features/im/ImChatRecordCard.test.tsx src/features/im/ImChatRecordDetailPage.test.tsx src/pages/user/UserFavoritesPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/features/im/pages.test.tsx
npm run lint
```

Expected: PASS at user/merchant/technician scopes without route shadowing.

- [ ] **Step 7: Commit record rendering and favorites**

```bash
git add src/features/im/ImChatRecordCard.tsx src/features/im/ImChatRecordCard.test.tsx src/features/im/ImChatRecordDetailPage.tsx src/features/im/ImChatRecordDetailPage.test.tsx src/pages/user/UserFavoritesPage.tsx src/pages/user/UserFavoritesPage.test.tsx src/features/im/components.tsx src/features/im/role-config.ts src/features/im/route-pages.tsx src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.test.tsx src/App.tsx src/styles.css
git commit -m "feat(im): render chat records and favorites"
```

---

### Task 7: Compact Fixed Two-Row Menu and Manual/Automatic Translation UI

**Files:**
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/message-translation.ts`
- Modify: `src/features/im/message-translation.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.tsx`

**Interfaces:**
- Consumes Task 5 `translateMessages` and Task 4 backend statuses.
- Produces per-message display state `{ translatedContent, visible }` without changing stored `Message.content`.

- [ ] **Step 1: Write failing action-menu layout and translation tests**

```tsx
expect(actionGrid?.className).toContain("grid-cols-4");
expect(actionGrid?.dataset.imMessageActionLayout).toBe("two-row");
expect(actionGrid?.textContent).toContain("翻译");
expect(actionGrid?.textContent).toContain("多选");
expect(menu?.classList.contains("client-liquid-glass-surface")).toBe(true);
expect(arrow?.className).toContain("client-liquid-glass-arrow");
expect(backdropRule).toContain("backdrop-filter: none");
```

Add tests that automatic translation disables the menu action, manual success renders a second text block under the original, the next menu label is “隐藏译文”, and provider failure leaves only the original.

Add an action-menu regression that records a reaction, proves the currently open common row does not reorder, closes the menu, and proves the new order appears on the next open. Keep the existing composer and Social quick-reply reopen tests green.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/message-translation.test.ts src/features/im/pages.test.tsx
```

Expected: FAIL because the menu is responsive one/six-or-three columns and no manual translation action exists.

- [ ] **Step 3: Fix the menu to exactly four columns and two rows**

Remove `actionsFitOneRow`; render:

```tsx
<div className="grid grid-cols-4 gap-1" data-im-message-action-layout="two-row">
```

Keep `min-h-11` touch targets, reduce only visual icon capsule/padding, and preserve the sheet/arrow/backdrop classes verbatim.

- [ ] **Step 4: Add translation state and action semantics**

In the conversation page maintain:

```ts
type VisibleMessageTranslation = { content: string; visible: boolean };
const [manualTranslations, setManualTranslations] = useState<Record<string, VisibleMessageTranslation>>({});
```

Action order is exactly reply, forward, copy, translate, pin, recall, delete, multiselect. Translation is disabled when `conversation.autoTranslateMessages`, the message is ineligible, or the message is pending. If a manual translation is visible, the action only toggles `visible=false`; it does not delete cache.

Automatic translation requests loaded eligible message IDs in chunks of 50, deduplicates in-flight IDs, and displays successful results. It does not call the app UI-string dictionary for arbitrary message text.

Replace the action sheet's live `useSyncExternalStore` ordering with a menu-open snapshot from `getRecentImReactionSnapshot()`. `recordRecentImReaction` still persists usage, but the open menu never consumes that notification; refresh the snapshot only when a new action-menu open begins. Do not change the already approved reopen behavior in the IM composer or Social quick-reply composer.

- [ ] **Step 5: Preserve displayed-text copy behavior**

Update `getImMessageCopyText` to accept the resolved displayed text. Single and multi-copy use a visible manual/automatic translation when present, otherwise original content. Tests must prove a failed translation never changes clipboard output.

- [ ] **Step 6: Run focused translation/menu regressions**

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/im/message-translation.test.ts src/features/im/pages.test.tsx src/features/im/pages.message-pressable.test.tsx
npm run lint
```

Expected: PASS; existing glass/backdrop and long-press tests remain green.

- [ ] **Step 7: Commit the menu and translation UI**

```bash
git add src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/message-translation.ts src/features/im/message-translation.test.ts src/features/im/pages.tsx src/features/im/pages.test.tsx
git commit -m "feat(im): add compact actions and translation"
```

---

### Task 8: Message Multiselect, Fixed “Here” Buttons, Gesture Arbitration, and Bottom Actions

**Files:**
- Create: `src/features/im/useImMessageMultiSelect.ts`
- Create: `src/features/im/useImMessageMultiSelect.test.tsx`
- Create: `src/features/im/ImMessageMultiSelectOverlay.tsx`
- Create: `src/features/im/ImMessageMultiSelectOverlay.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces `useImMessageMultiSelect({ messages, messageRefs, scrollRoot })`.
- Consumes Task 5 forward/favorite/batch-delete APIs and Task 7 menu action.

- [ ] **Step 1: Write failing pure selection and gesture tests**

```ts
expect(selectRangeToViewportPoint({ anchorId: "m3", pointY: 120, rows })).toEqual(["m1", "m2", "m3"]);
expect(selectRangeToViewportPoint({ anchorId: "m3", pointY: 720, rows })).toEqual(["m3", "m4", "m5"]);
expect(classifyPointerRelease({ movedPx: 12, scrollChanged: true, targetKind: "message" })).toBe("scroll-end");
expect(classifyPointerRelease({ movedPx: 0, scrollChanged: false, targetKind: "message" })).toBe("cancel-selection");
expect(classifyPointerRelease({ movedPx: 0, scrollChanged: false, targetKind: "control" })).toBe("control");
```

Add component tests for fixed top/bottom buttons, circles, zero-selection disabled buttons, 100-message overflow notice, `pointercancel`, and selection-handle drag callback.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/features/im/useImMessageMultiSelect.test.tsx src/features/im/ImMessageMultiSelectOverlay.test.tsx src/features/im/pages.test.tsx
```

Expected: FAIL because the hook and overlay do not exist.

- [ ] **Step 3: Implement the reducer and geometry helpers**

```ts
type ImMultiSelectState = {
  anchorId: string | null;
  active: boolean;
  selectedIds: Set<string>;
};

const MAX_SELECTED_MESSAGES = 100;
const POINTER_SCROLL_THRESHOLD_PX = 8;
```

The hook exposes `enter(anchorId)`, `exit()`, `toggle(id)`, `selectToPoint(y)`, `selectedMessages`, and pointer handlers. `selectToPoint` ignores system/recalled/expired/disappearing rows, finds the nearest eligible rendered row center, then selects the canonical inclusive range. Overflow returns a typed result without mutating selection.

- [ ] **Step 4: Implement the fixed overlay and row circles**

The overlay contains:

- top count/cancel header;
- fixed upper/lower “选择到这里” buttons using safe-area offsets;
- bottom `client-liquid-glass-surface` bar with forward/copy/favorite/delete;
- real checkbox semantics (`role="checkbox"`, `aria-checked`) for left circles.

Only elements with `data-im-multiselect-control="true"` suppress outside cancellation. Apply it to the action-menu surface/actions, header cancel, fixed “选择到这里” buttons, row circles, confirmation controls, and bottom actions. Message bubbles/cards are cancellation targets, not selection toggles.

- [ ] **Step 5: Wire gesture arbitration and selection handles**

Track pointer-down coordinates and starting `scrollTop`. On pointer move beyond 8px or any scroll delta, set `didScroll=true`. On pointer up, exit only when `didScroll=false` and the target is outside multiselect controls. On `pointercancel`, clear gesture tracking without exit.

Add `onDragStart?: () => void` to `ImMessageSelectionHandles`; invoke it immediately before pointer capture. Conversation page passes `multiSelect.exit`, while handle move continues preventing scroll.

- [ ] **Step 6: Wire four bottom actions**

- Forward: set transient pending selection and navigate to the target picker; single and multiple both create chat-record cards.
- Copy: chronological `sender:content`; resolve each row through Task 7's currently visible manual/automatic translation map, otherwise use original content; use localized media placeholders; preserve selection on clipboard failure and exit on success.
- Favorite: call formal favorite API with UUID idempotency key; exit on success.
- Delete: show confirmation with selected count; call atomic batch delete; remove local rows only after success; never affect peers.

- [ ] **Step 7: Run multiselect, action-menu, store, and page regressions**

```bash
npm test -- src/features/im/useImMessageMultiSelect.test.tsx src/features/im/ImMessageMultiSelectOverlay.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.test.tsx src/features/im/pages.message-pressable.test.tsx src/features/im/store.test.ts
npm run lint
```

Expected: PASS, including “drag then release does not cancel” and “plain message tap cancels”.

- [ ] **Step 8: Commit multiselect**

```bash
git add src/features/im/useImMessageMultiSelect.ts src/features/im/useImMessageMultiSelect.test.tsx src/features/im/ImMessageMultiSelectOverlay.tsx src/features/im/ImMessageMultiSelectOverlay.test.tsx src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.tsx src/features/im/pages.test.tsx src/styles.css
git commit -m "feat(im): add formal message multiselect"
```

---

### Task 9: Five-Language Copy, Documentation, Full Verification, and Live Acceptance

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `docs/realtime.md`
- Modify: `docs/environment.md`
- Modify: `README.md`

**Interfaces:**
- Finalizes all strings/config documentation and proves the integrated slice.

- [ ] **Step 1: Add failing five-language copy tests**

Use a table covering at least: 翻译, 隐藏译文, 多选, 已选择 N 条信息, 选择到这里/ここまで, 转发, 复制, 收藏, 删除, 聊天记录, single/pair/group record titles, 100条上限, four translation failures, batch-delete confirmation, unavailable record, and forward-selection-expired.

```ts
expect(translateText("选择到这里", "ja")).toBe("ここまで");
expect(translateText("聊天记录", "en")).toBe("Chat history");
expect(translateText("翻译服务暂不可用，请稍后重试", "ko")).not.toBe("翻译服务暂不可用，请稍后重试");
```

- [ ] **Step 2: Run copy tests and verify RED**

```bash
npm test -- src/features/im/pages.test.tsx src/pages/user/UserFavoritesPage.test.tsx
```

Expected: FAIL on missing translations.

- [ ] **Step 3: Add exact translations and documentation**

Add all five-language entries to `translations.ts`. Document:

- new migration/models/permissions and identity access;
- chat-record routes and batch-delete semantics;
- translation provider configuration and no-key behavior;
- DeepL Free 500,000-character limit, 429 retry, and 456 quota behavior;
- browser acceptance checklist and no-mock requirement.

- [ ] **Step 4: Run focused frontend and backend suites**

```bash
npm test -- src/features/im src/features/realtime/api.test.ts src/pages/user/UserCenterPage.test.tsx src/pages/user/UserFavoritesPage.test.tsx
cd backend
npm test -- --runTestsByPath tests/im-chat-record-schema.test.ts tests/im-chat-record-migration.test.ts tests/im-chat-record-permissions-migration.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-media.storage.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts tests/deepl-translation.provider.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-translation-config.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run full static/build/test verification**

```bash
cd backend
npm run prisma:generate
npm run lint
npm run build
npm test
cd ..
npm run lint
npm test
npm run verify:production-build
git diff --check
```

Expected: backend and frontend full suites PASS, builds exit 0, production bundle audit passes, and `git diff --check` has no output.

- [ ] **Step 6: Run formal browser acceptance at 390px and 440px**

Before browsing, prove frontend/backend listener PID and cwd. Use two formal test accounts and get consent before creating temporary messages/favorites. Verify:

1. Long press retains glass menu/arrow, no underlay blur/refraction, and fixed compact two-row actions.
2. Automatic translation disables “翻译”; manual translation shows under original and toggles to “隐藏译文”.
3. Fixed upper/lower buttons remain stationary while scrolling and select to their current positions.
4. Plain tap cancels; drag-and-release does not cancel; text-handle drag does not scroll and cancels multiselect.
5. Single/multiple forwarding creates one card; 1/2/3-sender titles render correctly; the fullscreen page uses the shared one-row header, right-side icon close control, info popover, and no lower gradient band.
6. Favorites survive reload/login and open the same detail.
7. Batch delete remains deleted for the actor after reload while the peer still sees the messages.
8. No console errors, HTTP errors, or 390px/440px horizontal overflow.

If no real DeepL key is configured, mark real translation acceptance as blocked and do not claim it passed. Clean up temporary favorites/messages where the product permits without violating the “permanent delete for me” contract.

- [ ] **Step 7: Update Step 13 completion evidence and commit**

Record exact test counts, build output, browser accounts, viewport widths, API outcomes, and any external-key limitation in `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` and `docs/realtime.md`.

```bash
git add src/i18n/translations.ts src/features/im/pages.test.tsx src/pages/user/UserFavoritesPage.test.tsx docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md docs/realtime.md docs/environment.md README.md
git commit -m "docs(im): verify chat records and multiselect"
```

---

## Final Review Gate

Before merge, push, or deployment:

1. Inspect `git status --short --branch`, `git diff --stat`, and commit ancestry.
2. Confirm only the planned files/migrations changed and no unrelated dirty work was overwritten.
3. Compare Prisma schema, migration SQL, generated client, `_prisma_migrations`, and physical tables; `prisma migrate status` alone is insufficient.
4. Do not merge, push, deploy, seed, or write browser/database QA data without the user’s explicit authorization for that exact action.
