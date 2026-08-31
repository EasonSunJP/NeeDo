# Test Feature Badges And Service Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the existing membership-style red `Test` badge to the merchant dine-in navigation and expose a badged service-account entry in every shared contact directory.

**Architecture:** Keep merchant badge state in the existing `merchantPrimaryModules` configuration and reuse `TestFeatureBadge` through the current carousel renderer. Keep all three contact portals on the shared `ImContactsListPage`; add a generic trailing slot to `ImEntryCell`, render the service-account entry unconditionally, and continue routing each scope to its existing service-account page.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind CSS, Vitest, Vite.

## Global Constraints

- Reuse `TestFeatureBadge`; do not create a second test-badge component or style.
- Show the merchant badges on `members`, `dine_order`, `menu`, and `floor_control` only.
- Show the service-account entry in user, merchant, and technician contact directories even when the current service-account list is empty.
- Keep service-account data, routes, permissions, and filtering unchanged; do not add mock data, backend APIs, migrations, or browser business persistence.
- Preserve unrelated working-tree changes in `README.md`, `backend/tests/openapi.test.ts`, `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, `src/i18n/translations.ts`, and any other concurrently modified files.
- Use test-first red-green cycles and verify the final narrow-screen UI without creating temporary business data.

---

### Task 1: Mark Merchant Test Modules

**Files:**
- Modify: `src/features/merchant-navigation/merchantModules.test.ts`
- Modify: `src/features/merchant-navigation/merchantModules.ts`

**Interfaces:**
- Consumes: `MerchantPrimaryModule.badge?: "Test"` and the existing `MerchantPrimaryNavCarousel` rendering of `TestFeatureBadge`.
- Produces: `merchantPrimaryModules` entries whose test keys are exactly `members`, `dine_order`, `menu`, and `floor_control`.

- [ ] **Step 1: Write the failing configuration test**

Replace the membership-only assertion in `merchantModules.test.ts` with the exact test-key contract:

```ts
it("marks the membership and dine-in modules as Test", () => {
  expect(
    merchantPrimaryModules
      .filter((module) => module.badge === "Test")
      .map((module) => module.key),
  ).toEqual(["members", "dine_order", "menu", "floor_control"]);
});
```

- [ ] **Step 2: Run the test and verify the RED state**

Run:

```bash
npm test -- src/features/merchant-navigation/merchantModules.test.ts
```

Expected: FAIL because the received keys contain only `members`.

- [ ] **Step 3: Add the minimal module badges**

Add the existing badge field to the three dine-in entries in `merchantModules.ts`:

```ts
{
  key: "dine_order",
  labelZh: "点菜",
  labelJa: "オーダー",
  caption: "扫码店内单",
  route: "/merchant/dine/orders",
  icon: "order",
  badge: "Test",
  permission: "store.dine-in.order.view"
},
{
  key: "menu",
  labelZh: "菜单",
  labelJa: "メニュー",
  caption: "商品与售罄",
  route: "/merchant/menu",
  icon: "menu",
  badge: "Test",
  permission: "store.dine-in.menu.view"
},
{
  key: "floor_control",
  labelZh: "场控",
  labelJa: "店内",
  caption: "桌台包厢床位",
  route: "/merchant/floor",
  icon: "floor",
  badge: "Test",
  permission: "store.dine-in.floor.view"
}
```

Do not change the carousel component: it already uses `TestFeatureBadge` with the approved membership placement and compact sizing.

- [ ] **Step 4: Run the test and verify the GREEN state**

Run:

```bash
npm test -- src/features/merchant-navigation/merchantModules.test.ts
```

Expected: PASS with 2 tests and 0 failures.

- [ ] **Step 5: Commit only the merchant navigation files**

```bash
git add src/features/merchant-navigation/merchantModules.test.ts src/features/merchant-navigation/merchantModules.ts
git commit -m "feat: mark merchant dine-in tools as test"
```

### Task 2: Add The Shared Service-Account Entry And Trailing Badge

**Files:**
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/pages.tsx`

**Interfaces:**
- Consumes: `TestFeatureBadge`, `getImRoleConfig(scope).routes.serviceAccounts`, and the existing `ImEntryCell` title/caption/link behavior.
- Produces: `ImEntryCell.trailing?: ReactNode`; an unconditional shared service-account entry with a compact `TestFeatureBadge` beside its title.

- [ ] **Step 1: Write the failing shared-entry tests**

In `pages.test.ts`, extend the component import and add the badge import:

```ts
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { ImChatComposer, ImEntryCell } from "./components";
```

Add a rendered component test for the new trailing slot:

```ts
it("renders the shared Test badge after the service-account title", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ImEntryCell, {
        icon: createElement("span", null, "icon"),
        title: "服务号",
        to: "/contacts/service-accounts",
        trailing: createElement(TestFeatureBadge, {
          className: "min-h-4 px-1.5 py-0 text-[8px]",
        }),
      }),
    ),
  );

  expect(markup).toContain('href="/contacts/service-accounts"');
  expect(markup).toContain("服务号");
  expect(markup).toContain('aria-label="Test 功能"');
  expect(markup.indexOf("服务号")).toBeLessThan(markup.indexOf("Test"));
});
```

Add a shared-page and scoped-route contract test:

```ts
it("always exposes the Test service-account entry in every scoped contact directory", () => {
  const contactsStart = pagesSource.indexOf("export function ImContactsListPage");
  const contactsEnd = pagesSource.indexOf("export function ImFriendRequestsPage", contactsStart);
  const contactsSource = pagesSource.slice(contactsStart, contactsEnd);

  expect(contactsSource).not.toContain("serviceContacts.length > 0");
  expect(contactsSource).toContain('title="服务号"');
  expect(contactsSource).toContain("to={config.routes.serviceAccounts}");
  expect(contactsSource).toContain("trailing={<TestFeatureBadge");
  expect(getImRoleConfig("user").routes.serviceAccounts).toBe("/contacts/service-accounts");
  expect(getImRoleConfig("merchant").routes.serviceAccounts).toBe("/merchant/contacts/service-accounts");
  expect(getImRoleConfig("technician").routes.serviceAccounts).toBe("/technician/contacts/service-accounts");
});
```

- [ ] **Step 2: Run the tests and verify the RED state**

Run:

```bash
npm test -- src/features/im/pages.test.ts
```

Expected: FAIL because `ImEntryCell` does not render `trailing`, the page still contains `serviceContacts.length > 0`, and it does not render `TestFeatureBadge` in the service-account entry.

- [ ] **Step 3: Add the generic trailing slot**

Update `ImEntryCell` in `components.tsx`:

```tsx
export function ImEntryCell({
  icon,
  title,
  caption,
  badge,
  badgeDot = false,
  trailing,
  to,
  onClick
}: {
  icon: ReactNode;
  title: string;
  caption?: string;
  badge?: string | number;
  badgeDot?: boolean;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
```

Replace the current title row with a title-and-trailing group while preserving the existing right-side caption:

```tsx
<div className="flex items-center justify-between gap-2">
  <div className="flex min-w-0 items-center gap-2">
    <strong className="truncate text-[15px] font-black text-[color:var(--client-text)]">{title}</strong>
    {trailing ? <span className="shrink-0">{trailing}</span> : null}
  </div>
  {caption ? <span className="shrink-0 text-xs font-bold text-[color:var(--client-muted)]">{caption}</span> : null}
</div>
```

- [ ] **Step 4: Render the service-account entry unconditionally**

Import the shared badge in `pages.tsx`:

```ts
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
```

Delete the contacts-page-only `serviceContacts` calculation:

```ts
const serviceContacts = getServiceContacts({
  ...store,
  contacts: visibleContacts
});
```

Keep `getServiceContacts(store)` in `ImServiceAccountsPage`; that is still the formal data source for the destination list.

Replace the conditional shortcut with the shared unconditional entry:

```tsx
<ImEntryCell
  icon={<ImIcon name="service" />}
  title="服务号"
  to={config.routes.serviceAccounts}
  trailing={<TestFeatureBadge className="min-h-4 px-1.5 py-0 text-[8px]" />}
/>
```

- [ ] **Step 5: Run focused tests and verify the GREEN state**

Run:

```bash
npm test -- src/features/im/pages.test.ts src/features/im/pages.test.tsx
```

Expected: PASS with 0 failures.

- [ ] **Step 6: Run the combined feature regression**

Run:

```bash
npm test -- src/features/merchant-navigation/merchantModules.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx
```

Expected: all three test files PASS with 0 failures.

- [ ] **Step 7: Commit only the shared IM files**

```bash
git add src/features/im/pages.test.ts src/features/im/components.tsx src/features/im/pages.tsx
git commit -m "feat: expose test service accounts in contacts"
```

### Task 3: Verify Build And Visible UI

**Files:**
- Verify only: `src/features/merchant-navigation/merchantModules.ts`
- Verify only: `src/features/merchant-navigation/MerchantPrimaryNavCarousel.tsx`
- Verify only: `src/features/im/components.tsx`
- Verify only: `src/features/im/pages.tsx`

**Interfaces:**
- Consumes: the two committed feature slices from Tasks 1 and 2.
- Produces: fresh automated and visible acceptance evidence without modifying business data.

- [ ] **Step 1: Check the exact final file scope and whitespace**

Run:

```bash
git diff --check HEAD~2..HEAD
git diff --name-only HEAD~2..HEAD
```

Expected: no whitespace errors; only the two test files and three implementation files from Tasks 1 and 2 are listed. The earlier design and plan documentation commits are outside this two-commit range.

- [ ] **Step 2: Run the frontend type check**

Run:

```bash
npm run lint
```

Expected: exit 0 with no TypeScript errors introduced by the `trailing` prop or badge imports. If unrelated concurrent files fail, report their exact path and error separately; do not alter them.

- [ ] **Step 3: Run the formal production build gate**

Run:

```bash
npm run verify:production-build
```

Expected: TypeScript build, Vite formal build, and the production bundle audit all exit 0. Existing non-failing bundle warnings may be reported but must not be presented as failures.

- [ ] **Step 4: Confirm runtime ownership before visible acceptance**

Run:

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

For every returned PID, run:

```bash
lsof -a -p <PID> -d cwd -Fn
```

Expected: the frontend cwd is `/Users/eason/Documents/New project` and the backend cwd is `/Users/eason/Documents/New project/backend`. If either listener belongs to another checkout, do not use it as acceptance evidence.

- [ ] **Step 5: Inspect the requested surfaces at both narrow widths**

Using the existing authenticated formal session only, inspect these routes at 440×956 and 320×956:

```text
/merchant.html#/merchant
/user.html#/contacts
/merchant.html#/merchant/contacts
/technician.html#/technician/contacts
```

Confirm:

- The merchant carousel shows the same red `Test` badge on 会员、点菜、菜单、场控.
- Each contact directory shows 服务号 in the upper shortcut section even with zero service contacts.
- The 服务号 `Test` badge is beside the title, not on the icon.
- Each service-account link stays in its current portal scope.
- No horizontal overflow appears at either viewport.
- No new console errors or failed requests occur from these UI-only changes.

Do not sign in, create contacts, send messages, or mutate service-account data without separate user authorization. If an authenticated session is unavailable, report visible acceptance as pending instead of bypassing formal auth.

- [ ] **Step 6: Report completion evidence**

Report the exact tests, type/build commands, runtime ownership, viewport checks, unchanged backend/data scope, and any acceptance item that remains pending. Do not claim browser acceptance from automated tests alone.
