# Legal Policy Catalog And Guided Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate NeeDo's formal legal-document catalog for current identity and transaction flows and make the operations editor self-explanatory.

**Architecture:** Reuse the existing guarded backfill and formal legal-document API. Add a pure frontend guidance model that owns presets, route choices, and display-location labels; render it from the existing legal tab without changing persistence contracts.

**Tech Stack:** React 19, TypeScript, Vitest, Node.js 22, Jest, Prisma/MySQL, Tailwind CSS.

## Global Constraints

- Work only on `codex/legal-policy-catalog` and merge locally into `main` after verification.
- Do not operate port 5180, remote Git, staging, or production.
- Do not publish unreviewed new legal text; new catalog entries start disabled and unpublished.
- Preserve formal RBAC, Zod validation, optimistic locking, immutable releases, and audit logs.
- Write each behavior test first and observe the expected failure before implementation.

---

### Task 1: Complete the guarded policy catalog

**Files:**
- Modify: `backend/tests/system-settings-flow-script.test.ts`
- Modify: `backend/scripts/backfill-system-settings.ts`
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Consumes: `SYSTEM_LEGAL_DOCUMENT_SOURCES` and the existing guarded `runSystemSettingsBackfill` flow.
- Produces: ten stable legal catalog sources with reviewed existing releases preserved and six disabled/unpublished additions.

- [ ] **Step 1: Add failing catalog assertions**

Assert the exact ten slugs, the identity/transaction display locations, five locales for terms/privacy, and disabled empty releases for every new document.

- [ ] **Step 2: Run the backend contract test and observe RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-flow-script.test.ts --runInBand`

Expected: failure because the six required slugs are absent.

- [ ] **Step 3: Replace generic future entries with the approved catalog records**

Use existing routes where available and one stable `/me/settings/legal/<slug>` path for a policy-specific viewer destination. Keep `isEnabled: false` and `releases: {}` for unreviewed additions.

- [ ] **Step 4: Run the catalog test and observe GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-flow-script.test.ts --runInBand`

Expected: one suite passing with the complete exact catalog.

### Task 2: Add guided creation and metadata editing

**Files:**
- Create: `src/features/admin-system-settings/legalDocumentGuidance.ts`
- Create: `src/features/admin-system-settings/legalDocumentGuidance.test.ts`
- Modify: `src/features/admin-system-settings/LegalDocumentsTab.tsx`
- Modify: `src/features/admin-system-settings/LegalDocumentsTab.test.tsx`

**Interfaces:**
- Produces: `legalDocumentTemplates`, `legalInternalRouteOptions`, `legalDisplayLocationOptions`, and `createDraftFromLegalTemplate`.
- Consumes: unchanged `adminSystemSettingsApi.createLegalDocument` and `updateLegalDocument` request contracts.

- [ ] **Step 1: Add failing guidance-model tests**

Assert that each preset returns the exact stable slug, a safe internal route, deduplicated display locations, and disabled visibility.

- [ ] **Step 2: Add failing component contract tests**

Assert visible workflow labels, clear explanations for document name/slug/internal route/display locations, recommended-template selection, route examples, and checkbox-based display locations.

- [ ] **Step 3: Run frontend tests and observe RED**

Run: `npm test -- src/features/admin-system-settings/legalDocumentGuidance.test.ts src/features/admin-system-settings/LegalDocumentsTab.test.tsx`

Expected: missing guidance module and missing guided-editor copy.

- [ ] **Step 4: Implement the pure guidance model**

Define the ten document presets, only real or stable internal routes, and semantic display-location choices. Return fresh arrays so form editing cannot mutate the preset registry.

- [ ] **Step 5: Implement the guided editor**

Render a compact workflow illustration, recommended template selector, visible labels and explanations, safe route examples, and display-location checkboxes for create and metadata forms. Preserve unknown codes and the existing save/publish lifecycle.

- [ ] **Step 6: Run frontend tests and observe GREEN**

Run: `npm test -- src/features/admin-system-settings/legalDocumentGuidance.test.ts src/features/admin-system-settings/LegalDocumentsTab.test.tsx`

Expected: both test files passing.

### Task 3: Verify and integrate locally

**Files:**
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Produces: fresh verification evidence and one local feature commit merged into local `main`.

- [ ] **Step 1: Run focused backend and frontend regressions**

Run the system-settings backfill contracts, legal service/API/OpenAPI tests, public legal-document tests, and the two frontend legal editor tests.

- [ ] **Step 2: Run static and production checks**

Run frontend lint, i18n quality audit, formal production build, backend lint, and backend build.

- [ ] **Step 3: Run guarded local data verification when the target is proven local**

Inspect `backend/.env.dev` without exposing credentials. When it resolves to local MySQL and local Redis, run `ENV_FILE=.env.dev npm --prefix backend run backfill:system-settings` followed by `ENV_FILE=.env.dev npm --prefix backend run check:system-settings-flow`.

- [ ] **Step 4: Commit, merge local main, and reverify**

Commit the scoped diff, merge it into a clean local-main integration worktree, rerun focused tests and builds, then remove only the feature worktree and branch proven merged.
