# NeeDo IM Floating Glass Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-width IM composer slab with two bottom-navigation-style floating glass capsules, keeping the input above a separately rounded panel that grows upward without changing message behavior.

**Architecture:** Keep `ImChatComposer` as the single formal composer. Give its input row and optional panel explicit semantic containers, move theme-dependent glass rendering into shared CSS based on existing client theme variables, and preserve every callback and state transition already supplied by `ImConversationRoomPage`. The conversation room's existing `flex` column remains the bottom anchor, so panel height consumes space upward while its own content scrolls after `42dvh`.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, shared CSS theme variables, Vitest with jsdom, Vite.

## Accepted scope extensions during implementation

- [x] Let the message scroller extend behind both fixed glass bars while preserving dynamic top and bottom terminal padding.
- [x] Keep the latest message above the composer after delayed image or video layout changes.
- [x] Render quoted image/video media as reduced previews with optional captions, never as raw attachment URLs.
- [x] Stage a selected album image locally inside the composer, allow text entry and removal, and upload only on explicit send.
- [x] Compact the composer controls and replace the voice/emoji controls with the approved capsule-microphone and smile-chat icons.
- [x] Keep the original rounded pinned-message container as a 50%-transparent blurred glass surface, leave its positioning wrapper invisible, and let messages continue behind the container.

## Global Constraints

- Modify only the formal IM composer, its styles, and focused tests; do not change APIs, database schema, message persistence, SSE, media upload, recall, delete, quick reactions, home carousel, or bottom navigation behavior.
- Keep `ImChatComposer` as the only formal composer; do not add mock data, a second component, or a page-specific fallback.
- The input capsule is above the optional panel capsule; the two surfaces have approximately `8px` spacing and four independently rounded corners.
- The panel begins below the input row and grows upward under the existing bottom-anchored flex layout.
- The panel maximum height is `42dvh`; overflow scrolls inside the panel.
- Preserve safe-area behavior with `env(safe-area-inset-bottom)` and use existing client theme variables rather than hard-coded theme colors.
- Preserve microphone/voice gestures, textarea, emoji selection and recents, more actions, blocked state, and send replacement behavior.
- Maintain semantic buttons, focus rings, labels, reduced-motion support, and a minimum `40px` click target with a `44px` target on touch-capable devices.
- Preserve the unrelated existing changes in `src/pages/user/HomePage.tsx` and `src/pages/user/HomePage.test.ts`.

## File Structure

- Create `src/features/im/components.composer.test.tsx`: jsdom interaction and DOM-order contract for the formal composer.
- Modify `src/features/im/components.tsx:432-617`: semantic glass-capsule structure and accessible labels; existing callbacks remain unchanged.
- Modify `src/styles.css:2417-2505`: reusable IM glass surface, responsive layout, theme variants, panel animation, and reduced-motion rules adjacent to the bottom-navigation material.

---

### Task 1: Implement and accept the floating glass composer

**Files:**
- Create: `src/features/im/components.composer.test.tsx`
- Modify: `src/features/im/components.tsx:432-617`
- Modify: `src/styles.css:2417-2505`
- Test: `src/features/im/components.composer.test.tsx`
- Test: `src/features/im/pages.test.ts`

**Interfaces:**
- Consumes: existing `ImChatComposer(props)` and `ImChatComposerPanel = "emoji" | "more" | null`; existing `ImChatComposerAction.run: () => void`; existing client CSS variables and `.client-shell` theme classes.
- Produces: `data-im-composer-stack="true"`, `data-im-composer-input-shell="true"`, and `data-im-composer-panel="emoji" | "more"`; reusable `.im-composer-glass`, `.im-composer-input-shell`, and `.im-composer-panel` style contracts.

- [ ] **Step 1: Write the failing composer interaction and style-contract test**

Create `src/features/im/components.composer.test.tsx` with this complete content:

```tsx
/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import stylesSource from "../../styles.css?raw";
import { ImChatComposer } from "./components";
import type { ImChatComposerPanel } from "./components";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  window.localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function ComposerHarness({ actionRun }: { actionRun: () => void }) {
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<ImChatComposerPanel>(null);

  return (
    <>
      <ImChatComposer
        actions={[{ icon: "photo", key: "image", label: "相册", run: actionRun }]}
        draft={draft}
        isNight
        onDraftChange={setDraft}
        onPanelChange={setPanel}
        onSend={vi.fn()}
        panel={panel}
      />
      <button aria-label="重置测试草稿" onClick={() => setDraft("")} type="button" />
    </>
  );
}

describe("ImChatComposer", () => {
  it("renders independent glass capsules and switches panels without breaking their actions", async () => {
    const actionRun = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ComposerHarness actionRun={actionRun} />);
    });

    const stack = container.querySelector<HTMLElement>("[data-im-composer-stack='true']");
    const inputShell = container.querySelector<HTMLElement>("[data-im-composer-input-shell='true']");
    expect(stack).not.toBeNull();
    expect(inputShell).not.toBeNull();
    expect(inputShell?.classList.contains("im-composer-glass")).toBe(true);
    expect(container.querySelector("[data-im-composer-panel]")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开表情面板']")?.click();
    });

    const emojiPanel = container.querySelector<HTMLElement>("[data-im-composer-panel='emoji']");
    expect(emojiPanel).not.toBeNull();
    expect(emojiPanel?.classList.contains("im-composer-glass")).toBe(true);
    expect(inputShell!.compareDocumentPosition(emojiPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      emojiPanel?.querySelector<HTMLButtonElement>("[aria-label^='输入表情 ']")?.click();
    });
    expect(container.querySelector("textarea")?.value).not.toBe("");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='重置测试草稿']")?.click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='打开更多功能']")?.click();
    });
    expect(container.querySelector("[data-im-composer-panel='emoji']")).toBeNull();
    const morePanel = container.querySelector<HTMLElement>("[data-im-composer-panel='more']");
    expect(morePanel).not.toBeNull();

    await act(async () => {
      morePanel?.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(actionRun).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("defines bottom-navigation glass, upward panel growth, touch targets, and reduced motion", () => {
    expect(stylesSource).toContain(".client-shell .im-composer-glass");
    expect(stylesSource).toContain(".im-chat-composer-stack");
    expect(stylesSource).toContain("gap: 8px");
    expect(stylesSource).toContain(".im-composer-panel");
    expect(stylesSource).toContain("max-height: 42dvh");
    expect(stylesSource).toContain("overflow-y: auto");
    expect(stylesSource).toContain("@media (pointer: coarse)");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain("var(--client-elevated)");
    expect(stylesSource).toContain("var(--client-line)");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the new contract fails**

Run:

```bash
npm test -- src/features/im/components.composer.test.tsx
```

Expected: FAIL because the current composer has no `data-im-composer-stack`, `data-im-composer-input-shell`, `data-im-composer-panel`, accessible toggle labels, or `.im-composer-glass` CSS contract.

- [ ] **Step 3: Replace the full-width slab with semantic input and panel capsules**

In `src/features/im/components.tsx`, delete `composerShellClass`, the theme branch in `composerInputShellClass`, and the Tailwind-only `composerPanelClass`. Replace them with:

```tsx
  const composerInputShellClass =
    "min-h-[40px] min-w-0 flex-1 rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,var(--client-bg)_38%)] px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--client-elevated)_18%,transparent)]";
  const composerIconButtonClass = "im-composer-icon-button shrink-0 text-[color:var(--client-muted)]";
  const composerTextareaClass =
    "max-h-[132px] min-h-[24px] w-full resize-none border-none bg-transparent p-0 text-[15px] leading-6 text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]";
  const composerPanelClass = "im-composer-glass im-composer-panel p-4";
```

Replace the composer root and input-row opening with:

```tsx
    <div
      className="im-chat-composer-root relative z-10 max-w-full px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 [overflow-x:clip]"
      data-im-composer-root="true"
    >
      <div className="im-chat-composer-stack mx-auto flex min-w-0 max-w-full flex-col" data-im-composer-stack="true">
        <div
          className="im-composer-glass im-composer-input-shell flex min-w-0 max-w-full items-end gap-2 px-2 py-2"
          data-im-composer-input-shell="true"
          data-im-composer-tone={isNight ? "night" : "day"}
        >
```

Close the input row with `</div>` and keep the optional panels as following siblings inside the stack. Close the stack immediately before the existing composer-root closing tag.

Add these exact accessible labels without changing the existing click handlers:

```tsx
aria-label={voiceMode ? "切换文字输入" : "切换语音输入"}
aria-label={panel === "emoji" ? "关闭表情面板" : "打开表情面板"}
aria-label={panel === "more" ? "关闭更多功能" : "打开更多功能"}
```

Change the two optional panel openings to:

```tsx
        <div
          className={cn(composerPanelClass, "overscroll-contain")}
          data-im-composer-panel="emoji"
        >
```

and:

```tsx
        <div className={composerPanelClass} data-im-composer-panel="more">
```

Do not change `selectEmoji`, `action.run`, `onSend`, recording pointer handlers, `onPanelChange`, or textarea state propagation.

- [ ] **Step 4: Add the reusable navigation-style glass CSS**

Add this complete block in `src/styles.css` immediately after the shared bottom-navigation glass rule ending near line 2432:

```css
.im-chat-composer-root {
  flex: 0 0 auto;
  overflow-x: clip;
  background: transparent;
}

.im-chat-composer-stack {
  width: min(100%, calc(var(--client-bottom-nav-max-width, 880px) - 24px));
  gap: 8px;
}

.client-shell .im-composer-glass {
  isolation: isolate;
  border: 1px solid color-mix(in srgb, var(--client-line) 42%, transparent);
  border-radius: 28px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--client-elevated) 18%, transparent),
      color-mix(in srgb, var(--client-bg) 8%, transparent)
    );
  box-shadow:
    0 -18px 44px color-mix(in srgb, var(--client-bg) 28%, rgba(0, 0, 0, 0.22)),
    inset 0 0 0 1px color-mix(in srgb, var(--client-elevated) 18%, transparent),
    inset 0 18px 22px -25px color-mix(in srgb, var(--client-elevated) 50%, transparent),
    inset 0 -18px 22px -25px color-mix(in srgb, var(--client-text) 18%, transparent);
  -webkit-backdrop-filter: blur(9px) saturate(1.95) contrast(1.08) brightness(1.03);
  backdrop-filter: blur(9px) saturate(1.95) contrast(1.08) brightness(1.03);
}

.im-composer-input-shell {
  min-height: 56px;
}

.im-composer-icon-button {
  min-width: 40px;
  min-height: 40px;
}

.im-composer-panel {
  min-height: 0;
  max-height: 42dvh;
  overflow-x: clip;
  overflow-y: auto;
  overscroll-behavior: contain;
  transform-origin: bottom center;
  animation: im-composer-panel-enter 180ms ease-out both;
  scrollbar-gutter: stable;
}

@keyframes im-composer-panel-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (pointer: coarse) {
  .im-composer-icon-button {
    min-width: 44px;
    min-height: 44px;
  }
}

@media (max-width: 359px) {
  .im-composer-input-shell {
    gap: 4px;
    padding-inline: 6px;
  }

  .im-composer-panel {
    padding: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .im-composer-panel {
    animation: none;
  }
}
```

Add theme-specific overrides beside the existing bottom-navigation theme rules so the composer follows the same palette without depending on navigation DOM selectors:

```css
.client-theme-black-gold .im-composer-glass,
.client-theme-noir-gold .im-composer-glass {
  background: linear-gradient(180deg, rgba(42, 42, 40, 0.2), rgba(13, 13, 13, 0.1));
  border-color: rgba(254, 222, 160, 0.16);
}

.client-theme-dark-green .im-composer-glass {
  background: linear-gradient(180deg, rgba(14, 31, 45, 0.22), rgba(7, 20, 31, 0.1));
  border-color: rgba(108, 144, 170, 0.3);
}

.client-theme-vital-mono .im-composer-glass {
  background: linear-gradient(180deg, rgba(47, 47, 48, 0.2), rgba(18, 18, 19, 0.1));
  border-color: rgba(255, 255, 255, 0.2);
}

.client-theme-cool-black-gray .im-composer-glass {
  background: linear-gradient(180deg, rgba(50, 58, 66, 0.22), rgba(13, 17, 21, 0.1));
  border-color: rgba(183, 204, 214, 0.18);
}
```

- [ ] **Step 5: Run focused tests and fix only contract regressions**

Run:

```bash
npm test -- src/features/im/components.composer.test.tsx src/features/im/pages.test.ts src/features/im/emoji.test.ts
```

Expected: all focused tests PASS. If the new test exposes an event or selector mismatch, fix the semantic composer attributes or test harness; do not bypass the real callback or replace it with local-only behavior.

- [ ] **Step 6: Run the complete IM regression suite**

Run:

```bash
npm test -- src/features/im
```

Expected: all IM test files PASS, including action-sheet, message press, formal API, store, recall, and emoji tests.

- [ ] **Step 7: Run static and production checks**

Run:

```bash
npm run lint
npm run verify:production-build
git diff --check
```

Expected: TypeScript lint exits `0`; formal production build and bundle audit exit `0`; `git diff --check` prints no whitespace errors.

- [ ] **Step 8: Perform local browser acceptance on the formal 5180 runtime**

Open `http://127.0.0.1:5180/user.html#/messages/2561` using the existing authenticated user session. Use `domcontentloaded`, not `networkidle`, because the formal IM keeps SSE connections open.

Verify each observable result:

1. At `440×956`, the full-width slab and top divider are absent; a rounded glass input capsule floats with side margins.
2. Opening emoji creates a second fully rounded glass capsule below the input with about `8px` separation; its content grows upward and scrolls internally.
3. Selecting an emoji changes the textarea and its recent list; switching directly to “更多” removes the emoji panel without a close-open jump.
4. Clicking the harmless “相册” entry invokes the existing picker/action path; close it without selecting a file.
5. Multiline text remains inside the input capsule; the send button replaces “更多” and still sends only when intentionally activated.
6. Voice mode closes the panel and preserves press/release controls.
7. Repeat at `320px` width and desktop width; there is no horizontal overflow or clipped rounded corner.
8. Check day and night themes; foreground controls remain readable.
9. Reduce the browser's visible viewport height to simulate a keyboard; the composer and panel remain visible above the reduced viewport.
10. The browser console has no new application error and there is only the expected single real-time stream per authenticated tab.

- [ ] **Step 9: Review scope and commit the micro-step**

Run:

```bash
git status --short
git diff -- src/features/im/components.composer.test.tsx src/features/im/components.tsx src/styles.css
git diff --name-only
```

Expected: only the new composer test plus intended IM component/style files are part of this task; the two pre-existing HomePage modifications remain unstaged.

Commit only the composer files:

```bash
git add src/features/im/components.composer.test.tsx src/features/im/components.tsx src/styles.css
git commit -m "feat: add floating glass IM composer"
```

Expected: one small reversible commit on `main`; no HomePage file is included.
