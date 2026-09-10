# Merchant Mobile Employee Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved merchant mobile employee list and editable formal employee detail flow.

**Architecture:** Keep the existing React/Vite mobile shell and shared visual system. Reuse the formal merchant employee APIs and `EmployeeDetailCard`; add only a bounded pagination helper and page-level composition needed by the mobile routes.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Vitest, existing `/api/v1/merchant-admin` contracts.

## Global Constraints

- Local-only work on `codex/merchant-employee-page-refresh`.
- Do not touch port 5180, remote Git, staging, or production.
- No new mock data, fake API, schema, or migration.

---

### Task 1: Employee header and list semantics

**Files:**
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalEmployment.test.ts`

**Interfaces:**
- Consumes: `MobileFullscreenHeader`, `FeatureSegmentedTabs`, `identityApplicationsApi` through the existing review page.
- Produces: four employee tabs, a controlled search query, hidden shared bottom navigation, and fully paginated technician classification data.

- [x] Add failing tests asserting Back/Search/Close, All/Staff/Temporary/Review, Review separation, and no bottom nav.
- [x] Run `npm test -- src/pages/mobile/MerchantPortalPage.test.tsx src/pages/mobile/MerchantPortalEmployment.test.ts` and confirm the new assertions fail.
- [x] Implement the smallest header, filtering, review composition, and pagination changes.
- [x] Re-run the same command and confirm it passes.

### Task 2: Formal mobile employee detail

**Files:**
- Create: `src/components/merchant-admin/MerchantEmployeeDetailWorkspace.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.test.tsx`

**Interfaces:**
- Consumes: `merchantEmployeeApi.detail/updateProfile/updateAffiliation/timeline`, `employeeCompensationApi`, `payrollSchedulePolicyApi`, and `EmployeeDetailCard`.
- Produces: canonical `/merchant/staff/:needoId` detail with Back, Close, retry, edit, preview, and timeline actions.

- [x] Add failing route assertions for canonical NeeDoID loading, shared header controls, and `EmployeeDetailCard` rendering.
- [x] Run the affected route tests and confirm they fail against the prior generic detail panel.
- [x] Implement the formal detail workspace and update all merchant employee links.
- [x] Re-run the new and affected tests and confirm they pass.

### Task 3: Remove redundant detail chrome

**Files:**
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`

**Interfaces:**
- Produces: an opt-in flat `FormalTabs` presentation used only by employee detail.

- [x] Add a failing test asserting the employee tab list has no enclosing capsule chrome.
- [x] Run `npm test -- src/components/merchant-admin/EmployeeDetailCard.test.tsx` and confirm failure.
- [x] Add the opt-in flat tab variant and remove the redundant employee wrapper.
- [x] Re-run the test and confirm it passes.

### Task 4: Verify and integrate locally

**Files:**
- Modify: `README.md` with the completed local UI contract.

- [x] Run all targeted tests, `npm run lint`, `npm run build`, and `git diff --check`.
- [x] Start only the frontend on verified-free port 5182 and confirm the formal login gate; use component DOM tests for the authenticated list/detail because no login credential was supplied to the browser session.
- [x] Commit the branch, merge into local `main` without fetching or pushing, repeat verification, and safely remove only the owned worktree/branch.
