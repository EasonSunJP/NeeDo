# IM Invalid Conversation State Implementation Plan

> **Execution:** Use `executing-plans` in the existing isolated worktree and follow `test-driven-development` for every production change. Use `verification-before-completion` before each success claim and `finishing-a-development-branch` for local integration.

**Goal:** Keep an inaccessible direct-message URL inside a recognizable but empty chat window, blur and disable the underlying UI, show a clear central “无效聊天，无法进入” prompt, and return the current portal to its own home page.

**Architecture:** Keep the formal backend security 404 unchanged. The shared conversation route recognizes only the formal and legacy conversation-not-found errors and transitions to a monotonic local unavailable state. A dedicated presentational view renders a real empty conversation shell below a dimmed blur scrim and a sharp foreground prompt; unrelated failures continue through the current global error path.

**Tech Stack:** React 19, TypeScript strict mode, React Router 7, Tailwind utility classes, Vitest 4, React DOM static rendering, existing NeeDo theme and runtime i18n.

## Product and visual authority

- Subject: NeeDo customer/merchant/technician IM.
- Audience: an authenticated person who followed a stale, deleted, or unauthorized conversation URL.
- Single job: explain that the chat cannot be entered and provide one safe exit.
- Design authority: `docs/superpowers/specs/2026-08-30-im-invalid-conversation-state-design.md`.

### Visual system

- **Palette:** reuse `--client-bg`, `--client-surface`, `--client-text`, `--client-muted`, and `--client-primary`; add no new brand colors.
- **Typography:** reuse the current IM header/body/button weights and font stack; the prompt title is the only high-emphasis type.
- **Depth:** the empty chat shell remains recognizable under a `4px` backdrop blur and dark translucent scrim; the prompt card is a crisp existing liquid-glass surface with the normal NeeDo lime primary button.
- **Spacing:** prompt width is capped near `360px`, with at least `20px` viewport padding and safe-area-aware vertical centering.
- **Motion:** no entrance animation; the failure state must be stable and respect reduced-motion expectations.
- **Signature:** the sharp prompt acts like a clear lens over the visibly paused, blurred chat window, preserving context without exposing a participant or message.

```text
┌──────────────────────────────────────┐
│  ‹                 [blank]           │  blurred + inert
│                                      │
│          ┌────────────────┐          │
│          │ 无效聊天，     │          │  sharp foreground
│          │ 无法进入       │          │
│          │ 原因说明       │          │
│          │ [ 返回首页 ]   │          │
│          └────────────────┘          │
│                                      │
│  (voice) [ 发送消息 ] (emoji) (+)   │  visible, disabled,
└──────────────────────────────────────┘  blurred + inert
```

Self-critique: a generic centered modal would lose the user’s chat context. This plan instead preserves the exact NeeDo chat wallpaper, header silhouette, and composer silhouette while removing all identity and content. The only deliberate visual contrast is focus versus blur; extra illustrations, icons, and secondary actions are omitted.

## Global constraints

- Do not modify login, Token, Session, RBAC, backend APIs, database schema, migrations, SSE, normal message sending, pagination, or browser storage.
- Treat missing and unauthorized conversations identically; do not reveal whether a conversation exists.
- Classify only `error.realtime.conversation_not_found` and the legacy `Conversation not found` message as inaccessible conversations.
- User home is `/`, merchant home is `/merchant`, and technician home is `/technician`.
- The foreground prompt contains exactly one active action: `返回首页`.
- The empty underlay displays no participant name, avatar, subtitle, menu action, message, timestamp, pinned content, or loading text.
- The underlay is inert and hidden from the accessibility tree; every composer form control is also natively disabled.
- Other network, API, and programming errors must continue through the existing global failure path.
- Add complete Japanese, English, Korean, and Traditional Chinese translations for all new copy.
- Preserve unrelated worktree changes, especially `docs/superpowers/plans/2026-08-30-auth-privacy-runtime-acceptance.md`.

## Planned files

- Modify `src/features/im/components.tsx`: add a non-breaking `disabled` state to `ImChatComposer` and apply native disabled semantics to all composer controls.
- Modify `src/features/im/pages.tsx`: add the classifier, dedicated unavailable view, route-local state, and scoped return-home navigation.
- Modify `src/features/im/role-config.ts`: add the pure `getImHomeRoute(scope)` helper.
- Modify `src/features/im/pages.test.ts`: cover classifier, disabled composer, empty/blurred unavailable shell, and route wiring.
- Modify `src/i18n/translations.ts` and `src/i18n/translations.test.ts`: add and lock the approved localized copy.
- Keep the approved design document unchanged during implementation.

---

### Task 0: Verify isolated baseline

- [ ] Confirm this checkout is a linked worktree and not a submodule:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
git status --short
```

- [ ] Run the focused pre-change baseline:

```bash
npm test -- \
  src/features/im/pages.test.ts \
  src/features/im/pages.test.tsx \
  src/features/im/formal-api.test.ts \
  src/features/im/store.test.ts \
  src/i18n/translations.test.ts
```

Expected: all selected tests pass before editing production code. Stop and report any baseline failure.

---

### Task 1: Define the disabled composer contract

**Files:** `src/features/im/pages.test.ts`, `src/features/im/components.tsx`

- [ ] Add a failing source/markup regression test that requires `ImChatComposer` to accept `disabled?: boolean`, expose `data-im-composer-disabled`, and combine `disabled` with every control’s native `disabled` attribute: voice/text input, pending-image removal, emoji, send, more, voice recording, and expanded action buttons.
- [ ] Run `npm test -- src/features/im/pages.test.ts` and confirm RED because the contract does not exist.
- [ ] Add `disabled = false` to `ImChatComposer`; use `disabled || blocked` only where `blocked` already applies, and use `disabled` alone for controls that must remain available during ordinary blacklist behavior.
- [ ] Ensure a disabled composer cannot call draft, panel, recording, send, emoji, removal, or action callbacks. Keep normal composer markup and existing appearance intact, adding only a restrained disabled opacity/cursor treatment.
- [ ] Re-run `npm test -- src/features/im/pages.test.ts` and confirm GREEN.

---

### Task 2: Build the empty blurred chat presentation

**Files:** `src/features/im/pages.test.ts`, `src/features/im/pages.tsx`

**Interfaces:**

```ts
export function isConversationNotFoundError(error: unknown): boolean
export function ImConversationUnavailableState(props: {
  onReturnHome: () => void;
}): ReactNode
```

- [ ] Add failing tests for the classifier: formal key and legacy message are true; timeout errors, unrelated errors, and non-`Error` values are false.
- [ ] Add a failing static-render test inside `MemoryRouter` for the unavailable state. Require:
  - `data-im-conversation-unavailable-underlay="true"` with inert semantics;
  - the chat wallpaper and blank top-bar silhouette;
  - no participant name, avatar, subtitle, more action, message bubble, date, or fallback loading/empty text;
  - a visible composer with `data-im-composer-disabled="true"`;
  - a separate `data-im-conversation-unavailable-scrim="true"` with `backdrop-blur-[4px]` and dimming;
  - a separate clear dialog containing `无效聊天，无法进入`, the approved caption, and exactly one active `返回首页` button.
- [ ] Run `npm test -- src/features/im/pages.test.ts` and confirm RED.
- [ ] Implement the narrow exported classifier using an exact formal-key comparison and legacy compatibility check.
- [ ] Implement `ImConversationUnavailableState` as a full-screen IM shell:
  - the inert underlay reuses the fixed conversation frame, blank centered header, existing wallpaper, and disabled `ImChatComposer`;
  - the dim/blur scrim is a sibling above the underlay;
  - the glass prompt is a sibling above the scrim with `role="dialog"`, `aria-modal="true"`, labelled title/caption, safe viewport padding, and an autofocus primary button;
  - do not render `ImEmptyState`, participant-derived data, or message-derived data.
- [ ] Re-run `npm test -- src/features/im/pages.test.ts` and confirm GREEN.

---

### Task 3: Route the formal 404 into a monotonic local state

**Files:** `src/features/im/pages.test.ts`, `src/features/im/pages.tsx`, `src/features/im/role-config.ts`

- [ ] Add failing tests for `getImHomeRoute`: user `/`, merchant `/merchant`, technician `/technician`.
- [ ] Add a failing route-source test requiring `conversationRouteStatus: "loading" | "ready" | "unavailable"`, a request-local `conversationRequestUnavailable` guard, the unavailable render branch before `!conversation`, and `navigate(getImHomeRoute(scope), { replace: true })`.
- [ ] Run `npm test -- src/features/im/pages.test.ts` and confirm RED.
- [ ] Add `getImHomeRoute(scope)` based on the existing route prefix.
- [ ] In the conversation loading effect:
  - reset status to `loading` for each conversation ID;
  - make all three existing async requests use one error handler;
  - on the recognized error, mark the request unavailable, clear the active conversation, and set route status to `unavailable`;
  - set `ready` only if the effect is current and no parallel request already made the state unavailable;
  - keep throwing unrelated errors to the existing error chain;
  - preserve cleanup and normal request behavior.
- [ ] Render `ImConversationUnavailableState` before the existing `!conversation` fallback and wire its only active button to the scoped home route with replace navigation.
- [ ] Do not add the domain error to the global non-fatal runtime list and do not redirect to the message list.
- [ ] Run:

```bash
npm test -- \
  src/features/im/pages.test.ts \
  src/features/im/formal-api.test.ts \
  src/features/im/store.test.ts
```

Expected: GREEN with unchanged adapter/store behavior.

---

### Task 4: Complete localized prompt copy

**Files:** `src/i18n/translations.test.ts`, `src/i18n/translations.ts`

- [ ] Add failing exact-map tests for `无效聊天，无法进入`, `该对话可能不存在、已被删除，或当前账号无权访问。`, and the existing malformed `返回首页` entry across `zh-Hant`, `ja`, `en`, and `ko`.
- [ ] Run `npm test -- src/i18n/translations.test.ts` and confirm RED.
- [ ] Add/fix concise, natural translations:
  - `无效聊天，无法进入`: `無效的聊天，無法進入` / `無効なチャットのため開けません` / `This chat can’t be opened` / `유효하지 않은 채팅이라 들어갈 수 없습니다`.
  - caption: preserve the same non-enumerating security meaning in every language.
  - `返回首页`: `返回首頁` / `ホームに戻る` / `Return home` / `홈으로 돌아가기`.
- [ ] Re-run `npm test -- src/i18n/translations.test.ts src/features/im/pages.test.ts` and confirm GREEN.

---

### Task 5: Focused regression, production gate, and browser acceptance

- [ ] Run the complete focused regression:

```bash
npm test -- \
  src/features/im/pages.test.ts \
  src/features/im/pages.test.tsx \
  src/features/im/formal-api.test.ts \
  src/features/im/store.test.ts \
  src/lib/share.test.ts \
  src/i18n/translations.test.ts
```

- [ ] Run `npm run lint`.
- [ ] Run `npm run verify:production-build` because the normal formal build may be protected by the production safety gate.
- [ ] Verify `GET http://127.0.0.1:3000/api/v1/ready` and `GET http://127.0.0.1:5180/user.html` return `200`; reuse the existing ignored local environment and do not print credentials.
- [ ] In Chrome, authenticate through the existing formal session and open `http://127.0.0.1:5180/user.html#/messages/999999999`.
- [ ] Accept at desktop and mobile width:
  - the recovery page and runtime-rejection banner are absent;
  - no participant identity or message content is visible;
  - the empty chat shell and composer are visible below a blur/dim layer;
  - voice, input, emoji, and plus controls cannot be focused, typed into, or clicked;
  - the central prompt remains crisp and within viewport safe margins;
  - exactly one active action says `返回首页`.
- [ ] Click `返回首页` and confirm `user.html#/`.
- [ ] Open known valid route `user.html#/messages/2561` and confirm participant header, messages, and an operable composer still load without recovery mode.
- [ ] Inspect console/network: the invalid route may produce the expected security 404, but must not emit an unhandled `error.realtime.conversation_not_found`; the valid route requests must succeed.
- [ ] Run `git diff --check`, inspect `git status --short`, and confirm only planned files plus approved design/plan documents are in scope.

---

### Task 6: Commit and integrate only this fix into local main

- [ ] Commit the implementation and tests on `codex/auth-privacy-completion` without staging the unrelated auth/privacy plan.
- [ ] Record the exact scoped commit list: the two approved design commits, this implementation-plan commit, and the implementation commit(s).
- [ ] Inspect the local `main` worktree and refuse to overwrite unrelated dirty changes.
- [ ] Because `codex/auth-privacy-completion` contains unrelated prior work, do not merge the whole branch. Cherry-pick only the scoped commits onto `main` in chronological order.
- [ ] Resolve only non-semantic conflicts; stop for user direction if a conflict changes behavior or overlaps unrelated work.
- [ ] On merged `main`, rerun the focused regression and `npm run verify:production-build`.
- [ ] Do not push or deploy.

## Completion report

Report modified files, no backend/API/schema changes, exact test/build/browser evidence, scoped commit hashes, local-main integration result, and any remaining untracked/unrelated work preserved.
