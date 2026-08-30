# IM Contact Information Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a formal friend request is accepted, replace the request-profile surface with the existing complete contact-information page and consistently name single-contact pages “联系人信息”.

**Architecture:** Keep `ImDirectoryProfilePage` as the non-friend/friend-request state surface. When the formal DirectoryProfile becomes `friend`, resolve the idempotent direct conversation and replace the route with the existing `ImConversationInfoPage`, avoiding a duplicate settings implementation. Keep group-chat naming and behavior unchanged.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vitest 4, existing NeeDo formal IM Store/API and five-language i18n map.

## Global Constraints

- Execute only this Step 13 micro-change; do not modify the friend-request API, 72-hour state machine, schema, migration, or backend transaction.
- Do not create mock data, browser business persistence, polling, or a parallel contact-settings page.
- Reuse `ensureDirectConversation(userId)` and `config.routes.conversationInfo(conversation.id)`.
- Single-contact pages use “联系人信息”; group chats retain “信息设置”.
- Preserve all unrelated dirty files, especially the in-progress judgement-sticker, identity-avatar, technician-profile, and Exchange work.
- Do not commit, push, merge, deploy, or mutate formal database data without separate explicit authorization.

---

### Task 1: Lock the contact-page transition and title contract with RED tests

**Files:**
- Modify: `src/features/im/pages.test.tsx:25-104`

**Interfaces:**
- Consumes: raw source string imported from `src/features/im/pages.tsx`.
- Produces: regression expectations for the DirectoryProfile-to-conversation-info transition and single/group title split.

- [ ] **Step 1: Add the failing source-contract tests**

Append these cases inside the existing `describe` block:

```tsx
it("promotes an accepted directory profile to the complete contact information page", () => {
  const start = source.indexOf("export function ImDirectoryProfilePage");
  const end = source.indexOf("export function ImContactDetailPage", start);
  const profileSource = source.slice(start, end);

  expect(profileSource).toContain('profile?.relationship !== "friend"');
  expect(profileSource).toContain("store.ensureDirectConversation(userId)");
  expect(profileSource).toContain("config.routes.conversationInfo(conversation.id)");
  expect(profileSource).toContain("navigate(config.routes.conversationInfo(conversation.id), { replace: true })");
  expect(profileSource).toContain("contactInfoRedirectAttempt");
  expect(profileSource).toContain("contactInfoRedirectFailed");
});

it("uses contact information naming for contact pages while retaining group settings naming", () => {
  const profileStart = source.indexOf("export function ImDirectoryProfilePage");
  const contactDetailStart = source.indexOf("export function ImContactDetailPage", profileStart);
  const conversationInfoStart = source.indexOf("export function ImConversationInfoPage", contactDetailStart);
  const conversationInfoEnd = source.indexOf("export function ImConversationSearchPage", conversationInfoStart);
  const profileSource = source.slice(profileStart, contactDetailStart);
  const contactDetailSource = source.slice(contactDetailStart, conversationInfoStart);
  const conversationInfoSource = source.slice(conversationInfoStart, conversationInfoEnd);

  expect(profileSource).toContain('title={t("联系人信息")}');
  expect(profileSource).not.toContain('title={t("账号信息")}');
  expect(contactDetailSource.match(/title=\{t\("联系人信息"\)\}/g)).toHaveLength(2);
  expect(conversationInfoSource).toContain(
    'title={t(conversation.type === "single" ? "联系人信息" : "信息设置")}',
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/im/pages.test.tsx
```

Expected: FAIL because `ImDirectoryProfilePage` does not resolve/navigate to the conversation info route, still uses `账号信息`, and `ImConversationInfoPage` still uses a constant `信息设置` title.

---

### Task 2: Route accepted friends into the existing complete contact page

**Files:**
- Modify: `src/features/im/pages.tsx:2693-2919`
- Test: `src/features/im/pages.test.tsx`

**Interfaces:**
- Consumes: `DirectoryProfile.relationship`, `store.ensureDirectConversation(userId)`, `config.routes.conversationInfo(conversationId)`, and React Router `navigate`.
- Produces: relationship-driven route replacement, retryable failure state, and translated contact page titles.

- [ ] **Step 1: Add redirect state beside the existing DirectoryProfile state**

Add:

```tsx
const [contactInfoRedirectFailed, setContactInfoRedirectFailed] = useState(false);
const [contactInfoRedirectAttempt, setContactInfoRedirectAttempt] = useState(0);
```

- [ ] **Step 2: Resolve the complete page whenever the formal relationship is friend**

Place this effect after the existing profile-load effect:

```tsx
useEffect(() => {
  if (!userId || profile?.relationship !== "friend") {
    setContactInfoRedirectFailed(false);
    return undefined;
  }

  let cancelled = false;
  setContactInfoRedirectFailed(false);
  void store.ensureDirectConversation(userId)
    .then((conversation) => {
      if (!cancelled) {
        navigate(config.routes.conversationInfo(conversation.id), { replace: true });
      }
    })
    .catch(() => {
      if (!cancelled) {
        setContactInfoRedirectFailed(true);
      }
    });

  return () => {
    cancelled = true;
  };
}, [
  config.routes,
  contactInfoRedirectAttempt,
  navigate,
  profile?.relationship,
  store.ensureDirectConversation,
  userId,
]);
```

- [ ] **Step 3: Render a transition/retry state instead of the stale request card**

Make the `main` branch start with `profile?.relationship === "friend"`. While resolving, render `t("正在进入联系人信息...")`. On failure, render `t("暂时无法打开联系人信息，请稍后再试。")` and a `重新加载` button that calls:

```tsx
setContactInfoRedirectAttempt((attempt) => attempt + 1)
```

Render `ImFriendProfileActionBar` only when:

```tsx
profile && profile.relationship !== "friend"
```

This prevents the accepted state from falling back to the request card with only the buttons removed.

- [ ] **Step 4: Rename the contact-specific headers without changing group chat**

Apply these exact title rules:

```tsx
// ImDirectoryProfilePage
title={t("联系人信息")}

// ImContactDetailPage (both loading and missing-contact branches)
title={t("联系人信息")}

// ImConversationInfoPage once the conversation is known
title={t(conversation.type === "single" ? "联系人信息" : "信息设置")}
```

Add `useI18n`/`translateText` inside `ImContactDetailPage`, and change its visible captions to `t("正在进入联系人信息...")` and `t("暂时无法打开联系人信息，请稍后再试。")`.

- [ ] **Step 5: Run the focused page test and verify GREEN**

Run:

```bash
npm test -- src/features/im/pages.test.tsx
```

Expected: PASS with both new regression cases and all pre-existing IM page source-contract tests green.

---

### Task 3: Add five-language contact-information copy with RED/GREEN proof

**Files:**
- Modify: `src/i18n/translations.test.ts:401-432`
- Modify: `src/i18n/translations.ts:7692-7699` and the alphabetically generated locations for the two longer source strings

**Interfaces:**
- Consumes: `translateText(source, language)` and the existing translation dictionary.
- Produces: translations for `联系人信息`, `正在进入联系人信息...`, and `暂时无法打开联系人信息，请稍后再试。`.

- [ ] **Step 1: Add failing translation expectations**

Inside `keeps manually locked Japanese terminology for merchants, group chat, and schedule contexts`, add:

```tsx
expect(translateText("联系人信息", "zh-Hant")).toBe("聯絡人資訊");
expect(translateText("联系人信息", "ja")).toBe("連絡先情報");
expect(translateText("联系人信息", "en")).toBe("Contact information");
expect(translateText("联系人信息", "ko")).toBe("연락처 정보");
expect(translateText("正在进入联系人信息...", "ja")).toBe("連絡先情報を開いています…");
expect(translateText("暂时无法打开联系人信息，请稍后再试。", "en")).toBe(
  "Can't open contact information right now. Try again later.",
);
```

- [ ] **Step 2: Run the translation test and verify RED**

Run:

```bash
npm test -- src/i18n/translations.test.ts
```

Expected: FAIL because the new source strings are not yet present in the translation dictionary.

- [ ] **Step 3: Add the exact translation entries**

Add:

```tsx
"联系人信息": {
  "zh-Hant": "聯絡人資訊",
  ja: "連絡先情報",
  en: "Contact information",
  ko: "연락처 정보",
},
"正在进入联系人信息...": {
  "zh-Hant": "正在進入聯絡人資訊...",
  ja: "連絡先情報を開いています…",
  en: "Opening contact information...",
  ko: "연락처 정보를 여는 중...",
},
"暂时无法打开联系人信息，请稍后再试。": {
  "zh-Hant": "暫時無法開啟聯絡人資訊，請稍後再試。",
  ja: "連絡先情報を開けません。しばらくしてからもう一度お試しください。",
  en: "Can't open contact information right now. Try again later.",
  ko: "지금은 연락처 정보를 열 수 없습니다. 잠시 후 다시 시도해 주세요.",
},
```

- [ ] **Step 4: Run the translation and focused page tests and verify GREEN**

Run:

```bash
npm test -- src/i18n/translations.test.ts src/features/im/pages.test.tsx
```

Expected: PASS with zero failures.

---

### Task 4: Verify the finished micro-change without disturbing parallel work

**Files:**
- Verify only: `src/features/im/pages.tsx`
- Verify only: `src/features/im/pages.test.tsx`
- Verify only: `src/i18n/translations.ts`
- Verify only: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: fresh automated and browser evidence for the exact user-visible requirement.

- [ ] **Step 1: Run the complete focused regression set**

Run:

```bash
npm test -- src/features/im/pages.test.tsx src/features/im/pages.test.ts src/features/im/friend-request-presentation.test.ts src/features/im/formal-api.test.ts src/i18n/translations.test.ts
```

Expected: all selected suites pass with zero failures.

- [ ] **Step 2: Run TypeScript lint and the formal production build**

Run:

```bash
npm run lint
npm run verify:production-build
```

Expected: both commands exit 0. If unrelated dirty work causes a failure, record the exact failing file and do not edit outside this plan.

- [ ] **Step 3: Run whitespace and scoped-diff checks**

Run:

```bash
git diff --check -- src/features/im/pages.tsx src/features/im/pages.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git diff -- src/features/im/pages.tsx src/features/im/pages.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
```

Expected: no whitespace errors; the diff contains only the relationship transition, contact title/copy changes, and their tests, while retaining pre-existing judgement-sticker hunks in `pages.tsx`.

- [ ] **Step 4: Perform mobile browser acceptance against the formal runtime**

At a 440×956 viewport, use a real incoming pending friend request and verify:

1. Before acceptance, the title is “联系人信息” and both “拒绝”/“添加好友” are present.
2. After clicking “添加好友”, the route is replaced with `/messages/:conversationId/info` and the complete page shows label editing, activity, mute, pin, delete contact, and “开始聊天”.
3. Refresh and reopen the accepted request; the complete contact-information page remains authoritative.
4. Open a group conversation info page; its title remains “信息设置”.
5. The console has no new error, the page has no horizontal overflow, and the fixed start-chat button does not cover settings rows.

If a suitable pending formal request is unavailable, do not create mock data or mutate production-like data; report browser acceptance as blocked while retaining automated evidence.
