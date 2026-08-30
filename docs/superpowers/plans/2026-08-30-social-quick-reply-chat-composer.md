# Social Quick-Reply Chat Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Social post-detail quick-reply footer with the shared IM chat composer while showing the current account avatar instead of chat's voice-input control and retaining the emoji and plus controls.

**Architecture:** Add narrowly scoped optional presentation/action seams to `ImChatComposer` without changing its defaults, then wrap it in a focused `SocialQuickReplyComposer` that owns only transient Social reply state. `SocialPostDetailPage` remains responsible for Social provider mutations and navigation to the existing full reply composer.

**Tech Stack:** React 19, TypeScript strict mode, React Router, Vitest 4 with jsdom, Tailwind utility classes, and existing NeeDo client theme/glass CSS.

## Global Constraints

- Work only within Step 13 and the Social post-detail quick-reply surface.
- Keep React / TSX / Vite and the current formal Social provider/API path.
- Do not add mock, demo, fake API, browser business persistence, schema, migration, or backend route.
- Chat keeps its current voice-input, recording, attachment, emoji, plus-panel, and send behavior when the new props are omitted.
- Social shows a 40-by-40 circular current-account avatar in the leading control position.
- Social retains the shared emoji panel and a functional plus button; plus navigates to the existing full reply composer with the current `replyToPostId`.
- Social quick submit trims and materializes the shared composer draft, creates exactly one reply, and clears only after a successful mutation.
- Restricted comments keep the composer visible with native disabled controls and the existing permission placeholder.
- Preserve unrelated dirty files and do not include them in commits.
- No push, deployment, or production publication.

---

### Task 1: Add backwards-compatible shared composer seams

**Files:**
- Modify: `src/features/im/components.tsx:646-900`
- Test: `src/features/im/components.composer.test.tsx`

**Interfaces:**
- Consumes: Existing `ImChatComposer` props and `ImChatComposerPanel` behavior.
- Produces: Optional `leadingAccessory?: ReactNode`, `moreAction?: { ariaLabel: string; run: () => void }`, `sendLabel?: string`, and `sendingLabel?: string` props. Omitting all four retains current chat behavior.

- [ ] **Step 1: Write the failing custom-leading and direct-plus regression tests**

Append these tests inside `describe("ImChatComposer", ...)` in `src/features/im/components.composer.test.tsx`:

```tsx
it("replaces the voice control with a custom leading accessory and runs a direct plus action", async () => {
  const onOpenMore = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImChatComposer
        draft=""
        isNight
        leadingAccessory={<img alt="当前账号" src="/avatar.jpg" />}
        moreAction={{ ariaLabel: "打开完整回复", run: onOpenMore }}
        onDraftChange={vi.fn()}
        onPanelChange={vi.fn()}
        onSend={vi.fn()}
        panel={null}
        sendLabel="回复"
        sendingLabel="回复中"
      />
    );
  });

  expect(container.querySelector("[data-im-composer-leading-accessory='true'] img")?.getAttribute("alt")).toBe("当前账号");
  expect(container.querySelector("[data-im-composer-control='voice-input']")).toBeNull();

  await act(async () => {
    container.querySelector<HTMLButtonElement>("[aria-label='打开完整回复']")?.click();
  });

  expect(onOpenMore).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it("uses custom send copy without changing the default chat copy", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ImChatComposer
        draft="回复内容"
        isNight
        onDraftChange={vi.fn()}
        onPanelChange={vi.fn()}
        onSend={vi.fn()}
        panel={null}
        sendLabel="回复"
      />
    );
  });

  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "回复")).toBe(true);
  await act(async () => root.unmount());
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/im/components.composer.test.tsx
```

Expected: FAIL because `ImChatComposer` does not yet accept the new props and the custom leading marker is absent.

- [ ] **Step 3: Implement the minimal backwards-compatible props**

Update `ImChatComposer` in `src/features/im/components.tsx` with these optional props and defaults:

```tsx
leadingAccessory,
moreAction,
sendLabel = "发送",
sendingLabel = "发送中"
```

Add these entries to its inline prop type:

```tsx
leadingAccessory?: ReactNode;
moreAction?: { ariaLabel: string; run: () => void };
sendLabel?: string;
sendingLabel?: string;
```

Replace only the leading voice button block with:

```tsx
{leadingAccessory ? (
  <div
    className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full"
    data-im-composer-leading-accessory="true"
  >
    {leadingAccessory}
  </div>
) : (
  <button
    aria-label={voiceMode ? "切换文字输入" : "切换语音输入"}
    className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
    data-im-composer-control="voice-input"
    disabled={disabled}
    onClick={() => {
      onToggleVoice?.();
      onPanelChange(null);
    }}
    type="button"
  >
    <ImIcon className="h-[18px] w-[18px]" name="voice-input" />
  </button>
)}
```

Render custom send copy with:

```tsx
<Button className="h-9 shrink-0 rounded-full px-3 text-sm" disabled={disabled || blocked || sending} onClick={onSend}>
  {sending ? sendingLabel : sendLabel}
</Button>
```

Run the direct Social plus action before the existing chat panel toggle:

```tsx
<button
  aria-label={moreAction?.ariaLabel ?? (panel === "more" ? "关闭更多功能" : "打开更多功能")}
  className={cn("focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full", composerIconButtonClass)}
  disabled={disabled}
  onClick={() => {
    if (moreAction) {
      moreAction.run();
      onPanelChange(null);
      return;
    }
    onPanelChange((value) => (value === "more" ? null : "more"));
  }}
  type="button"
>
  <ImIcon name="plus" />
</button>
```

- [ ] **Step 4: Run composer tests and verify GREEN**

Run:

```bash
npm test -- src/features/im/components.composer.test.tsx src/features/im/pages.test.tsx
```

Expected: both files PASS; existing tests still find the default voice-input control, emoji panel, more panel, and default send behavior.

- [ ] **Step 5: Commit only the shared composer slice**

```bash
git add src/features/im/components.tsx src/features/im/components.composer.test.tsx
git commit -m "feat(im): support shared Social composer chrome"
```

Expected: the commit contains only the two listed files.

---

### Task 2: Build and integrate the Social quick-reply wrapper

**Files:**
- Create: `src/features/social/components/SocialQuickReplyComposer.tsx`
- Create: `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- Create: `src/features/social/pages/SocialPostDetailPage.test.ts`
- Modify: `src/features/social/pages/SocialPostDetailPage.tsx:1-5,461-525,530-720`

**Interfaces:**
- Consumes: Task 1 `ImChatComposer` props, `materializeImComposerDraft`, `SocialProfile`, existing `createPost`, and `socialPaths.compose`.
- Produces: `SocialQuickReplyComposer` with props `actor?: Pick<SocialProfile, "avatar" | "displayName">`, `canComment: boolean`, `onOpenFullComposer: () => void`, and `onSubmit: (text: string) => SocialPost | Promise<SocialPost>`.

- [ ] **Step 1: Write the failing Social wrapper behavior tests**

Create `src/features/social/components/SocialQuickReplyComposer.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialQuickReplyComposer } from "./SocialQuickReplyComposer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("SocialQuickReplyComposer", () => {
  it("uses the shared chat shell with an avatar, emoji control, and functional plus action", async () => {
    const onOpenFullComposer = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onOpenFullComposer={onOpenFullComposer}
          onSubmit={vi.fn()}
        />
      );
    });

    expect(container.querySelector("[data-im-composer-root='true']")).not.toBeNull();
    expect(container.querySelector("[data-im-composer-input-shell='true']")?.classList.contains("im-composer-glass")).toBe(true);
    expect(container.querySelector("[data-social-quick-reply-avatar='true'] img")?.getAttribute("alt")).toBe("Mia");
    expect(container.querySelector("[data-im-composer-control='voice-input']")).toBeNull();
    expect(container.querySelector("[data-im-composer-control='emoji-chat']")).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开完整回复']")?.click();
    });
    expect(onOpenFullComposer).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("inserts emoji and submits one materialized trimmed reply", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "reply-1" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment
          onOpenFullComposer={vi.fn()}
          onSubmit={onSubmit}
        />
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-im-reaction-value="Thanks"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "回复")?.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Thanks");
    expect(container.querySelector('[data-im-composer-rich-input="true"]')?.textContent).toBe("");
    await act(async () => root.unmount());
  });

  it("keeps restricted comments visible and natively disabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SocialQuickReplyComposer
          actor={{ avatar: "/mia.jpg", displayName: "Mia" }}
          canComment={false}
          onOpenFullComposer={vi.fn()}
          onSubmit={vi.fn()}
        />
      );
    });

    expect(container.querySelector("[data-im-composer-disabled='true']")).not.toBeNull();
    expect(container.querySelector("[aria-placeholder='仅好友可以评论']")).not.toBeNull();
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
    await act(async () => root.unmount());
  });
});
```

Create `src/features/social/pages/SocialPostDetailPage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import source from "./SocialPostDetailPage.tsx?raw";

describe("SocialPostDetailPage quick reply integration", () => {
  it("routes plus to the full reply composer for the current post", () => {
    expect(source).toContain("<SocialQuickReplyComposer");
    expect(source).toContain("onOpenFullComposer={() => navigate(socialPaths.compose(scope, { replyToPostId: post.id }))}");
    expect(source).not.toContain("function QuickReplyComposer(");
  });
});
```

- [ ] **Step 2: Run the focused Social tests and verify RED**

Run:

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts
```

Expected: FAIL because `SocialQuickReplyComposer.tsx` does not exist and `SocialPostDetailPage` still defines the old local `QuickReplyComposer`.

- [ ] **Step 3: Implement the focused Social wrapper**

Create `src/features/social/components/SocialQuickReplyComposer.tsx`:

```tsx
import { useState } from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { ImChatComposer, type ImChatComposerPanel } from "../../im/components";
import { materializeImComposerDraft } from "../../im/reaction-policy";
import type { SocialPost, SocialProfile } from "../types";

export function SocialQuickReplyComposer({
  actor,
  canComment,
  onOpenFullComposer,
  onSubmit
}: {
  actor?: Pick<SocialProfile, "avatar" | "displayName">;
  canComment: boolean;
  onOpenFullComposer: () => void;
  onSubmit: (text: string) => SocialPost | Promise<SocialPost>;
}) {
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<ImChatComposerPanel>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const text = materializeImComposerDraft(draft).trim();
    if (!canComment || !text || sending) return;

    setSending(true);
    try {
      await onSubmit(text);
      setDraft("");
      setPanel(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[720px]"
      data-social-quick-reply-composer="true"
    >
      <ImChatComposer
        disabled={!canComment}
        draft={draft}
        isNight
        leadingAccessory={
          <span className="block h-10 w-10" data-social-quick-reply-avatar="true">
            <AvatarImage
              alt={actor?.displayName ?? "当前账号"}
              className="h-10 w-10 object-cover"
              src={actor?.avatar ?? ""}
            />
          </span>
        }
        moreAction={{ ariaLabel: "打开完整回复", run: onOpenFullComposer }}
        onDraftChange={setDraft}
        onPanelChange={setPanel}
        onSend={() => void submit()}
        panel={panel}
        placeholder={canComment ? "发布你的回复" : "仅好友可以评论"}
        sendLabel="回复"
        sending={sending}
        sendingLabel="回复中"
      />
    </div>
  );
}
```

- [ ] **Step 4: Replace the old page-local footer with the wrapper**

In `src/features/social/pages/SocialPostDetailPage.tsx`:

1. Remove `FormEvent` from the React import.
2. Import `SocialQuickReplyComposer` from `../components/SocialQuickReplyComposer`.
3. Delete the old `QuickReplyComposer` function.
4. Add `createPost` to the existing `useSocial()` destructuring in `SocialPostDetailPage`.
5. Replace the final old composer call with:

```tsx
<SocialQuickReplyComposer
  actor={actor}
  canComment={canComment}
  onOpenFullComposer={() => navigate(socialPaths.compose(scope, { replyToPostId: post.id }))}
  onSubmit={(text) => createPost({
    authorKey: actorKey,
    replyToPostId: post.id,
    text,
    postType: "reply"
  })}
/>
```

Keep the page main-content bottom padding at no less than `pb-[152px]`; adjust it only if browser measurement shows the shared composer can cover final content at the reference or 320-pixel viewport.

- [ ] **Step 5: Run focused Social and shared composer tests and verify GREEN**

Run:

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/im/components.composer.test.tsx src/features/im/pages.test.tsx
```

Expected: all four files PASS. Social proves the shared shell, avatar, emoji, plus callback, materialized reply, and disabled state; chat regressions retain their defaults.

- [ ] **Step 6: Commit only the Social integration slice**

```bash
git add src/features/social/components/SocialQuickReplyComposer.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.tsx src/features/social/pages/SocialPostDetailPage.test.ts
git commit -m "feat(social): align quick reply with chat composer"
```

Expected: the commit contains only the four listed Social files.

