# Friend Deletion Confirmation Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit, left-positioned confirmation action before either existing friend-deletion entry point calls the formal deletion API.

**Architecture:** Add one controlled IM dialog plus a small shared confirmation hook that owns the target, pending state, failure state, and duplicate-submit guard. Both the contacts swipe action and the one-to-one information settings action use that hook and the same dialog, while the existing `store.deleteContact` remains the only deletion boundary and the information page adds its route-specific success navigation.

**Tech Stack:** React 19, TypeScript, React Router, existing `ClientActionDialog`, existing `translateText` i18n map, Vitest, jsdom, Vite/Tailwind.

## Global Constraints

- This is one Step 13 frontend micro-step; do not change backend routes, repositories, services, Prisma schema, migrations, or formal deletion semantics.
- The dialog copy must say `你的聊天记录`; it must not claim that the removed party's retained history is deleted.
- The left button is the red `确认删除` action; the right button is neutral `取消`.
- Neither entry point may call `store.deleteContact` before the user confirms.
- While the request is pending, both actions and backdrop dismissal are disabled and the confirmation label is `正在删除…`.
- A failed request keeps the dialog open, renders `删除失败，请稍后重试` with `role="alert"`, and permits retry or cancel.
- Contacts-list success removes the row in place; information-settings success navigates to `config.routes.contacts` with `{ replace: true }`.
- All new visible copy must have complete `zh-Hant`, `ja`, `en`, and `ko` translations in addition to the Simplified Chinese source.
- Do not add mocks, demo data, a second deletion API, new dependencies, or broad dialog refactors.
- Preserve unrelated working-tree changes and do not push, deploy, or merge as part of this plan.

---

## File Structure

- Create `src/features/im/FriendDeletionConfirmDialog.tsx`: shared deletion-confirmation state hook and controlled visual dialog.
- Create `src/features/im/FriendDeletionConfirmDialog.test.tsx`: jsdom interaction tests for cancel, confirmation, pending, duplicate suppression, success, and failure.
- Modify `src/features/im/pages.tsx`: replace both direct deletion calls with the shared confirmation flow and add information-page success navigation.
- Modify `src/features/im/pages.test.tsx`: assert both entry points use the shared flow and no longer delete directly from their click handlers.
- Modify `src/i18n/translations.ts`: add or correct the five-language dialog strings.
- Modify `src/i18n/translations.test.ts`: lock complete, semantically correct translations for every new dialog string.

### Task 1: Lock the Five-Language Deletion Copy

**Files:**
- Modify: `src/i18n/translations.ts:9088,9372-9374`
- Test: `src/i18n/translations.test.ts:282-301`

**Interfaces:**
- Consumes: existing `translations: TranslationMap` and `translateText(source, language)`.
- Produces: exact translation entries for `确认删除好友？`, the approved warning sentence, `确认删除`, `正在删除…`, and the generic `删除失败，请稍后重试`.

- [ ] **Step 1: Write the failing translation test**

Add this test after the existing recall/message-deletion localization test in `src/i18n/translations.test.ts`:

```ts
it("localizes the friend-deletion confirmation without changing one-sided history semantics", () => {
  const expected = {
    "zh-Hant": {
      title: "確認刪除好友？",
      description: "刪除後，你與對方的好友關係將解除。你的聊天記錄以及雙方的動態追蹤關係將被永久刪除，且無法復原。確定要刪除這位好友嗎？",
      confirm: "確認刪除",
      deleting: "正在刪除…",
      failure: "刪除失敗，請稍後再試",
    },
    ja: {
      title: "友だちを削除しますか？",
      description: "削除すると、相手との友だち関係が解除されます。あなたのチャット履歴と双方の投稿フォロー関係は完全に削除され、元に戻せません。この友だちを削除しますか？",
      confirm: "削除する",
      deleting: "削除中…",
      failure: "削除できませんでした。しばらくしてからもう一度お試しください。",
    },
    en: {
      title: "Delete this friend?",
      description: "Deleting this friend will end your friend relationship. Your chat history and both users’ activity follows will be permanently deleted and cannot be restored. Delete this friend?",
      confirm: "Delete",
      deleting: "Deleting…",
      failure: "Delete failed. Please try again later.",
    },
    ko: {
      title: "친구를 삭제할까요?",
      description: "삭제하면 상대방과의 친구 관계가 해제됩니다. 내 채팅 기록과 양쪽의 활동 팔로우 관계가 영구적으로 삭제되며 복구할 수 없습니다. 이 친구를 삭제할까요?",
      confirm: "삭제하기",
      deleting: "삭제 중…",
      failure: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    },
  } as const;

  for (const [language, values] of Object.entries(expected)) {
    const targetLanguage = language as keyof typeof expected;

    expect(translateText("确认删除好友？", targetLanguage)).toBe(values.title);
    expect(translateText("删除后，你与对方的好友关系将解除。你的聊天记录以及双方的动态关注关系将被永久删除，且无法恢复。确定删除该好友吗？", targetLanguage)).toBe(values.description);
    expect(translateText("确认删除", targetLanguage)).toBe(values.confirm);
    expect(translateText("正在删除…", targetLanguage)).toBe(values.deleting);
    expect(translateText("删除失败，请稍后重试", targetLanguage)).toBe(values.failure);
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/i18n/translations.test.ts
```

Expected: FAIL because the title, warning sentence, and `正在删除…` entries are missing and existing generic deletion translations do not match the approved wording.

- [ ] **Step 3: Add the complete translation entries**

Add the new exact keys and replace the current low-quality `确认删除` and message-specific `删除失败，请稍后重试` values in `src/i18n/translations.ts`:

```ts
"确认删除好友？": {
  "zh-Hant": "確認刪除好友？",
  ja: "友だちを削除しますか？",
  en: "Delete this friend?",
  ko: "친구를 삭제할까요?",
},
"删除后，你与对方的好友关系将解除。你的聊天记录以及双方的动态关注关系将被永久删除，且无法恢复。确定删除该好友吗？": {
  "zh-Hant": "刪除後，你與對方的好友關係將解除。你的聊天記錄以及雙方的動態追蹤關係將被永久刪除，且無法復原。確定要刪除這位好友嗎？",
  ja: "削除すると、相手との友だち関係が解除されます。あなたのチャット履歴と双方の投稿フォロー関係は完全に削除され、元に戻せません。この友だちを削除しますか？",
  en: "Deleting this friend will end your friend relationship. Your chat history and both users’ activity follows will be permanently deleted and cannot be restored. Delete this friend?",
  ko: "삭제하면 상대방과의 친구 관계가 해제됩니다. 내 채팅 기록과 양쪽의 활동 팔로우 관계가 영구적으로 삭제되며 복구할 수 없습니다. 이 친구를 삭제할까요?",
},
"确认删除": {
  "zh-Hant": "確認刪除",
  ja: "削除する",
  en: "Delete",
  ko: "삭제하기",
},
"正在删除…": {
  "zh-Hant": "正在刪除…",
  ja: "削除中…",
  en: "Deleting…",
  ko: "삭제 중…",
},
"删除失败，请稍后重试": {
  "zh-Hant": "刪除失敗，請稍後再試",
  ja: "削除できませんでした。しばらくしてからもう一度お試しください。",
  en: "Delete failed. Please try again later.",
  ko: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
},
```

Keep the existing `取消` entry; do not create another cancel key.

- [ ] **Step 4: Run localization tests and quality audit**

Run:

```bash
npm test -- src/i18n/translations.test.ts
npm run i18n:quality
```

Expected: the translation test passes, and the quality audit exits with code 0 without missing target-language values for the five dialog strings.

- [ ] **Step 5: Commit the localization checkpoint**

```bash
git add src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "i18n: localize friend deletion confirmation"
```

### Task 2: Build and Test the Shared Confirmation Flow

**Files:**
- Create: `src/features/im/FriendDeletionConfirmDialog.tsx`
- Create: `src/features/im/FriendDeletionConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `ClientActionDialog`, `useI18n`, `translateText`, and an injected `(contactId: string) => Promise<unknown>` deletion function.
- Produces: `FriendDeletionConfirmDialog`, `useFriendDeletionConfirmation<T extends FriendDeletionTarget>()`, and the controller methods `requestDeletion`, `cancelDeletion`, and `confirmDeletion`.

- [ ] **Step 1: Write the failing jsdom interaction tests**

Create `src/features/im/FriendDeletionConfirmDialog.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  FriendDeletionConfirmDialog,
  useFriendDeletionConfirmation,
} from "./FriendDeletionConfirmDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function Harness({
  deleteContact,
  onDeleted,
}: {
  deleteContact: (contactId: string) => Promise<unknown>;
  onDeleted?: (target: { id: string }) => void;
}) {
  const deletion = useFriendDeletionConfirmation({ deleteContact, onDeleted });

  return (
    <>
      <button onClick={() => deletion.requestDeletion({ id: "contact-1" })} type="button">
        打开删除确认
      </button>
      <FriendDeletionConfirmDialog
        deleting={deletion.deleting}
        errorMessage={deletion.errorMessage}
        onCancel={deletion.cancelDeletion}
        onConfirm={deletion.confirmDeletion}
        open={deletion.open}
      />
    </>
  );
}

describe("FriendDeletionConfirmDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.setItem("needo.language", "zh");
    localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  const renderHarness = async (
    deleteContact: (contactId: string) => Promise<unknown>,
    onDeleted?: (target: { id: string }) => void,
  ) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <Harness deleteContact={deleteContact} onDeleted={onDeleted} />
        </I18nProvider>,
      );
    });
  };

  const button = (label: string) => {
    const matched = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.trim() === label);

    if (!matched) {
      throw new Error(`Missing button: ${label}`);
    }

    return matched;
  };

  it("opens without deleting and keeps confirm on the left of cancel", async () => {
    const deleteContact = vi.fn(async () => undefined);
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const actions = Array.from(dialog?.querySelectorAll("button") ?? []);

    expect(deleteContact).not.toHaveBeenCalled();
    expect(dialog?.textContent).toContain("确认删除好友？");
    expect(dialog?.textContent).toContain("你的聊天记录");
    expect(actions.map((item) => item.textContent?.trim())).toEqual(["确认删除", "取消"]);
  });

  it("cancels without calling the deletion function", async () => {
    const deleteContact = vi.fn(async () => undefined);
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());
    await act(async () => button("取消").click());

    expect(deleteContact).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("submits once, disables dismissal while pending, and closes after success", async () => {
    const deferred = createDeferred();
    const deleteContact = vi.fn(() => deferred.promise);
    const onDeleted = vi.fn();
    await renderHarness(deleteContact, onDeleted);

    await act(async () => button("打开删除确认").click());
    await act(async () => {
      button("确认删除").click();
      await Promise.resolve();
    });

    expect(deleteContact).toHaveBeenCalledTimes(1);
    expect(deleteContact).toHaveBeenCalledWith("contact-1");
    expect(button("正在删除…").disabled).toBe(true);
    expect(button("取消").disabled).toBe(true);

    await act(async () => {
      container.querySelector<HTMLElement>('[role="dialog"]')?.click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onDeleted).toHaveBeenCalledWith({ id: "contact-1" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the dialog open with an alert after failure and clears it on cancel", async () => {
    const deleteContact = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    await renderHarness(deleteContact);

    await act(async () => button("打开删除确认").click());
    await act(async () => {
      button("确认删除").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("删除失败，请稍后重试");
    expect(button("确认删除").disabled).toBe(false);

    await act(async () => button("取消").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => button("打开删除确认").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
npm test -- src/features/im/FriendDeletionConfirmDialog.test.tsx
```

Expected: FAIL because `FriendDeletionConfirmDialog.tsx` does not exist.

- [ ] **Step 3: Implement the shared hook and dialog**

Create `src/features/im/FriendDeletionConfirmDialog.tsx`:

```tsx
import { useCallback, useState } from "react";
import { ClientActionDialog } from "../../components/ui/ClientActionDialog";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

export type FriendDeletionTarget = {
  id: string;
};

export function useFriendDeletionConfirmation<T extends FriendDeletionTarget>({
  deleteContact,
  onDeleted,
}: {
  deleteContact: (contactId: string) => Promise<unknown>;
  onDeleted?: (target: T) => void;
}) {
  const [target, setTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestDeletion = useCallback((nextTarget: T) => {
    if (deleting) {
      return;
    }

    setErrorMessage(null);
    setTarget(nextTarget);
  }, [deleting]);

  const cancelDeletion = useCallback(() => {
    if (deleting) {
      return;
    }

    setErrorMessage(null);
    setTarget(null);
  }, [deleting]);

  const confirmDeletion = useCallback(async () => {
    if (!target || deleting) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);

    try {
      await deleteContact(target.id);
      setTarget(null);
      setDeleting(false);
      onDeleted?.(target);
    } catch {
      setErrorMessage("删除失败，请稍后重试");
      setDeleting(false);
    }
  }, [deleteContact, deleting, onDeleted, target]);

  return {
    cancelDeletion,
    confirmDeletion,
    deleting,
    errorMessage,
    open: target !== null,
    requestDeletion,
    target,
  };
}

export function FriendDeletionConfirmDialog({
  open,
  deleting,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  deleting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);

  return (
    <ClientActionDialog
      actions={(
        <div className="grid grid-cols-2 gap-3" data-testid="friend-deletion-actions">
          <button
            className="focus-ring min-h-11 rounded-full bg-[#ef4f3f] px-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleting}
            onClick={() => void onConfirm()}
            type="button"
          >
            {t(deleting ? "正在删除…" : "确认删除")}
          </button>
          <button
            className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-3 text-sm font-black text-[color:var(--client-text)] transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleting}
            onClick={onCancel}
            type="button"
          >
            {t("取消")}
          </button>
        </div>
      )}
      closeOnBackdrop={!deleting}
      description={t("删除后，你与对方的好友关系将解除。你的聊天记录以及双方的动态关注关系将被永久删除，且无法恢复。确定删除该好友吗？")}
      onClose={onCancel}
      open={open}
      title={t("确认删除好友？")}
    >
      {errorMessage ? (
        <p className="rounded-2xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-500" role="alert">
          {t(errorMessage)}
        </p>
      ) : null}
    </ClientActionDialog>
  );
}
```

- [ ] **Step 4: Run focused component and type checks**

Run:

```bash
npm test -- src/features/im/FriendDeletionConfirmDialog.test.tsx
npm run lint
```

Expected: four component tests pass, TypeScript exits with code 0, and no duplicate-submit or callback type errors are reported.

- [ ] **Step 5: Commit the shared flow checkpoint**

```bash
git add src/features/im/FriendDeletionConfirmDialog.tsx src/features/im/FriendDeletionConfirmDialog.test.tsx
git commit -m "feat: add friend deletion confirmation dialog"
```

### Task 3: Wire Both Existing Deletion Entry Points

**Files:**
- Modify: `src/features/im/pages.tsx:1-90,2009-2561,6775-7671`
- Test: `src/features/im/pages.test.tsx:1-52`

**Interfaces:**
- Consumes: `FriendDeletionConfirmDialog`, `useFriendDeletionConfirmation<ContactRelation>`, `store.deleteContact(contactId)`, and `config.routes.contacts`.
- Produces: contacts-list in-place deletion after confirmation and information-page replace navigation after confirmation.

- [ ] **Step 1: Write the failing page-wiring test**

Add this test inside the existing `ImNewConversationPage directory query handoff` suite in `src/features/im/pages.test.tsx`:

```tsx
it("routes both friend-deletion entry points through the shared confirmation flow", () => {
  const contactsStart = source.indexOf("export function ImContactsListPage");
  const contactsEnd = source.indexOf("export function ImFriendRequestsPage", contactsStart);
  const contactsSource = source.slice(contactsStart, contactsEnd);
  const infoStart = source.indexOf("export function ImConversationInfoPage");
  const infoEnd = source.indexOf("export function ImMediaRecordsPage", infoStart);
  const infoSource = source.slice(infoStart, infoEnd);

  expect(source).toContain('from "./FriendDeletionConfirmDialog"');
  expect(source.match(/<FriendDeletionConfirmDialog/g)).toHaveLength(2);

  expect(contactsSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
  expect(contactsSource).toContain("contactDeletion.requestDeletion(contact)");
  expect(contactsSource).not.toContain("onClick: () => void store.deleteContact(contact.id)");

  expect(infoSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
  expect(infoSource).toContain("contactDeletion.requestDeletion(contact)");
  expect(infoSource).toContain("navigate(config.routes.contacts, { replace: true })");
  expect(infoSource).not.toContain("onClick={() => void store.deleteContact(contact.id)}");
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run:

```bash
npm test -- src/features/im/pages.test.tsx
```

Expected: FAIL because `pages.tsx` still calls `store.deleteContact` directly at both entry points.

- [ ] **Step 3: Import the shared flow**

Add this import with the other IM-local imports in `src/features/im/pages.tsx`:

```tsx
import {
  FriendDeletionConfirmDialog,
  useFriendDeletionConfirmation,
} from "./FriendDeletionConfirmDialog";
```

- [ ] **Step 4: Wire the contacts-list swipe action**

After the existing state declarations in `ImContactsListPage`, add:

```tsx
const contactDeletion = useFriendDeletionConfirmation<ContactRelation>({
  deleteContact: store.deleteContact,
});
```

Replace the current direct swipe action:

```tsx
onClick: () => void store.deleteContact(contact.id)
```

with:

```tsx
onClick: () => contactDeletion.requestDeletion(contact)
```

Render the shared dialog after `</UnifiedChatHomePage>` and before the existing filter/tag sheets:

```tsx
<FriendDeletionConfirmDialog
  deleting={contactDeletion.deleting}
  errorMessage={contactDeletion.errorMessage}
  onCancel={contactDeletion.cancelDeletion}
  onConfirm={contactDeletion.confirmDeletion}
  open={contactDeletion.open}
/>
```

Do not add navigation on contacts-list success. The existing store update removes the contact and its deleted conversation from the current snapshot.

- [ ] **Step 5: Wire the information-settings action**

After the existing state declarations in `ImConversationInfoPage`, add:

```tsx
const contactDeletion = useFriendDeletionConfirmation<ContactRelation>({
  deleteContact: store.deleteContact,
  onDeleted: () => navigate(config.routes.contacts, { replace: true }),
});
```

Replace the current direct button callback:

```tsx
onClick={() => void store.deleteContact(contact.id)}
```

with:

```tsx
onClick={() => contactDeletion.requestDeletion(contact)}
```

Render the shared dialog before the existing group-dissolution `ClientActionDialog`:

```tsx
<FriendDeletionConfirmDialog
  deleting={contactDeletion.deleting}
  errorMessage={contactDeletion.errorMessage}
  onCancel={contactDeletion.cancelDeletion}
  onConfirm={contactDeletion.confirmDeletion}
  open={contactDeletion.open}
/>
```

Leave the group-dissolution dialog unchanged; it is outside this micro-step.

- [ ] **Step 6: Run the focused IM tests**

Run:

```bash
npm test -- src/features/im/pages.test.tsx src/features/im/pages.test.ts src/features/im/FriendDeletionConfirmDialog.test.tsx src/features/im/store.test.ts
```

Expected: all focused IM tests pass. The source-wiring test finds exactly two shared dialog instances, and the interaction tests prove no deletion before confirmation.

- [ ] **Step 7: Commit the two-entry integration checkpoint**

```bash
git add src/features/im/pages.tsx src/features/im/pages.test.tsx
git commit -m "feat: confirm friend deletion from both entry points"
```

### Task 4: Complete Automated and Browser Acceptance

**Files:**
- Verify only: `src/features/im/FriendDeletionConfirmDialog.tsx`
- Verify only: `src/features/im/pages.tsx`
- Verify only: `src/i18n/translations.ts`
- Reference: `docs/superpowers/specs/2026-08-30-friend-deletion-confirmation-dialog-design.md`

**Interfaces:**
- Consumes: the completed shared flow and the existing formal frontend/backend runtime.
- Produces: evidence that the change passes automated checks and behaves correctly in both mobile browser entry points.

- [ ] **Step 1: Run all focused tests together**

Run:

```bash
npm test -- src/i18n/translations.test.ts src/features/im/FriendDeletionConfirmDialog.test.tsx src/features/im/pages.test.tsx src/features/im/pages.test.ts src/features/im/store.test.ts
```

Expected: every selected Vitest file passes with zero failed tests.

- [ ] **Step 2: Run static and localization verification**

Run:

```bash
npm run lint
npm run i18n:quality
```

Expected: both commands exit with code 0; no missing translations, TypeScript errors, or new unsafe visible-copy findings.

- [ ] **Step 3: Run the formal production build gate**

Run:

```bash
npm run verify:production-build
```

Expected: the formal TypeScript/Vite build and production-bundle audit pass. If the build fails, record the exact failure and fix only a regression caused by this micro-step before rerunning.

- [ ] **Step 4: Start or verify the formal local runtime**

Run:

```bash
cd backend
npm run dev
```

In another terminal, run:

```bash
npm run dev:frontend
```

Then verify:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -I -s http://127.0.0.1:5180
```

Expected: backend health returns the formal success payload and the frontend returns HTTP 200. Reuse healthy existing processes instead of starting duplicate listeners.

- [ ] **Step 5: Browser-check cancellation at both entry points**

Using a real formal test account and a 440 × 956 viewport:

1. Open 通讯录, reveal a contact's swipe actions, and press 删除.
2. Confirm the dialog appears without a DELETE network request.
3. Confirm the red `确认删除` button is on the left and neutral `取消` is on the right.
4. Press 取消 and verify the contact, direct conversation, history entry, and follow state remain.
5. Open a one-to-one 信息设置 page, press 删除联系人, and repeat the no-request-before-confirmation and cancel checks.

Expected: both entry points display identical copy and button order; cancellation changes no formal state.

- [ ] **Step 6: Browser-check pending and failure behavior**

With the deletion request paused or forced to fail through the browser's request controls:

1. Press the left confirmation button once.
2. Verify it changes to `正在删除…` and both buttons become disabled.
3. Click the backdrop and verify the dialog remains open.
4. Let the request fail.
5. Verify the dialog remains open, `删除失败，请稍后重试` is visible, and retry/cancel are enabled.

Expected: exactly one DELETE request is issued per confirmation attempt, and failed state never removes the contact row early.

- [ ] **Step 7: Browser-check successful deletion semantics**

Use separate disposable formal friend pairs for each entry point:

1. Confirm deletion from the contacts-list swipe entry and verify the row disappears without an unrelated page jump.
2. Confirm deletion from 信息设置 and verify the page returns to 通讯录 with replace navigation.
3. Verify both users no longer appear in each other's contacts and their activity follows are removed.
4. Verify only the deleting account's direct conversation/history entry is removed.
5. Verify the removed account retains its history and receives `对方不是你的好友，信息发送失败` when attempting to send.
6. Verify the profile/search route can start a new friend request.

Expected: the existing server-authoritative hard-deletion contract remains unchanged; this change adds only the confirmation boundary.

- [ ] **Step 8: Inspect visual and runtime regressions**

At 440 × 956, inspect both light and dark themes and each supported language long enough to verify:

- no horizontal overflow or clipped warning text;
- no clipped buttons or reversed button order;
- correct overlay stacking and backdrop behavior;
- visible keyboard focus ring and usable native button focus;
- no new browser console errors or unhandled promise rejections.

Expected: all checks pass. Record browser evidence separately from automated test/build results.

- [ ] **Step 9: Confirm the final diff stays within scope**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~3..HEAD
```

Expected: only the planned frontend, tests, i18n, and planning/spec files are present; no backend, Prisma, API, generated asset, or unrelated user changes are included.
