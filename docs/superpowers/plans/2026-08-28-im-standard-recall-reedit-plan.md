# NeeDo IM Standard Recall Residue and Re-edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless the user explicitly requests them.

**Goal:** Make standard IM recall server-authoritative and persistent, show the correct residue to each side, restore recalled text into the sender composer, retain the residue after re-send, and reject recall after three minutes with the exact prompt.

**Architecture:** Extend the existing formal `Route → Controller → Service → Repository → Prisma` IM path with one standard-recall mutation over the lifecycle columns already present in the schema. Map the content-free terminal message through the formal realtime adapter and store, preserve tombstones against stale history/SSE races, and restore the sender's pre-request text only from local memory after confirmed server success.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma/MySQL, Jest/Supertest, SSE, existing NeeDo i18n.

## Global Constraints

- Work only in Step 13 IM; do not change Social, Notification, Booking, NDP, or unrelated admin work.
- Do not add a mock, demo, fake API, second IM page, or browser-only recall success.
- Server time and persisted `recallDeadlineAt` are authoritative; the window remains exactly 180 seconds.
- Standard recall responses/events contain no original text or media identifiers.
- Sender copy is `你撤回了一条消息`; recipient copy is `对方撤回了一条消息`.
- Confirmed text recall restores the sender's pre-request text and focuses the caret at the end.
- Re-send creates a new message and never removes the old recall residue.
- Expired recall shows `发送超过3分钟后无法撤回` and mutates no message, pin, reaction, or composer state.
- New copy must exist in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean.
- Use `apply_patch`, preserve unrelated work, and commit each independently testable task.

---

## File Map

- `backend/src/repositories/realtime.repository.ts`: lifecycle payload fields and atomic standard-recall transaction.
- `backend/src/services/realtime.service.ts`: stable errors and content-free participant events.
- `backend/src/validators/realtime.validator.ts`, `backend/src/controllers/realtime.controller.ts`, `backend/src/routes/realtime.routes.ts`: Zod/controller/protected route.
- `backend/src/constants/permissions.constants.ts`, `backend/src/api/openapi.ts`: RBAC and formal contract.
- `src/features/realtime/api.ts`, `src/features/im/formal-api.ts`: transport and strict mapping.
- `src/features/im/model.ts`, `src/features/im/store.ts`: terminal types and tombstone-preserving state.
- `src/features/im/pages.tsx`, `src/features/im/components.tsx`: recall action, notice, composer restoration, and exact residue copy.
- `src/i18n/translations.ts`: five-language copy.
- Corresponding `*.test.ts` files: RED→GREEN coverage.
- `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`: verified completion evidence.

### Task 1: Add the server-authoritative standard recall mutation

**Files:**
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/im-standard-recall.repository.test.ts`
- Test: `backend/tests/realtime-service.test.ts`
- Test: `backend/tests/realtime-api.test.ts`

**Interfaces:**
- Consumes: existing `Message` recall fields, `ImDeletionSync`, `AuditLog`, and reactions.
- Produces: `RealtimeService.recallMessage(auth, { conversationId, messageId, mode: "standard" })` and `POST /api/v1/im/conversations/:conversationId/messages/:messageId/recall`.

- [ ] **Step 1: Write failing service tests**

Add success, timeout, scope, and idempotency cases:

```ts
repository.recallMessage.mockResolvedValue({ status: "recalled", message: recalledMessage });

await expect(service.recallMessage(auth, {
  conversationId: 91,
  messageId: 700,
  mode: "standard",
})).resolves.toEqual({
  action: "standard_recall",
  conversationId: 91,
  messageId: 700,
  message: recalledMessage,
});

expect(recalledMessage.content).toBeNull();
expect(recalledMessage.metadata).toBeNull();
expect(eventGateway.publish).toHaveBeenCalledTimes(2);
```

`window_expired` must reject with `error.im.recall_window_expired`; `not_found` must use the safe message not-found error; `already_recalled` must return the same tombstone without publishing a duplicate event.

- [ ] **Step 2: Run service RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/realtime-service.test.ts
```

Expected: FAIL because the repository and service recall methods do not exist.

- [ ] **Step 3: Write the failing HTTP contract test**

```ts
await request(app)
  .post("/api/v1/im/conversations/91/messages/700/recall")
  .set("Authorization", `Bearer ${accessToken}`)
  .send({ mode: "standard" })
  .expect(200)
  .expect(({ body }) => {
    expect(body.data.action).toBe("standard_recall");
    expect(body.data.message.content).toBeNull();
  });
```

Also assert permission `message:recall`, positive numeric IDs, rejection of unsupported modes, and the standard error envelope.

- [ ] **Step 4: Run HTTP RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/realtime-api.test.ts
```

Expected: FAIL with HTTP 404 because the route is absent.

- [ ] **Step 5: Add lifecycle fields and repository result types**

```ts
export type MessageRecallModePayload = "standard" | "traceless";

export interface MessagePayload {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  type: MessageTypePayload;
  content: string | null;
  metadata: unknown;
  reactions: MessageReactionSummaryPayload[];
  createdAt: Date;
  recallDeadlineAt: Date;
  recalledAt: Date | null;
  recallMode: MessageRecallModePayload | null;
  contentPurgedAt: Date | null;
  lifecycleVersion: number;
  availableRecallModes: MessageRecallModePayload[];
}

export type StandardRecallRepositoryOutcome =
  | { status: "recalled" | "already_recalled"; message: MessagePayload }
  | { status: "not_found" | "window_expired" };
```

`mapMessage(message, viewerUserId, now)` returns `availableRecallModes: ["standard"]` only for the sender's active row while `now <= recallDeadlineAt`; recalled or expired rows return `[]`.

- [ ] **Step 6: Implement the atomic repository mutation**

First create `backend/tests/im-standard-recall.repository.test.ts` with a transaction-capable Prisma test double. The RED cases must prove: content/metadata become null; active reactions are soft-deleted; exactly one `STANDARD_RECALL` sync directive and one content-free audit row are written; history mapping returns the recalled row; a second call is idempotent; `now` one millisecond after `recallDeadlineAt` returns `window_expired` without writes; a different sender returns `not_found`.

Run the repository RED test:

```bash
npm --prefix backend test -- --runTestsByPath tests/im-standard-recall.repository.test.ts
```

Expected: FAIL because `RealtimeRepository.recallMessage` does not exist.

Then implement the transaction. Start with a sender-and-participant-scoped lookup:

Start the transaction with a sender-and-participant-scoped lookup:

```ts
const candidate = await tx.message.findFirst({
  where: {
    id: input.messageId,
    conversationId: input.conversationId,
    senderUserId: input.senderUserId,
    deletedAt: null,
    conversation: {
      deletedAt: null,
      participants: { some: { userId: input.senderUserId, deletedAt: null } },
    },
  },
  include: messageInclude,
});

if (!candidate) return { status: "not_found" } as const;
if (candidate.recalledAt || candidate.recallMode) {
  return { status: "already_recalled", message: this.mapMessage(candidate, input.senderUserId, input.now) } as const;
}
if (input.now.getTime() > candidate.recallDeadlineAt.getTime()) {
  return { status: "window_expired" } as const;
}
```

Conditionally update only the still-active row: clear `content` and `metadata`, set `recalledAt`, `recallMode: STANDARD_RECALL`, `contentPurgedAt`, and increment `lifecycleVersion`. Soft-delete active reactions, upsert the unique `ImDeletionSync` `STANDARD_RECALL` directive, create one content-free `AuditLog` action `im.message.standard_recall`, and update the conversation timestamp. A lost concurrent update must be refetched and classified without restoring content.

- [ ] **Step 7: Add Zod, controller, route, RBAC, and OpenAPI**

```ts
export const messageRecallParamSchema = conversationIdParamSchema.extend({
  messageId: z.coerce.number().int().positive(),
});

export const messageRecallBodySchema = z.object({ mode: z.literal("standard") });
```

Register the protected route with `message:recall`. Assign that permission to existing roles that already have formal message creation. The controller only parses and passes values. The service supplies `now: new Date()`, maps stable errors, and publishes `message.recalled` only for the first mutation; its payload is the content-free mapped message.

- [ ] **Step 8: Run backend GREEN and build**

```bash
npm --prefix backend test -- --runTestsByPath tests/realtime-service.test.ts tests/realtime-api.test.ts
npm --prefix backend test -- --runTestsByPath tests/im-standard-recall.repository.test.ts
npm --prefix backend run build
```

Expected: both suites PASS and the strict backend build exits 0.

- [ ] **Step 9: Commit Task 1**

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/validators/realtime.validator.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/im-standard-recall.repository.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts
git commit -m "feat: persist standard IM recall"
```

### Task 2: Carry terminal recall through the formal client and store

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`
- Test: `src/features/realtime/api.test.ts`
- Test: `src/features/im/formal-api.test.ts`
- Test: `src/features/im/store.test.ts`

**Interfaces:**
- Consumes: backend content-free message and `message.recalled` SSE event.
- Produces: `store.recallMessage(conversationId, messageId, "standard")` and tombstone-preserving merges.

- [ ] **Step 1: Write failing transport and mapping tests**

```ts
await realtimeApi.recallMessage(91, 700, "standard");
expect(httpClient.request).toHaveBeenCalledWith(
  "/im/conversations/91/messages/700/recall",
  { body: { mode: "standard" }, method: "POST" },
);
```

Map a recalled response to:

```ts
expect(toConversationMessage(recalledRealtimeMessage)).toMatchObject({
  id: "700",
  type: "recalled",
  content: "",
  status: "recalled",
  serverState: "recalled",
  availableRecallModes: [],
});
```

Reject a standard response without a tombstone as `error.response.invalid_recall_result`, map `message.recalled` SSE, and sanitize recalled plaintext to empty content.

- [ ] **Step 2: Run adapter RED**

```bash
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts
```

Expected: FAIL because transport and formal recall mapping are absent.

- [ ] **Step 3: Write failing store terminal tests**

Prove confirmed recall upserts a single tombstone, a later stale active history page cannot overwrite it, duplicate SSE leaves one residue, and route reload from formal history stays recalled.

```ts
await store.recallMessage("91", "700", "standard");
expect(store.messagesByConversation["91"][0]).toMatchObject({
  id: "700",
  type: "recalled",
  content: "",
  serverState: "recalled",
});
```

- [ ] **Step 4: Run store RED**

```bash
npm test -- src/features/im/store.test.ts
```

Expected: FAIL because the store uses the legacy one-argument recall and blind replacement.

- [ ] **Step 5: Implement formal types and transport**

```ts
export type ImMessageServerState = "active" | "recalled";
export type ImRecallMode = "standard";

export type ImRecallMessageResult = {
  conversationId: string;
  messageId: string;
  message: ConversationMessage;
  mode: "standard";
};
```

Extend `RealtimeMessage` with lifecycle fields and `availableRecallModes`, add `RealtimeRecallResult`, and add `realtimeApi.recallMessage`. Formal mapping always converts a recalled row to empty content, recalled status/type/state, and zero modes.

- [ ] **Step 6: Implement store mutation and terminal precedence**

Unify legacy/formal API signatures as `(conversationId, messageId, mode)`. The legacy adapter remains static-demo only and may ignore `conversationId`. Add:

```ts
function preferTerminalMessage(current: ConversationMessage | undefined, incoming: ConversationMessage) {
  if (current?.serverState === "recalled" && incoming.serverState !== "recalled") return current;
  return incoming;
}
```

Use it in direct upserts, reset history merges, and typed formal SSE updates. Formal `store.recallMessage` awaits success, upserts the tombstone, emits once, and returns the result to the page.

- [ ] **Step 7: Run client GREEN and typecheck**

```bash
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts
npm run lint
```

Expected: all named suites PASS and strict TypeScript exits 0.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/features/realtime/api.ts src/features/im/model.ts src/features/im/api.ts src/features/im/formal-api.ts src/features/im/store.ts src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts
git commit -m "fix: retain formal IM recall tombstones"
```

### Task 3: Add exact residue copy, automatic re-edit, and timeout prompt

**Files:**
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/model.ts`
- Modify: `src/i18n/translations.ts`
- Test: `src/features/im/pages.test.ts`
- Test: `src/features/im/model.test.ts`
- Test: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: formal deadline/modes and `store.recallMessage` from Task 2.
- Produces: exact residue labels, exact timeout notice, and confirmed-success composer restoration.

- [ ] **Step 1: Write failing pure behavior tests**

```ts
expect(getStandardRecallAvailability(ownMessage, currentUserId, deadline - 1)).toBe("available");
expect(getStandardRecallAvailability(ownMessage, currentUserId, deadline + 1)).toBe("expired");
expect(getRecallResidueLabel(true)).toBe("你撤回了一条消息");
expect(getRecallResidueLabel(false)).toBe("对方撤回了一条消息");
```

Return `unavailable` for another sender, failed/system/recalled messages, or no formal standard mode.

- [ ] **Step 2: Run behavior RED**

```bash
npm test -- src/features/im/model.test.ts
```

Expected: FAIL because these helpers do not exist.

- [ ] **Step 3: Write failing room integration tests**

Assert that room source no longer uses `messageRecallTraceThresholdMs` or recall-time `hiddenMessageIds`, calls `store.recallMessage(message.conversationId, message.id, "standard")`, restores captured text only in `.then`, persists it with `store.setDraft`, focuses the textarea, sets the caret to the end, and maps `error.im.recall_window_expired` to the exact prompt.

- [ ] **Step 4: Run room RED**

```bash
npm test -- src/features/im/pages.test.ts
```

Expected: FAIL because quick recall still performs local hiding.

- [ ] **Step 5: Implement labels and translations**

```tsx
const label = message.type === "recalled"
  ? getRecallResidueLabel(isMine)
  : message.content;
```

Add non-empty translations for `你撤回了一条消息`, `对方撤回了一条消息`, `发送超过3分钟后无法撤回`, and `撤回失败，请稍后重试` in all five languages.

- [ ] **Step 6: Implement confirmed-success composer restoration**

```ts
const originalContent = message.type === "text" ? message.content : "";
setRecallPending(true);
setActionNotice(null);

void store.recallMessage(message.conversationId, message.id, "standard")
  .then(() => {
    setPinnedMessageIds((current) => current.filter((id) => id !== message.id));
    closeMessageMenu();
    if (!originalContent) return;
    setDraft(originalContent);
    store.setDraft(conversationId, originalContent);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(originalContent.length, originalContent.length);
    });
  })
  .catch((error) => setActionNotice(formatRecallError(error)))
  .finally(() => setRecallPending(false));
```

Known expiry shows the exact notice without a mutation; the backend boundary-race error uses the same notice. Render `actionNotice` in the existing inline notice area with `aria-live="assertive"` and clear it after 2.6 seconds.

- [ ] **Step 7: Run UI GREEN, i18n audit, and typecheck**

```bash
npm test -- src/features/im/model.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
npm run i18n:audit
npm run lint
```

Expected: all named tests PASS, i18n reports no missing new keys, and strict TypeScript exits 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/features/im/pages.tsx src/features/im/components.tsx src/features/im/model.ts src/i18n/translations.ts src/features/im/pages.test.ts src/features/im/model.test.ts src/i18n/translations.test.ts
git commit -m "fix: restore recalled text for re-editing"
```

### Task 4: Verify regression safety and formal acceptance

**Files:**
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Verify: all Task 1-3 files

**Interfaces:**
- Consumes: completed backend, formal adapter/store, and UI behavior.
- Produces: current automated and browser acceptance evidence.

- [ ] **Step 1: Run focused regression suites**

```bash
npm --prefix backend test -- --runTestsByPath tests/realtime-service.test.ts tests/realtime-api.test.ts
npm --prefix backend test -- --runTestsByPath tests/im-standard-recall.repository.test.ts
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/model.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
```

Expected: every named suite PASS with no unhandled rejection.

- [ ] **Step 2: Run project gates**

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm run lint
npm run build -- --mode formal
git diff --check
```

Expected: all commands exit 0. If the formal build guard detects local bypass variables, use the documented formal empty-variable command without changing tracked configuration.

- [ ] **Step 3: Run two-session browser acceptance when runtime authorization is available**

Verify in separate authenticated sessions: send/recall within three minutes; exact sender/recipient residues; sender text/focus/caret; edit and re-send while the old residue remains; clear draft while residue remains; leave/re-enter/refresh without revival; expired recall shows the exact prompt and leaves the message unchanged.

If the runtime, account authorization, or second session is unavailable, report browser acceptance as pending rather than treating automated tests as page acceptance.

- [ ] **Step 4: Update Step 13 evidence**

Add a dated bullet with the formal endpoint, permanent residue, composer restoration, timeout prompt, automated results, and explicit browser-acceptance status.

- [ ] **Step 5: Commit documentation evidence**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs: record formal IM recall acceptance"
```

- [ ] **Step 6: Final status check**

```bash
git status --short --branch
git log -5 --oneline
```

Expected: no uncommitted task files. The handoff lists changed files, endpoint, schema/migration status (`none`), commands/results, passed items, and any browser/runtime limitation without claiming deployment, push, or merge.
