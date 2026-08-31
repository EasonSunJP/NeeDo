# Dashboard Navigation Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the one-dashboard navigation cutover, rename operations navigation, add disabled TEST partner entries and preserve old dashboard URLs only as redirects.

**Architecture:** Keep `/admin` and `/merchant-admin` as the only dashboard components. Extend navigation metadata with truly disabled sections for franchisee/supplier, route historical dashboard URLs through `Navigate`, and use source tests to prevent legacy pages from returning.

**Tech Stack:** React Router, TypeScript, Vitest

## Global Constraints

- Top navigation label `PF運営` becomes `运营管理`.
- “加盟商” and “供货商” appear in the top navigation with `TEST`, are disabled, and have no route or detail page.
- “代理” opens the formal `/admin/agents` capability from the agent plan.
- Exactly one operations dashboard component and one merchant dashboard component remain.
- Historical `/admin/analytics` and `/merchant-admin/analytics` URLs redirect; they never mount legacy components.
- Delete only verified duplicate page files; do not remove scheduling routes containing the word “overview”.

---

### Task 1: Add disabled top-level TEST sections and rename operations

**Files:**
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`

**Interfaces:**
- Produces: `AdminNavSection.disabled?: boolean`
- Produces top labels `运营管理`, `加盟商 TEST`, `供货商 TEST`

- [ ] **Step 1: Write failing navigation tests**

```ts
expect(source).toContain('title: "运营管理"');
expect(source).toContain('title: "加盟商"');
expect(source).toContain('title: "供货商"');
expect(source).toContain('badge: "TEST"');
expect(source).not.toContain('? "PF運営"');
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/components/admin/AdminLayout.test.ts`

Expected: FAIL because the old special-case PF label remains and partner sections are absent.

- [ ] **Step 3: Implement disabled section behavior**

```ts
type AdminNavSection = {
  key: string;
  title: string;
  badge?: string;
  disabled?: boolean;
  items: AdminNavItem[];
};
```

Add two sections with `disabled: true`, `badge: "TEST"`, and `items: []`. Keep disabled sections in the top tab list, render their buttons with `disabled`, `aria-disabled="true"`, and never call `navigate`. Replace platform section title with `运营管理` and remove the `PF運営` ternary.

- [ ] **Step 4: Run layout tests**

Run: `npm test -- src/components/admin/AdminLayout.test.ts`

Expected: PASS and disabled sections cannot become the active sidebar section.

- [ ] **Step 5: Commit top navigation**

```bash
git add src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts
git commit -m "feat: finalize operations top navigation"
```

### Task 2: Point the agent section to formal management

**Files:**
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`

**Interfaces:**
- Consumes: route `/admin/agents` from the agent plan
- Produces: one agent nav item `{ label: "代理商管理", to: "/admin/agents" }`

- [ ] **Step 1: Write the failing agent-route test**

```ts
expect(source).toContain('{ label: "代理商管理", to: "/admin/agents"');
expect(source).not.toContain('{ label: "代理能力状态", to: "/admin/afirieito"');
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/components/admin/AdminLayout.test.ts`

Expected: FAIL because the agent item still points to affiliate.

- [ ] **Step 3: Replace only the agent section item**

```ts
{
  key: "agents",
  title: "代理",
  items: [
    { label: "代理商管理", to: "/admin/agents", icon: "代", children: ["用户标记", "介绍店铺", "奖励与分佣", "支付记录"] }
  ]
}
```

- [ ] **Step 4: Run layout and app route tests**

Run: `npm test -- src/components/admin/AdminLayout.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit agent navigation**

```bash
git add src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts
git commit -m "fix: route agent navigation to formal management"
```

### Task 3: Redirect historical dashboard URLs without legacy components

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces: `/admin/analytics -> /admin`
- Produces: `/merchant-admin/analytics -> /merchant-admin`

- [ ] **Step 1: Replace the absence-only tests with redirect tests**

```ts
expect(appSource).toContain('path="/admin/analytics" element={<Navigate replace to="/admin" />}');
expect(appSource).toContain('path="/merchant-admin/analytics" element={<Navigate replace to="/merchant-admin" />}');
expect(appSource).not.toContain("<AnalyticsPage />");
expect(appSource).not.toContain("<MerchantAdminAnalyticsPage />");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because redirect routes are not mounted.

- [ ] **Step 3: Add protected redirects**

Use the same portal protection as each dashboard so an unauthenticated legacy URL does not bypass login. Keep the two canonical dashboard routes unchanged.

- [ ] **Step 4: Run app tests**

Run: `npm test -- src/App.test.tsx`

Expected: PASS with exactly one canonical dashboard component per portal.

- [ ] **Step 5: Commit legacy URL redirects**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "fix: redirect legacy dashboard URLs"
```

### Task 4: Lock legacy page deletion and dashboard menu uniqueness

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`

**Interfaces:**
- Produces: source guard against `AnalyticsPage`, `MerchantAdminAnalyticsPage`, duplicate “数据大盘” items

- [ ] **Step 1: Add exact source guards**

```ts
expect(appSource).not.toContain('import { AnalyticsPage }');
expect(appSource).not.toContain('import { MerchantAdminAnalyticsPage }');
expect(adminLayoutSource.match(/label: "数据大盘"/g)).toHaveLength(1);
expect(merchantLayoutSource.match(/label: "数据大盘"/g)).toHaveLength(1);
```

- [ ] **Step 2: Run the guards**

Run: `npm test -- src/App.test.tsx src/components/admin/AdminLayout.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts`

Expected: PASS on the current tree; a reintroduced legacy component would fail.

- [ ] **Step 3: Audit the repository for duplicate page files**

Run: `rg --files src/pages | rg '(^|/)(AnalyticsPage|MerchantAdminAnalyticsPage)\.tsx$'`

Expected: no output. Do not delete any file when the audit is empty.

- [ ] **Step 4: Run lint and production build**

Run: `npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the source guards**

```bash
git add src/App.test.tsx src/components/admin/AdminLayout.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts
git commit -m "test: prevent duplicate dashboard pages"
```

### Task 5: Verify navigation acceptance

**Files:**
- No source file changes

**Interfaces:**
- Consumes: standard frontend listener and operations/merchant authenticated sessions
- Produces: browser acceptance for top navigation, redirects and canonical dashboards

- [ ] **Step 1: Prove listener ownership**

Run: `lsof -nP -iTCP:5180 -sTCP:LISTEN && lsof -nP -iTCP:3000 -sTCP:LISTEN`

Expected: both listeners belong to this checkout.

- [ ] **Step 2: Verify operations navigation**

Open `/admin`; confirm `运营管理`, disabled `加盟商 TEST`, disabled `供货商 TEST`, formal agent route and exactly one data-dashboard item.

- [ ] **Step 3: Verify merchant navigation**

Open `/merchant-admin`; confirm exactly one data-dashboard item and the store-switch/account/NDP card remains available.

- [ ] **Step 4: Verify redirects**

Open `/admin/analytics` and `/merchant-admin/analytics`; confirm replacement navigation to the canonical page without console errors or duplicate content.

- [ ] **Step 5: Confirm clean acceptance state**

Run: `git status -sb`

Expected: no uncommitted files from browser acceptance.
