# Realtime IM / Social / Notification

Step 13 adds the first production backend slice for IM, Social, and Notifications without changing the existing IM/Social UI.

## Data Model

New tables:

- `conversations`: direct or group conversation shell.
- `conversation_participants`: membership, role, `unread_count`, and last-read marker.
- `messages`: durable message history with cursor pagination by message id.
- `contacts`: user-to-user contact rows.
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
- `GET /im/contacts`
- `GET /im/friend-requests`
- `POST /im/friend-requests`
- `POST /im/friend-requests/:id/accept`
- `POST /im/friend-requests/:id/reject`

Social:

- `GET /social/posts`
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

Message unread counts are stored on `conversation_participants.unread_count`. Sending a message increments other active participants in one update and resets the sender. Marking a conversation read resets only the current participant. Notification unread counts come from `notifications.read_at IS NULL`. Friend request unread counts come from pending incoming requests.

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

## High-Frequency Event Boundary

The database stores durable messages, social posts, requests, follows, and notifications. The realtime gateway only fans out in-memory SSE events. Message unread counts are denormalized on participant rows, avoiding per-message per-recipient notification rows and avoiding N+1 unread-count queries on conversation lists.
