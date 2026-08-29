# User Center NeeDo ID Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete ID row on `/me` copy only the formal public NeeDo ID, excluding the visible `ID ` prefix.

**Architecture:** Keep the formal profile read path unchanged and add one view-only Clipboard API action inside `CompleteUserCenterPage`. Reuse the page's existing toast state for success and failure feedback, and lock the exact copied value with jsdom interaction tests.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, jsdom, Tailwind CSS, Vite 7.

## Global Constraints

- Copy exactly `currentCustomer.systemId`; never copy the visible `ID ` prefix or space.
- Keep the ID sourced from `GET /api/v1/customer-profile/me`; do not add mock data or a fallback ID.
- Do not change the backend, API, database, migration, RBAC, public-ID format, routes, themes, or other profile cards.
- Reuse the existing localized strings `复制 NeeDo ID`, `已复制`, and `复制失败，请手动复制`; add no new user-visible copy.
- Preserve the current ID typography and layout while making the complete row a native button with keyboard and focus behavior.

---

### Task 1: Copy the formal NeeDo ID from the complete row

**Files:**
- Modify: `src/pages/user/UserCenterPage.interaction.test.tsx:13-310`
- Modify: `src/pages/user/UserCenterPage.tsx:579-968`

**Interfaces:**
- Consumes: `currentCustomer.systemId: string`, `navigator.clipboard.writeText(value: string): Promise<void>`, and the existing `setProfileToastMessage(message: string)` state setter.
- Produces: a native `button[aria-label="复制 NeeDo ID"]` that writes only `currentCustomer.systemId` and shows an existing success or failure toast.

- [ ] **Step 1: Add the clipboard test seam and failing success test**

Add this property after `previewCustomer` in the hoisted `testState` object:

```tsx
writeClipboardText: vi.fn()
```

Immediately after `vi.clearAllMocks()` in `beforeEach`, install the Clipboard API seam:

```tsx
testState.writeClipboardText.mockResolvedValue(undefined);
Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText: testState.writeClipboardText }
});
```

Add this interaction test after the existing compact-name test:

```tsx

it("copies only the formal NeeDo ID when the complete ID row is clicked", async () => {
  await renderUserCenter();

  const idRow = container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]');

  expect(idRow).not.toBeNull();
  expect(idRow?.textContent).toContain("ID u3141592653");
  await click(idRow!);

  await waitFor(() => expect(testState.writeClipboardText).toHaveBeenCalledWith("u3141592653"));
  expect(testState.writeClipboardText).not.toHaveBeenCalledWith("ID u3141592653");
  await waitFor(() => expect(container.textContent).toContain("已复制"));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/pages/user/UserCenterPage.interaction.test.tsx
```

Expected: FAIL because no `button[aria-label="复制 NeeDo ID"]` exists in `UserCenterPage`.

- [ ] **Step 3: Add the failing Clipboard API rejection test**

Add:

```tsx
it("shows an explicit failure when the NeeDo ID cannot be copied", async () => {
  testState.writeClipboardText.mockRejectedValueOnce(new Error("clipboard denied"));
  await renderUserCenter();

  const idRow = container.querySelector<HTMLButtonElement>('button[aria-label="复制 NeeDo ID"]');

  expect(idRow).not.toBeNull();
  await click(idRow!);

  await waitFor(() => expect(container.textContent).toContain("复制失败，请手动复制"));
});
```

- [ ] **Step 4: Implement the minimal copy action and semantic row**

Inside `CompleteUserCenterPage`, add:

```tsx
const copyNeedoId = async () => {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("clipboard_unavailable");
    }
    await navigator.clipboard.writeText(currentCustomer.systemId);
    setProfileToastMessage("已复制");
  } catch {
    setProfileToastMessage("复制失败，请手动复制");
  }
};
```

Replace the static ID paragraph with:

```tsx
<button
  aria-label="复制 NeeDo ID"
  className={cn(
    "w-full truncate text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]",
    membershipSurface.muted
  )}
  onClick={() => void copyNeedoId()}
  type="button"
>
  ID {currentCustomer.systemId}
</button>
```

- [ ] **Step 5: Run the focused interaction and source-contract tests and verify GREEN**

Run:

```bash
npm test -- src/pages/user/UserCenterPage.interaction.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts
```

Expected: all selected tests PASS with zero failures.

- [ ] **Step 6: Run static and formal-build verification**

Run:

```bash
npm run lint
npm run verify:production-build
```

Expected: TypeScript exits 0; the formal build and production-bundle audit exit 0.

- [ ] **Step 7: Perform real browser acceptance**

Use the authenticated user route `http://127.0.0.1:5180/user.html#/me` at the existing mobile acceptance viewport. Click the complete ID row and verify that the clipboard contains only the visible public-ID value after the `ID ` prefix, the success toast appears, keyboard activation works, the console has no new error, and the card does not overflow.

- [ ] **Step 8: Commit the tested microstep**

```bash
git add src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.interaction.test.tsx docs/superpowers/plans/2026-08-30-user-center-needo-id-copy.md
git commit -m "fix: copy user center NeeDo ID"
```
