# IM Width-Aware Action Menu and Click Reliability Plan

> **For implementation:** Execute one task at a time with test-driven development. Keep formal IM mutations, permissions, and persistence unchanged.

**Goal:** Make the six message actions fit on one row whenever the action sheet itself is wide enough, fall back to an exact 3-by-2 grid only when necessary, and make every action and quick reaction respond reliably to pointer and touch input.

**Architecture:** Keep the existing `ImMessageActionSheet` and formal callbacks. Measure the rendered menu content, derive one compact density state from that measurement, and render the action and reaction rows from that state instead of viewport breakpoints. Treat the portal sheet as an interaction island so the conversation-level dismissal gesture cannot unmount it before a button click completes.

**Tech Stack:** React 19, TypeScript, Vitest, JSDOM, Vite, existing formal IM API/store.

## Constraints

- Use the menu's rendered content width, not `window.innerWidth` or a Tailwind viewport breakpoint.
- At content width `>= 304px`, render all six actions in one row; below it, render exactly three actions per row.
- At content width `>= 336px`, show all six quick reactions plus the more button; below it, show four quick reactions plus the more button.
- Preserve the existing placement rule: the quick-reaction row stays on the side nearest the selected message.
- Preserve 44px minimum touch targets and left/right message anchoring.
- Do not add polling, mock data, a second menu, permission bypasses, or alternative mutation paths.
- A failed formal mutation must keep the existing rollback/error behavior.

---

### Task 1: Lock the width contract with failing tests

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Read: `src/features/im/components.tsx:1980-2280`

- [ ] Add a reusable test renderer that supplies six named action spies, a reaction spy, an expand spy, and deterministic `getBoundingClientRect()` values for the anchor, sheet, and inner content.

- [ ] Add a wide-content test (`content width = 360`) asserting:
  - the action grid has the wide one-row state;
  - all six action buttons are visible;
  - all six quick reactions and the more button are visible;
  - no viewport-width utility class controls either result.

- [ ] Add a narrow-content test (`content width = 280`) asserting:
  - the action grid has the exact three-column state;
  - only four quick reactions plus the more button are visible;
  - the quick-reaction section remains nearest the selected message for both `above` and `below` placement.

- [ ] Run the focused test and confirm RED:

```bash
npm test -- src/features/im/components.action-menu.test.tsx
```

Expected failure: current markup still uses `min-[480px]` viewport breakpoints and cannot distinguish two menu widths at the same viewport width.

---

### Task 2: Replace viewport breakpoints with measured menu density

**Files:**
- Modify: `src/features/im/components.tsx:1980-2280`
- Modify: `src/features/im/components.action-menu.test.tsx`

- [ ] Add a ref to the inner menu content and include its rendered width in the existing layout measurement. Update it on mount, resize, and the existing menu-position refresh path without installing a polling timer.

- [ ] Derive explicit booleans from the measured content width:

```tsx
const actionsFitOneRow = menuContentWidth >= 304;
const reactionsFitFullRow = menuContentWidth >= 336;
```

- [ ] Render the action grid with exactly one of `grid-cols-6` or `grid-cols-3`. Remove `min-[480px]:grid-cols-6`.

- [ ] Render all reaction buttons, but hide reaction indices 4 and 5 only when `reactionsFitFullRow` is false. Make the quick-reaction grid five columns in compact mode and seven columns in full mode. Remove `min-[480px]` visibility/layout classes.

- [ ] Guard initial measurement so the first paint uses the compact safe layout and switches once after the real width is known; avoid state updates when the measured width has not changed.

- [ ] Run the focused test and confirm GREEN:

```bash
npm test -- src/features/im/components.action-menu.test.tsx
```

---

### Task 3: Reproduce and isolate the lost-click path

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/pages.test.ts`
- Read: `src/features/im/pages.tsx:2700-3050`

- [ ] Add a behavior test that wraps the action sheet in an outer surface which dismisses on pointer-down. Dispatch the real sequence `pointerdown -> pointerup -> click` on each of the six buttons. Assert each corresponding spy fires exactly once and the outer dismiss handler does not run first.

- [ ] Add equivalent pointer-sequence tests for:
  - each visible quick reaction;
  - the more button opening and closing the expanded catalog;
  - a disabled action remaining inert;
  - right-click/context-menu inside the custom sheet not opening the native browser menu.

- [ ] Add a source/behavior assertion around the conversation capture handler so targets inside `[data-im-message-action-sheet="true"]` are excluded using the event's composed path as well as `closest()`. This covers portal descendants and SVG icon targets.

- [ ] Run the focused tests and confirm at least one new interaction assertion is RED before changing production code:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts
```

If all new assertions unexpectedly pass, do not add speculative event code. Reproduce once in the signed-in browser with event instrumentation and move the failing boundary into a test first.

---

### Task 4: Make the action sheet an interaction island

**Files:**
- Modify: `src/features/im/components.tsx:1980-2280`
- Modify: `src/features/im/pages.tsx:2700-3050`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/pages.test.ts`

- [ ] Stop pointer-down, pointer-up, click, and context-menu propagation at the sheet boundary while leaving the backdrop button responsible for outside dismissal.

- [ ] Keep every action on a native `<button type="button">`; invoke the existing callback once from `onClick`. Do not move formal mutations into pointer handlers.

- [ ] Make the conversation capture guard inspect `nativeEvent.composedPath()` and return when any path element belongs to the action sheet, composer, or other already-exempt interactive surface.

- [ ] Prevent the native desktop context menu only for message press targets and the custom action sheet. Preserve ordinary context menus elsewhere in the app.

- [ ] Run focused tests and confirm GREEN:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts
```

---

### Task 5: Verify formal callbacks and persistence contracts

**Files:**
- Modify if needed: `src/features/im/pages.test.ts`
- Verify: `src/features/im/pages.tsx`
- Verify: `src/features/im/formal-api.ts`

- [ ] Assert the six menu entries still map to the intended existing callbacks: reply, forward, copy, pin/unpin, recall, and delete.

- [ ] Assert a quick reaction calls `store.setMessageReaction` once with the selected message ID and emoji, and that the optimistic rollback path remains active on API failure.

- [ ] Assert disabled recall/delete states do not bypass ownership, expiry, or server authorization.

- [ ] Run the complete formal IM test subset:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts src/features/im/formal-store.test.ts src/features/im/formal-api.test.ts
```

Expected: all tests pass without React act warnings or unhandled promise rejections.

---

### Task 6: Static, build, and signed-in 5180 acceptance

**Files:**
- Verify only; no unrelated edits.

- [ ] Run:

```bash
npm run lint
npm run verify:production-build
```

- [ ] On `http://127.0.0.1:5180/user.html#/messages/2561`, test a left-side and right-side text message and a media message:
  - wide menu: six actions in one compressed row;
  - narrow emulation: exact 3-by-2 actions and reduced quick reactions;
  - menu remains aligned to the selected message side;
  - all visible actions work on actual clicks;
  - quick reactions persist after reload/reconnect;
  - native desktop context menu does not appear on message long-press/right-click;
  - clicking outside still closes the sheet.

- [ ] Check browser console and network results. Treat any 4xx/5xx, duplicate mutation, unhandled rejection, or reload-only state as a failed acceptance.

---

### Task 7: Commit only the scoped IM fix

- [ ] Review the diff and leave concurrent homepage/carousel work untouched.

```bash
git diff -- src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.tsx src/features/im/pages.test.ts
git status --short
```

- [ ] Commit only the four scoped files after all checks and browser acceptance pass:

```bash
git add src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.tsx src/features/im/pages.test.ts
git commit -m "fix: stabilize adaptive IM message actions"
```
