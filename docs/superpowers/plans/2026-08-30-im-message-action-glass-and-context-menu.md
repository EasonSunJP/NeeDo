# IM Message Action Menu Repair Implementation Plan

> **For Codex:** Execute this plan inline with the `executing-plans` skill. Keep the existing uncommitted `HomePage` work and the in-progress `ImChatComposer` glass work intact; do not stage or overwrite unrelated hunks.

**Goal:** Restore every message action and quick reaction, match the action menu to the navigation glass surface, suppress the browser context menu on every NeeDo page, and keep the chat composer mounted except while the media viewer is fullscreen.

**Architecture:** Install one document-bubble `contextmenu` guard from the shared Vite entry so every portal and role entry is covered after NeeDo components receive the event. Keep the message action layer as an independent portal above the conversation while the composer remains in the conversation tree. Reuse a shared liquid-glass surface class for the navigation and action menu instead of duplicating an opaque menu style.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, Tailwind utility classes, project CSS theme tokens.

---

## Task 1: Global native context-menu guard

**Files:**
- Create: `src/lib/nativeContextMenuGuard.ts`
- Create: `src/lib/nativeContextMenuGuard.test.ts`
- Modify: `src/main.tsx`
- Modify: `portal-entry.js`

1. Add a jsdom test proving the document guard prevents a cancelable `contextmenu` event after a descendant NeeDo handler receives it unmodified, and stops preventing after cleanup.
2. Run `npm test -- src/lib/nativeContextMenuGuard.test.ts` and confirm it fails because the helper does not yet exist.
3. Implement `installNativeContextMenuGuard(target = document)` with `preventDefault()` only—never `stopPropagation()`—and return a cleanup function.
4. Install it in `src/main.tsx` before React mounts, register cleanup with Vite HMR disposal, and add the same minimal bubble guard at the top of `portal-entry.js` so all eight HTML portals are protected before the asynchronous React import starts. The bubble phase is intentional: Chrome must let the React message handler open the NeeDo menu before the document cancels the browser default.
5. Re-run the focused test and confirm it passes.

## Task 2: Message action event boundary and functional controls

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/pages.message-pressable.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/pages.tsx`

1. Extend action-sheet tests so `contextmenu` is prevented on the full action layer and backdrop, while the existing six action callbacks, six quick reactions, and more button remain callable through complete pointer sequences.
2. Extend `MessagePressable` tests so a right-click is prevented and opens the NeeDo menu, and a long-press release suppresses only the synthetic release click while the next deliberate activation remains available.
3. Run the two focused test files and confirm the new assertions fail against the current implementation.
4. Add a `contextmenu` handler to the full action layer/backdrop boundary and preserve bubbling needed by application controls. Keep the long-press activation guard scoped to the opening pointer sequence.
5. Re-run the focused tests and confirm every callback and reaction assertion passes.

## Task 3: Composer lifecycle independent from the action menu

**Files:**
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/pages.tsx`

1. Add source-contract assertions that the message action sheet and composer are siblings, the composer is gated only by `!mediaPreview`, and `openMessageMenu` no longer clears the current composer panel or voice mode.
2. Run `npm test -- src/features/im/pages.test.ts` and confirm the new contract fails.
3. Replace the `menuState ? actionSheet : composer` branch with two independent branches: render the action sheet when `menuState` exists; render quoted reply, `ImChatComposer`, and file input when `!mediaPreview`.
4. Remove the `setPanel(null)` and `setVoiceMode(false)` calls from `openMessageMenu` so draft/panel/voice state is not destroyed.
5. Re-run the focused test and confirm the lifecycle contract passes.

## Task 4: Navigation-matched liquid-glass action surface

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/components/mobile/MobileShell.tsx`
- Modify: `src/components/mobile/MobileShell.test.ts`
- Modify: `src/styles.css`

1. Add assertions that both the bottom-navigation panel and action sheet carry `client-liquid-glass-surface`, and that the sheet no longer carries the opaque elevated background utility.
2. Run the focused component tests and confirm the new shared-surface assertions fail.
3. Add `client-liquid-glass-surface` to the navigation panel and message action sheet. Alias the existing composer glass rules to the same shared surface while preserving the current uncommitted composer implementation.
4. Move common border, translucent gradient, shadow, blur, and theme variants into the shared selector. Give the menu arrow a token-based glass background/border matching its parent surface.
5. Re-run the focused component tests and confirm they pass.

## Task 5: Verification and browser acceptance

**Files:**
- Verify only; do not modify unrelated files.

1. Run the full focused regression set:
   `npm test -- src/lib/nativeContextMenuGuard.test.ts src/features/im/components.action-menu.test.tsx src/features/im/pages.message-pressable.test.tsx src/features/im/pages.test.ts src/features/im/components.composer.test.tsx src/components/mobile/MobileShell.test.ts`
2. Run `npm run lint`.
3. Run `npm run verify:production-build`.
4. In the real local application at `http://127.0.0.1:5180/user.html#/messages/2561`, verify desktop and mobile-width behavior:
   - right-click anywhere never opens the browser menu;
   - right-click/long-press on a message opens only the NeeDo action menu;
   - all six action buttons execute their expected path;
   - each quick reaction persists visibly, including after reload where practical;
   - the composer remains visible and retains its draft/panel while the menu is open;
   - the composer is absent only in fullscreen media preview and returns with its prior state after close;
   - the action container visually matches the active navigation glass theme and does not overflow.
5. Inspect console errors during the acceptance flow and record any unrelated pre-existing extension noise separately.
6. Review `git diff` and `git status`; report task-owned changes separately from the preserved pre-existing `HomePage` and composer edits. Do not commit overlapping dirty files unless ownership is unambiguous.
