# Settings Home Close And Nav Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared close control to the unified settings home header and remove the bottom navigation from that page.

**Architecture:** Extend existing scaffold props instead of creating page-local controls. `SettingsHomePage` opts out of `MobileShell` navigation and forwards close navigation to `AppTopBar`; `UnifiedSettingsPage` supplies the current portal's “me” destination.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, existing NeeDo mobile header components.

## Global Constraints

- Preserve React, TSX, Vite, existing routes, theme tokens, and portal entrypoints.
- Reuse the existing shared close control and mobile header grid.
- Do not add mocks, APIs, persistence, dependencies, or user-visible copy.
- Preserve unrelated dirty workspace files.

---

### Task 1: Settings home shell behavior

**Files:**
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`
- Modify: `src/components/client-ui/AppScaffold.tsx`
- Modify: `src/components/client-ui/SettingsDirectory.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`

**Interfaces:**
- Consumes: `MobileShell({ showBottomNav?: boolean })`, `AppTopBar({ closeTo?: string, closeLabel?: string, onClose?: () => void })`, and `getPortalMePath(portal)`.
- Produces: `PageScaffold({ showBottomNav?: boolean })` and `SettingsHomePage({ closeTo?: string, closeLabel?: string, onClose?: () => void })`.

- [x] **Step 1: Write the failing settings-home source contract**

Add a test that slices `UnifiedSettingsPage` and asserts:

```ts
expect(settingsHomeSource).toContain("closeTo={getPortalMePath(portal)}");
expect(settingsHomeSource).toContain("<SettingsHomePage");
```

Add a raw-source import for `SettingsDirectory.tsx` and assert:

```ts
expect(settingsDirectorySource).toContain("showBottomNav={false}");
expect(settingsDirectorySource).toContain("closeTo={closeTo}");
```

- [x] **Step 2: Verify RED**

Run:

```bash
npm test -- src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: the new settings-home close and bottom-navigation assertions fail because those props are not wired yet.

- [x] **Step 3: Implement the minimal shared prop wiring**

In `PageScaffold`, add `showBottomNav = true` and pass it through:

```tsx
<MobileShell
  className={className}
  navItems={navItems}
  showBottomNav={showBottomNav}
  showTopEdgeMask={showTopEdgeMask}
>
```

In `SettingsHomePage`, accept `onClose`, `closeTo`, and `closeLabel`; pass `showBottomNav={false}` to `PageScaffold` and forward the close props to `AppTopBar`.

In `UnifiedSettingsPage`, add:

```tsx
closeTo={getPortalMePath(portal)}
```

- [x] **Step 4: Verify GREEN and regression safety**

Run:

```bash
npm test -- src/features/settings/UnifiedSettingsPages.test.ts
npm run lint
git diff --check
```

Expected: all commands pass with no new warnings or whitespace errors.

- [ ] **Step 5: Verify the rendered mobile page**

Open the authenticated user settings route at an approximately 440-pixel mobile viewport. Confirm the shared close button is visible at the upper right, activates `/me`, the left back button remains, and no bottom navigation or bottom navigation safe-area gap is rendered.
