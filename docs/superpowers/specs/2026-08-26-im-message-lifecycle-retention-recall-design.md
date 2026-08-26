# NeeDo IM Message Lifecycle, Retention, Recall, and Local Cache Design

**Date:** 2026-08-26  
**Status:** Approved design  
**Scope:** Step 13 IM only. Social, Notifications, affiliate marketing, membership billing, and unrelated UI redesign are out of scope.

## 1. Goal

Complete the formal IM message lifecycle without expanding the legacy browser mock implementation. The finished system must provide:

- backend-configurable text retention, defaulting to indefinite server retention;
- backend-configurable image and video retention, defaulting to three days;
- ordinary recall and premium traceless recall within a server-enforced three-minute window;
- group-only privacy mode with deletion after a sender-selected duration;
- realtime removal from all online participants and reliable cleanup for participants who reconnect later;
- encrypted local message and opened-media caching, while ensuring recall and privacy deletion override local retention;
- idempotent, retryable, observable cleanup workers and content-free security audit evidence.

## 2. Approved Product Rules

### 2.1 Text retention

- Text messages are stored indefinitely on the server by default.
- Operations may change the default server retention period.
- A message snapshots the active policy when it is sent. Later policy changes affect only new messages.
- Applying a new retention policy to historical messages is a separate destructive operation with a count preview, explicit second confirmation, and an audit log.
- Ordinary server-retention expiry removes the server copy but does not force deletion of an otherwise valid local encrypted copy.

### 2.2 Image and video retention

- Images and videos expire on the server three days after successful message creation by default.
- The default duration is configurable in the operations backend.
- On expiry, the original object, thumbnail, storage keys, and access URLs are deleted or cleared.
- The message position remains in the conversation.
- A user without a local copy sees `Image expired` or `Video expired` through i18n.
- If the current device still has an opened-media copy in its encrypted cache, the user may continue to open it.
- Media is cached locally only after the user opens it. Receipt of a message does not create a permanent automatic download.
- Users can inspect and clear local chat-cache usage.

### 2.3 Recall

- Only the original sender may recall a message.
- Recall is allowed for 180 seconds after the authoritative server creation time.
- After 180 seconds, the backend rejects recall even if a client clock or UI still offers the action.
- Ordinary recall deletes the message content and all attached media from the server and every related frontend, then leaves a content-free `Message recalled` placeholder.
- Eligible members may choose traceless recall. It deletes the entire visible message with no participant-visible placeholder.
- Operations configures which membership levels may use traceless recall.
- The default eligible set is all paid membership levels.
- The backend checks the current customer membership level and operations policy at recall time. Frontend labels are never authoritative.
- Traceless recall keeps only a non-content security audit record containing the message ID, actor ID, recall time, and recall mode.
- A repeated recall request is idempotent and cannot restore content or create duplicate participant events.

### 2.4 Group privacy mode

- Privacy mode is available only for `GROUP` conversations.
- A group may have only two participants; a two-person group is still eligible.
- A normal `DIRECT` conversation cannot enable disappearing messages.
- Group owners and group administrators may change group privacy settings.
- Privacy mode applies only to messages sent after the setting becomes effective.
- A privacy message snapshots its expiry time when sent. Later group-setting changes do not modify existing messages.
- The countdown always starts from successful server creation time.
- The `read_by_all` countdown option is removed from types, APIs, UI, tests, and legacy compatibility mapping.
- At expiry, the message content, media, reactions, and visible message row are removed from the server and all participant frontends.
- Privacy expiry is stronger than ordinary local caching. The content must be removed from memory, IndexedDB, browser caches, and active object URLs.

## 3. Chosen Architecture

Use explicit lifecycle columns, normalized message-media records, versioned IM policy, and durable deletion-sync records.

Do not store searchable expiry or recall state only inside `Message.metadata`. JSON-only lifecycle state would make due-row scans, indexing, optimistic concurrency, validation, and cleanup audits unreliable.

Do not create an independent IM microservice in this increment. Keep the current Express/Prisma service boundary while defining repository and worker ports that can move to a dedicated realtime service later.

## 4. Data Model

Exact Prisma names may be adjusted to existing naming conventions, but the contracts below are required.

### 4.1 `Conversation`

Add:

- `privacyModeEnabled Boolean @default(false)`
- `disappearingTtlSeconds Int?`
- `privacyPolicyVersion Int @default(0)`
- `privacyUpdatedAt DateTime?`
- `privacyUpdatedByUserId Int?`

Constraints enforced by service validation:

- `DIRECT` conversations always have privacy disabled and no TTL.
- Enabled group privacy requires a bounded positive TTL.
- Only owner/admin participants may mutate group privacy.

The TTL is stored as seconds. The API may accept structured months/days/hours/minutes for compatibility, but the backend normalizes and validates it before persistence.

### 4.2 `Message`

Add:

- `expiresAt DateTime?`
- `expiredAt DateTime?`
- `recallDeadlineAt DateTime`
- `recalledAt DateTime?`
- `recallMode String?` with `standard` or `traceless`
- `contentPurgedAt DateTime?`
- `lifecycleVersion Int @default(0)`

Indexes:

- `(expiresAt, expiredAt, deletedAt)` for worker scans;
- `(conversationId, id, deletedAt)` remains the history cursor index;
- `(senderUserId, recallDeadlineAt)` where supported by the chosen database/index strategy.

Lifecycle meaning:

- Active ordinary message: content available, `deletedAt`, `expiredAt`, and `recalledAt` are null.
- Media-expired message: message remains active, media record is purged, and its media type remains available for placeholder rendering.
- Standard recall: content and original metadata are cleared; the row remains as a content-free recalled placeholder.
- Traceless recall: visible message and content are removed; only a separate minimal audit/sync directive remains.
- Privacy expiry: the message and dependent user content are physically removed after sync directives are recorded. This is an explicit privacy exception to the repository's default soft-delete rule.

### 4.3 `MessageMedia`

Create a normalized relation for formal IM image and video messages:

- `id`
- `messageId`
- `kind` (`image` or `video`)
- `storageKey`
- `thumbnailStorageKey`
- `accessUrl` or resolvable storage reference
- `thumbnailUrl`
- `mimeType`
- `fileSize`
- `width`, `height`, `durationMs`
- `checksumSha256`
- `expiresAt`
- `purgeStartedAt`
- `purgedAt`
- `version`
- `createdAt`, `updatedAt`, `deletedAt`

The database stores internal storage keys as the durable source of truth. Public access URLs are short-lived signed values or derived responses, not permanent bearer secrets.

### 4.4 `ImPolicy`

Store one active versioned policy row:

- `textRetentionSeconds Int?`, where null means indefinite;
- `imageRetentionSeconds Int`, default `259200`;
- `videoRetentionSeconds Int`, default `259200`;
- `recallWindowSeconds Int`, default `180`;
- `tracelessRecallMembershipLevels Json`;
- `version`;
- `updatedByUserId`;
- `createdAt`, `updatedAt`, `deletedAt`.

Policy reads may be cached briefly, but writes must invalidate the cache. Updating the active policy requires an expected version to prevent lost updates.

The first implementation checks the server-side `CustomerProfile.membershipLevel` against the configured allowlist. A membership-entitlement service port isolates this decision so a future formal subscription domain can replace the lookup without changing the IM API.

### 4.5 `ImDeletionSync`

Create a content-free durable mutation feed so offline devices can remove stale local content after reconnecting:

- `id` as the monotonically increasing sync cursor;
- `conversationId`;
- `messageId`;
- `action` (`standard_recall`, `traceless_recall`, `privacy_expired`, `media_expired`, `server_retention_expired`);
- `mediaKind` when needed for an expired placeholder;
- `occurredAt`;
- `createdAt`, `updatedAt`, `deletedAt`.

It must never contain message text, original message metadata, media URLs, storage keys, filenames, or thumbnails.

Participant authorization is resolved from conversation membership when reading the sync feed. Retention of sync directives must cover active devices; device acknowledgements or an account-wide resync rule must prevent an offline device from retaining privacy-deleted content indefinitely.

## 5. API Contracts

All endpoints live under `/api/v1`, use Zod, OpenAPI, the standard response envelope, and server-side RBAC.

### 5.1 Group privacy

`PATCH /im/conversations/:conversationId/privacy`

Request:

```json
{
  "privacyModeEnabled": true,
  "disappearingTtlSeconds": 86400,
  "expectedVersion": 3
}
```

Rules:

- rejects `DIRECT` conversations;
- requires owner/admin membership;
- validates the TTL bounds;
- uses optimistic locking;
- publishes a content-free conversation policy update event;
- does not rewrite expiry values on existing messages.

### 5.2 Recall

`POST /im/conversations/:conversationId/messages/:messageId/recall`

Request:

```json
{
  "mode": "standard"
}
```

or:

```json
{
  "mode": "traceless"
}
```

The backend transaction verifies participant access, sender ownership, the recall deadline, current message state, and traceless entitlement. It purges content and reactions, updates unread/last-message state, writes the deletion-sync directive and minimal audit, and commits once.

### 5.3 Message response

Formal message responses add:

- `expiresAt`;
- `mediaExpiresAt`;
- `recallDeadlineAt`;
- `availableRecallModes`;
- explicit recalled or media-expired representation without original content.

History rules:

- standard recalled rows are returned as placeholders;
- media-expired rows are returned as `image_expired` or `video_expired` views;
- traceless-recalled and privacy-expired messages are absent;
- server-retention-expired content is absent from the server response;
- cursor pagination remains bounded and indexed.

### 5.4 Sync feed

`GET /im/sync?after=<cursor>&pageSize=<bounded>`

Returns only deletion/mutation directives for conversations visible to the authenticated user. The client stores its last applied cursor only after applying every directive in order.

The existing SSE stream carries the same directive immediately. SSE remains a latency layer; the sync endpoint is the recovery source of truth.

### 5.5 Operations policy

- `GET /backoffice/im-policy`
- `PATCH /backoffice/im-policy`
- separate preview/confirm endpoints for an explicitly requested historical-policy application

Permissions:

- `im-policy:read`
- `im-policy:update`
- `im-policy:apply-history`

The operations UI shows the current policy, defaults, effective-from behavior, eligible membership levels, version conflict errors, and destructive-history warnings.

## 6. Realtime and Client State

Events:

- `message.recalled`
- `message.deleted`
- `message.media.expired`
- `conversation.privacy.updated`

Every deletion event contains a durable sync cursor and no original content.

Client behavior:

- Standard recall replaces the message with a recalled placeholder and purges text/media caches.
- Traceless recall removes the message entirely and recomputes the visible conversation summary.
- Privacy expiry removes the message entirely and purges all local representations.
- Media expiry uses the encrypted local copy when available; otherwise it renders the expired placeholder.
- On reconnect, the client fetches the sync feed before treating cached messages as current.
- Events are idempotent. Replaying the same cursor cannot restore or duplicate a message.

The current frontend behavior that locally hides any message sent within three minutes must be removed. The three-minute rule belongs exclusively to the formal recall API.

## 7. Encrypted Local Cache

Use IndexedDB rather than `localStorage` for message pages and binary media.

- Namespace data by authenticated account and device.
- Encrypt message content and opened media with AES-GCM using a non-extractable Web Crypto key.
- Keep the active decryption key out of application memory after logout.
- Preserve encrypted data across logout so a later authenticated session for the same account may restore it.
- Never expose one account's cache to another account on the same browser profile.
- Provide cache usage, clear-cache, and failure/eviction states.
- Revoke object URLs after viewing or when deletion events arrive.
- Delete Cache Storage/service-worker copies if present.
- Treat encryption as at-rest defense, not as protection from same-origin XSS; retain CSP, dependency hygiene, and output escaping.

Normal server-retention expiry may leave a local-only historical copy. The UI must distinguish local-only history when that distinction matters. Recall and privacy expiry always override local retention and delete the local copy.

## 8. Cleanup Workers and Reliability

Separate responsibilities while reusing a common lease/batch pattern:

- message retention worker;
- message-media purge worker;
- privacy expiry worker;
- deletion-sync/outbox dispatcher.

Worker requirements:

- indexed due-row selection;
- bounded batches;
- lease or version-based claims for multi-instance safety;
- idempotent storage deletion;
- safe retry after partial failure;
- transactionally recorded sync/outbox directive before final visibility changes;
- no overlapping run in one process;
- metrics for due, claimed, purged, retried, failed, and oldest-due age;
- structured logs without message content, media URL, token, or storage credential;
- alerts for repeated failures and growing lag.

For media, delete the object and thumbnail idempotently, then clear database access fields and mark the media purged. If database finalization fails after object deletion, retry safely and never recreate the object.

For privacy expiry and traceless recall, clear dependent reactions and read markers as required by foreign keys, recompute conversation summaries/unread state, and physically remove user content. Keep only approved content-free sync and audit evidence.

## 9. Security and Abuse Controls

- Use server time for recall deadlines and expiry calculations.
- Never trust frontend membership, conversation role, or message ownership claims.
- Rate-limit recall, privacy mutation, media upload initiation, and sync polling.
- Enforce actual file signatures, MIME allowlists, size/dimension/duration limits, and malware/moderation hooks.
- Use short-lived signed media access and authorization checks before signing.
- Do not log request bodies for message and media endpoints.
- Audit policy changes, historical-policy application, recall mode, and actor without retaining content.
- Prevent standard users from submitting `traceless` by changing frontend requests.
- Return uniform not-found behavior for messages outside the current user's conversation scope.
- Use idempotency keys or stable mutation identity where retries can cross network boundaries.

## 10. Error Handling

Required stable error keys include:

- `error.im.direct_privacy_not_supported`
- `error.im.privacy_admin_required`
- `error.im.invalid_disappearing_ttl`
- `error.im.message_not_found`
- `error.im.message_not_owned`
- `error.im.recall_window_expired`
- `error.im.traceless_recall_not_entitled`
- `error.im.message_already_deleted`
- `error.im.policy_version_conflict`
- `error.im.media_expired`

Node/Prisma/storage exceptions are mapped to the standard API envelope and are not returned to clients.

## 11. Testing and Acceptance

### 11.1 Backend unit tests

- policy snapshot and exact expiry boundary;
- direct-chat privacy rejection;
- two-person group privacy acceptance;
- owner/admin authorization;
- removal of the read-by-all mode;
- exact 180-second recall boundary using server time;
- standard versus traceless recall state transitions;
- membership allowlist and policy changes;
- worker claim, retry, idempotency, and partial storage failure;
- content-free audit and sync payloads.

### 11.2 Backend integration tests

- migration and indexes;
- message send/history with lifecycle fields;
- recall transactions and concurrent duplicate recall;
- expired media placeholders;
- privacy physical deletion and dependent-row cleanup;
- unread counts and last-message summary after deletion;
- SSE event plus reconnect sync recovery;
- RBAC and cross-conversation isolation;
- operations policy optimistic locking and historical preview safeguards.

### 11.3 Frontend tests

- normal recall replaces content with a placeholder;
- traceless recall removes the row;
- expired media opens an encrypted local copy when present;
- expired media without a local copy shows the correct image/video text;
- privacy deletion removes memory, IndexedDB, cache, and object URL state;
- reconnect applies missed sync directives before showing cached history;
- direct chats have no privacy control;
- two-person groups retain privacy controls;
- no `read_by_all` option remains;
- unavailable recall is disabled after the authoritative deadline;
- three-language i18n coverage.

### 11.4 Manual acceptance

- Test user, technician, and merchant portals against the same formal conversation.
- Verify online two-party and group deletion in separate authenticated sessions.
- Disconnect one participant, recall or expire a privacy message, reconnect, and verify local cleanup.
- Open media before expiry and verify it remains locally viewable after server purge.
- Do not open another media item and verify it becomes an expired placeholder.
- Change eligible membership levels in operations admin and verify the recall choices change after a fresh entitlement check.
- Verify API, database, filesystem/object storage, logs, and frontend state contain no purged content.

## 12. Incremental Delivery

This design must be implemented as small Step 13 microsteps, each passing migration/lint/test/build before the next begins:

1. Lifecycle schema, policy read service, migration, indexes, and policy tests.
2. Server-enforced standard/traceless recall API, audit, sync directives, and frontend recall adapter.
3. Group-only privacy settings and send-time expiry snapshots; remove `read_by_all` everywhere.
4. Privacy expiry worker, durable reconnect sync, and frontend local purge behavior.
5. Formal image/video upload and `MessageMedia` lifecycle with three-day purge and expired placeholders.
6. Encrypted IndexedDB message/opened-media cache, account isolation, quota UI, and clear-cache controls.
7. Operations IM policy UI, membership-level configuration, historical-policy preview/apply flow.
8. Cross-session acceptance, failure injection, monitoring, documentation, and final full-repository verification.

No microstep may add a mock, silently claim an unavailable storage path, or skip its acceptance gate.

## 13. Explicit Non-goals

- Private/direct-chat disappearing timers.
- Read-by-all countdown mode.
- Full membership billing or payment settlement.
- Full independent IM service extraction.
- Redesigning the existing IM visual system.
- Retaining recalled or privacy-expired content for moderation.
- Applying new policy values retroactively without a separate confirmed operation.
