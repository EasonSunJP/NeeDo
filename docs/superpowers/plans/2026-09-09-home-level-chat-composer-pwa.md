# Home Level and PWA Chat Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the home avatar level, expanded chat panels, installed-PWA composer bottom edge, Safari keyboard frame, legacy Android theme fallbacks, and Android 9 interaction performance synchronized with their authoritative data and shared mobile layout contracts.

**Architecture:** Reuse the existing formal customer resource and shared composer panel. Separate the visual viewport measurement used for panel sizing from the room edges used for positioning, so installed mobile PWA layout can match the homepage navigation and Safari can anchor to the keyboard edge. Add a feature-detected legacy Chromium fallback without altering modern theme rendering.

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

- [x] Add a regression assertion that rejects `getCustomerLevelLabel(currentCustomer.activeScore)` and requires `currentCustomer.experienceLevel`.
- [x] Run `npm test -- src/pages/user/HomePage.test.ts` and confirm the new assertion fails.
- [x] Replace the score-derived label with the persisted experience level.
- [x] Rerun the same test and confirm it passes.

### Task 2: Two-row emoji and attachment panels

**Files:**
- Modify: `src/features/im/components.composer.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `.im-composer-panel` for both `data-im-composer-panel="emoji"` and `data-im-composer-panel="more"`.
- Produces: a shared preferred panel height with a two-row minimum in normal mobile viewports and shrink/scroll behavior in short viewports.

- [x] Add CSS contract assertions for the two-row minimum and preferred height.
- [x] Run the composer test and confirm the new assertions fail.
- [x] Update only the shared panel sizing rules.
- [x] Rerun the composer test and confirm it passes.

### Task 3: Installed PWA bottom anchoring

**Files:**
- Modify: `src/lib/useVisualViewportFrame.lifecycle.test.tsx`
- Modify: `src/lib/useVisualViewportFrame.test.tsx`
- Modify: `src/lib/useVisualViewportFrame.ts`
- Modify: `src/styles.css`
- Add: `src/lib/mobileViewportPolicy.test.ts`
- Modify: all eight formal HTML entry files
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: `visualViewport`, PWA display mode, and mobile platform detection.
- Produces: `--im-conversation-room-height` plus the existing viewport variables.

- [x] Add lifecycle assertions that installed iPhone/Android PWA rooms use `height:auto` and `bottom:0` when the keyboard is closed, and measured top/bottom edges while it is open.
- [x] Run the viewport tests and confirm the new assertions fail.
- [x] Add the room-height variable and installed-PWA closed-state bottom anchoring while retaining pixel visual height for panel sizing.
- [x] Add a Safari keyboard regression proving the room bottom equals the measured visual viewport bottom.
- [x] Add `interactive-widget=resizes-content` to formal HTML entries so capable Chromium resizes the layout viewport natively, with a regression test covering every entry.
- [x] Rerun viewport and composer tests and confirm they pass.
- [x] Update the Step 13 implementation record with the corrected root cause and boundary.

### Task 4: Legacy Android Chromium theme fallback

**Files:**
- Modify: `src/features/im/chat-home.test.tsx`
- Modify: `src/features/im/chat-home.tsx`
- Modify: `src/theme/ClientThemeProvider.test.ts`
- Modify: `src/theme/ClientThemeProvider.tsx`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

- [x] Add failing assertions for unsupported-`color-mix()` border/background fallbacks and theme `color-scheme`.
- [x] Add a dedicated chat-home surface hook and feature-detected fallback styles.
- [x] Synchronize the root browser color scheme with the selected client theme.
- [x] Rerun the Android/theme tests and confirm they pass.

### Task 5: Android 9 startup and interaction profile

**Files:**
- Add: `src/lib/clientPerformance.ts`
- Add: `src/lib/clientPerformance.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [x] Reproduce the reported OPPO class from its Android 9 UA in a failing profile test.
- [x] Detect legacy/constrained Android without hard-coding a handset model.
- [x] Stop automatic multi-megabyte pet animation preloading and continuous motion only on the reduced profile.
- [x] Shorten the fixed splash delay, switch its primary image to async decoding, and remove its duplicate decorative decode on the reduced profile.
- [x] Reduce GPU-heavy blur, shadow and animation paint costs while retaining the same data and layout.

### Task 6: Local verification and integration

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a locally committed branch merged into local `main` with fresh post-merge verification.

- [x] Run the focused frontend tests.
- [x] Run `npm run lint`.
- [x] Run `npm run verify:production-build`.
- [x] If browser layout verification is needed, prove an alternate port is free and use it without touching 5180.
- [ ] Inspect the diff, commit the implementation, merge to local `main`, rerun focused verification on `main`, and safely remove only the worktree/branch created for this task.
