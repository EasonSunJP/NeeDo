# Friend Request Verification and Contact Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct contact creation with a server-authoritative 72-hour friend-request flow, reciprocal contacts/follows, bilateral friendship removal, requester-only chat-history deletion, and a pre-insert non-friend message gate.

**Architecture:** Keep the existing React/Vite IM pages and Express/Prisma realtime stack. Extend the formal FriendRequest state machine and Conversation authorization metadata, put every relationship mutation in repository transactions, publish SSE only after commit, and let the shared frontend adapter/store render the same server state for user, merchant, and technician scopes. A deleted user's ConversationParticipant is physically removed while the shared Conversation and Message rows remain for the other participant; re-acceptance creates a new participant whose join time is the history visibility boundary.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Node.js 22, Express, Zod, Prisma, MySQL 8, Redis/SSE, Jest, Supertest, OpenAPI.

## Global Constraints

- Scope is one Step 13 microstep; do not refactor unrelated IM, Social, Booking, order, group-chat, or business-conversation behavior.
- Use only formal `/api/v1/` APIs, Prisma persistence, RBAC, AuditLog, Redis/SSE, and the existing shared IM pages; add no production mock, demo array, placeholder user, fake success path, or client polling.
- `PENDING` expires exactly 72 hours after `createdAt`, using database UTC time as authority.
- A same-direction repeat during the same unexpired 72-hour window returns the original request without changing any timestamp or creating Notification/SSE work.
- Rejection ends the old request; a new request may be created immediately with a new timestamp, notification, red dot, and independent 72-hour window.
- Acceptance atomically creates reciprocal Contact and Follow rows.
- Manual Social unfollow changes only the current Follow direction and never changes Contact.
- Deleting a friendship physically deletes both Contact directions, both Follow directions, and only the deleter's friendship ConversationParticipant; do not use `hiddenAt` for this operation.
- The non-deleter retains the shared conversation and full history. Re-acceptance never restores the deleter's old history.
- A failed non-friend send returns `error.im.not_friends` before Message insert, unread increment, or message SSE.
- `BUSINESS_CONTEXT` direct conversations and `GROUP_MEMBERSHIP` conversations retain their existing authorization contracts.
- New visible copy must cover Simplified Chinese source text, Traditional Chinese, Japanese, English, and Korean.
- Preserve unrelated worktree changes. Each commit stages only the files named in its task.
- Follow TDD for every behavior: observe the focused test fail for the intended reason, implement the minimum production change, then rerun the focused test.

---

## File and Responsibility Map

### Database and deployment safety

- Modify `backend/prisma/schema.prisma`: add expired requests, expiry timestamps, conversation access policy, and friendship pair identity.
- Create `backend/prisma/migrations/20260830200000_friend_request_verification/migration.sql`: backfill request expiry and conversation policies, then add indexes and the friendship pair uniqueness constraint.
- Create `backend/scripts/check-friendship-conversation-pairs.ts`: read-only duplicate-pair preflight that prints exact Conversation IDs and exits non-zero.
- Modify `backend/package.json`: expose `check:friendship-conversation-pairs`.
- Create `backend/tests/friend-request-verification-schema.test.ts`: schema, migration, and preflight contract.

### Backend domain, expiry, HTTP, and realtime

- Modify `backend/src/repositories/realtime.repository.ts`: public profile payloads, request lifecycle transactions, reciprocal Contact/Follow creation, hard friendship deletion, conversation rejoin boundary, unread filtering, and message authorization.
- Modify `backend/src/services/realtime.service.ts`: stable errors and post-commit SSE fan-out.
- Create `backend/src/services/friend-request-expiry.service.ts`: expire due requests and publish terminal refresh events.
- Create `backend/src/workers/friend-request-expiry.worker.ts`: non-overlapping scheduled expiry batches.
- Modify `backend/src/config/env.ts` and `backend/src/server.ts`: validated expiry worker configuration and lifecycle wiring.
- Modify `backend/src/validators/realtime.validator.ts`: expired filter and directory profile path validation; retire public direct Contact creation input.
- Modify `backend/src/controllers/realtime.controller.ts` and `backend/src/routes/realtime.routes.ts`: profile read, idempotent request response, and removal of the public Contact-create bypass.
- Modify `backend/src/api/openapi.ts`: complete request/profile/delete/message error schemas.
- Create `backend/tests/friend-request-lifecycle.repository.test.ts`.
- Create `backend/tests/friend-request-expiry.service.test.ts`.
- Create `backend/tests/friend-request-expiry.worker.test.ts`.
- Create `backend/tests/friendship-removal.repository.test.ts`.
- Modify `backend/tests/realtime-service.test.ts`, `backend/tests/realtime-api.test.ts`, `backend/tests/openapi.test.ts`, `backend/tests/contact-delete.repository.test.ts`, `backend/tests/contact-delete.service.test.ts`, and `backend/tests/realtime-technician-application-contact.test.ts`.

### Frontend formal contract and state

- Modify `src/features/realtime/api.ts`: expired/profile/create-result/delete-result types and API methods; remove direct `addContact`.
- Modify `src/features/realtime/api.test.ts`: exact wire contracts.
- Modify `src/features/im/model.ts`: request timestamps, directory profile state, and `not_friends` failure reason.
- Modify `src/features/im/contract.ts`: directory profile and request methods; remove direct Contact mutation.
- Modify `src/features/im/formal-api.ts`: safe profile mapping, no placeholder request users, delete result mapping, and refresh events.
- Modify `src/features/im/formal-api.test.ts`, `src/features/im/formal-pages.test.ts`, `src/features/im/formal-store-gate.test.ts`, and `src/features/im/store.test.ts`.
- Modify `src/features/im/store.ts`: send/request/respond/delete mutations, counterpart-aware updates, exact incoming badge helpers, and expiry refresh.

### Frontend routes, UI, Social, and localization

- Modify `src/features/im/role-config.ts`: scoped directory profile route.
- Modify `src/features/im/route-pages.tsx` and `src/App.tsx`: shared directory profile page in all three portals.
- Modify `src/features/im/pages.tsx`: search-to-profile flow, profile actions, latest request cards, direction-specific labels, red dot, and delete/send error UI.
- Modify `src/features/im/components.tsx`: render the exact non-friend send failure.
- Create `src/features/im/friend-request-presentation.test.ts` and modify `src/features/im/pages.test.tsx`.
- Modify `src/features/social/components/UnifiedSocialUi.tsx` and `src/features/social/components/UnifiedSocialUi.test.ts`: remove follow-to-friend and unfollow-to-delete coupling.
- Modify `src/i18n/translations.ts` and `src/i18n/translations.test.ts`: five-language copy.
- Modify `README.md` and `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`: formal behavior and verification evidence.

---

### Task 1: Persist request expiry and explicit conversation authorization

**Files:**
- Create: `backend/prisma/migrations/20260830200000_friend_request_verification/migration.sql`
- Create: `backend/scripts/check-friendship-conversation-pairs.ts`
- Create: `backend/tests/friend-request-verification-schema.test.ts`
- Modify: `backend/prisma/schema.prisma:400-435,1723-1780,1923-1945`
- Modify: `backend/src/repositories/realtime.repository.ts:560-615,1637-1700`
- Modify: `backend/tests/realtime-technician-application-contact.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: Prisma `FriendRequestStatus.EXPIRED`, `ConversationAccessPolicy`, `FriendRequest.expiresAt`, `FriendRequest.expiredAt`, `Conversation.accessPolicy`, and `Conversation.friendshipPairKey`.
- Produces: `npm run check:friendship-conversation-pairs`, a read-only pre-deploy guard.
- Produces: `toFriendshipPairKey(leftUserId, rightUserId): string` for every friendship conversation lookup.
- Consumes: existing Contact `source` values `friend_request`, `manual`, and `technician_application`.

- [ ] **Step 1: Write the failing schema and migration test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("friend request verification schema", () => {
  it("persists expiry and conversation authorization without soft-delete aliases", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(resolve(__dirname, "../prisma/migrations/20260830200000_friend_request_verification/migration.sql"), "utf8");

    expect(schema).toContain("EXPIRED  @map(\"expired\")");
    expect(schema).toContain("expiresAt");
    expect(schema).toContain("expiredAt");
    expect(schema).toContain("enum ConversationAccessPolicy");
    expect(schema).toContain("friendshipPairKey");
    expect(migration).toContain("INTERVAL 72 HOUR");
    expect(migration).toContain("friendship_pair_key");
    expect(migration).toContain("friend_request_target_pending_expiry_idx");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

Run: `cd backend && npm test -- friend-request-verification-schema.test.ts`

Expected: FAIL because the migration and new Prisma fields do not exist.

- [ ] **Step 3: Add the Prisma types and fields**

```prisma
enum ConversationAccessPolicy {
  FRIENDSHIP_REQUIRED @map("friendship_required")
  BUSINESS_CONTEXT    @map("business_context")
  GROUP_MEMBERSHIP    @map("group_membership")

  @@map("conversation_access_policy")
}

enum FriendRequestStatus {
  PENDING  @map("pending")
  ACCEPTED @map("accepted")
  REJECTED @map("rejected")
  EXPIRED  @map("expired")

  @@map("friend_request_status")
}
```

Insert these exact fields into the named models:

```prisma
accessPolicy      ConversationAccessPolicy @map("access_policy")
friendshipPairKey String?                  @unique(map: "conversations_friendship_pair_key_key") @map("friendship_pair_key") @db.VarChar(64)

expiresAt DateTime  @map("expires_at")
expiredAt DateTime? @map("expired_at")

@@index([requesterUserId, targetUserId, status, expiresAt, deletedAt], map: "friend_request_direction_status_expiry_idx")
@@index([targetUserId, status, expiresAt, deletedAt], map: "friend_request_target_pending_expiry_idx")
```

- [ ] **Step 4: Create the migration and deterministic backfill**

Use the migration sequence below: expand nullable columns, backfill, make required, then add indexes.

```sql
ALTER TABLE `friend_requests`
  MODIFY `status` ENUM('pending','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
  ADD COLUMN `expires_at` DATETIME(3) NULL,
  ADD COLUMN `expired_at` DATETIME(3) NULL;

UPDATE `friend_requests`
SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 72 HOUR),
    `expired_at` = CASE
      WHEN `status` = 'pending' AND DATE_ADD(`created_at`, INTERVAL 72 HOUR) <= CURRENT_TIMESTAMP(3)
      THEN DATE_ADD(`created_at`, INTERVAL 72 HOUR)
      ELSE NULL
    END,
    `status` = CASE
      WHEN `status` = 'pending' AND DATE_ADD(`created_at`, INTERVAL 72 HOUR) <= CURRENT_TIMESTAMP(3)
      THEN 'expired'
      ELSE `status`
    END;

ALTER TABLE `friend_requests`
  MODIFY `expires_at` DATETIME(3) NOT NULL;

ALTER TABLE `conversations`
  ADD COLUMN `access_policy` ENUM('friendship_required','business_context','group_membership') NULL,
  ADD COLUMN `friendship_pair_key` VARCHAR(64) NULL;

CREATE TEMPORARY TABLE `friendship_conversation_pair_backfill` AS
SELECT
  `conversation_id`,
  MIN(`user_id`) AS `low_user_id`,
  MAX(`user_id`) AS `high_user_id`,
  COUNT(*) AS `participant_count`
FROM `conversation_participants`
WHERE `deleted_at` IS NULL
GROUP BY `conversation_id`;

UPDATE `conversations` AS `conversation`
LEFT JOIN `friendship_conversation_pair_backfill` AS `pair`
  ON `pair`.`conversation_id` = `conversation`.`id`
SET
  `conversation`.`access_policy` = CASE
    WHEN `conversation`.`type` = 'group' THEN 'group_membership'
    WHEN EXISTS (
      SELECT 1
      FROM `contacts` AS `forward_contact`
      INNER JOIN `contacts` AS `reverse_contact`
        ON `reverse_contact`.`owner_user_id` = `forward_contact`.`contact_user_id`
       AND `reverse_contact`.`contact_user_id` = `forward_contact`.`owner_user_id`
       AND `reverse_contact`.`source` = 'technician_application'
       AND `reverse_contact`.`deleted_at` IS NULL
      WHERE `forward_contact`.`owner_user_id` = `pair`.`low_user_id`
        AND `forward_contact`.`contact_user_id` = `pair`.`high_user_id`
        AND `forward_contact`.`source` = 'technician_application'
        AND `forward_contact`.`deleted_at` IS NULL
    ) THEN 'business_context'
    ELSE 'friendship_required'
  END,
  `conversation`.`friendship_pair_key` = CASE
    WHEN `conversation`.`type` = 'direct'
      AND `pair`.`participant_count` = 2
      AND NOT EXISTS (
        SELECT 1
        FROM `contacts` AS `forward_contact`
        INNER JOIN `contacts` AS `reverse_contact`
          ON `reverse_contact`.`owner_user_id` = `forward_contact`.`contact_user_id`
         AND `reverse_contact`.`contact_user_id` = `forward_contact`.`owner_user_id`
         AND `reverse_contact`.`source` = 'technician_application'
         AND `reverse_contact`.`deleted_at` IS NULL
        WHERE `forward_contact`.`owner_user_id` = `pair`.`low_user_id`
          AND `forward_contact`.`contact_user_id` = `pair`.`high_user_id`
          AND `forward_contact`.`source` = 'technician_application'
          AND `forward_contact`.`deleted_at` IS NULL
      )
    THEN CONCAT(`pair`.`low_user_id`, ':', `pair`.`high_user_id`)
    ELSE NULL
  END;

DROP TEMPORARY TABLE `friendship_conversation_pair_backfill`;

ALTER TABLE `conversations`
  MODIFY `access_policy` ENUM('friendship_required','business_context','group_membership') NOT NULL;

CREATE UNIQUE INDEX `conversations_friendship_pair_key_key`
  ON `conversations`(`friendship_pair_key`);
CREATE INDEX `friend_request_direction_status_expiry_idx`
  ON `friend_requests`(`requester_user_id`, `target_user_id`, `status`, `expires_at`, `deleted_at`);
CREATE INDEX `friend_request_target_pending_expiry_idx`
  ON `friend_requests`(`target_user_id`, `status`, `expires_at`, `deleted_at`);
```

- [ ] **Step 5: Add the read-only duplicate-pair guard and explicit creation policies**

The preflight uses this complete control flow and also rejects malformed direct conversations that do not have exactly two active participants:

```ts
import { config as loadDotenv } from "dotenv";

const main = async () => {
  loadDotenv({ path: process.env.ENV_FILE || ".env.dev" });
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const conversations = await prisma.conversation.findMany({
      where: { type: "DIRECT", deletedAt: null },
      select: {
        id: true,
        participants: {
          where: { deletedAt: null },
          select: { userId: true }
        }
      }
    });
    const malformed = conversations.filter((item) => item.participants.length !== 2);
    const pairMap = new Map<string, number[]>();
    for (const conversation of conversations.filter((item) => item.participants.length === 2)) {
      const [low, high] = conversation.participants.map((item) => item.userId).sort((a, b) => a - b);
      const pair = `${low}:${high}`;
      pairMap.set(pair, [...(pairMap.get(pair) ?? []), conversation.id]);
    }
    const duplicates = [...pairMap.entries()]
      .filter(([, conversationIds]) => conversationIds.length > 1)
      .map(([pair, conversationIds]) => ({ pair, conversationIds }));
    if (malformed.length > 0 || duplicates.length > 0) {
      process.stderr.write(`${JSON.stringify({
        malformedConversationIds: malformed.map((item) => item.id),
        duplicatePairs: duplicates
      }, null, 2)}\n`);
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma();
  }
};

void main();
```

Register:

```json
"check:friendship-conversation-pairs": "tsx scripts/check-friendship-conversation-pairs.ts"
```

Update the generic create/reuse path to search only `FRIENDSHIP_REQUIRED` rows and to write `GROUP_MEMBERSHIP` for groups or `FRIENDSHIP_REQUIRED` plus a normalized pair key for direct conversations. Update `ensureDirectContactConversation` to search only `BUSINESS_CONTEXT` rows and to create `BUSINESS_CONTEXT` with no friendship pair key, so a friendship thread is never reused as an application/order authorization channel.

Use one normalization helper in every later transaction:

```ts
export function toFriendshipPairKey(leftUserId: number, rightUserId: number): string {
  const [lowUserId, highUserId] = [leftUserId, rightUserId].sort((left, right) => left - right);
  return `${lowUserId}:${highUserId}`;
}
```

- [ ] **Step 6: Generate Prisma client and run the focused verification**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- friend-request-verification-schema.test.ts realtime-technician-application-contact.test.ts
npm run build
```

Expected: Prisma generation succeeds, both suites PASS, and TypeScript build exits 0.

- [ ] **Step 7: Commit the schema foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260830200000_friend_request_verification/migration.sql backend/scripts/check-friendship-conversation-pairs.ts backend/tests/friend-request-verification-schema.test.ts backend/src/repositories/realtime.repository.ts backend/tests/realtime-technician-application-contact.test.ts backend/package.json
git commit -m "feat: persist friend request verification state"
```

---

### Task 2: Implement the authoritative friend-request transaction state machine

**Files:**
- Create: `backend/tests/friend-request-lifecycle.repository.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts:20-150,280-450,1700-1805,2400-2460,2930-2960`

**Interfaces:**
- Produces: `FriendRequestStatusPayload = "pending" | "accepted" | "rejected" | "expired"`.
- Produces: `CreateFriendRequestResult`, `DirectoryProfilePayload`, `RespondFriendRequestResult`, and safe requester/target profiles.
- Produces: `createFriendRequest`, `getDirectoryProfile`, `listFriendRequests`, `respondToFriendRequest`, and `expireDueFriendRequests` repository methods.
- Produces: private `expireDuePendingForPair(tx, requesterUserId, targetUserId, dbNow): Promise<void>`.
- Consumes: schema fields from Task 1 and existing `ParticipantPayload`, `ContactPayload`, `FollowPayload`, and AuditLog.

- [ ] **Step 1: Write failing repository tests for idempotency, rejection, acceptance, and profiles**

Create tests with fixed DB time `2026-08-30T00:00:00.000Z` that assert:

```ts
expect(repeated).toEqual({ friendRequest: original, created: false });
expect(tx.friendRequest.create).not.toHaveBeenCalled();
expect(tx.notification.create).not.toHaveBeenCalled();

expect(reapplied.created).toBe(true);
expect(reapplied.friendRequest.id).not.toBe(rejected.id);
expect(reapplied.friendRequest.expiresAt.toISOString()).toBe("2026-09-02T00:00:00.000Z");

expect(tx.contact.upsert).toHaveBeenCalledTimes(2);
expect(tx.follow.upsert).toHaveBeenCalledTimes(2);
expect(accepted.friendRequest.status).toBe("accepted");
expect(accepted.recipientUserIds).toEqual([requesterUserId, targetUserId]);
```

Also assert that `requester` and `target` contain only `userId`, `needoId`, `username`, and `avatarUrl`, and that a reverse active pending request is returned rather than duplicated.

- [ ] **Step 2: Run the repository suite and confirm it fails on duplicate creation and missing profiles**

Run: `cd backend && npm test -- friend-request-lifecycle.repository.test.ts`

Expected: FAIL because current creation always inserts and current payload has no expiry or profiles.

- [ ] **Step 3: Define the exact repository payloads**

```ts
export type FriendRequestStatusPayload = "pending" | "accepted" | "rejected" | "expired";

export interface FriendRequestPayload {
  id: number;
  requesterUserId: number;
  targetUserId: number;
  requester: ParticipantPayload;
  target: ParticipantPayload;
  status: FriendRequestStatusPayload;
  message: string | null;
  respondedAt: Date | null;
  expiresAt: Date;
  expiredAt: Date | null;
  createdAt: Date;
}

export interface CreateFriendRequestResult {
  friendRequest: FriendRequestPayload;
  created: boolean;
}

export type CreateFriendRequestOutcome =
  | { status: "ready"; result: CreateFriendRequestResult }
  | { status: "already_friends" }
  | { status: "target_unavailable" };

export interface DirectoryProfilePayload {
  user: ParticipantPayload;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending";
  contactId: number | null;
  friendRequest: FriendRequestPayload | null;
}

export interface RespondFriendRequestResult {
  friendRequest: FriendRequestPayload;
  recipientUserIds: number[];
}

const friendRequestInclude = {
  requester: {
    select: { id: true, needoId: true, username: true, avatarUrl: true }
  },
  target: {
    select: { id: true, needoId: true, username: true, avatarUrl: true }
  }
} satisfies Prisma.FriendRequestInclude;
```

- [ ] **Step 4: Implement ordered pair locking and database-time expiry**

Inside `createFriendRequest`, start a Prisma transaction, obtain `CURRENT_TIMESTAMP(3)`, lock the two User rows in ascending ID order with parameterized `Prisma.sql`, and apply this order:

```ts
const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
  Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
);
const dbNow = databaseClock[0]?.dbNow;
if (!dbNow) throw new Error("Database clock query returned no row");
const orderedUserIds = [requesterUserId, targetUserId].sort((left, right) => left - right);
await tx.$queryRaw<Array<{ id: number }>>(
  Prisma.sql`
    SELECT id FROM users
    WHERE id IN (${Prisma.join(orderedUserIds)})
      AND is_active = 1
      AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE
  `
);
if (friendshipExists) return { status: "already_friends" };
if (activePending) {
  return {
    status: "ready",
    result: { friendRequest: this.mapFriendRequest(activePending), created: false }
  };
}
await expireDuePendingForPair(tx, requesterUserId, targetUserId, dbNow);
const created = await tx.friendRequest.create({
  data: {
    requesterUserId,
    targetUserId,
    message: input.message?.trim() || null,
    expiresAt: new Date(dbNow.getTime() + 72 * 60 * 60 * 1_000)
  },
  include: friendRequestInclude
});
await tx.notification.create({
  data: {
    recipientUserId: targetUserId,
    actorUserId: requesterUserId,
    type: NotificationType.FRIEND_REQUEST,
    title: "New friend request",
    body: "You have a new friend request.",
    payload: { friendRequestId: created.id }
  }
});
await tx.auditLog.create({
  data: {
    actorId: requesterUserId,
    action: "im.friend_request.created",
    targetType: "FriendRequest",
    targetId: created.id,
    ip: null,
    userAgent: null,
    metadata: { targetUserId, expiresAt: created.expiresAt.toISOString() }
  }
});
return {
  status: "ready",
  result: { friendRequest: this.mapFriendRequest(created), created: true }
};
```

The pair-local expiry helper is exact and never changes a timestamp on an unexpired request:

```ts
private async expireDuePendingForPair(
  tx: Prisma.TransactionClient,
  requesterUserId: number,
  targetUserId: number,
  dbNow: Date
): Promise<void> {
  const due = await tx.friendRequest.findMany({
    where: {
      status: FriendRequestStatus.PENDING,
      expiresAt: { lte: dbNow },
      deletedAt: null,
      OR: [
        { requesterUserId, targetUserId },
        { requesterUserId: targetUserId, targetUserId: requesterUserId }
      ]
    },
    select: { id: true }
  });
  const dueIds = due.map((request) => request.id);
  if (dueIds.length === 0) return;
  await tx.friendRequest.updateMany({
    where: { id: { in: dueIds }, status: FriendRequestStatus.PENDING },
    data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
  });
  await tx.auditLog.createMany({
    data: dueIds.map((id) => ({
      actorId: requesterUserId,
      action: "im.friend_request.expired",
      targetType: "FriendRequest",
      targetId: id,
      ip: null,
      userAgent: null,
      metadata: { source: "new_request_guard" }
    }))
  });
}
```

The transaction outcome must distinguish `already_friends`, inactive/not-found accounts, and a successful result without exposing block details.

- [ ] **Step 5: Implement list/profile/respond behavior**

- `listFriendRequests` filters `deletedAt: null`, maps `EXPIRED`, includes both safe profiles, and preserves pagination.
- For list responses, a stored `PENDING` with `expiresAt <= dbNow` is serialized as effective `expired` immediately; the worker remains responsible for claiming, auditing, persisting, and broadcasting the terminal transition.
- `getDirectoryProfile(viewerUserId, targetUserId)` returns the active Contact first; otherwise it returns the newest unexpired pending request in either direction; otherwise `none`.
- `respondToFriendRequest` locks the request, checks target ownership and `expiresAt > dbNow`, writes `ACCEPTED` or `REJECTED`, writes `respondedAt`, and audits the terminal transition.
- On accept, upsert both Contact directions with `source: "friend_request"` and both Follow directions. On reject, create no Contact or Follow.
- If the row is already expired, atomically write `EXPIRED`/`expiredAt` and return an `expired` outcome rather than accepting it.

- [ ] **Step 6: Run repository tests and backend build**

Run:

```bash
cd backend
npm test -- friend-request-lifecycle.repository.test.ts
npm run build
```

Expected: lifecycle suite PASS and build exits 0.

- [ ] **Step 7: Commit the friend-request state machine**

```bash
git add backend/src/repositories/realtime.repository.ts backend/tests/friend-request-lifecycle.repository.test.ts
git commit -m "feat: enforce friend request lifecycle"
```

---

### Task 3: Expire requests in the background without duplicate terminal events

**Files:**
- Create: `backend/src/services/friend-request-expiry.service.ts`
- Create: `backend/src/workers/friend-request-expiry.worker.ts`
- Create: `backend/tests/friend-request-expiry.service.test.ts`
- Create: `backend/tests/friend-request-expiry.worker.test.ts`
- Create: `backend/tests/friend-request-expiry-config.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/config/env.ts:140-170`
- Modify: `backend/src/server.ts:1-140`

**Interfaces:**
- Consumes: `expireDueFriendRequests({ batchSize })` from Task 2.
- Produces: `FriendRequestExpiryService.expireDue({ batchSize }): Promise<{ expired: number }>`.
- Produces: `FriendRequestExpiryWorker.start()`, `.stop()`, and `.runOnce()`.

- [ ] **Step 1: Write the failing service, worker, and config tests**

```ts
it("publishes one terminal event to each side of each newly expired request", async () => {
  const request = { id: 9, requesterUserId: 1, targetUserId: 2, status: "expired" };
  const repository = { expireDueFriendRequests: jest.fn().mockResolvedValue([request]) };
  const gateway = { publish: jest.fn(), subscribe: jest.fn() };
  const service = new FriendRequestExpiryService(repository as never, gateway);

  await expect(service.expireDue({ batchSize: 100 })).resolves.toEqual({ expired: 1 });
  expect(gateway.publish).toHaveBeenCalledTimes(2);
  expect(gateway.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "friend_request.expired", recipientUserId: 1 }));
  expect(gateway.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "friend_request.expired", recipientUserId: 2 }));
});
```

Worker tests must assert immediate first run, one unref interval, overlap prevention, logged failure, and clean stop. Config tests must assert defaults `60_000` and `100`, minimum interval `60_000`, and batch range `1..500`.

- [ ] **Step 2: Run the three suites and confirm the missing modules/config failure**

Run: `cd backend && npm test -- friend-request-expiry.service.test.ts friend-request-expiry.worker.test.ts friend-request-expiry-config.test.ts`

Expected: FAIL because the service, worker, and config keys do not exist.

- [ ] **Step 3: Make expiry claiming concurrency-safe in the repository**

`expireDueFriendRequests` must use one transaction and a parameterized `FOR UPDATE SKIP LOCKED` selection limited by `batchSize`, update only still-`PENDING` rows whose `expiresAt <= CURRENT_TIMESTAMP(3)`, create AuditLog rows with action `im.friend_request.expired`, and return only rows claimed by that transaction. This prevents two server instances from publishing the same terminal event.

```ts
return this.client.$transaction(async (tx) => {
  const candidates = await tx.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      SELECT id
      FROM friend_requests
      WHERE status = 'pending'
        AND expires_at <= CURRENT_TIMESTAMP(3)
        AND deleted_at IS NULL
      ORDER BY expires_at, id
      LIMIT ${input.batchSize}
      FOR UPDATE SKIP LOCKED
    `
  );
  const ids = candidates.map((item) => item.id);
  if (ids.length === 0) return [];
  const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
    Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
  );
  const dbNow = databaseClock[0]?.dbNow;
  if (!dbNow) throw new Error("Database clock query returned no row");
  await tx.friendRequest.updateMany({
    where: { id: { in: ids }, status: FriendRequestStatus.PENDING, deletedAt: null },
    data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
  });
  await tx.auditLog.createMany({
    data: ids.map((id) => ({
      actorId: null,
      action: "im.friend_request.expired",
      targetType: "FriendRequest",
      targetId: id,
      ip: null,
      userAgent: null,
      metadata: { source: "expiry_worker" }
    }))
  });
  const expired = await tx.friendRequest.findMany({
    where: { id: { in: ids }, status: FriendRequestStatus.EXPIRED },
    include: friendRequestInclude,
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }]
  });
  return expired.map((request) => this.mapFriendRequest(request));
});
```

- [ ] **Step 4: Implement the service and worker**

```ts
import { randomUUID } from "node:crypto";
import type { RealtimeRepositoryPort } from "../repositories/realtime.repository";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";

export class FriendRequestExpiryService {
  public constructor(
    private readonly repository: Pick<RealtimeRepositoryPort, "expireDueFriendRequests">,
    private readonly eventGateway: RealtimeEventGatewayPort
  ) {}

  public async expireDue(input: { batchSize: number }) {
    const expired = await this.repository.expireDueFriendRequests(input);
    for (const request of expired) {
      for (const recipientUserId of [request.requesterUserId, request.targetUserId]) {
        this.eventGateway.publish({
          id: randomUUID(),
          type: "friend_request.expired",
          recipientUserId,
          payload: request,
          createdAt: new Date().toISOString()
        });
      }
    }
    return { expired: expired.length };
  }
}
```

Create the worker with this non-overlapping lifecycle:

```ts
interface FriendRequestExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class FriendRequestExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<FriendRequestExpiryService, "expireDue">,
    private readonly logger: FriendRequestExpiryWorkerLogger,
    private readonly intervalMs: number,
    private readonly batchSize: number
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
      const result = await this.service.expireDue({ batchSize: this.batchSize });
      this.logger.info(result, "Friend request expiry completed");
    } catch (error) {
      this.logger.error({ error }, "Friend request expiry failed");
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 5: Wire validated config and server lifecycle**

Add `FRIEND_REQUEST_EXPIRY_INTERVAL_MS` with `.min(60_000).default(60_000)` and `FRIEND_REQUEST_EXPIRY_BATCH_SIZE` with `.min(1).max(500).default(100)`. Instantiate the service with `new RealtimeRepository()` and the shared `realtimeEventGateway`; call `start()` after listen and `stop()` during shutdown.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
cd backend
npm test -- friend-request-expiry.service.test.ts friend-request-expiry.worker.test.ts friend-request-expiry-config.test.ts
npm run build
```

Expected: all three suites PASS and build exits 0.

- [ ] **Step 7: Commit expiry processing**

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/services/friend-request-expiry.service.ts backend/src/workers/friend-request-expiry.worker.ts backend/src/config/env.ts backend/src/server.ts backend/tests/friend-request-expiry.service.test.ts backend/tests/friend-request-expiry.worker.test.ts backend/tests/friend-request-expiry-config.test.ts
git commit -m "feat: expire friend requests after 72 hours"
```

---

### Task 4: Hard-delete the deleter's friendship view and gate direct messages

**Files:**
- Create: `backend/tests/friendship-removal.repository.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts:150-320,930-1210,1594-1805,2480-2670`
- Modify: `backend/src/services/realtime.service.ts:160-205,400-490`
- Modify: `backend/tests/contact-delete.repository.test.ts`
- Modify: `backend/tests/contact-delete.service.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`

**Interfaces:**
- Produces: `DeleteFriendshipResult` with actor, counterpart, physical-delete counts, and friendship Conversation ID.
- Produces: `CreateMessageOutcome = created | not_found | not_friends`.
- Extends: accepted request handling to recreate a missing friendship participant without restoring old history.

- [ ] **Step 1: Replace the old soft-delete tests with failing bilateral hard-delete tests**

```ts
expect(tx.contact.deleteMany).toHaveBeenCalledWith({
  where: {
    OR: [
      { ownerUserId: 41, contactUserId: 167 },
      { ownerUserId: 167, contactUserId: 41 }
    ]
  }
});
expect(tx.follow.deleteMany).toHaveBeenCalledWith({
  where: {
    OR: [
      { followerUserId: 41, followingUserId: 167 },
      { followerUserId: 167, followingUserId: 41 }
    ]
  }
});
expect(tx.conversationParticipant.deleteMany).toHaveBeenCalledWith({
  where: { conversationId: 91, userId: 41 }
});
expect(tx.conversationParticipant.deleteMany).not.toHaveBeenCalledWith({
  where: { conversationId: 91, userId: 167 }
});
```

Add tests proving B can still list old messages, A cannot list the conversation, a post-delete B send returns `not_friends` with no Message insert, and a later accept recreates A's participant with a new `createdAt` while A's message query filters older messages.

Add one test that direct Conversation creation for two non-friends returns `not_friends` without inserting Conversation/Participant rows, while group and `BUSINESS_CONTEXT` creation retain their existing authorization.

- [ ] **Step 2: Run the focused suites and confirm they fail on current soft deletion**

Run: `cd backend && npm test -- contact-delete.repository.test.ts contact-delete.service.test.ts friendship-removal.repository.test.ts realtime-service.test.ts`

Expected: FAIL because current code updates only one Contact `deletedAt` and does not gate messages.

- [ ] **Step 3: Define exact deletion and message outcomes**

```ts
export interface DeleteFriendshipResult {
  actorUserId: number;
  counterpartUserId: number;
  contactIds: number[];
  deletedContactCount: number;
  deletedFollowCount: number;
  deletedConversationId: number | null;
  deletedAt: Date;
  deleted: true;
}

export type CreateMessageOutcome =
  | { status: "created"; message: MessagePayload }
  | { status: "not_found" }
  | { status: "not_friends" };
```

- [ ] **Step 4: Implement the hard-delete transaction**

Lock the authenticated user's active friendship Contact, resolve the counterpart ID, load both relationship IDs for audit, and in the same transaction:

```ts
const actorId = input.ownerUserId;
const counterpartId = ownedContact.contactUserId;
const bilateralContactWhere: Prisma.ContactWhereInput = {
  OR: [
    { ownerUserId: actorId, contactUserId: counterpartId },
    { ownerUserId: counterpartId, contactUserId: actorId }
  ]
};
const bilateralFollowWhere: Prisma.FollowWhereInput = {
  OR: [
    { followerUserId: actorId, followingUserId: counterpartId },
    { followerUserId: counterpartId, followingUserId: actorId }
  ]
};
await tx.contact.deleteMany({ where: bilateralContactWhere });
await tx.follow.deleteMany({ where: bilateralFollowWhere });
const conversation = await tx.conversation.findFirst({
  where: {
    accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
    friendshipPairKey: toFriendshipPairKey(actorId, counterpartId),
    deletedAt: null
  },
  select: { id: true }
});
if (conversation) {
  await tx.conversationParticipant.deleteMany({
    where: { conversationId: conversation.id, userId: actorId }
  });
}
await tx.auditLog.create({
  data: {
    actorId,
    action: "im.friendship.deleted",
    targetType: "User",
    targetId: counterpartId,
    ip: null,
    userAgent: null,
    metadata: { contactIds, conversationId: conversation?.id ?? null }
  }
});
```

Do not update `hiddenAt` or `deletedAt` on these three relationship types.

- [ ] **Step 5: Enforce send and rejoin history boundaries**

- Inside the existing Message-create transaction, a `FRIENDSHIP_REQUIRED` direct conversation must have two reciprocal active Contacts. If not, return `{ status: "not_friends" }` before `message.create`, unread updates, Conversation update, or SSE-visible result.
- The generic direct Conversation-create path applies the same reciprocal Contact check before `conversation.create`; service maps its `not_friends` outcome to `error.im.not_friends`. Group creation and the internal technician-application method keep their separate authorization.
- Service maps `not_friends` to a 403 `AppError` with message `error.im.not_friends`; it publishes no event for that outcome.
- `BUSINESS_CONTEXT` and `GROUP_MEMBERSHIP` skip the friendship Contact check and keep existing authorization.
- On accepting a new request for a pair whose friendship conversation has only one participant, create the missing ConversationParticipant with `createdAt = dbNow`.
- `listMessages`, conversation search, media lookup, last-message mapping, reaction mutation, recall, and direct message reads must reject or filter Message rows older than that participant `createdAt`.

The create transaction uses this branch before persisting:

```ts
const participant = await tx.conversationParticipant.findFirst({
  where: {
    conversationId: input.conversationId,
    userId: input.senderUserId,
    deletedAt: null,
    conversation: { deletedAt: null }
  },
  select: {
    id: true,
    createdAt: true,
    conversation: {
      select: {
        accessPolicy: true,
        participants: {
          where: { deletedAt: null },
          select: { userId: true }
        }
      }
    }
  }
});
if (!participant) return { status: "not_found" };
if (participant.conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED) {
  const userIds = participant.conversation.participants.map((item) => item.userId);
  if (userIds.length !== 2) return { status: "not_friends" };
  const [leftUserId, rightUserId] = userIds as [number, number];
  const reciprocalCount = await tx.contact.count({
    where: {
      deletedAt: null,
      OR: [
        { ownerUserId: leftUserId, contactUserId: rightUserId },
        { ownerUserId: rightUserId, contactUserId: leftUserId }
      ]
    }
  });
  if (reciprocalCount !== 2) return { status: "not_friends" };
}
```

- [ ] **Step 6: Run focused tests and backend build**

Run:

```bash
cd backend
npm test -- contact-delete.repository.test.ts contact-delete.service.test.ts friendship-removal.repository.test.ts realtime-service.test.ts realtime-technician-application-contact.test.ts
npm run build
```

Expected: suites PASS; the technician application business conversation test proves the friend gate is not applied to `BUSINESS_CONTEXT`.

- [ ] **Step 7: Commit deletion and message authorization**

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/tests/contact-delete.repository.test.ts backend/tests/contact-delete.service.test.ts backend/tests/friendship-removal.repository.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-technician-application-contact.test.ts
git commit -m "feat: remove friendships and gate direct messages"
```

---

### Task 5: Expose the lifecycle through validated API, OpenAPI, unread counts, and SSE

**Files:**
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts:2390-2460`
- Modify: `backend/src/api/openapi.ts:12780-12980`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/im/directory/:userId`.
- Changes: `POST /api/v1/im/friend-requests` returns `{ friendRequest, created }`.
- Removes: public `POST /api/v1/im/contacts` direct-add bypass.
- Produces: post-commit `friend_request.created|accepted|rejected|expired`, `friendship.deleted`, `contact.updated`, and `social.follow.updated` refresh events.

- [ ] **Step 1: Add failing Supertest and OpenAPI assertions**

Extend the formal API fixture to assert:

```ts
await request(app).post("/api/v1/im/contacts").set(auth).send({ targetUserId: 2 }).expect(404);

const first = await request(app).post("/api/v1/im/friend-requests").set(authA).send({ targetUserId: 2 }).expect(200);
const repeated = await request(app).post("/api/v1/im/friend-requests").set(authA).send({ targetUserId: 2 }).expect(200);
expect(first.body.data.created).toBe(true);
expect(repeated.body.data).toMatchObject({ created: false, friendRequest: { id: first.body.data.friendRequest.id } });

await request(app).get("/api/v1/im/directory/2").set(authA).expect(200).expect(({ body }) => {
  expect(body.data.relationship).toBe("outgoing_pending");
  expect(body.data.user).not.toHaveProperty("email");
});
```

Add OpenAPI assertions for the `expired` enum, `expiresAt`, `expiredAt`, safe profiles, directory profile path, 403 `error.im.not_friends`, and hard-delete wording.

- [ ] **Step 2: Run API/OpenAPI tests and confirm the contract failure**

Run: `cd backend && npm test -- realtime-api.test.ts openapi.test.ts realtime-service.test.ts`

Expected: FAIL because the directory profile route and new envelopes are absent and direct Contact creation still exists.

- [ ] **Step 3: Update validators, controller, and routes**

```ts
export const directoryUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const friendRequestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(["pending", "accepted", "rejected", "expired"]).optional(),
  direction: z.enum(["incoming", "outgoing", "all"]).default("all")
});
```

Register `GET /im/directory/:userId` after `/im/directory` and before unrelated dynamic paths. Delete the `POST /im/contacts` route and its public controller/service path. Keep `GET /im/contacts` and business-only repository contact creation used by internal application workflows.

Use these controller and route bodies:

```ts
public getDirectoryProfile = this.createHandler((request, response) => {
  const params = directoryUserIdParamSchema.parse(request.params);
  return this.service.getDirectoryProfile(getAuthenticatedAccess(response), params.userId);
});

router.get(
  "/im/directory/:userId",
  authenticate(),
  authorize(REALTIME_ROUTE_PERMISSIONS.searchDirectory),
  validateRequest({ params: directoryUserIdParamSchema }),
  controller.getDirectoryProfile
);
```

The create controller returns the repository envelope without a second wrapper:

```ts
public createFriendRequest = this.createHandler((request, response) =>
  this.service.createFriendRequest(
    getAuthenticatedAccess(response),
    friendRequestCreateBodySchema.parse(request.body)
  )
);
```

- [ ] **Step 4: Publish events only after committed repository results**

- A newly created request publishes `friend_request.created` to the target; `created:false` publishes nothing.
- Accept/reject publishes the terminal event to requester and target.
- Friendship delete publishes `friendship.deleted` to both; the deleter payload contains the deleted conversation ID, while the counterpart refresh keeps its conversation.
- Accepted friendship also triggers Contact, Follow, and unread refresh for both accounts.
- Repository `getUnreadCounts` counts only incoming `PENDING` with `expiresAt > CURRENT_TIMESTAMP(3)`.

- [ ] **Step 5: Replace the OpenAPI definitions**

Document exact pagination, safe public profile schema, request status enum, `created` boolean, accept/reject ownership errors, expiry conflict, hard bilateral delete result, and `error.im.not_friends`. Remove the `post` operation from `/im/contacts`; do not leave obsolete “soft-delete one contact” wording.

The reusable OpenAPI request schema contains these required properties:

```ts
FriendRequest: {
  type: "object",
  required: [
    "id", "requesterUserId", "targetUserId", "requester", "target",
    "status", "message", "respondedAt", "expiresAt", "expiredAt", "createdAt"
  ],
  properties: {
    id: { type: "integer" },
    requesterUserId: { type: "integer" },
    targetUserId: { type: "integer" },
    requester: { $ref: "#/components/schemas/RealtimeParticipant" },
    target: { $ref: "#/components/schemas/RealtimeParticipant" },
    status: { type: "string", enum: ["pending", "accepted", "rejected", "expired"] },
    message: { type: "string", nullable: true },
    respondedAt: { type: "string", format: "date-time", nullable: true },
    expiresAt: { type: "string", format: "date-time" },
    expiredAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" }
  }
}
```

- [ ] **Step 6: Run API, permissions, OpenAPI, and build checks**

Run:

```bash
cd backend
npm test -- realtime-api.test.ts openapi.test.ts contact-delete-permission-migration.test.ts realtime-service.test.ts
npm run lint
npm run build
```

Expected: tests PASS, lint exits 0, and build exits 0.

- [ ] **Step 7: Commit the formal HTTP and realtime contract**

```bash
git add backend/src/validators/realtime.validator.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/services/realtime.service.ts backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts backend/tests/realtime-service.test.ts
git commit -m "feat: expose verified friendship APIs"
```

---

### Task 6: Replace frontend direct-add state with the formal request contract

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/realtime/api.test.ts`
- Modify: `src/features/im/model.ts:1-90,250-275,390-430`
- Modify: `src/features/im/contract.ts:1-45`
- Modify: `src/features/im/formal-api.ts:450-735`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/formal-store-gate.test.ts`
- Modify: `src/features/im/store.ts:120-135,390-430,980-1060,1090-1180`
- Modify: `src/features/im/store.test.ts`

**Interfaces:**
- Consumes: Task 5 HTTP payloads.
- Produces: `getDirectoryProfile`, `sendFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `deleteContact`, and `refresh` store methods.
- Produces: `getIncomingPendingFriendRequestCount` and `selectLatestFriendRequestsByCounterpart` pure helpers.

- [ ] **Step 1: Write failing wire, adapter, and store tests**

```ts
expect(realtimeApi.createFriendRequest({ targetUserId: 167 })).resolves.toEqual({
  friendRequest: expect.objectContaining({ status: "pending", expiresAt: expect.any(String) }),
  created: true
});
expect(requestMock).toHaveBeenCalledWith("/im/friend-requests", {
  body: { targetUserId: 167 }, method: "POST"
});

expect(getIncomingPendingFriendRequestCount(requests, "2", Date.parse("2026-08-30T00:00:00.000Z"))).toBe(1);
expect(selectLatestFriendRequestsByCounterpart(requests, "2")).toEqual([newestForUser1]);
expect(getMessageFailureReason(new Error("error.im.not_friends"))).toBe("not_friends");
```

Assert formal bootstrap uses `requester` and `target` profiles and contains no `toPlaceholderUser` call for friend requests. Assert deleting a Contact removes only the current store's matching friendship conversation ID.

- [ ] **Step 2: Run focused frontend tests and confirm type/behavior failures**

Run: `npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/formal-store-gate.test.ts src/features/im/store.test.ts`

Expected: FAIL because current wire types omit expiry/profiles, formal API exposes `addContact`, and delete maps a soft-deleted Contact.

- [ ] **Step 3: Define exact frontend types**

```ts
export type RealtimeFriendRequest = {
  id: number;
  requesterUserId: number;
  targetUserId: number;
  requester: RealtimeParticipant;
  target: RealtimeParticipant;
  status: "pending" | "accepted" | "rejected" | "expired";
  message: string | null;
  respondedAt: string | null;
  expiresAt: string;
  expiredAt: string | null;
  createdAt: string;
};

export type RealtimeDirectoryProfile = {
  user: RealtimeParticipant;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending";
  contactId: number | null;
  friendRequest: RealtimeFriendRequest | null;
};

export type RealtimeCreateFriendRequestResult = {
  friendRequest: RealtimeFriendRequest;
  created: boolean;
};

export type RealtimeDeletedFriendship = {
  actorUserId: number;
  counterpartUserId: number;
  contactIds: number[];
  deletedContactCount: number;
  deletedFollowCount: number;
  deletedConversationId: number | null;
  deletedAt: string;
  deleted: true;
};
```

Extend `FriendRequest` with `expiresAt` and `expiredAt`; extend `ConversationMessage.failureReason` with `not_friends`; add the equivalent `DirectoryProfile` domain type.

```ts
export type DirectoryProfile = {
  user: ImUser;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending";
  contactId?: string;
  friendRequest?: FriendRequest;
};
```

- [ ] **Step 4: Replace formal methods and remove the bypass**

- Delete `realtimeApi.addContact`, `ImApi.addContact`, formal `addContact`, and the formal store `addContact` action.
- Add `realtimeApi.getDirectoryProfile(userId)` and make `createFriendRequest` return `RealtimeCreateFriendRequestResult`.
- Add `ImApi.getDirectoryProfile` and `ImApi.sendFriendRequest`.
- Convert both safe profiles with `toImUser`, merge them during bootstrap/list refresh, and delete the placeholder-user fallback for friend requests.
- Map delete response to remove the current Contact and `deletedConversationId` from the deleter's snapshot; counterpart SSE uses bootstrap refresh and therefore retains its conversation.

The realtime API methods are:

```ts
getDirectoryProfile(userId: number) {
  return httpClient.request<RealtimeDirectoryProfile>(`/im/directory/${userId}`);
},
createFriendRequest(input: { message?: string; targetUserId: number }) {
  return httpClient.request<RealtimeCreateFriendRequestResult>("/im/friend-requests", {
    body: input,
    method: "POST"
  });
},
deleteContact(contactId: number) {
  return httpClient.request<RealtimeDeletedFriendship>(`/im/contacts/${contactId}`, {
    method: "DELETE"
  });
}
```

- [ ] **Step 5: Add exact derived-state helpers and expiry refresh**

```ts
export function isIncomingPendingRequest(request: FriendRequest, currentUserId: string, nowMs: number) {
  return request.toUserId === currentUserId
    && request.status === "pending"
    && new Date(request.expiresAt).getTime() > nowMs;
}

export function getFriendRequestCounterpartId(request: FriendRequest, currentUserId: string): string {
  return request.fromUserId === currentUserId ? request.toUserId : request.fromUserId;
}

export function selectLatestFriendRequestsByCounterpart(requests: FriendRequest[], currentUserId: string) {
  const latest = new Map<string, FriendRequest>();
  for (const request of requests) {
    const counterpartId = getFriendRequestCounterpartId(request, currentUserId);
    const current = latest.get(counterpartId);
    if (!current || Date.parse(request.createdAt) > Date.parse(current.createdAt)) {
      latest.set(counterpartId, request);
    }
  }
  return [...latest.values()].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
}

export function getIncomingPendingFriendRequestCount(requests: FriendRequest[], currentUserId: string, nowMs: number) {
  return selectLatestFriendRequestsByCounterpart(requests, currentUserId)
    .filter((request) => isIncomingPendingRequest(request, currentUserId, nowMs)).length;
}
```

Expose `refreshBootstrap` as `refresh`. After a request mutation, use the returned row immediately and then call one formal refresh. Realtime friend/contact/follow/delete events continue through `shouldForwardFormalImEvent` and trigger the same refresh boundary.

- [ ] **Step 6: Run frontend focused tests and typecheck**

Run:

```bash
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/formal-store-gate.test.ts src/features/im/store.test.ts
npm run lint
```

Expected: suites PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the frontend formal state contract**

```bash
git add src/features/realtime/api.ts src/features/realtime/api.test.ts src/features/im/model.ts src/features/im/contract.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts src/features/im/formal-store-gate.test.ts src/features/im/store.ts src/features/im/store.test.ts
git commit -m "feat: consume formal friend request state"
```

---

### Task 7: Build the search profile, request-processing UI, badges, and send failure

**Execution skills:** Apply `needo-mobile-headers` for the shared fullscreen header and `frontend-design` for the screenshot-calibrated visual review before editing JSX.

**Files:**
- Create: `src/features/im/friend-request-presentation.test.ts`
- Modify: `src/features/im/role-config.ts`
- Modify: `src/features/im/route-pages.tsx`
- Modify: `src/App.tsx:1105-1125,1195-1215,1324-1344`
- Modify: `src/features/im/pages.tsx:2280-2320,2490-2570,7420-7950`
- Modify: `src/features/im/components.tsx:2940-2960`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/components/mobile/MobileShell.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: Task 6 store methods and presentation helpers.
- Produces: scoped `directoryProfile(userId)` route and `ImDirectoryProfilePage`.
- Produces: `getFriendRequestLabel(request, currentUserId)` and profile action resolver.

**Visual lock:** The page's single job is to let a NeeDo account holder inspect one real account and make the correct friendship decision. Calibrate the supplied reference with Ink Night `#11142F`, Plum Fog `#2B2347`, Violet Glass `#3A3268`, Lavender `#C7AAFF`, Alert Coral `#F15A63`, and Frost `#F7F4FF`, but implement them through the existing client theme tokens so every NeeDo theme remains supported. Use the current client sans face in compact 800-weight for the display name and the same family at 600-weight for NeeDoID/status utility text; add no font dependency. The signature is the rounded identity card with one restrained lavender hierarchy and the paired recipient red dots; no decorative motion or gradient band is added.

```text
┌────────────────────────────────────┐
│ 账号信息  ⓘ                  [ × ] │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ [avatar]  Display name         │ │
│ │           ID u5314672018       │ │
│ └────────────────────────────────┘ │
│ ┌ 标签 ─────────────────────────┐ │
│ │ 还没有添加标签                │ │
│ └────────────────────────────────┘ │
│ ┌ 动态 ─────── 前往好友的动态页 ›│ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌──────────┐  ┌─────────────────┐ │
│ │ 取消/拒绝│  │ 添加好友/状态   │ │
│ └──────────┘  └─────────────────┘ │
└────────────────────────────────────┘
```

Before coding, compare this lock to the supplied screenshots: retain the account-first card hierarchy and red-dot meaning; reject generic dashboard stats, oversized hero typography, extra gradients, and unrelated animation.

- [ ] **Step 1: Write failing presentation and route tests**

```ts
expect(getFriendRequestLabel(outgoingPending, "1")).toBe("等待对方验证");
expect(getFriendRequestLabel(incomingPending, "2")).toBe("待处理");
expect(getFriendRequestLabel(rejected, "1")).toBe("被拒绝");
expect(getFriendRequestLabel(rejected, "2")).toBe("已拒绝");
expect(getFriendRequestLabel(accepted, "1")).toBe("成功添加");
expect(getFriendRequestLabel(expired, "2")).toBe("已过期");

expect(getImRoleConfig("user").routes.directoryProfile("167")).toBe("/contacts/directory/167");
expect(getImRoleConfig("merchant").routes.directoryProfile("167")).toBe("/merchant/contacts/directory/167");
expect(getImRoleConfig("technician").routes.directoryProfile("167")).toBe("/technician/contacts/directory/167");
```

Source-level tests must assert the friend search click navigates to `directoryProfile` and contains neither `addFriendAndOpen` nor `ensureDirectConversation` in the friend-mode branch.

Also assert the new page uses `MobileFullscreenPage` and `MobileFullscreenHeader`, passes explanatory copy through `info`, uses `onClose` for request-origin entry, renders no visible `subtitle`, and adds no lower header gradient mask.

- [ ] **Step 2: Run focused UI tests and confirm current direct-chat behavior fails**

Run: `npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx src/components/mobile/MobileShell.test.ts`

Expected: FAIL because the shared profile route/page and direction labels do not exist.

- [ ] **Step 3: Add scoped routes and the shared profile page**

Add the presentation functions first:

```ts
export function getFriendRequestLabel(
  request: FriendRequest,
  currentUserId: string,
  nowMs: number = Date.now()
): string {
  const outgoing = request.fromUserId === currentUserId;
  if (request.status === "accepted") return "成功添加";
  if (request.status === "rejected") return outgoing ? "被拒绝" : "已拒绝";
  if (request.status === "expired" || Date.parse(request.expiresAt) <= nowMs) return "已过期";
  return outgoing ? "等待对方验证" : "待处理";
}

export type DirectoryProfileAction = "cancel" | "send_request" | "reject" | "accept" | "waiting" | "status";

export function resolveDirectoryProfileActions(
  profile: DirectoryProfile,
  request: FriendRequest | null,
  currentUserId: string
): DirectoryProfileAction[] {
  if (profile.relationship === "friend") return [];
  if (request?.status === "pending" && request.toUserId === currentUserId) {
    return ["reject", "accept"];
  }
  if (request?.status === "pending") return ["waiting"];
  if (request) return ["status"];
  return ["cancel", "send_request"];
}
```

Add:

```ts
directoryProfile: (userId: string) => `${prefix}/contacts/directory/${encodeURIComponent(userId)}`
```

Register `/contacts/directory/:userId`, `/merchant/contacts/directory/:userId`, and `/technician/contacts/directory/:userId` before each `/contacts/:contactId` route. `ImDirectoryProfilePage` loads `store.getDirectoryProfile(userId)`, shows avatar/name/NeeDoID, the existing tag/activity card structure, and these action sets:

- search origin + `none`: bottom “取消 / 添加好友”;
- `outgoing_pending`: disabled “等待对方验证”;
- `incoming_pending`: header-right “关闭”, bottom “拒绝 / 添加好友”;
- terminal request: status only;
- `friend`: existing friend/profile action, no add button.

All async buttons stay disabled until the formal mutation resolves. The page shell is:

Inside `ImDirectoryProfilePage`, derive `isNight` from `useClientTheme()`, `fromRequests` from `searchParams.get("from") === "requests"`, and every visible source string through the existing `translateText(source, language)` adapter. Reuse the existing formal activity-status lookup and `socialPaths.accountProfile(...)`; if the account has no routable Social profile, omit the activity entry instead of passing an undefined destination.

```tsx
<MobileFullscreenPage innerClassName="bg-[color:var(--client-bg)]">
  <MobileFullscreenHeader
    dark={isNight}
    info={t("查看账号资料和好友关系状态")}
    onBack={fromRequests ? undefined : () => navigate(-1)}
    onClose={fromRequests ? () => navigate(config.routes.friendRequests) : undefined}
    title={t("账号信息")}
  />
  <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
    <div className="space-y-4">
      <ContactSummaryCard showTags={false} user={profile.user} />
      <section className="rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4">
        <h2 className="text-[15px] font-black">{t("标签")}</h2>
        <p className="mt-3 text-sm font-semibold text-[color:var(--client-muted)]">{t("还没有添加标签")}</p>
      </section>
      {activityTo ? <ImContactActivityEntry status={activityStatus} to={activityTo} /> : null}
    </div>
  </main>
  <ImFriendProfileActionBar
    actions={actions}
    currentUserId={store.currentUserId}
    disabled={submitting}
    onAccept={acceptRequest}
    onCancel={() => navigate(-1)}
    onReject={rejectRequest}
    onSendRequest={sendRequest}
    request={request}
  />
</MobileFullscreenPage>
```

`ImFriendProfileActionBar` is driven only by the resolver and uses the same fixed width, border, radius, and backdrop hierarchy as the existing `StickyActionBar`:

```tsx
function ImFriendProfileActionBar({
  actions,
  currentUserId,
  disabled,
  onAccept,
  onCancel,
  onReject,
  onSendRequest,
  request
}: {
  actions: DirectoryProfileAction[];
  currentUserId: string;
  disabled: boolean;
  onAccept: () => Promise<void>;
  onCancel: () => void;
  onReject: () => Promise<void>;
  onSendRequest: () => Promise<void>;
  request: FriendRequest | null;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[75] mx-auto w-full max-w-[480px] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex gap-2 rounded-[28px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_95%,transparent)] p-3 shadow-soft backdrop-blur-xl">
        {actions.includes("cancel") ? <Button className="flex-1" onClick={onCancel} variant="secondary">{t("取消")}</Button> : null}
        {actions.includes("reject") ? <Button className="flex-1" disabled={disabled} onClick={() => void onReject()} variant="secondary">{t("拒绝")}</Button> : null}
        {actions.includes("send_request") ? <Button className="flex-1" disabled={disabled} onClick={() => void onSendRequest()}>{t("添加好友")}</Button> : null}
        {actions.includes("accept") ? <Button className="flex-1" disabled={disabled} onClick={() => void onAccept()}>{t("添加好友")}</Button> : null}
        {actions.includes("waiting") || actions.includes("status") ? (
          <Button className="flex-1" disabled>
            {t(request ? getFriendRequestLabel(request, currentUserId) : "等待对方验证")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

In the same red-green cycle, add the missing five-language entries used by this page and its send-failure state to `translations.ts`, using the reviewed values in Task 9. The Task 7 commit must pass both i18n audits; it may not rely on untranslated hard-coded fallback copy.

- [ ] **Step 4: Replace the friend search click and request list**

- Replace `addFriendAndOpen` with `navigate(config.routes.directoryProfile(user.id))`.
- Replace “直接加入通讯录并进入聊天窗口” copy with “点击账号查看资料并发送好友申请”.
- Render `selectLatestFriendRequestsByCounterpart(store.friendRequests, store.currentUserId)`; resolve counterpart as requester for incoming and target for outgoing.
- A request card click opens the same profile with `?requestId=<id>&from=requests`; incoming pending shows process actions and all other rows show the exact status label.

- [ ] **Step 5: Correct both red dots and the failed message copy**

- The bottom Contacts navigation icon and the “新的朋友” entry icon both use `getIncomingPendingFriendRequestCount` rather than all pending requests, and both render the same Alert Coral dot only when the count is greater than zero.
- MobileShell continues to consume backend `friendRequests`; add a test that the Contacts destination gets the count while messages and moments do not, plus a page test that the “新的朋友” entry shows and clears its own dot from the same count.
- Schedule one timeout for the nearest visible `expiresAt`; at the boundary call `store.refresh()` once and recalculate. Do not use an interval.
- Render `message.failureReason === "not_friends"` as “对方不是你的好友，信息发送失败”.

- [ ] **Step 6: Run focused UI tests and root typecheck**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx src/components/mobile/MobileShell.test.ts
npm test -- src/i18n/translations.test.ts
npm run i18n:audit
npm run i18n:quality
npm run lint
```

Expected: suites PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the verified friend-request UI**

```bash
git add src/features/im/friend-request-presentation.test.ts src/features/im/role-config.ts src/features/im/route-pages.tsx src/App.tsx src/features/im/pages.tsx src/features/im/components.tsx src/features/im/pages.test.ts src/features/im/pages.test.tsx src/components/mobile/MobileShell.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: add friend verification screens"
```

---

### Task 8: Decouple Social follow controls and contact-card requests

**Files:**
- Modify: `src/features/social/components/UnifiedSocialUi.tsx:1060-1155`
- Modify: `src/features/social/components/UnifiedSocialUi.test.ts`
- Modify: `src/features/social/formal-contacts.test.ts`
- Modify: `src/features/im/pages.tsx:5160-5210`
- Modify: `src/features/im/contact-card-sharing.test.ts`

**Interfaces:**
- Consumes: Task 6 `sendFriendRequest` and existing Social `toggleFollow`.
- Produces: Social follow/unfollow that never writes Contact.
- Produces: contact-card “添加好友” that sends a formal request instead of directly adding.

- [ ] **Step 1: Write failing decoupling tests**

```ts
expect(source).not.toContain("imStore.addContact");
expect(source).not.toContain("imStore.deleteContact");
expect(source).not.toContain("autoFriendTargetRef");
expect(source).toContain("toggleFollow(actorKey, targetKey)");

expect(contactCardSource).toContain("store.sendFriendRequest(card.userId)");
expect(contactCardSource).not.toContain("store.addContact(card.userId");
```

Add a component case where two active reciprocal follows exist without Contact: the button shows “已关注”, not “好友” or “删除好友”. Add a case where Contact exists but current follow does not: the button shows “关注” and clicking it follows without changing Contact.

- [ ] **Step 2: Run focused tests and confirm the current coupling failure**

Run: `npm test -- src/features/social/components/UnifiedSocialUi.test.ts src/features/social/formal-contacts.test.ts src/features/im/contact-card-sharing.test.ts`

Expected: FAIL because mutual follow currently calls `imStore.addContact` and the friend-unfollow dialog calls `deleteContact`.

- [ ] **Step 3: Remove automatic Contact creation from mutual follows**

Delete `autoFriendTargetRef`, its effect, the `isSocialFriend` fallback, and the “同步中” state. Friendship is `Boolean(activeContact)` only; follow presentation is derived only from `following`.

- [ ] **Step 4: Make the Social button follow-only**

Use this action boundary:

```ts
const mode = following ? "following" : "follow";
const label = pendingAction ? "处理中" : following ? "已关注" : "关注";

const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
  event.stopPropagation();
  toggleFollow(actorKey, targetKey);
};
```

Remove the friend-delete confirmation dialog from the Social follow button. Friendship deletion remains available from IM contact/conversation info, where Task 4 semantics apply.

- [ ] **Step 5: Replace contact-card direct addition**

Both contact-card action branches call `store.sendFriendRequest(card.userId)` and show the resulting “等待对方验证” state. They must not open a direct conversation until friendship has been accepted.

- [ ] **Step 6: Run focused tests and root typecheck**

Run:

```bash
npm test -- src/features/social/components/UnifiedSocialUi.test.ts src/features/social/formal-contacts.test.ts src/features/im/contact-card-sharing.test.ts
npm run lint
```

Expected: suites PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Social/friendship decoupling**

```bash
git add src/features/social/components/UnifiedSocialUi.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/formal-contacts.test.ts src/features/im/pages.tsx src/features/im/contact-card-sharing.test.ts
git commit -m "fix: decouple social follows from friendships"
```

---

### Task 9: Complete five-language copy and formal documentation

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `README.md`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: every visible source string and stable backend error key from Tasks 4-8.
- Produces: complete Traditional Chinese, Japanese, English, and Korean translations for each Simplified Chinese source string.

- [ ] **Step 1: Add a failing translation coverage test**

```ts
const friendVerificationCopy = [
  "取消",
  "添加好友",
  "拒绝",
  "关闭",
  "等待对方验证",
  "待处理",
  "成功添加",
  "被拒绝",
  "已拒绝",
  "已过期",
  "对方不是你的好友，信息发送失败",
  "点击账号查看资料并发送好友申请",
  "申请状态已变化，请刷新后重试",
  "删除好友失败，请稍后重试",
  "好友申请发送失败，请稍后重试",
  "好友申请已过期",
  "你们已经是好友"
];

for (const source of friendVerificationCopy) {
  expect(translations[source]).toMatchObject({
    "zh-Hant": expect.any(String),
    ja: expect.any(String),
    en: expect.any(String),
    ko: expect.any(String)
  });
}
```

- [ ] **Step 2: Run the translation test and confirm missing entries**

Run: `npm test -- src/i18n/translations.test.ts`

Expected: FAIL listing only the missing friend-verification strings.

- [ ] **Step 3: Add reviewed translations**

Use these product meanings consistently:

| Source | Traditional Chinese | Japanese | English | Korean |
|---|---|---|---|---|
| 等待对方验证 | 等待對方驗證 | 相手の確認待ち | Waiting for verification | 상대방 확인 대기 |
| 待处理 | 待處理 | 対応待ち | Pending | 처리 대기 |
| 成功添加 | 新增成功 | 友だち追加済み | Added successfully | 친구 추가 완료 |
| 被拒绝 | 被拒絕 | 拒否されました | Rejected | 거절됨 |
| 已拒绝 | 已拒絕 | 拒否しました | Rejected by you | 거절함 |
| 已过期 | 已過期 | 期限切れ | Expired | 만료됨 |
| 对方不是你的好友，信息发送失败 | 對方不是你的好友，訊息傳送失敗 | 相手は友だちではないため、メッセージを送信できません | This person is not your friend. Message not sent. | 상대방이 친구가 아니어서 메시지를 보낼 수 없습니다 |
| 点击账号查看资料并发送好友申请 | 點擊帳號查看資料並傳送好友申請 | アカウントを選択してプロフィールを確認し、友だち申請を送信します | Select an account to view the profile and send a friend request. | 계정을 눌러 프로필을 확인하고 친구 요청을 보내세요 |
| 申请状态已变化，请刷新后重试 | 申請狀態已變更，請重新整理後再試 | 申請の状態が変更されました。更新してからもう一度お試しください | The request status changed. Refresh and try again. | 요청 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요 |
| 删除好友失败，请稍后重试 | 刪除好友失敗，請稍後再試 | 友だちを削除できませんでした。しばらくしてからもう一度お試しください | Could not remove this friend. Try again later. | 친구를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요 |
| 好友申请发送失败，请稍后重试 | 好友申請傳送失敗，請稍後再試 | 友だち申請を送信できませんでした。しばらくしてからもう一度お試しください | Could not send the friend request. Try again later. | 친구 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요 |
| 好友申请已过期 | 好友申請已過期 | 友だち申請の有効期限が切れました | The friend request has expired. | 친구 요청이 만료되었습니다 |
| 你们已经是好友 | 你們已經是好友 | すでに友だちです | You are already friends. | 이미 친구입니다 |

For `取消`, `添加好友`, `拒绝`, and `关闭`, retain the existing reviewed entries and include them in the coverage assertion so a missing locale still fails the suite.

- [ ] **Step 4: Update formal documentation**

In `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, document the state matrix, 72-hour idempotency, rejected reapply, reciprocal Contact/Follow transaction, hard bilateral friendship delete, requester-only participant deletion, rejoin history boundary, and `error.im.not_friends`. In `README.md`, update the Step 13 capability summary and list the focused verification commands.

The Step 13 document must include this terminal matrix verbatim:

```markdown
| 状态 | 发出方 | 接收方 | 接收方红点 |
|---|---|---|---|
| pending 且未过期 | 等待对方验证 | 待处理 | 显示 |
| accepted | 成功添加 | 成功添加 | 不显示 |
| rejected | 被拒绝 | 已拒绝 | 不显示 |
| expired | 已过期 | 已过期 | 不显示 |
```

- [ ] **Step 5: Run i18n quality and documentation checks**

Run:

```bash
npm test -- src/i18n/translations.test.ts
npm run i18n:audit
npm run i18n:quality
rg -n "直接加入通讯录并进入聊天窗口|Soft-delete one contact|soft-deletes an owned contact" src backend docs README.md
```

Expected: tests and audits PASS; the final search returns no obsolete product/contract wording.

- [ ] **Step 6: Run both builds before the documentation commit**

Run:

```bash
cd backend && npm run build
cd .. && npm run verify:production-build
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit localization and docs**

```bash
git add src/i18n/translations.ts src/i18n/translations.test.ts README.md docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs: document verified friendship lifecycle"
```

---

### Task 10: Run full automated and formal two-account browser acceptance

**Execution skill:** Use `webapp-testing` for local browser interaction and evidence capture; use `domcontentloaded` because formal SSE connections remain open.

**Files:**
- Modify only if evidence reveals a scoped defect: files already listed in Tasks 1-9 and their focused tests.
- Do not modify production/test data outside the controlled formal test accounts.

**Interfaces:**
- Consumes: the complete vertical slice from Tasks 1-9.
- Produces: fresh test, build, database, SSE, and browser evidence; no new product interface.

- [ ] **Step 1: Verify migration safety before applying**

Run:

```bash
cd backend
npm run check:friendship-conversation-pairs
npx prisma migrate status
```

Expected: duplicate-pair guard exits 0 and migration status shows `20260830200000_friend_request_verification` pending or applied without an unrelated missing migration.

- [ ] **Step 2: Run complete backend verification**

Run:

```bash
cd backend
npm test
npm run lint
npm run format:check
npm run build
```

Expected: every command exits 0. If Supertest fails only with sandbox `listen EPERM`, rerun the same suite in the approved execution environment and record that distinction; do not call the product failed without confirming the cause.

- [ ] **Step 3: Run complete frontend verification**

Run:

```bash
npm test
npm run lint
npm run i18n:audit
npm run i18n:quality
npm run verify:production-build
```

Expected: every command exits 0 and production bundle audit reports no formal-runtime mock inclusion.

- [ ] **Step 4: Start and health-check the formal stack**

Run the existing formal development entry, then verify listeners and health:

```bash
npm run dev
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend health succeeds, readiness is ready with MySQL/Redis available, and frontend returns HTTP 200. Because SSE is long-lived, browser navigation waits for `domcontentloaded`, not `networkidle`.

- [ ] **Step 5: Execute the formal A/B request lifecycle in a 440×956 viewport**

Using two real controlled accounts:

1. A searches B; clicking B opens the account profile and does not create Contact or Conversation.
2. A sends once; A shows “等待对方验证”; B contacts nav and New Friends icons show a red dot and B shows “待处理”.
3. A submits again within 72 hours; request ID and timestamps remain unchanged and B gets no new Notification/SSE alert.
4. B rejects; A shows “被拒绝”, B shows “已拒绝”.
5. A immediately reapplies; a new request ID/timestamp is created and B gets exactly one new alert.
6. B accepts; both Contact directions and Follow directions exist and both lists show “成功添加”.

For each mutation, reload both pages and confirm the same formal terminal state.

- [ ] **Step 6: Execute Social, deletion, send failure, and rejoin acceptance**

1. A manually unfollows B in Social; Contact remains and B→A Follow is unchanged.
2. A deletes B from IM; both Contact directions and both Follow directions are absent.
3. A's friendship conversation and history entry are gone and direct API access is forbidden.
4. B's old conversation/history remains.
5. B sends from the old conversation; UI shows “对方不是你的好友，信息发送失败”; database Message count, unread count, and message SSE do not increase.
6. Reapply and accept; A sees only messages created after the new participant join time, B retains full history, and both see one conversation entry.
7. Open one `BUSINESS_CONTEXT` conversation and one group conversation to prove their existing send authorization still works.

- [ ] **Step 7: Verify exact expiry and visual quality**

Use a controlled test request whose `expiresAt` is set through the test clock/data harness to the next boundary. Confirm it becomes “已过期” at `expiresAt`, both red dots clear, accept/reject fail, and a post-expiry reapply produces one new alert. Check user, merchant, and technician shared routes; header close button; fixed bottom actions; horizontal overflow 0; no added console errors; and at least one light and one dark theme.

- [ ] **Step 8: Review final diff and commit only scoped acceptance fixes**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no unrelated file is staged, no whitespace errors, and every changed production file maps to a focused test above. If acceptance required a scoped fix, repeat its failing test, minimal implementation, passing test, then commit it with a behavior-specific message. If no fix was needed, do not create an empty commit.
