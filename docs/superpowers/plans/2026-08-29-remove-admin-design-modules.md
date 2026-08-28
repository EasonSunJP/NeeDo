# Remove Admin Design Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely remove the merchant-admin “UI装修” module and the operations-admin “设计” module without retaining routes, redirects, compatibility screens, or active documentation.

**Architecture:** Remove the two modules at the frontend ownership boundaries: navigation configuration, application route registration, page components, and module tests. Keep shared theme tokens and unrelated storefront helpers intact, then prove removal with source-contract tests, TypeScript/build verification, and logged-in browser acceptance.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vite 7, Vitest, existing NeeDo admin layouts and theme tokens.

## Global Constraints

- Execute only this deletion microstep; employee schedule, payroll, settlement, and timeline remain later microsteps.
- Do not add a redirect, alias, replacement screen, disabled tab, or compatibility entry for either deleted module.
- Preserve client theme switching, admin theme tokens, carousel, avatar badges, and shared storefront presentation helpers.
- Merge the current local `main` before editing because another task has advanced it beyond this worktree.
- Preserve unrelated worktree changes and never stage the untracked dependency links.
- No backend schema, migration, API, permission, or persisted data change is permitted.
- User-visible remaining navigation continues to use the existing i18n and blue-black admin visual system.

---

### Task 1: Remove both navigation sections

**Files:**

- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Create: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`

**Interfaces:**

- Consumes: the static `merchantAdminSections` and `navSections` arrays rendered by the existing layouts.
- Produces: merchant and operations navigation with no design-module section or item while leaving all other section order and permission filtering unchanged.

- [ ] **Step 1: Merge the current local main and check the four target files**

Run:

```bash
git merge main
git status --short
git diff --check
```

Expected: the merge completes without dropping the employee-card commits; only known untracked `node_modules` links may remain, and `git diff --check` prints nothing.

- [ ] **Step 2: Add failing navigation source-contract tests**

Append this test to `src/components/merchant-admin/MerchantAdminLayout.test.ts`:

```ts
it("does not expose the removed merchant UI decoration module", () => {
  expect(source).not.toContain('key: "design"');
  expect(source).not.toContain('title: "UI装修"');
  expect(source).not.toContain('to: "/merchant-admin/design"');
  expect(source).not.toContain('to: "/merchant-admin/design?module=cards"');
});
```

Create `src/components/admin/AdminLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";

describe("AdminLayout navigation", () => {
  it("does not expose the removed operations design module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "设计"');
    expect(source).not.toContain('to: "/admin/decoration"');
    expect(source).not.toContain('label: "装修中心"');
  });
});
```

- [ ] **Step 3: Run navigation RED**

Run:

```bash
npm test -- --run src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/admin/AdminLayout.test.ts
```

Expected: both new assertions fail because the two navigation sections still exist.

- [ ] **Step 4: Remove only the two navigation section objects**

Delete this object from `merchantAdminSections` in `src/components/merchant-admin/MerchantAdminLayout.tsx`:

```ts
{
  key: "design",
  title: "UI装修",
  items: [
    { label: "店铺 UI 装修", to: "/merchant-admin/design", icon: "店", children: ["能力门禁", "版本 API", "媒体审计"] },
    { label: "信息卡装修", to: "/merchant-admin/design?module=cards", icon: "卡", children: ["能力门禁", "发布版本", "回滚"] }
  ]
},
```

Delete this object from `navSections` in `src/components/admin/AdminLayout.tsx`:

```ts
{
  key: "design",
  title: "设计",
  items: [
    { label: "装修中心", to: "/admin/decoration", icon: "装", children: ["基础组件", "手机模拟器", "配置面板"] }
  ]
},
```

Do not reorder or rename any remaining section.

- [ ] **Step 5: Run navigation GREEN**

Run:

```bash
npm test -- --run src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/admin/AdminLayout.test.ts
```

Expected: 2 test files pass and the existing merchant-layout assertions remain green.

- [ ] **Step 6: Commit navigation removal**

```bash
git add src/components/merchant-admin/MerchantAdminLayout.tsx src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts
git commit -m "refactor: remove admin design navigation"
```

---

### Task 2: Remove routes and page components

**Files:**

- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/App.tsx`
- Delete: `src/pages/merchant-admin/MerchantAdminDesignPage.tsx`
- Delete: `src/pages/merchant-admin/MerchantAdminDesignPage.test.ts`
- Delete: `src/pages/admin/DecorationPage.tsx`

**Interfaces:**

- Consumes: the existing root `Routes` registry and the remaining carousel/avatar-badge capability-gate tests.
- Produces: an application with no registered design-module route or import; the old paths fall through the existing ordinary unknown-route behavior.

- [ ] **Step 1: Add failing route-removal assertions**

In `src/pages/admin/AdminCapabilityRoutes.test.ts`, add this block after the source declarations:

```ts
describe("removed admin design modules", () => {
  it("does not register or import either deleted design page", () => {
    expect(appSource).not.toContain('./pages/admin/DecorationPage');
    expect(appSource).not.toContain('./pages/merchant-admin/MerchantAdminDesignPage');
    expect(appSource).not.toContain('path="/admin/decoration"');
    expect(appSource).not.toContain('path="/merchant-admin/design"');
  });
});
```

- [ ] **Step 2: Run route RED**

Run:

```bash
npm test -- --run src/pages/admin/AdminCapabilityRoutes.test.ts
```

Expected: the new route-removal test fails on both imports and both paths.

- [ ] **Step 3: Remove the imports and route registrations from App**

Delete these imports from `src/App.tsx`:

```ts
import { DecorationPage } from "./pages/admin/DecorationPage";
import { MerchantAdminDesignPage } from "./pages/merchant-admin/MerchantAdminDesignPage";
```

Delete these route registrations:

```tsx
<Route path="/merchant-admin/design" element={protect("merchant", <MerchantAdminDesignPage />)} />
<Route path="/admin/decoration" element={protect("admin", <DecorationPage />)} />
```

Do not add replacements.

- [ ] **Step 4: Delete the page files and narrow the shared capability tests**

Delete:

```text
src/pages/merchant-admin/MerchantAdminDesignPage.tsx
src/pages/merchant-admin/MerchantAdminDesignPage.test.ts
src/pages/admin/DecorationPage.tsx
```

In `src/pages/admin/AdminCapabilityRoutes.test.ts`:

- remove the `decorationSource` declaration;
- rename the browser-store test to `does not publish carousel or ornament data from browser stores`;
- remove both `decorationSource` assertions;
- change `[carouselSource, decorationSource, badgesSource]` to `[carouselSource, badgesSource]`;
- rename `keeps all three routes...` to `keeps the remaining routes...`;
- remove the PageLayout assertion for the deleted page.

Keep all carousel and avatar-badge assertions unchanged.

Remove the obsolete i18n test block that verifies “UI装修”, “店铺 UI 装修”, and “信息卡装修” in `src/i18n/translations.test.ts`. Remove these now-unreferenced keys from `src/i18n/translations.ts` after confirming they have no consumer outside the deleted modules:

```text
平台 UI 装修
正式平台 UI 装修尚未启用
正式店铺装修功能尚未启用
店铺 UI 装修
信息卡装修
装修中心
UI装修
```

Do not remove the generic “设计” translation because unrelated product copy may still use it.

- [ ] **Step 5: Run route GREEN and compile the route graph**

Run:

```bash
npm test -- --run src/pages/admin/AdminCapabilityRoutes.test.ts
npm test -- --run src/i18n/translations.test.ts
npm run lint
```

Expected: the focused capability test passes, TypeScript exits 0, and no deleted import remains.

- [ ] **Step 6: Commit route and page deletion**

```bash
git add src/App.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git add -u src/pages/admin/DecorationPage.tsx src/pages/merchant-admin/MerchantAdminDesignPage.tsx src/pages/merchant-admin/MerchantAdminDesignPage.test.ts
git commit -m "refactor: delete admin design modules"
```

---

### Task 3: Remove active documentation references

**Files:**

- Modify: `README.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`
- Modify: `docs/superpowers/specs/2026-08-29-remove-admin-design-modules-design.md`

**Interfaces:**

- Consumes: the current-scope and mock-retirement documentation.
- Produces: documentation that no longer presents the deleted modules as current routes or capability gates and records their completed removal.

- [ ] **Step 1: Update README current-scope and backoffice sections**

In `README.md`:

- remove `UI装修` from the 店铺后台 current-scope list;
- remove the “商户‘店铺 UI 装修/信息卡装修’已改为正式能力门禁” paragraph;
- remove the operations decoration route from the paragraph that lists carousel, platform-decoration, and avatar-ornament gates while preserving the carousel and avatar-ornament statements;
- remove “UI装修” from the 店铺后台 menu tree under “Backoffice IA Refactor”.

Do not alter client theme-switching documentation.

- [ ] **Step 2: Update the mock-retirement map**

In `docs/MOCK_RETIREMENT_MAP.md`:

- remove `DecorationPage.tsx` from the operations capability-gate list;
- remove `MerchantAdminDesignPage.tsx` and its activation description from the merchant-admin section;
- preserve statements for carousel, avatar badges, inventory, floor control, and merchant settings.

- [ ] **Step 3: Mark the approved design as implemented**

Change the design document header to:

```markdown
**Status:** Implemented
```

Append a short implementation record containing the navigation commit, route/page commit, and browser acceptance result after they are known. Do not add forward-looking feature claims or attempt to record the hash of the commit that contains the record itself.

- [ ] **Step 4: Verify active references are absent**

Run:

```bash
rg -n 'MerchantAdminDesignPage|DecorationPage|/merchant-admin/design|/admin/decoration|title: "UI装修"|title: "设计"|"平台 UI 装修"|"店铺 UI 装修"|"信息卡装修"|"装修中心"|"UI装修"' src README.md docs/MOCK_RETIREMENT_MAP.md
git diff --check
```

Expected: `rg` exits 1 with no matches and `git diff --check` prints nothing.

- [ ] **Step 5: Commit documentation cleanup**

```bash
git add README.md docs/MOCK_RETIREMENT_MAP.md docs/superpowers/specs/2026-08-29-remove-admin-design-modules-design.md
git commit -m "docs: remove retired design module references"
```

---

### Task 4: Full verification and browser acceptance

**Files:**

- Verify only; no planned product-code changes.

**Interfaces:**

- Consumes: the completed deletion commits and the logged-in formal local merchant/operations portals.
- Produces: fresh evidence that the build, source graph, and visible navigation contain neither deleted module.

- [ ] **Step 1: Run focused and full frontend verification**

Run:

```bash
npm test -- --run src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/admin/AdminLayout.test.ts src/pages/admin/AdminCapabilityRoutes.test.ts src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

Expected: all focused tests pass, TypeScript exits 0, Vite formal production build exits 0, and the production-bundle audit reports no prohibited formal-route regressions.

- [ ] **Step 2: Run final source and worktree checks**

Run:

```bash
rg -n 'MerchantAdminDesignPage|DecorationPage|/merchant-admin/design|/admin/decoration|title: "UI装修"|title: "设计"|"平台 UI 装修"|"店铺 UI 装修"|"信息卡装修"|"装修中心"|"UI装修"' src README.md docs/MOCK_RETIREMENT_MAP.md
git status --short
git log --oneline -6
```

Expected: source search has no matches; status contains no tracked changes and may contain only the two known untracked dependency links.

- [ ] **Step 3: Restart the isolated formal runtime**

Run:

```bash
FORMAL_BACKEND_PORT=3102 FRONTEND_PORT=5182 FORMAL_BACKEND_ENV_FILE='/Users/eason/Documents/New project/backend/.env.dev' npm run dev:formal
```

Expected: frontend 5182 and backend 3102 are healthy, and the formal readiness endpoint succeeds.

- [ ] **Step 4: Accept the merchant navigation in the logged-in browser**

Open `http://127.0.0.1:5182/store-admin.html#/merchant-admin/people?module=staff` and verify:

- the primary navigation has no “UI装修” item;
- the remaining groups keep the current blue-black theme, spacing, borders, and active-state styling;
- `/merchant-admin/design` does not render a design page or module-specific redirect;
- the console has no errors or warnings caused by the deletion.

- [ ] **Step 5: Accept the operations navigation in the logged-in browser**

Open `http://127.0.0.1:5182/pf-admin.html#/admin` with an authenticated operations session and verify:

- the navigation has no “设计” group and no “装修中心” item;
- `/admin/decoration` does not render a design page or module-specific redirect;
- remaining navigation styling and route access are unchanged;
- the console has no deletion-related errors or warnings.

- [ ] **Step 6: Record the browser evidence and final commit status**

Update the implementation record in the approved design document only if browser evidence adds missing factual hashes or acceptance results. If changed, commit it with:

```bash
git add docs/superpowers/specs/2026-08-29-remove-admin-design-modules-design.md
git commit -m "docs: record design module removal acceptance"
```

Expected: the microstep is represented by small reversible commits, with no push, deployment, backend mutation, or unrelated file staged.
