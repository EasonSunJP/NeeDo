# Identity Application Pending Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep unsubmitted technician and merchant applications available, while making submitted applications grey, navigable, and read-only with a disabled `审核中` action.

**Architecture:** Preserve the existing backend-owned availability states and application APIs. Change only frontend interaction/presentation: pending settings rows navigate to the existing application routes, and both application pages render submitted server data through a shared read-only field component without issuing mutations.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, existing NeeDo client UI and i18n.

## Global Constraints

- No new mock, demo, placeholder, fake API, schema, migration, or backend state.
- Page entry may call only the existing list/read API; pending views may not call create, update, upload, contract-acceptance, or submit APIs.
- Submitted information is read-only and sensitive bank details remain masked or omitted according to the existing API projection.
- Preserve unrelated dirty files and existing identity switching behavior.

---

### Task 1: Make pending identity rows grey and navigable

**Files:**
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Test: `src/features/settings/UnifiedSettingsPages.test.ts`

**Interfaces:**
- Consumes: `IdentitySettingsRow.action: "pending"` and `getIdentityApplicationPath(kind)`.
- Produces: a pending row whose trailing pill stays grey while its row click navigates to the existing application page.

- [ ] **Step 1: Write the failing test**

Add source assertions that pending is excluded from the row-level `disabled` expression, retains the pending grey class branch, and reaches `navigate(getIdentityApplicationPath(row.kind))`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/features/settings/UnifiedSettingsPages.test.ts`

Expected: FAIL because the current `disabled` expression includes `row.action === "pending"`.

- [ ] **Step 3: Implement the minimal interaction change**

Change the row-level disabled expression to disable only the current identity or an in-progress identity switch. Keep the existing grey pending pill styling and navigation branch unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/features/settings/UnifiedSettingsPages.test.ts`

Expected: PASS.

### Task 2: Render submitted technician and merchant information read-only

**Files:**
- Modify: `src/features/identity-applications/ApplicationUi.tsx`
- Modify: `src/features/identity-applications/TechnicianApplicationPage.tsx`
- Modify: `src/features/identity-applications/MerchantApplicationPage.tsx`
- Test: `src/features/identity-applications/ApplicationPages.test.ts`

**Interfaces:**
- Consumes: `IdentityApplication.status`, `technicianDetail`, and `merchantDetail` returned by `listMine`.
- Produces: `ApplicationReadOnlyField` and pending detail cards with disabled secondary-tone `审核中` buttons.

- [ ] **Step 1: Write failing tests for both pending views**

Assert that both pages use `ApplicationReadOnlyField`, show a disabled secondary-tone `审核中` action for submitted/under-review state, and keep the return-to-settings action. Retain the existing assertion that initial page load performs no write API calls.

- [ ] **Step 2: Run the application-page test and verify RED**

Run: `npm test -- --run src/features/identity-applications/ApplicationPages.test.ts`

Expected: FAIL because neither page currently renders the requested read-only fields or disabled pending action.

- [ ] **Step 3: Add the shared read-only field**

Add `ApplicationReadOnlyField({ label, value })` to `ApplicationUi.tsx`, using existing translated labels, surface tokens, and an explicit fallback for empty optional values.

- [ ] **Step 4: Implement technician pending details**

When status is `submitted` or `under_review`, render target shop, applicant name, phone, city, service areas, skills, experience, biography, gender, and birth date from the loaded application. Do not render editable inputs or mutation handlers. Render disabled secondary `审核中` plus return-to-settings.

- [ ] **Step 5: Implement merchant pending details**

When status is `submitted` or `under_review`, render applicant kind, legal/representative names, shop name, address, phone, responsible person, service description, price label, and safe bank/eKYC status projection. Do not reconstruct raw bank data or render mutation handlers. Render disabled secondary `审核中` plus return-to-settings.

- [ ] **Step 6: Run focused frontend tests and verify GREEN**

Run: `npm test -- --run src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/model.test.ts src/features/identity-applications/api.test.ts src/features/settings/UnifiedSettingsPages.test.ts`

Expected: all selected test files pass with zero failures.

- [ ] **Step 7: Run frontend and backend regression gates**

Run: `npm run lint`

Run: `npm run build`

Run from `backend/`: `npm test -- --runTestsByPath tests/auth.test.ts tests/identity-application.service.test.ts tests/identity-application-api.test.ts --runInBand`

Expected: all commands exit 0.

- [ ] **Step 8: Commit implementation**

Commit only the five frontend files with message `fix: keep pending identity applications inspectable`.

- [ ] **Step 9: Merge locally into main and reverify**

Merge `codex/identity-application-pending-details` into the existing main worktree without touching unrelated changes, rerun the focused frontend tests, and report local merge separately from push/deployment.
