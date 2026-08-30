# User Calendar Source Button Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the existing calendar-source menu button on the formal user schedule page without re-enabling local calendar persistence or local event creation.

**Architecture:** Keep `UnifiedUserCalendar` as the single schedule surface and opt the formal user page into its existing `showSourceDrawer` capability. Add a page-level regression assertion for the prop, then reuse the component's existing formal-mode interaction test to verify the source drawer remains safe.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, jsdom, Tailwind CSS, Playwright browser acceptance.

## Global Constraints

- This is one microstep; do not refactor the schedule system or change unrelated pages.
- Do not add a mock, demo, placeholder, fake API, local business-data fallback, or browser persistence path.
- Keep `formalOnly` enabled on the user calendar.
- Reuse the existing `UnifiedUserCalendar` source button and `CalendarSourceDrawer`.
- Do not restore the local “新增行程” floating action button.
- Do not modify backend, database, migrations, RBAC, formal schedule API, source list, sync rules, or current unrelated dirty files.

---

### Task 1: Restore the source drawer entry on the formal user schedule page

**Files:**
- Modify: `src/pages/user/UserSchedulePage.test.tsx`
- Modify: `src/pages/user/UserSchedulePage.tsx`
- Verify: `src/components/scheduling/UnifiedUserCalendar.formal.test.tsx`

**Interfaces:**
- Consumes: `UnifiedUserCalendarProps.showSourceDrawer?: boolean` and the existing `formalOnly` behavior.
- Produces: `<UnifiedUserCalendar currentCustomer={customer} formalOnly searchQuery={scheduleSearchQuery} showSourceDrawer />` on the successful formal user profile path.

- [ ] **Step 1: Extend the page test double and write the failing prop assertion**

In `src/pages/user/UserSchedulePage.test.tsx`, replace the `UnifiedUserCalendar` mock with this prop-aware test double:

```tsx
vi.mock("../../components/scheduling/UnifiedUserCalendar", () => ({
  UnifiedUserCalendar: ({
    currentCustomer,
    formalOnly,
    showSourceDrawer
  }: {
    currentCustomer: { name: string };
    formalOnly?: boolean;
    showSourceDrawer?: boolean;
  }) => (
    <div
      data-source-drawer-enabled={showSourceDrawer ? "true" : "false"}
      data-testid={formalOnly ? "formal-user-calendar" : "non-formal-user-calendar"}
    >
      {currentCustomer.name}
    </div>
  )
}));
```

In the existing `renders the formal customer and formal-only calendar` test, replace the final calendar assertion with:

```tsx
const calendar = container.querySelector('[data-testid="formal-user-calendar"]');
expect(calendar).not.toBeNull();
expect(calendar?.getAttribute("data-source-drawer-enabled")).toBe("true");
```

- [ ] **Step 2: Run the focused page test and verify RED**

Run:

```bash
npm test -- src/pages/user/UserSchedulePage.test.tsx
```

Expected: FAIL only on `data-source-drawer-enabled`, with the received value `"false"`, because `UserSchedulePage` does not yet pass `showSourceDrawer`.

- [ ] **Step 3: Add the minimal production prop**

In the successful profile branch of `src/pages/user/UserSchedulePage.tsx`, replace the calendar invocation with:

```tsx
<UnifiedUserCalendar
  currentCustomer={customer}
  formalOnly
  searchQuery={scheduleSearchQuery}
  showSourceDrawer
/>
```

Do not change `UnifiedUserCalendar` defaults or source drawer internals.

- [ ] **Step 4: Run focused regression tests and verify GREEN**

Run:

```bash
npm test -- src/pages/user/UserSchedulePage.test.tsx src/components/scheduling/UnifiedUserCalendar.formal.test.tsx
```

Expected: both test files PASS. The component test must still open the button labelled `打开日历来源`, render the approved source labels, and record zero writes to `needo.user-unified-calendar.v1`.

- [ ] **Step 5: Run production build and diff checks**

Run:

```bash
npm run verify:production-build
git diff --check
git diff -- src/pages/user/UserSchedulePage.tsx src/pages/user/UserSchedulePage.test.tsx
```

Expected: production build exits 0, `git diff --check` prints no errors, and the diff contains only the test-double assertion plus the `showSourceDrawer` prop.

- [ ] **Step 6: Run mobile browser acceptance**

Use the formal customer entry at `http://127.0.0.1:5180/user.html#/schedule` with a mobile viewport matching the supplied screenshot. Authenticate with an existing local formal customer account; read credentials only from ignored local environment or account export files.

Verify all of the following in the rendered page:

1. A circular button labelled `打开日历来源` appears to the left of the date heading.
2. The date heading and “今天” control remain visible without overlap or horizontal overflow.
3. Clicking the button opens one visible `role="menu"` panel titled `日历来源`.
4. The panel includes `我的行程`, `技师端行程`, `商户端行程`, `ToDo`, and `生日`.
5. Closing and reopening the panel works.
6. No `新增行程` floating action button appears in formal mode.
7. The browser console has no new error caused by the interaction.

If the formal schedule API returns an unrelated runtime error such as rate limiting, record it separately; it does not invalidate the button visibility and drawer interaction checks.

- [ ] **Step 7: Commit only the two implementation files**

```bash
git add src/pages/user/UserSchedulePage.tsx src/pages/user/UserSchedulePage.test.tsx
git commit -m "fix: restore user calendar source menu"
```

Before committing, confirm that the existing dirty `ContactEventTimeline` and technician-schedule files are not staged.
