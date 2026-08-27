# NeeDo IM Standard Recall Residue and Re-edit Design

**Date:** 2026-08-28  
**Status:** Approved design  
**Scope:** One Step 13 microstep for standard message recall in the existing formal IM UI and API. Traceless recall, retention policy, media lifecycle, and unrelated chat redesign are out of scope.

## 1. Goal

Make standard recall persistent, truthful, and convenient to edit again:

- a successful recall is committed by the formal backend and cannot reappear after leaving, refreshing, reconnecting, or reopening the conversation;
- the sender sees `你撤回了一条消息`;
- other participants see `对方撤回了一条消息`;
- the sender's original text returns to the composer, is focused, and can be edited and sent as a new message or cleared permanently from the composer;
- sending the edited text creates a new message and never removes the old recall residue;
- selecting recall after the server-authoritative three-minute window shows `发送超过3分钟后无法撤回` and leaves the original message unchanged.

This design refines the standard-recall microstep in `2026-08-26-im-message-lifecycle-retention-recall-design.md`; it does not replace that lifecycle design.

## 2. Current Root Cause

The current formal conversation page treats a message sent within three minutes as a local quick recall. It adds the message ID to component-local `hiddenMessageIds` and returns without calling the formal recall API. Leaving the route destroys that temporary state, and the next history load returns the still-active server message, so the message appears to revive.

The current formal IM adapter also exposes recall as unavailable on this branch. A separate IM lifecycle branch contains a server-backed recall path, but the required behavior must be integrated and verified against the current branch rather than replacing the UI with another implementation.

## 3. Chosen Approach

Use server-authoritative standard recall with local-only composer restoration.

1. The conversation page captures the visible original text before submitting recall.
2. Every standard recall calls the formal `/api/v1/im/conversations/:conversationId/messages/:messageId/recall` endpoint. No successful state is produced by `hiddenMessageIds`.
3. The backend verifies participant access, sender ownership, active message state, and the authoritative recall deadline in one transaction.
4. On success, the backend purges message content and returns/publishes a content-free recalled representation.
5. The store upserts that recalled representation. History loads and SSE replay the same terminal state.
6. Only the sender client uses the text it captured before the request to replace the composer draft and focus the textarea with the caret at the end. The purged text is not returned by the recall response or SSE event.
7. Sending the composer draft follows the existing send path and creates a new message ID. The recalled row remains unchanged.

This avoids the rejected alternatives:

- optimistic local hiding can revive after reload and can display success when the backend rejects the request;
- deleting the old message and inserting an unrelated system message weakens lifecycle identity, ordering, idempotency, and reconnect synchronization;
- storing recalled plaintext in a backend response merely to support re-editing violates the content-purge contract.

## 4. User Interaction

### 4.1 Successful recall within three minutes

- Recall remains an action only for the current user's active, successfully sent message.
- While the request is pending, duplicate recall submission is blocked.
- After success, the existing message row becomes a centered, content-free residue.
- The sender label is `你撤回了一条消息`.
- Every other participant label is `对方撤回了一条消息`.
- For an editable text message, the sender's original text becomes the current composer draft automatically, the composer receives focus, and the caret moves to the end.
- The sender may edit and send the draft as a new message or clear it. Clearing the composer does not affect the permanent recall residue.
- Non-text messages still become recall residue, but binary content is not inserted into the text composer.

### 4.2 Recall after three minutes

- The backend uses `recallDeadlineAt` and server time as the authority.
- If the client already knows the deadline has passed, selecting recall immediately shows `发送超过3分钟后无法撤回`.
- A request near the boundary is still subject to backend validation. The stable `error.im.recall_window_expired` response maps to the same user-facing prompt.
- The original message, reactions, pinned state, conversation summary, and composer remain unchanged.
- The UI must not display a recalled residue or re-edit draft for a rejected request.

### 4.3 Re-entry, refresh, and re-send

- Reopening or refreshing the conversation loads the recalled row from formal history and cannot restore its content.
- Realtime delivery and reconnect sync apply the same recalled terminal state idempotently.
- Re-sending edited content creates a new ordinary message below the recall residue.
- The old residue never disappears merely because the sender re-sent, cleared the composer, deleted the new message locally, or reopened the conversation.

## 5. State and Data Boundaries

- `hiddenMessageIds` remains a local-delete concern only. It must not implement recall.
- The recalled row is identified by the original message ID and a recalled terminal state.
- Formal history, send responses, bootstrap merges, SSE updates, and reconnect sync must not overwrite a recalled terminal state with older active content.
- Standard recall responses and events contain no original text, attachment URL, thumbnail, storage key, or filename.
- Composer restoration uses the sender's pre-request in-memory message content only. It does not weaken server purge or expose content to other participants.
- Conversation previews use the recalled summary and do not reuse the purged text.

No schema or migration is expected because the existing lifecycle schema already contains the recall deadline and recalled state. If implementation inspection disproves that assumption, schema work must stop and be proposed as a separate microstep.

## 6. Error Handling

- `error.im.recall_window_expired` → `发送超过3分钟后无法撤回`.
- `error.im.message_already_deleted` → show the recalled terminal state after refreshing the message, without restoring content.
- permission, ownership, or conversation-scope failures use the existing safe not-found/forbidden mapping and never alter the local message.
- network or unexpected failures show the existing action error surface and preserve the original message and composer.
- failed recall never removes pinned state or reactions locally.

All new user-facing text must use the existing i18n system in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean.

## 7. Test-first Acceptance

### 7.1 Frontend

- a recallable text message submits the formal recall request rather than adding the message to `hiddenMessageIds`;
- successful recall renders `你撤回了一条消息` for the sender and `对方撤回了一条消息` for another participant;
- successful sender recall places the captured original text in the composer, focuses it, and puts the caret at the end;
- re-sending creates a new message while the old recalled row remains;
- clearing the recalled draft leaves the old recalled row unchanged;
- leaving and reopening the route retains the recall residue and does not restore content;
- a known-expired message shows `发送超过3分钟后无法撤回` and does not mutate message, pin, reaction, or composer state;
- a backend expiry response at the deadline race shows the same prompt and rolls back no state because no optimistic mutation occurred;
- formal adapter and store tests reject malformed recall responses and apply terminal SSE/history updates idempotently;
- all new translation keys are complete.

### 7.2 Backend

- recall succeeds at the allowed boundary and rejects after the exact server-authoritative deadline;
- only the original sender and conversation participant can recall;
- standard recall purges content and returns a content-free placeholder;
- duplicate/concurrent recall is idempotent;
- message history returns the placeholder after recall;
- sender and recipient events contain no original content;
- conversation preview, unread state, pin/reaction cleanup, audit, and sync behavior remain transactionally consistent with the existing lifecycle contract.

### 7.3 Manual acceptance

Using two formal authenticated sessions:

1. Send a unique text message and recall it within three minutes.
2. Confirm the sender residue, recipient residue, automatic composer restoration, focus, and editable text.
3. Edit and send the restored text; confirm the new message appears and the old residue remains.
4. Leave and re-enter the conversation in both sessions; confirm neither side sees the original recalled content.
5. Refresh and reconnect one session; confirm the residue remains and the message does not revive.
6. Select recall on a message older than three minutes; confirm the exact prompt and unchanged original message.

## 8. Non-goals

- Changing the three-minute policy value.
- Redesigning the message action sheet or composer.
- Implementing a second formal IM page.
- Adding mock recall behavior.
- Returning purged content from the backend for re-editing.
- Removing recall residue after a re-send.
- Merging unrelated IM lifecycle, encrypted-cache, Social, Notification, Booking, or NDP work.
