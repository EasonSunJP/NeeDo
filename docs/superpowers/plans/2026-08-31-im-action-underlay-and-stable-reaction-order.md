# IM Action Underlay And Stable Reaction Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the message-menu underlay sharp while deferring common-reaction reordering until the next emoji-panel opening in both chat and Social.

**Architecture:** Keep `ImMessageActionSheet` and its glass menu unchanged, but replace the blur-bearing backdrop utility with one filter-free backdrop class. Keep recent-reaction persistence immediate while `ImChatComposer` renders a per-open snapshot; Social inherits the behavior through its existing shared composer.

**Tech Stack:** React 19, TypeScript 5.9, Vitest/JSDOM, Tailwind utilities, shared CSS theme tokens.

## Global Constraints

- Do not change the message menu, arrow, action callbacks, positioning, or glass material.
- Preserve the backdrop's light black dimming and outside-click behavior.
- Do not change REST/SSE, RBAC, Prisma, migrations, reaction categories, or recent-reaction storage format.
- Use TDD and keep the production edit limited to the shared IM component and the backdrop CSS rule.

---

### Task 1: Lock the filter-free underlay contract

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `ImMessageActionSheet` portal and backdrop button.
- Produces: `.im-message-action-backdrop`, a pure dimming layer with no filter.

- [ ] **Step 1: Write the failing component/CSS assertions**

Assert that the backdrop uses `im-message-action-backdrop`, contains no `backdrop-blur` utility, and that the CSS rule declares `-webkit-backdrop-filter: none`, `backdrop-filter: none`, and `filter: none`. Also assert that the sheet still has `client-liquid-glass-surface` and the arrow still has `client-liquid-glass-arrow`.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/features/im/components.action-menu.test.tsx`

Expected: FAIL because the current backdrop still contains `backdrop-blur-[1px]` and has no filter-free class.

- [ ] **Step 3: Implement the minimal backdrop change**

Replace only the backdrop class with `im-message-action-backdrop absolute inset-0 bg-black/20`, then add:

```css
.im-message-action-backdrop {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  filter: none;
}
```

- [ ] **Step 4: Re-run the focused test and observe GREEN**

Run: `npm test -- src/features/im/components.action-menu.test.tsx`

Expected: all tests in the file pass.

### Task 2: Freeze common-reaction order per emoji-panel opening

**Files:**
- Modify: `src/features/im/components.composer.test.tsx`
- Modify: `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- Modify: `src/features/im/components.tsx`

**Interfaces:**
- Consumes: `getRecentImReactionSnapshot()` and `recordRecentImReaction(value)`.
- Produces: one visible recent-reaction snapshot for each continuous `panel === "emoji"` interval.

- [ ] **Step 1: Write failing chat and Social interaction tests**

For each entry, open the emoji panel, capture the common-reaction order, select a value that was not first, assert the open panel retains the captured order, close the panel, reopen it, and assert the selected value is now first.

- [ ] **Step 2: Run both tests and observe RED**

Run: `npm test -- src/features/im/components.composer.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx`

Expected: FAIL because the open composer subscribes directly to the live recent-reaction array and reorders immediately.

- [ ] **Step 3: Implement a per-open snapshot in `ImChatComposer`**

Keep one state value initialized from `getRecentImReactionSnapshot()`. On a transition into `panel === "emoji"`, refresh it in `useLayoutEffect`; while the panel remains open, continue recording selections but do not replace the visible state.

- [ ] **Step 4: Re-run both tests and observe GREEN**

Run: `npm test -- src/features/im/components.composer.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx`

Expected: both test files pass with no React act warnings.

### Task 3: Verify the scoped regression

**Files:**
- Verify only.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: fresh verification evidence for the handoff.

- [ ] **Step 1: Run the complete focused interaction suite**

Run: `npm test -- src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/im/pages.message-pressable.test.tsx src/features/im/pages.test.ts`

- [ ] **Step 2: Run static and production checks**

Run: `npm run lint`

Run: `npm run verify:production-build`

Run: `git diff --check`

- [ ] **Step 3: Review the exact scope**

Run: `git diff -- src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/styles.css docs/superpowers/specs/2026-08-31-im-action-underlay-and-stable-reaction-order-design.md docs/superpowers/plans/2026-08-31-im-action-underlay-and-stable-reaction-order.md`

Expected: no menu/arrow styling changes, no backend/data changes, and no unrelated files.

