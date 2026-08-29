# IM Return-to-Latest Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a fixed circular down-arrow in an IM conversation whenever the latest-message position is outside the visible message area, and return smoothly to the latest message when activated.

**Architecture:** Add a small observer utility that treats an end-of-list sentinel as the authoritative latest position and falls back to the existing near-bottom calculation when `IntersectionObserver` is unavailable. Render a non-draggable chat-specific button using the same visual classes and fixed position as the Social compose FAB, then replace the existing new-message-count pill in the shared conversation page.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, JSDOM, Tailwind utility classes, existing NeeDo client theme tokens.

## Global Constraints

- Use the existing formal IM Store, pagination, SSE, and persisted database data; add no mock, API, polling loop, or browser-local business truth.
- Keep the existing automatic bottom-stick behavior when the active user sends or is already near the bottom.
- The button uses the Social compose FAB's 58 px circular glass visual and `bottom-[calc(env(safe-area-inset-bottom)+104px)] right-4` position.
- The button is not draggable and has the accessible name `回到最新消息`.
- Replace the existing `N 条新消息` pill; do not keep two return controls.
- Hide the button while the message action menu or full-screen media preview is open.
- Respect `prefers-reduced-motion: reduce` by using instant rather than smooth scrolling.
- Preserve unrelated dirty-worktree changes.

---

## File Map

- Create `src/features/im/conversation-scroll.ts`: observer/fallback lifecycle and reduced-motion scroll behavior.
- Create `src/features/im/conversation-scroll.test.ts`: deterministic observer, fallback, cleanup, and motion tests.
- Modify `src/features/im/components.tsx`: exported presentational `ImReturnToLatestButton`.
- Modify `src/features/im/components.composer.test.tsx`: real DOM assertions for visual class, arrow, accessibility, and click behavior.
- Modify `src/features/im/pages.tsx`: end sentinel, visibility state, observer wiring, return action, and removal of the count pill.
- Modify `src/features/im/pages.test.ts`: integration contract assertions for sentinel wiring, hidden overlay states, and old pill removal.
- Modify `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`: add the completed frontend-only return-to-latest behavior after verification.

### Task 1: Latest-position observer utility

**Files:**
- Create: `src/features/im/conversation-scroll.ts`
- Create: `src/features/im/conversation-scroll.test.ts`

**Interfaces:**
- Consumes: a message scroller `HTMLElement`, its end sentinel `HTMLElement`, and a visibility callback.
- Produces: `observeImLatestPosition(options): () => void` and `getImReturnScrollBehavior(): ScrollBehavior`.

- [ ] **Step 1: Write failing observer and fallback tests**

```ts
/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getImReturnScrollBehavior, observeImLatestPosition } from "./conversation-scroll";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("observeImLatestPosition", () => {
  it("reports sentinel intersection and disconnects the observer", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    let callback: IntersectionObserverCallback | undefined;
    vi.stubGlobal("IntersectionObserver", vi.fn((nextCallback: IntersectionObserverCallback) => {
      callback = nextCallback;
      return { disconnect, observe };
    }));
    const root = document.createElement("div");
    const target = document.createElement("div");
    const onVisibilityChange = vi.fn();

    const cleanup = observeImLatestPosition({ onVisibilityChange, root, target });
    callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(observe).toHaveBeenCalledWith(target);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("falls back to the existing near-bottom distance calculation", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const root = document.createElement("div");
    Object.defineProperties(root, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 300, writable: true }
    });
    const onVisibilityChange = vi.fn();
    const cleanup = observeImLatestPosition({ onVisibilityChange, root, target: document.createElement("div") });

    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    root.scrollTop = 550;
    root.dispatchEvent(new Event("scroll"));
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    cleanup();
  });
});

describe("getImReturnScrollBehavior", () => {
  it("disables smooth scrolling for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(getImReturnScrollBehavior()).toBe("auto");
  });

  it("uses smooth scrolling otherwise", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    expect(getImReturnScrollBehavior()).toBe("smooth");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/im/conversation-scroll.test.ts`

Expected: FAIL because `./conversation-scroll` does not exist.

- [ ] **Step 3: Implement the observer utility**

```ts
const IM_NEAR_BOTTOM_THRESHOLD_PX = 120;

type ObserveImLatestPositionOptions = {
  onVisibilityChange: (visible: boolean) => void;
  root: HTMLElement;
  target: HTMLElement;
};

export function observeImLatestPosition({ onVisibilityChange, root, target }: ObserveImLatestPositionOptions) {
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(Boolean(entry?.isIntersecting)),
      { root, threshold: 0.01 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }

  const update = () => {
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
    onVisibilityChange(remaining < IM_NEAR_BOTTOM_THRESHOLD_PX);
  };
  root.addEventListener("scroll", update, { passive: true });
  update();
  return () => root.removeEventListener("scroll", update);
}

export function getImReturnScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/features/im/conversation-scroll.test.ts`

Expected: PASS with 0 failed tests.

- [ ] **Step 5: Commit the observer utility**

```bash
git add src/features/im/conversation-scroll.ts src/features/im/conversation-scroll.test.ts
git commit -m "feat: observe IM latest message position"
```

### Task 2: Circular return button and conversation integration

**Files:**
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.composer.test.tsx`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.ts`

**Interfaces:**
- Consumes: `observeImLatestPosition`, `getImReturnScrollBehavior`, existing `listRef`, `menuState`, and `mediaPreview`.
- Produces: exported `ImReturnToLatestButton({ onActivate, visible })` and the in-list `data-im-latest-position` sentinel.

- [ ] **Step 1: Write failing DOM tests for the circular control**

Append to `src/features/im/components.composer.test.tsx`:

```tsx
import { ImChatComposer, ImReturnToLatestButton } from "./components";

it("renders the fixed Social-FAB-style down arrow only when requested", async () => {
  const onActivate = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => root.render(<ImReturnToLatestButton onActivate={onActivate} visible />));
  const button = container.querySelector<HTMLButtonElement>("[aria-label='回到最新消息']");
  expect(button).not.toBeNull();
  expect(button?.className).toContain("client-floating-action-button");
  expect(button?.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+104px)]");
  expect(button?.querySelector("[data-im-return-arrow='true']")).not.toBeNull();
  await act(async () => button?.click());
  expect(onActivate).toHaveBeenCalledOnce();

  await act(async () => root.render(<ImReturnToLatestButton onActivate={onActivate} visible={false} />));
  expect(container.querySelector("[aria-label='回到最新消息']")).toBeNull();
  await act(async () => root.unmount());
});
```

Add source contract assertions to `src/features/im/pages.test.ts`:

```ts
expect(componentSource).toContain('data-im-latest-position="true"');
expect(componentSource).toContain("observeImLatestPosition");
expect(componentSource).toContain("!menuState && !mediaPreview");
expect(componentSource).toContain("getImReturnScrollBehavior()");
expect(componentSource).not.toContain("条新消息");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/features/im/components.composer.test.tsx src/features/im/pages.test.ts`

Expected: FAIL because the button export and sentinel wiring are absent and the old count pill remains.

- [ ] **Step 3: Implement the presentational button**

Add to `src/features/im/components.tsx`:

```tsx
export function ImReturnToLatestButton({
  onActivate,
  visible
}: {
  onActivate: () => void;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <button
      aria-label="回到最新消息"
      className="focus-ring client-floating-action-button fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] right-4 z-50 grid place-items-center"
      onClick={onActivate}
      type="button"
    >
      <span aria-hidden="true" className="client-floating-action-button__shine" />
      <span className="client-floating-action-button__icon">
        <svg aria-hidden="true" data-im-return-arrow="true" fill="none" viewBox="0 0 24 24">
          <path d="M12 5v11m-4-4 4 4 4-4M7 20h10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Wire the sentinel and visibility state into the conversation page**

In `src/features/im/pages.tsx`:

```diff
   ImMessageSelectionHandles,
   ImQuotedMessagePreview,
+  ImReturnToLatestButton,
   hasActiveImMessageTextSelection,
```

```tsx
import { getImReturnScrollBehavior, observeImLatestPosition } from "./conversation-scroll";
```

Replace `newMessageCount` state with:

```tsx
const [latestPositionVisible, setLatestPositionVisible] = useState(true);
const latestPositionRef = useRef<HTMLDivElement | null>(null);
```

Observe after the existing list-bottom effects:

```tsx
useEffect(() => {
  const root = listRef.current;
  const target = latestPositionRef.current;
  if (!root || !target) {
    setLatestPositionVisible(true);
    return undefined;
  }
  return observeImLatestPosition({ onVisibilityChange: setLatestPositionVisible, root, target });
}, [conversationId, messages.length]);
```

Place the sentinel after the existing message-row rendering expression and immediately before the closing tag of the `data-scroll-drag-ignore="true"` message scroller:

```tsx
<div aria-hidden="true" className="h-px w-full" data-im-latest-position="true" ref={latestPositionRef} />
```

Replace the old count pill with:

```tsx
<ImReturnToLatestButton
  onActivate={() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ behavior: getImReturnScrollBehavior(), top: list.scrollHeight });
  }}
  visible={!latestPositionVisible && !menuState && !mediaPreview}
/>
```

Remove `setNewMessageCount(0)`, the count increment branch, and the old `N 条新消息` button. Keep `listWasNearBottomRef` and its existing auto-stick decisions unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/features/im/conversation-scroll.test.ts src/features/im/components.composer.test.tsx src/features/im/pages.test.ts`

Expected: PASS with 0 failed tests.

- [ ] **Step 6: Run the complete IM regression set**

Run: `npm test -- src/features/im`

Expected: all IM test files pass with 0 failed tests.

- [ ] **Step 7: Commit the integrated feature**

```bash
git add src/features/im/components.tsx src/features/im/components.composer.test.tsx src/features/im/pages.tsx src/features/im/pages.test.ts
git commit -m "feat: add IM return-to-latest control"
```

### Task 3: Formal verification, documentation, and browser acceptance

**Files:**
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: the completed observer and UI integration from Tasks 1–2.
- Produces: release evidence and a concise formal IM completion note.

- [ ] **Step 1: Run static verification**

Run:

```bash
npm run lint
npm run verify:production-build
git diff --check
```

Expected: every command exits 0. Existing documented bundle-size warnings may remain, but no new error is accepted.

- [ ] **Step 2: Perform 5180 browser acceptance**

Open the existing formal acceptance conversation at `http://127.0.0.1:5180/user.html#/messages/2561` and verify:

1. At the latest message, `[aria-label="回到最新消息"]` is absent.
2. Scroll upward until `[data-im-latest-position="true"]` leaves the view; the circular down-arrow appears at the same coordinate as the Social compose FAB.
3. Click the arrow; the list reaches its maximum scroll position and the button disappears.
4. Scroll upward again, receive or send a new message from the paired formal account, and confirm the history position is preserved while the button remains available.
5. Open the message action menu and media preview separately; the button is absent in both overlay states.
6. Repeat at 440 × 956 and a desktop viewport; confirm no horizontal overflow and no composer overlap.

- [ ] **Step 3: Record the verified behavior**

Append this item to `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` only after Steps 1–2 pass:

```md
## 6.10 回到最新消息按钮（2026-08-30）

- 会话页以消息列表末尾标记的可见性决定是否显示“回到最新消息”圆形向下箭头；按钮复用动态发布按钮的固定位置和玻璃视觉，但不可拖动。
- 用户查看历史消息时不会因新消息到达被强制拉到底部；点击按钮或手动回到底部后按钮自动消失，消息菜单和媒体全屏预览期间不会遮挡操作。
- 该能力仅维护前端瞬时滚动状态，不新增接口、轮询、mock 或浏览器持久化业务数据。
```

- [ ] **Step 4: Commit documentation and verification evidence**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs: record IM latest-message navigation"
```

- [ ] **Step 5: Sync the reviewed commits to local `main` without unrelated dirty changes**

Run from the feature checkout after the design, plan, implementation, and completion-note commits exist:

```bash
git worktree add .worktrees/im-return-to-latest-main main
git -C .worktrees/im-return-to-latest-main cherry-pick "$(git log -1 --format=%H --grep='^docs: define IM return-to-latest button$')"
git -C .worktrees/im-return-to-latest-main cherry-pick "$(git log -1 --format=%H --grep='^docs: plan IM return-to-latest button$')"
git -C .worktrees/im-return-to-latest-main cherry-pick "$(git log -1 --format=%H --grep='^feat: observe IM latest message position$')"
git -C .worktrees/im-return-to-latest-main cherry-pick "$(git log -1 --format=%H --grep='^feat: add IM return-to-latest control$')"
git -C .worktrees/im-return-to-latest-main cherry-pick "$(git log -1 --format=%H --grep='^docs: record IM latest-message navigation$')"
npm --prefix .worktrees/im-return-to-latest-main test -- src/features/im
npm --prefix .worktrees/im-return-to-latest-main run lint
npm --prefix .worktrees/im-return-to-latest-main run verify:production-build
git worktree remove .worktrees/im-return-to-latest-main
```

Expected: every cherry-pick and verification command exits 0, local `main` contains only the five named feature commits, and the original checkout keeps all unrelated changes. Do not push or deploy without explicit user authorization.
