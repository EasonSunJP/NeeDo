# Home Level and PWA Chat Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the home avatar level, expanded chat panels, and installed-PWA composer bottom edge synchronized with their authoritative data and shared mobile layout contracts.

**Architecture:** Reuse the existing formal customer resource and shared composer panel. Separate the visual viewport measurement used for panel sizing from the fixed room height used for bottom anchoring, so installed mobile PWA layout can match the homepage navigation without weakening keyboard handling.

**Tech Stack:** React 19, TypeScript, CSS, Vitest/jsdom, Vite.

## Global Constraints

- Work only on the isolated local branch and never touch port 5180.
- Do not add mock data, API routes, database changes, migrations, remote writes, or deployment changes.
- Add a failing regression test before each production change.

---

### Task 1: Authoritative home avatar level

**Files:**
- Modify: `src/pages/user/HomePage.test.ts`
- Modify: `src/pages/user/HomePage.tsx`

**Interfaces:**
- Consumes: `Customer.experienceLevel?: number` from `useCustomerSelfProfile`.
- Produces: `SharedHomeHeader.avatarLevelLabel` as `Lv.<experienceLevel>` when the formal value exists.

- [ ] Add a regression assertion that rejects `getCustomerLevelLabel(currentCustomer.activeScore)` and requires `currentCustomer.experienceLevel`.
- [ ] Run `npm test -- src/pages/user/HomePage.test.ts` and confirm the new assertion fails.
- [ ] Replace the score-derived label with the persisted experience level.
- [ ] Rerun the same test and confirm it passes.

### Task 2: Two-row emoji and attachment panels

**Files:**
- Modify: `src/features/im/components.composer.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `.im-composer-panel` for both `data-im-composer-panel="emoji"` and `data-im-composer-panel="more"`.
- Produces: a shared preferred panel height with a two-row minimum in normal mobile viewports and shrink/scroll behavior in short viewports.

- [ ] Add CSS contract assertions for the two-row minimum and preferred height.
- [ ] Run the composer test and confirm the new assertions fail.
- [ ] Update only the shared panel sizing rules.
- [ ] Rerun the composer test and confirm it passes.

### Task 3: Installed PWA bottom anchoring

**Files:**
- Modify: `src/lib/useVisualViewportFrame.lifecycle.test.tsx`
- Modify: `src/lib/useVisualViewportFrame.test.tsx`
- Modify: `src/lib/useVisualViewportFrame.ts`
- Modify: `src/styles.css`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: `visualViewport`, PWA display mode, and mobile platform detection.
- Produces: `--im-conversation-room-height` plus the existing viewport variables.

- [ ] Add lifecycle assertions that installed iPhone/Android PWA rooms use `height:auto` and `bottom:0` when the keyboard is closed, but pixel height and `bottom:auto` while it is open.
- [ ] Run the viewport tests and confirm the new assertions fail.
- [ ] Add the room-height variable and installed-PWA closed-state bottom anchoring while retaining pixel visual height for panel sizing.
- [ ] Rerun viewport and composer tests and confirm they pass.
- [ ] Update the Step 13 implementation record with the corrected root cause and boundary.

### Task 4: Local verification and integration

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a locally committed branch merged into local `main` with fresh post-merge verification.

- [ ] Run the focused frontend tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run verify:production-build`.
- [ ] If browser layout verification is needed, prove an alternate port is free and use it without touching 5180.
- [ ] Inspect the diff, commit the implementation, merge to local `main`, rerun focused verification on `main`, and safely remove only the worktree/branch created for this task.
