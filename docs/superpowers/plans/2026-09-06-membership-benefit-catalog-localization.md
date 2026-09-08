# Membership Benefit Catalog Localization Implementation Plan

> **For Codex:** Execute this plan one task at a time with test-driven development. This microstep deliberately excludes the chat recall execution path and membership-card gradient fields.

**Goal:** Add the formal `traceless_recall` membership benefit, seed safe tier defaults, and show benefit names/descriptions in the operations portal's current language instead of exposing storage codes.

**Architecture:** Keep the benefit code as the stable API/database identifier. Store five-language display copy in the existing formal benefit catalog, resolve localized text in the frontend with a deterministic fallback, and attach the new benefit to every existing tier version through an idempotent migration. Until the later IM microstep is implemented, the catalog must report this benefit's delivery capability as unavailable.

**Tech Stack:** React, TypeScript, Vite/Vitest, Express, Zod, Prisma/MySQL, Jest.

---

### Task 1: Lock the eight-benefit formal contract

**Files:**
- Create: `backend/tests/membership-traceless-benefit-schema.test.ts`
- Modify: `backend/tests/platform-membership-schema.test.ts`
- Modify: `backend/tests/platform-membership-openapi.test.ts`
- Modify: `backend/tests/platform-membership-api.test.ts`
- Modify: `backend/tests/platform-membership-*.test.ts`

1. Add failing tests for the eighth enum value, exact five-language catalog copy, free-off/paid-on migration defaults, and eight-item API invariants.
2. Run the focused Jest tests and confirm they fail because `traceless_recall` is absent.
3. Extend the domain, Prisma enum, repository mappings, validators, OpenAPI, capability registry, fixtures, and add an idempotent migration.
4. Run Prisma generation and the focused backend tests until green.

### Task 2: Localize operations benefit presentation

**Files:**
- Create: `src/features/platform-user-management/benefitLocalization.ts`
- Create: `src/features/platform-user-management/benefitLocalization.test.ts`
- Modify: `src/features/platform-user-management/MembershipBenefitsPage.tsx`
- Modify: `src/features/platform-user-management/MembershipBenefitEditor.tsx`
- Modify: `src/features/platform-user-management/MembershipTiersPage.tsx`
- Modify: `src/features/platform-user-management/MembershipTierEditor.tsx`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/features/platform-user-management/*.test.tsx`

1. Add failing tests for current-language resolution, deterministic fallback, hidden raw codes, and free-off/paid-on draft defaults.
2. Confirm the focused Vitest tests fail on the current raw-code and Simplified-Chinese-only UI.
3. Load the formal benefit catalog alongside tiers, pass localized labels into the tier editor, and render localized catalog copy on the benefits page/editor.
4. Keep `traceless_recall` marked capability-unavailable until the IM execution microstep.
5. Run the focused frontend tests until green.

### Task 3: Verify and integrate locally

**Files:**
- Verify all modified files

1. Run focused backend and frontend suites.
2. Run repository lint, full tests, and production build.
3. Inspect the operations membership pages in a browser against the matching local frontend/backend when the formal local database is available; otherwise report that boundary explicitly.
4. Review the diff, commit the isolated branch, and merge it into local `main` only after all automated checks pass. Do not deploy staging in this microstep.
