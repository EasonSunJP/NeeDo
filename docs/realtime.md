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
- `POST /social/posts`
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

Message unread counts are stored on `conversation_participants.unread_count`. Sending a message increments other active participants in one update and resets the sender. Marking a conversation read or unread changes only the current participant. Pin and mute are also participant preferences. Deleting a conversation sets `hidden_at` only for the current participant; it does not delete shared membership or messages, and a new message makes the conversation visible again. Notification unread counts come from `notifications.read_at IS NULL`. Friend request unread counts come from pending incoming requests.

## Order Status Notifications

Booking state transitions call the Step 13 notification service after a successful transition. The first slice writes an `order_status` notification for the customer when a service provider confirms, starts, completes, or cancels an order. This keeps Booking state-machine logic separate from the notification repository while still producing a durable notification event.

## SSE Events

`GET /realtime/events` opens a Server-Sent Events stream for the authenticated user. The stream:

- sends a `connected` event immediately;
- includes `retry: 5000` so clients reconnect after 5 seconds;
- sends heartbeat comments every 25 seconds;
- publishes message, friend request, follow, notification-read, and order-status events to in-memory subscribers;
- does not write an extra database row for each realtime delivery.

Durable facts remain in MySQL. The SSE gateway is a delivery layer, so reconnecting clients should refresh `/realtime/unread-counts`, `/notifications`, and the relevant conversation/message page.

Every event includes an SSE `id:` field. The authenticated frontend stream sends `Last-Event-ID` when reconnecting, then refreshes durable REST resources. The current in-memory gateway does not claim durable event replay; REST refresh is the recovery source of truth.

Creating a social post publishes `social.post.created` to the author and current followers. Public discovery by users who do not follow the author remains REST-paginated and does not require global event fan-out.

## High-Frequency Event Boundary

The database stores durable messages, social posts, requests, follows, and notifications. The realtime gateway only fans out in-memory SSE events. Message unread counts are denormalized on participant rows, avoiding per-message per-recipient notification rows and avoiding N+1 unread-count queries on conversation lists.

## Frontend Runtime Boundary

Formal authenticated sessions use the typed adapter in `src/features/realtime/api.ts` for IM, Social, notifications, unread counts, and SSE. The global unread-count provider owns one application-level SSE connection for navigation and pet badges.

Legacy IM/Social pages and browser databases remain available only to an explicit static-demo build with a frontend-bypass session. Formal IM uses persisted APIs for conversations, messages, reactions, read/unread state, pin/mute preferences, personal deletion, and owner-scoped contact block/unblock state. Blocking requires `contact:block`, can modify only the authenticated user's own contact row, and emits `contact.updated`. Other unsupported legacy mutations still reject with `error.feature_unavailable`, so unrelated components cannot silently persist fake business state.

For a formal merchant identity, the organization directory is hydrated separately from the paginated `GET /api/v1/merchant-admin/technicians?status=published` source. It uses the shop-scoped persisted technician profile, account, and avatar fields and does not create or imply a reciprocal IM contact relationship.

The first production slice supports text IM, conversation list preferences, persisted contact blocking, merchant technician organization contacts, and basic text Social posts. File/media upload, cross-device drafts, reply/like/repost/quote/bookmark state, relationship lists, other organization directory types, contact tags, service accounts, and advanced group settings remain capability-gated until their database, storage, RBAC, moderation, and audit contracts are implemented.
