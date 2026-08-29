# Realtime IM / Social / Notification

Step 13 adds the first production backend slice for IM, Social, and Notifications without changing the existing IM/Social UI.

## Data Model

New tables:

- `conversations`: direct or group conversation shell.
- `conversation_participants`: membership, role, `unread_count`, last-read marker, per-user pin/mute preferences, and personal list hiding.
- `messages`: durable message history with cursor pagination by message id.
- `contacts`: user-to-user contact rows with owner-scoped `blocked_at` state.
- `friend_requests`: pending, accepted, and rejected friend requests.
- `social_posts`: basic text/media social posts with `public` or `followers` visibility.
- `follows`: user follow graph.
- `notifications`: durable notification inbox with `read_at`.

All tables include `id`, `created_at`, `updated_at`, and `deleted_at`. Reads filter soft-deleted rows.

## REST API

All endpoints live under `/api/v1`, use JSON, require Bearer auth, and are protected by RBAC permissions.

IM:

- `GET /im/conversations`
- `POST /im/conversations`
- `GET /im/conversations/:conversationId/messages?pageSize=20&beforeId=123`
- `POST /im/conversations/:conversationId/messages`
- `POST /im/conversations/:conversationId/read`
- `POST /im/conversations/:conversationId/unread`
- `PATCH /im/conversations/:conversationId/preferences`
- `DELETE /im/conversations/:conversationId`
- `GET /im/contacts`
- `POST /im/contacts/:contactId/block`
- `DELETE /im/contacts/:contactId/block`
- `GET /im/friend-requests`
- `POST /im/friend-requests`
- `POST /im/friend-requests/:id/accept`
- `POST /im/friend-requests/:id/reject`

Social:

- `GET /social/posts`
- `GET /social/posts/:id`
- `POST /social/media?fileName=photo.png`（JPEG/PNG/WebP 原始字节，单张最多 8 MiB，需要 `social-post:create`）
- `POST /social/posts`
- `PATCH /social/posts/:id`（仅作者本人；沿用 `social-post:create` 权限）
- `POST /social/follows`
- `DELETE /social/follows/:targetUserId`

Notifications and realtime:

- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `GET /realtime/unread-counts`
- `GET /realtime/events`

Messages use cursor pagination through `beforeId`. The first page returns newest messages. If `nextCursor` is present, pass it as the next `beforeId`.

## Unread Counts

Message unread counts are stored on `conversation_participants.unread_count`. Sending a message increments other active participants in one update and resets the sender. Marking a conversation read or unread changes only the current participant. Pin and mute are also participant preferences. Deleting a conversation sets `hidden_at` only for the current participant; it does not delete shared membership or messages, and a new message makes the conversation visible again. Clearing a conversation advances only that participant's `cleared_through_message_id`. Deleting one message writes a viewer-scoped `message_user_deletions` tombstone; message history and conversation previews exclude that tombstone only for the deleting user while the shared message remains available to other participants. Notification unread counts come from `notifications.read_at IS NULL`. Friend request unread counts come from pending incoming requests.

## Order Status Notifications

Booking state transitions call the Step 13 notification service after a successful transition. The first slice writes an `order_status` notification for the customer when a service provider confirms, starts, completes, or cancels an order. This keeps Booking state-machine logic separate from the notification repository while still producing a durable notification event.

## SSE Events

`GET /realtime/events` opens a Server-Sent Events stream for the authenticated user. The stream:

- sends a `connected` event immediately;
- includes `retry: 5000` so clients reconnect after 5 seconds;
- sends heartbeat comments every 25 seconds;
- delivers message, friend request, follow, notification-read, and order-status events to local SSE subscribers;
- publishes one directed envelope to the configured Redis channel so recipients connected to another backend instance receive the same event;
- does not write an extra database row for each realtime delivery.

Durable facts remain in MySQL. The SSE gateway is a delivery layer, so reconnecting clients should refresh `/realtime/unread-counts`, `/notifications`, and the relevant conversation/message page.

Every event includes an SSE `id:` field. The authenticated frontend stream sends `Last-Event-ID` when reconnecting, then refreshes durable REST resources. Redis Pub/Sub does not claim durable event replay; REST refresh from MySQL remains the recovery source of truth.

Each backend process owns one Redis channel subscription and one dedicated publisher connection, independent of the number of connected users. A process still delivers to its own SSE clients when Redis publication is temporarily unavailable. Cross-instance envelopes are size-bounded, schema-checked, addressed to one authenticated user id, and deduplicated on the publishing instance. Slow SSE responses are closed when Node reports backpressure instead of accumulating an unbounded application buffer.

If the process-wide Redis subscription cannot be established, the gateway retries only that one subscription with bounded exponential delays from 5 to 30 seconds. This retry is independent of the number of users and does not query MySQL or create browser polling.

Creating a social post publishes `social.post.created` to the author and current followers. When `mentionUserIds` contains valid owner-scoped, unblocked contacts, the same database transaction creates durable Social notifications and the service publishes `notification.created` only after commit. Public discovery by users who do not follow the author remains REST-paginated and does not require global event fan-out.

## High-Frequency Event Boundary

The database stores durable messages, social posts, requests, follows, and notifications. Redis Pub/Sub carries only transient delivery envelopes; it creates no per-event database write and no per-user Redis subscription. Message unread counts are denormalized on participant rows, avoiding per-message per-recipient notification rows and avoiding N+1 unread-count queries on conversation lists.

## Frontend Runtime Boundary

Formal authenticated sessions use the typed adapter in `src/features/realtime/api.ts` for IM, Social, notifications, unread counts, and SSE. All consumers in one visible browser tab share one authenticated SSE connection; hidden tabs release it and reconnect with a single durable-resource refresh when visible again.

`REALTIME_REDIS_CHANNEL` selects the internal Redis Pub/Sub channel and defaults to `needo:realtime:events:v1`. Use the same value for every backend instance in one deployment and a different value between isolated environments.

Legacy IM/Social pages and browser databases remain available only to an explicit static-demo build with a frontend-bypass session. Formal IM uses persisted APIs for conversations, messages, reactions, read/unread state, pin/mute preferences, personal deletion, and owner-scoped contact block/unblock state. Blocking requires `contact:block`, can modify only the authenticated user's own contact row, and emits `contact.updated`. Other unsupported legacy mutations still reject with `error.feature_unavailable`, so unrelated components cannot silently persist fake business state.

For a formal merchant identity, the organization directory is hydrated separately from the paginated `GET /api/v1/merchant-admin/technicians?status=published` source. It uses the shop-scoped persisted technician profile, account, and avatar fields and does not create or imply a reciprocal IM contact relationship.

The current production slice supports text IM, conversation image upload, conversation list preferences, persisted contact blocking, merchant technician organization contacts, Social text posts, and audited Social JPEG/PNG/WebP image upload. Social create requests may carry up to 50 `mentionUserIds`; every id must still be an active contact owned by the authenticated user, and the post, image bindings, mention notifications, and audit record commit atomically. The composer loads its reminder candidates only from paginated formal contacts, keeps failed image previews retryable, and shares the chat-style glass fullscreen header. Social video upload, cross-device drafts, reply/like/repost/quote/bookmark state, relationship lists, other organization directory types, contact tags, service accounts, and advanced group settings remain capability-gated until their database, storage, RBAC, moderation, and audit contracts are implemented.
