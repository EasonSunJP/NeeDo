# IM Contact Auto Translation and Language Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-persisted, identity-scoped “聊天内容自动翻译” switch to single-chat contact information, make all supported chat text honor that switch without changing stored message content, and render contact language abilities as normalized full-name pills.

**Architecture:** Store the preference on the current identity's `ConversationParticipant`, reuse the existing conversation-preferences PATCH endpoint, and carry the confirmed value through the formal realtime API into the IM store. Put all user-generated message text behind `data-no-i18n`, then derive translated display parts with a pure helper only when the confirmed conversation preference is enabled. Normalize language labels in a separate pure presentation helper; never rewrite directory/profile data.

**Tech Stack:** React 18, TypeScript, Vitest, Express, Zod, Prisma, MySQL 8, Jest/Supertest, existing NeeDo i18n runtime and `translateText` catalog.

**Approved design:** [`docs/superpowers/specs/2026-08-31-im-contact-auto-translation-and-language-display-design.md`](../specs/2026-08-31-im-contact-auto-translation-and-language-display-design.md)

## Global Constraints

- Preserve the unrelated dirty changes in `src/components/mobile/ContactEventTimeline*` and `src/features/technician-schedule/*`; stage only files named by the current task.
- Keep this as one Step 13 IM micro-step. Do not add a route, permission, event type, localStorage preference, mock path, external translation provider, translation cache table, or group-chat control.
- The default is `false`. The preference belongs to one active identity in one conversation; the other participant and another identity on the same account remain independent.
- Raw `ConversationMessage`, `MessageExt`, server payloads, send/forward/resend/recall/search inputs, and database message rows remain the source of truth. Translation is display-only.
- Use the server response as confirmation. Do not optimistically mutate the toggle. Disable the control while its request is pending and retain the prior confirmed value on failure.
- App interface language remains `zh | zh-Hant | ja | en | ko`. The seven language-ability labels are profile capabilities, not new App locale choices.
- Do not apply the migration to a shared/local formal database or create browser test messages without explicit user approval. Schema-file tests, Prisma Client generation, Prisma validation, isolated automated tests, and builds are allowed.
- Every implementation task starts with a failing test, confirms the intended RED failure, makes the smallest production change, confirms GREEN, and commits only its scoped files.

---

### Task 1: Add the persisted participant preference and migration contract

**Files:**

- Create: `backend/tests/conversation-auto-translate-schema.test.ts`
- Create: `backend/prisma/migrations/20260831120000_conversation_auto_translate_messages/migration.sql`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**

```prisma
model ConversationParticipant {
  autoTranslateMessages Boolean @default(false) @map("auto_translate_messages")
}
```

```sql
ALTER TABLE `conversation_participants`
  ADD COLUMN `auto_translate_messages` BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 1: Write the schema/migration contract test**

Add a focused Jest test that reads `schema.prisma` and the exact migration file and asserts:

```ts
expect(schema).toContain(
  'autoTranslateMessages Boolean @default(false) @map("auto_translate_messages")',
);
expect(migration).toMatch(
  /ALTER TABLE `conversation_participants`[\s\S]*`auto_translate_messages` BOOLEAN NOT NULL DEFAULT FALSE/,
);
expect(migration).not.toMatch(/ALTER TABLE `(messages|contacts|conversations)`/i);
expect(migration).not.toMatch(/UPDATE `(messages|contacts)`/i);
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm --prefix backend test -- conversation-auto-translate-schema.test.ts
```

Expected: FAIL because the Prisma field and migration file do not exist.

- [ ] **Step 3: Add the minimal Prisma field and additive migration**

Add the field beside `isPinned` / `isMuted` in `ConversationParticipant`. Create only the single `ALTER TABLE` statement above. Do not add a data rewrite: MySQL's non-null `DEFAULT FALSE` supplies the existing-row value.

- [ ] **Step 4: Regenerate and validate Prisma artifacts**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend exec -- prisma validate
```

Expected: both commands exit 0. Do not run `prisma migrate deploy` or `prisma migrate dev` against a formal database in this task.

- [ ] **Step 5: Run the contract test to verify GREEN**

Run:

```bash
npm --prefix backend test -- conversation-auto-translate-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit only the schema slice**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260831120000_conversation_auto_translate_messages/migration.sql backend/tests/conversation-auto-translate-schema.test.ts
git commit -m "feat(im): persist auto translation preference"
```

---

### Task 2: Extend the formal backend preference and conversation contracts

**Files:**

- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-repository-identity.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**

```ts
ConversationPayload.autoTranslateMessages: boolean;
UpdateConversationPreferencesInput.autoTranslateMessages?: boolean;
```

The existing endpoint remains:

```text
PATCH /api/v1/im/conversations/:conversationId/preferences
permission: conversation:list
body: at least one of isPinned, isMuted, autoTranslateMessages
```

- [ ] **Step 1: Extend failing validator, identity, payload, and OpenAPI tests**

Update the `realtime-api.test.ts` fixture's participant preference record and defaults to include `autoTranslateMessages: false`. Extend “keeps pin, mute, unread, and deletion state private…” so Mika sends:

```ts
.send({ autoTranslateMessages: true })
```

and receives `autoTranslateMessages: true`, while Aya's conversation payload still contains `autoTranslateMessages: false`. Add requests proving `{}` and `{ autoTranslateMessages: "yes" }` return validation errors.

In `realtime-service.test.ts`, add a test proving the active identity is forwarded unchanged:

```ts
expect(repository.updateConversationPreferences).toHaveBeenCalledWith({
  conversationId: 91,
  userId: 41,
  identityId: 410,
  autoTranslateMessages: true,
});
```

In `realtime-repository-identity.test.ts`, use a minimal Prisma fake to prove the update `where` uses the participant row resolved for identity `410`, sets only `autoTranslateMessages`, clears `hiddenAt`, and does not update the peer identity's participant row.

In `openapi.test.ts`, assert the preferences PATCH request schema exposes a boolean `autoTranslateMessages`, keeps `minProperties: 1`, and the serialized conversation response schema includes the same boolean field.

- [ ] **Step 2: Run the backend contract tests to verify RED**

Run:

```bash
npm --prefix backend test -- realtime-api.test.ts realtime-service.test.ts realtime-repository-identity.test.ts openapi.test.ts
```

Expected: FAIL because validation rejects/strips the new field, payload mapping omits it, and OpenAPI does not describe it.

- [ ] **Step 3: Make the repository and validator changes**

Update `conversationPreferencesBodySchema`:

```ts
export const conversationPreferencesBodySchema = z
  .object({
    isPinned: z.boolean().optional(),
    isMuted: z.boolean().optional(),
    autoTranslateMessages: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.isPinned !== undefined ||
      value.isMuted !== undefined ||
      value.autoTranslateMessages !== undefined,
    { message: "At least one conversation preference is required" },
  );
```

Add the optional input and required payload fields. In `updateConversationPreferences`, add only the conditional Prisma update:

```ts
...(input.autoTranslateMessages === undefined
  ? {}
  : { autoTranslateMessages: input.autoTranslateMessages }),
```

In `mapConversation`, use the active viewer row and default safely:

```ts
autoTranslateMessages: viewer?.autoTranslateMessages ?? false,
```

Do not publish SSE from this update.

- [ ] **Step 4: Update OpenAPI without changing the route/security contract**

Change the PATCH summary to cover participant preferences and add:

```ts
autoTranslateMessages: { type: "boolean", default: false }
```

Add the same required boolean to every formal Conversation response schema location alongside `isPinned` and `isMuted`. Keep bearer security and `conversation:list` route wiring unchanged.

- [ ] **Step 5: Run the focused backend tests to verify GREEN**

Run:

```bash
npm --prefix backend test -- conversation-auto-translate-schema.test.ts realtime-api.test.ts realtime-service.test.ts realtime-repository-identity.test.ts openapi.test.ts
```

Expected: PASS, including per-identity isolation and invalid-body rejection.

- [ ] **Step 6: Commit only the backend contract slice**

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/validators/realtime.validator.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-repository-identity.test.ts backend/tests/openapi.test.ts
git commit -m "feat(im): expose auto translation preference"
```

---

### Task 3: Carry the confirmed preference through the frontend formal API and store

**Files:**

- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/contract.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/store.test.ts`

**Interfaces:**

```ts
Conversation.autoTranslateMessages: boolean;
RealtimeConversation.autoTranslateMessages?: boolean;

setConversationAutoTranslateMessages(
  conversationId: string,
  enabled: boolean,
): Promise<{ conversation: Conversation }>;
```

- [ ] **Step 1: Write failing adapter and store tests**

Extend the formal API preference test so its base transport conversation has `autoTranslateMessages: false`, then assert:

```ts
await expect(
  api.setConversationAutoTranslateMessages("91", true),
).resolves.toMatchObject({
  conversation: { id: "91", autoTranslateMessages: true },
});

expect(updateConversationPreferences).toHaveBeenNthCalledWith(3, 91, {
  autoTranslateMessages: true,
});
```

Add an adapter assertion that an older/missing transport field maps to `false`.

In `store.test.ts`, add a fake API test proving the Store does not alter the current conversation before the promise resolves, then replaces it with the complete returned conversation after success. Add a rejection case proving the previously confirmed value remains unchanged.

- [ ] **Step 2: Run the frontend contract tests to verify RED**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/store.test.ts
```

Expected: FAIL because the transport type, model field, API method, and Store method do not exist.

- [ ] **Step 3: Add the minimal type and mapping changes**

Add `autoTranslateMessages?: boolean` to `RealtimeConversation` and its preference request type. Add required `autoTranslateMessages` to `Conversation`, include `false` in builders/defaults, and map the formal payload in `toConversation`:

```ts
autoTranslateMessages: conversation.autoTranslateMessages ?? false,
```

Audit every literal `Conversation` fixture and builder surfaced by TypeScript; add `false` rather than weakening the model field to optional.

- [ ] **Step 4: Add one formal API method and one server-confirmed Store method**

Implement the formal adapter with the existing PATCH method:

```ts
async setConversationAutoTranslateMessages(conversationId, enabled) {
  const conversation = await realtimeApi.updateConversationPreferences(
    toNumericId(conversationId),
    { autoTranslateMessages: enabled },
  );
  return { conversation: toConversation(conversation, currentUser.id) };
}
```

Implement the Store method with the same confirmed-response pattern as pin/mute:

```ts
async function setConversationAutoTranslateMessages(
  conversationId: string,
  enabled: boolean,
) {
  await hydrateStore();
  const response = await api.setConversationAutoTranslateMessages(
    conversationId,
    enabled,
  );
  upsertConversation(response.conversation);
  emit();
  return response.conversation;
}
```

Expose it through `useStore()`. Do not write localStorage and do not mutate the conversation before the API resolves.

- [ ] **Step 5: Run the focused frontend tests and type-aware build slice**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/store.test.ts
npm run build
```

Expected: tests PASS and TypeScript reports no missing `Conversation` fields. If the repository's formal build gate refuses `npm run build`, record that exact refusal and defer the production build to Task 7's approved command rather than bypassing it.

- [ ] **Step 6: Commit only the frontend plumbing slice**

```bash
git add src/features/realtime/api.ts src/features/im/model.ts src/features/im/contract.ts src/features/im/formal-api.ts src/features/im/store.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts
git commit -m "feat(im): carry auto translation preference"
```

---

### Task 4: Create the pure display translation boundary

**Files:**

- Create: `src/features/im/message-translation.ts`
- Create: `src/features/im/message-translation.test.ts`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/i18n/I18nProvider.test.ts`

**Interfaces:**

```ts
import type { Language } from "../../i18n/translations";
import type { MessageExt } from "./model";
import type { ImMessageRichTextPart } from "./reaction-policy";

export type ImMessageTranslationOptions = {
  enabled: boolean;
  language: Language;
};

export function getImMessageDisplayParts(
  content: string,
  richText: MessageExt["richText"] | undefined,
  options: ImMessageTranslationOptions,
): ImMessageRichTextPart[];

export function getImMessageDisplayText(
  content: string,
  richText: MessageExt["richText"] | undefined,
  options: ImMessageTranslationOptions,
): string;
```

- [ ] **Step 1: Write the pure helper tests first**

Cover these exact contracts:

```ts
expect(getImMessageDisplayText("测试测试", undefined, {
  enabled: false,
  language: "ja",
})).toBe("测试测试");

expect(getImMessageDisplayText("测试测试", undefined, {
  enabled: true,
  language: "ja",
})).toBe("テストテスト");
```

Also cover unknown free text remaining unchanged, whitespace preservation, and rich text such as:

```ts
{
  version: 1,
  parts: [
    { type: "judgement", value: "Done" },
    { type: "text", value: "测试" },
    { type: "judgement", value: "OK" },
  ],
}
```

Expected display parts: judgement parts unchanged and only the text part translated. Expected materialized copy text: `DoneテストOK`.

- [ ] **Step 2: Add failing component/runtime boundary tests**

In `components.action-menu.test.tsx`, render `MessageBubble` with Japanese translation options and assert:

- disabled renders `测试测试`;
- enabled renders `テストテスト`;
- both main text and caption roots are inside `[data-no-i18n]`;
- a mixed judgement message still renders its `Done` / `OK` images and translates only the text segment;
- `ImQuotedMessagePreview` follows the same option for text and media captions.

In `I18nProvider.test.ts`, add a DOM test proving a `data-no-i18n` message node remains `测试测试` after the runtime language is Japanese.

- [ ] **Step 3: Run the new tests to verify RED**

Run:

```bash
npm test -- src/features/im/message-translation.test.ts src/features/im/components.action-menu.test.tsx src/i18n/I18nProvider.test.ts
```

Expected: FAIL because the helper/options do not exist and chat text has no explicit runtime boundary.

- [ ] **Step 4: Implement the pure helper without mutating inputs**

Use `resolveImMessageRichText(content, richText)` as the validator/source of display parts. Return a new array. When disabled, clone parts unchanged; when enabled, call `translateText(part.value, language)` only for `type === "text"`.

`getImMessageDisplayText` must join every derived part's value so structured judgement tokens remain present for existing copy semantics. Do not alter `content`, `richText`, or any message object.

- [ ] **Step 5: Thread options through message rendering**

Add an optional `translation` prop to `MessageBubble`, `ImQuotedMessagePreview`, and the internal `ImRichMessageText`. Default to `{ enabled: false, language: "zh" }` only at the rendering boundary for old call sites.

Use `getImMessageDisplayParts` inside `ImRichMessageText`, and place `data-no-i18n` on the `<p>` that contains all message text. Pass the same option to:

- text and emoji body text;
- image/video captions;
- quoted text;
- quoted media captions.

Do not add `data-no-i18n` to system/recalled UI labels; those remain normal interface copy.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
npm test -- src/features/im/message-translation.test.ts src/features/im/components.action-menu.test.tsx src/i18n/I18nProvider.test.ts
```

Expected: PASS with SVG judgement assets intact and no implicit mutation of disabled text.

- [ ] **Step 7: Commit the pure display boundary**

```bash
git add src/features/im/message-translation.ts src/features/im/message-translation.test.ts src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/i18n/I18nProvider.test.ts
git commit -m "fix(im): isolate message text from runtime i18n"
```

---

### Task 5: Apply the confirmed preference to every in-scope chat display and copy path

**Files:**

- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/chat-home.tsx`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/features/im/chat-home.test.tsx` if it exists; otherwise create it
- Modify: `src/features/im/message-translation.test.ts`

**Interfaces:**

Add a preview helper in `message-translation.ts` only if it avoids duplicating the rule:

```ts
export function getImPreviewDisplayText(
  text: string,
  options: ImMessageTranslationOptions,
): string;
```

Draft text and system/meta labels are excluded by the caller; stored `lastMessagePreview` remains raw.

- [ ] **Step 1: Write failing room, preview, search-row, and copy tests**

Add test coverage proving:

- `ImConversationRoomPage` passes `{ enabled: conversation.autoTranslateMessages, language }` to every `MessageBubble` and pinned-message text preview;
- a conversation-list last-message preview displays `测试测试` when disabled and `テストテスト` when enabled;
- draft preview remains the user's raw draft regardless of the setting;
- chat-search result text uses the result conversation's preference for display but raw message content for matching;
- copy with no active selection writes `测试测试` when disabled and `テストテスト` when enabled;
- selected visible text still has priority;
- forward/resend/recall-edit paths continue to receive the original `message.content` and `richText`.

Prefer behavioral render tests. Where the page harness makes a behavior impossible to isolate, use a narrow source assertion only for the prop/wiring boundary and keep pure logic in `message-translation.test.ts`.

- [ ] **Step 2: Run the focused page tests to verify RED**

Run:

```bash
npm test -- src/features/im/pages.test.tsx src/features/im/chat-home.test.tsx src/features/im/message-translation.test.ts
```

Expected: FAIL because pages still pass raw text and copy raw content unconditionally.

- [ ] **Step 3: Use current App language in the conversation room**

Read `language` with `useI18n()` in `ImConversationRoomPage`, construct:

```ts
const messageTranslation = {
  enabled: conversation.autoTranslateMessages,
  language,
};
```

Pass it to every `MessageBubble` and quoted preview path. Derive pinned-message preview text explicitly and wrap it with `data-no-i18n`; never overwrite `buildMessagePreview` output in Store.

- [ ] **Step 4: Make copy reflect visible text while preserving raw structured payload**

Retain selected DOM text as first priority. For a text-bearing message without selection, use `getImMessageDisplayText(message.content, message.ext?.richText, messageTranslation)`. For media/non-text fallbacks, preserve the existing payload/preview behavior; for captions, use the derived caption text and `captionRichText`.

Do not change send, forward, resend, search matching, or recalled-draft restoration inputs.

- [ ] **Step 5: Translate only confirmed conversation previews**

At the page boundary, derive the list row's non-draft preview from `conversation.lastMessagePreview` when `conversation.autoTranslateMessages` is true. Keep draft and privacy/system labels on their current UI-i18n path. Add `data-no-i18n` around message-derived preview text in `UnifiedConversationPreviewText` (pass a `userGenerated`/equivalent flag rather than suppressing the whole row).

For chat search result rows, resolve the owning conversation and apply the same display helper while retaining raw search-index behavior.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
npm test -- src/features/im/pages.test.tsx src/features/im/chat-home.test.tsx src/features/im/message-translation.test.ts src/features/im/components.action-menu.test.tsx
```

Expected: PASS. Confirm tests inspect raw message objects after rendering and show they are unchanged.

- [ ] **Step 7: Commit the display wiring**

```bash
git add src/features/im/pages.tsx src/features/im/chat-home.tsx src/features/im/pages.test.tsx src/features/im/chat-home.test.tsx src/features/im/message-translation.test.ts
git commit -m "feat(im): honor translation preference in chat displays"
```

If `chat-home.test.tsx` already existed or no new file was needed, stage the actual test paths only; never stage by wildcard.

---

### Task 6: Add the single-chat toggle, pending/error behavior, and full language labels

**Files:**

- Create: `src/features/im/language-display.ts`
- Create: `src/features/im/language-display.test.ts`
- Modify: `src/features/im/ConversationIdentityProfileCard.tsx`
- Modify: `src/features/im/ConversationIdentityProfileCard.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**

```ts
export function normalizeImLanguageLabels(values: readonly string[]): string[];
```

Canonical native labels:

```ts
const expected = [
  "日本語",
  "中文",
  "English",
  "한국어",
  "ไทย",
  "Tiếng Việt",
  "Español",
];
```

Extend `ToggleRow` with `disabled?: boolean` and pass it to the existing `ToggleSwitch`.

- [ ] **Step 1: Write failing language-normalization tests**

Cover aliases, trimming, case-insensitivity, stable order, deduplication, empty filtering, and unknown preservation:

```ts
expect(normalizeImLanguageLabels([
  " ja ", "ja-JP", "Chinese", "EN-us", "ko-KR",
  "Thai", "vi-VN", "Spanish", "Klingon", " ",
])).toEqual([
  "日本語", "中文", "English", "한국어",
  "ไทย", "Tiếng Việt", "Español", "Klingon",
]);
```

The alias table must at least cover every value listed in the approved design. Do not translate native labels through App i18n.

- [ ] **Step 2: Write failing profile-card visual contract tests**

Change the fixture languages to `['ja', 'zh', 'en', 'ko', 'th', 'vi', 'es']`. Assert all seven full labels render, none of the bare code pills render, the language pill container uses `flex-wrap`, and the old language section's nested heavy bordered-card class is absent.

Add a duplicate/unknown fixture assertion to prove no duplicate pills and unknown nonempty values remain visible.

- [ ] **Step 3: Write failing contact-info toggle tests**

In `pages.test.tsx`, assert:

- only the single-chat branch renders `聊天内容自动翻译` before `消息免打扰` and `置顶聊天`;
- its caption is `打开后按当前 App 语言显示；关闭后显示原文`;
- `checked` comes from `conversation.autoTranslateMessages`;
- the control is disabled while the PATCH is pending;
- success relies on the Store's returned conversation;
- failure leaves the previous checked state and shows the translated error key/message;
- the group-chat branch does not render this switch.

Add a behavioral rapid-click test if the page harness supports it; the Store/API call count must remain one while pending.

- [ ] **Step 4: Add failing five-language i18n assertions**

Add translations for these UI strings in `zh-Hant`, `ja`, `en`, and `ko` (Simplified Chinese remains the source):

```text
聊天内容自动翻译
打开后按当前 App 语言显示；关闭后显示原文
聊天内容自动翻译设置失败，请稍后重试
```

Test each source through every supported App `Language`, including `zh` source passthrough.

- [ ] **Step 5: Run the focused UI/i18n tests to verify RED**

Run:

```bash
npm test -- src/features/im/language-display.test.ts src/features/im/ConversationIdentityProfileCard.test.tsx src/features/im/pages.test.tsx src/i18n/translations.test.ts
```

Expected: FAIL because normalization, switch state, pending behavior, and translations are absent.

- [ ] **Step 6: Implement the language helper and reference-card layout**

Normalize with a lower-cased alias lookup but preserve the trimmed original for unknown values. Dedupe by canonical label while preserving first occurrence.

In `ConversationIdentityProfileCard`, compute the normalized list once and render:

- the existing `语言能力` heading;
- a natural `flex flex-wrap gap-2` pill row;
- intrinsic-width, non-truncating pills using existing `--client-*` purple token semantics;
- no separate rounded/bordered background card around the whole language section.

Do not mutate `identityCard.languages` and do not inject missing capabilities.

- [ ] **Step 7: Implement pending/error-safe toggle behavior**

Add `disabled` support to `ToggleRow`. In `ImConversationInfoPage`, keep only request-state locally:

```ts
const [autoTranslatePending, setAutoTranslatePending] = useState(false);
```

Render the control only when `conversation.type === "single"`, before mute/pin. Its `checked` value must always be `conversation.autoTranslateMessages`. On change:

1. Return immediately if already pending.
2. Set pending true.
3. Await `store.setConversationAutoTranslateMessages(conversation.id, next)`.
4. On rejection, call `showInfoToast(t("聊天内容自动翻译设置失败，请稍后重试"))` without changing checked state.
5. Clear pending in `finally`.

- [ ] **Step 8: Run the focused UI/i18n tests to verify GREEN**

Run:

```bash
npm test -- src/features/im/language-display.test.ts src/features/im/ConversationIdentityProfileCard.test.tsx src/features/im/pages.test.tsx src/i18n/translations.test.ts
```

Expected: PASS with stable aliases, seven full labels, no group control, and server-confirmed switch state.

- [ ] **Step 9: Commit the contact-info UI slice**

```bash
git add src/features/im/language-display.ts src/features/im/language-display.test.ts src/features/im/ConversationIdentityProfileCard.tsx src/features/im/ConversationIdentityProfileCard.test.tsx src/features/im/components.tsx src/features/im/pages.tsx src/features/im/pages.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat(im): add contact translation controls"
```

---

### Task 7: Document, verify, and prepare controlled browser acceptance

**Files:**

- Modify: `README.md`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Verify only: all files changed in Tasks 1–6

- [ ] **Step 1: Update formal behavior documentation**

In `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, record:

- the `ConversationParticipant.autoTranslateMessages` identity/conversation boundary;
- default-off and server-confirmed interaction;
- explicit `data-no-i18n` plus display-only translation behavior;
- raw message preservation and supported text surfaces;
- full-name language capability normalization;
- exact automated verification completed;
- database/browser acceptance as pending unless separately authorized and actually run.

Add a concise README note to the formal IM section and link to the Step 13 document. Do not claim deployment or live acceptance.

- [ ] **Step 2: Run the complete focused regression set**

Run:

```bash
npm --prefix backend test -- conversation-auto-translate-schema.test.ts realtime-api.test.ts realtime-service.test.ts realtime-repository-identity.test.ts openapi.test.ts
npm test -- src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/message-translation.test.ts src/features/im/components.action-menu.test.tsx src/features/im/chat-home.test.tsx src/features/im/language-display.test.ts src/features/im/ConversationIdentityProfileCard.test.tsx src/features/im/pages.test.tsx src/i18n/I18nProvider.test.ts src/i18n/translations.test.ts
```

Expected: PASS. If a listed test file was not created because equivalent coverage lives in an existing file, use the actual path and record the substitution in the Step 13 verification note.

- [ ] **Step 3: Run Prisma, lint, backend build, and production frontend build**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend exec -- prisma validate
npm --prefix backend run lint
npm --prefix backend run build
npm run lint
npm run verify:production-build
```

Expected: all commands exit 0. Treat sandbox-only Supertest `listen EPERM` separately from product failures and capture the exact evidence; do not mark a failing product test as accepted.

- [ ] **Step 4: Inspect the diff and prohibited patterns**

Run:

```bash
git diff --check
git status --short
rg -n "TODO|FIXME|not implemented|localStorage|sessionStorage|DeepL|Google Translate|OpenAI" backend/src backend/prisma src/features/im
```

Expected:

- `git diff --check` exits 0;
- only task files plus the pre-existing unrelated dirty files are present;
- no new placeholder, browser persistence, or external provider reference exists in the implementation;
- no raw `ConversationMessage` assignment stores translated display text.

- [ ] **Step 5: Review requirements coverage before browser work**

Manually confirm the diff covers all of the following:

- default false and migration safety;
- active-identity isolation and peer independence;
- formal PATCH validation/OpenAPI/response mapping;
- refresh/reload source is the server payload;
- disabled state restores raw text because runtime i18n never owns message nodes;
- enabled history/new messages, quotes, captions, pinned/list/search previews, and copy use current App language;
- judgement SVGs and raw forward/resend/recall/search payloads remain intact;
- single chat only, request locked, error-safe;
- full language labels, alias dedupe, unknown retention, narrow-screen wrap;
- five-language UI copy.

- [ ] **Step 6: Commit documentation and verification record**

```bash
git add README.md docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs(im): record auto translation behavior"
```

- [ ] **Step 7: Pause for explicit database/browser authorization**

Do not apply the migration or send temporary messages yet. Ask the user to authorize controlled local formal-database and browser acceptance.

Once authorized, perform this acceptance as a separate, evidence-producing step:

1. Prove ports `3000`, `5180`, `3307`, and `6379` and confirm port `5180` belongs to this exact working tree.
2. Check `/api/v1/health`, `/api/v1/ready`, frontend HTTP 200, and proxy health.
3. Apply the migration only to the authorized local formal database and verify the actual column/default.
4. Use two real test identities in one single chat; prove both default off.
5. Send the one agreed test message `测试测试`; prove raw on both sides.
6. Enable only the Japanese-side switch; prove loaded history and new text show `テストテスト` there and remain raw for the peer.
7. Disable it; prove immediate raw display. Refresh/relogin and prove persisted server state.
8. Verify judgement stickers, quote, image caption, copy, pinned/list/search previews, and raw forward payload.
9. Verify actual profile language codes render full labels and wrap at a mobile viewport without horizontal overflow.
10. Inspect console errors, failed requests, hidden panels, safe areas, and current worktree ownership.
11. Remove or recall only the authorized temporary test content when product rules permit, restore any temporary preference values, and prove cleanup.

Do not describe this as deployed or live acceptance unless deployment and a live environment were separately authorized and verified.

---

## Final Self-Review Gate

Before reporting completion, answer each with evidence:

- [ ] Are there any placeholder functions, fake responses, or browser-only business-state fallbacks? Expected: no.
- [ ] Are `ConversationPayload.autoTranslateMessages`, `RealtimeConversation.autoTranslateMessages`, and `Conversation.autoTranslateMessages` consistently boolean at their respective boundaries? Expected: backend/model required, transport compatibility safely defaults false.
- [ ] Does every preference update target the authenticated active identity participant? Expected: yes, proven by service/repository/API tests.
- [ ] Can global `I18nRuntime` still rewrite any in-scope user message text when the switch is off? Expected: no.
- [ ] Does any derived translation enter Store messages, send/forward/resend/recall/search input, or the database? Expected: no.
- [ ] Does the group info page expose the switch? Expected: no.
- [ ] Do language aliases normalize without changing formal profile data? Expected: yes.
- [ ] Were unrelated working-tree changes preserved and excluded from task commits? Expected: yes.
- [ ] Were database/browser claims limited to work actually authorized and observed? Expected: yes.
