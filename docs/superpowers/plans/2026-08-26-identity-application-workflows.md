# Identity Application Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build formal identity availability, technician and merchant application/review flows, click-through contracts, protected bank-name verification, affiliate activation/withdrawal guards, retention, resume export, and mobile-first frontend workflows.

**Architecture:** Add a shared `IdentityApplication` aggregate with typed technician/merchant detail tables, separate protected bank and immutable contract records, and one transactional identity-activation service. Keep API layers Route → Controller → Service → Repository, expose server-computed identity availability through Auth, and place new frontend code in a focused `features/identity-applications` module rather than expanding the already-large settings page.

**Tech Stack:** React 18, TypeScript strict, Vite, Express, Prisma/MySQL, Zod, JWT/RBAC, Jest/Supertest, Vitest/Testing Library, ExcelJS-compatible bundled spreadsheet runtime, OpenAPI.

## Global Constraints

- Implement one independently testable microstep at a time; do not batch unrelated repository changes.
- Do not add mock, demo, placeholder, fake API, local-storage application state, hard-coded secrets, or client-side authorization.
- Use `/api/v1`, Zod, OpenAPI, RBAC permissions, audit logs, pagination, transactions, UTC API timestamps, and existing i18n.
- Preserve React/TSX/Vite and the existing NeeDo visual tokens and routes.
- Customer identity is always the base identity; switching accepts only active formal `UserIdentity` records.
- Contract evidence does not store IP addresses.
- Closed application sensitive data is purged after 30 days; pending data is retained.
- Bank holder mismatch has no manual bypass.
- Preserve all pre-existing dirty-worktree changes and never stage unrelated hunks.

---

### Task 1: Formal domain schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826_identity_application_workflows/migration.sql`
- Create: `backend/tests/identity-application-schema.test.ts`

**Interfaces:**
- Produces Prisma models `IdentityApplication`, `TechnicianApplicationDetail`, `MerchantApplicationDetail`, `ProtectedBankAccount`, and `ContractAcceptance`.
- Produces indexed state fields and relation names consumed by repositories in Tasks 3-9.

- [ ] **Step 1: Write the failing schema contract test**

Assert that every new model contains `id`, `createdAt`, `updatedAt`, `deletedAt`, required indexes, protected fields, retention fields, and typed detail relations; assert the migration creates the same tables, foreign keys, and indexes.

```ts
it("defines reviewable identity applications with typed detail and retention fields", () => {
  expect(schema).toContain("model IdentityApplication {");
  expect(schema).toContain("purgeAt");
  expect(schema).toContain("technicianDetail TechnicianApplicationDetail?");
  expect(schema).toContain("merchantDetail MerchantApplicationDetail?");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/identity-application-schema.test.ts`  
Expected: FAIL because the models and migration are absent.

- [ ] **Step 3: Add the minimal Prisma models and migration**

Use strings for workflow/status values to match current schema style. Store only encrypted bank account number/raw holder data; store submitted detail snapshots as Prisma `Json`; add active-key uniqueness for one active application per user/type.

- [ ] **Step 4: Validate and verify GREEN**

Run: `npm --prefix backend run prisma:validate`  
Run: `npm --prefix backend test -- --runInBand tests/identity-application-schema.test.ts`  
Expected: both exit 0.

- [ ] **Step 5: Commit only Task 1 files**

Commit message: `feat: add identity application data model`

### Task 2: Pure state, normalization, retention, and billing rules

**Files:**
- Create: `backend/src/services/identity-application-policy.service.ts`
- Create: `backend/src/services/bank-account-holder.service.ts`
- Create: `backend/tests/identity-application-policy.service.test.ts`
- Create: `backend/tests/bank-account-holder.service.test.ts`
- Modify: `backend/tests/saas-billing-policy.service.test.ts`
- Modify only if a boundary test fails: `backend/src/services/saas-billing-policy.service.ts`

**Interfaces:**
- Produces `IdentityApplicationPolicyService.assertTransition(current, next)`.
- Produces `IdentityApplicationPolicyService.calculatePurgeAt(closedAt): Date`.
- Produces `BankAccountHolderService.normalizeKatakana(value): string` and `assertMatches(actual, expected): void`.
- Reuses `SaasBillingPolicyService.calculateInitialTrial(startedAt)`.

- [ ] **Step 1: Write failing transition and purge tests**

Cover draft→submitted, submitted→under_review, review→approved/rejected, withdrawal, rejection-required reason, snapshot locking, duplicate active key, and exactly 30 calendar days after close.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runInBand tests/identity-application-policy.service.test.ts`  
Expected: FAIL because the policy service is absent.

- [ ] **Step 3: Implement the minimal policy**

```ts
export type IdentityApplicationStatus =
  | "draft" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";

export class IdentityApplicationPolicyService {
  public calculatePurgeAt(closedAt: Date): Date {
    return new Date(closedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}
```

- [ ] **Step 4: Write failing bank normalization tests**

Cover whitespace, half-width/full-width katakana, punctuation accepted by Japanese bank holder notation, corporate prefixes/suffixes, exact match, and mismatch rejection. Verify that an individual comparison uses the verified eKYC kana and a corporate comparison uses the verified legal-entity kana only.

- [ ] **Step 5: Verify RED, implement, and verify GREEN**

Run the two focused test files. Expected final result: PASS with no warnings.

- [ ] **Step 6: Add the 14/15/16-day Tokyo trial boundary tests**

Verify August 20 bills December 1, August 10 bills November 1, and exactly 15 remaining days counts the activation month. Change the existing billing policy only if these tests expose a mismatch.

- [ ] **Step 7: Commit only Task 2 files**

Commit message: `feat: define identity application policies`

### Task 3: Repository ports and application service

**Files:**
- Create: `backend/src/repositories/identity-application.repository.ts`
- Create: `backend/src/services/identity-application.service.ts`
- Create: `backend/tests/identity-application-repository.test.ts`
- Create: `backend/tests/identity-application.service.test.ts`

**Interfaces:**
- Produces paginated repository methods for own applications, target-shop reviews, and operations reviews.
- Produces service methods `createTechnicianDraft`, `updateTechnicianDraft`, `createMerchantDraft`, `updateMerchantShowcase`, `bindMerchantBankAccount`, `submit`, `withdraw`, `approveTechnician`, `rejectTechnician`, `approveMerchant`, and `rejectMerchant`.
- Consumes Task 2 policies.

- [ ] **Step 1: Write failing service tests with an in-memory repository port**

Tests must exercise real service state logic and only fake the persistence port. Cover one-active-application conflicts, ownership, target-shop isolation, required technician name, merchant applicant-kind requirements, submitted snapshot hash, optimistic versioning, and rejection/resubmission.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runInBand tests/identity-application.service.test.ts`  
Expected: FAIL because the repository port and service are absent.

- [ ] **Step 3: Implement minimal port and service**

Use `AppError` with stable keys such as `error.identity_application.conflict`, `error.identity_application.invalid_transition`, `error.identity_application.version_conflict`, and `error.identity_application.not_found`.

- [ ] **Step 4: Add repository query tests**

Assert `deletedAt: null`, shop scoping, pagination, no N+1 application-detail reads, and transaction use for state transitions.

- [ ] **Step 5: Implement Prisma repository and verify GREEN**

Run both focused files; expected PASS.

- [ ] **Step 6: Commit only Task 3 files**

Commit message: `feat: add identity application service`

### Task 4: Contract evidence, protected bank storage, and activation transaction

**Files:**
- Create: `backend/src/services/sensitive-field-cipher.service.ts`
- Create: `backend/src/repositories/identity-activation.repository.ts`
- Create: `backend/src/services/identity-activation.service.ts`
- Create: `backend/src/services/contract-acceptance.service.ts`
- Create: `backend/tests/sensitive-field-cipher.service.test.ts`
- Create: `backend/tests/identity-activation.service.test.ts`
- Create: `backend/tests/contract-acceptance.service.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: backend test environment fixtures that construct `AppConfig`

**Interfaces:**
- Produces authenticated AES-256-GCM encryption with a required non-placeholder secret.
- Produces `IdentityActivationService.activate(input)` with idempotent identity/role/profile creation and audit/notification callbacks.
- Produces immutable contract acceptance by version and hash, without IP.

- [ ] **Step 1: Write failing encryption tests**

Verify round trip, random IV/ciphertext, tamper rejection, masked API projection, and no raw values in serialized audit metadata.

- [ ] **Step 2: Verify RED, implement minimal cipher, verify GREEN**

Use Node `crypto` AES-256-GCM; derive the 32-byte key from the configured secret with SHA-256. Do not supply a production default.

- [ ] **Step 3: Write failing contract and activation tests**

Cover version/hash mismatch, immutable snapshot, no IP field, duplicate acceptance idempotency, customer base identity, technician/merchant/affiliate role mapping, and rollback when any transaction action fails.

- [ ] **Step 4: Implement repositories/services and verify GREEN**

Run all Task 4 tests; expected PASS.

- [ ] **Step 5: Commit only Task 4 files**

Commit message: `feat: secure identity activation evidence`

### Task 5: Applicant APIs and identity availability

**Files:**
- Create: `backend/src/validators/identity-application.validator.ts`
- Create: `backend/src/controllers/identity-application.controller.ts`
- Create: `backend/src/routes/identity-application.routes.ts`
- Create: `backend/src/routes/identity-application-service.factory.ts`
- Create: `backend/tests/identity-application-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: shared backend auth payload types
- Modify: `backend/tests/auth.test.ts`

**Interfaces:**
- Adds the applicant/search routes specified in the design.
- Adds `identityAvailability` to `/auth/me` with `active`, `available_to_apply`, `draft`, `pending`, and `rejected` states.

- [ ] **Step 1: Write failing API tests**

Cover Zod rejection, authentication, applicant ownership, pagination, search by merchant ID/name/address, draft CRUD, submit, withdraw, conflict envelopes, and server-computed availability.

- [ ] **Step 2: Verify RED**

Run the focused API tests and the auth test; expected failure because routes and availability are absent.

- [ ] **Step 3: Implement validators/controller/routes/factory and Auth projection**

Controllers only translate request/response. Services own all decisions. All successful JSON responses use the standard envelope.

- [ ] **Step 4: Verify GREEN**

Run Task 5 tests plus `backend/tests/openapi.test.ts` after Task 9 registers OpenAPI. Before Task 9, run only route/auth contracts.

- [ ] **Step 5: Commit only Task 5-owned changes or leave overlapping user hunks unstaged**

Commit message: `feat: expose identity application APIs`

### Task 6: Technician merchant-review, contact, and Excel resume

**Files:**
- Create: `backend/src/services/technician-application-review.service.ts`
- Create: `backend/src/services/technician-resume-export.service.ts`
- Create: `backend/src/controllers/merchant-technician-application.controller.ts`
- Create: `backend/src/routes/merchant-technician-application.routes.ts`
- Create: `backend/src/validators/merchant-technician-application.validator.ts`
- Create: `backend/tests/technician-application-review.service.test.ts`
- Create: `backend/tests/merchant-technician-application-api.test.ts`
- Create: `backend/tests/technician-resume-export.service.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts` only through a new repository method needed for idempotent direct conversation/contact creation

**Interfaces:**
- Produces target-shop approve/reject/contact/export methods.
- `contact` returns `{ conversationId: number }` and is idempotent.
- Export returns an XLSX buffer and safe filename.

- [ ] **Step 1: Write failing review/contact tests**

Cover target-shop isolation, approval transaction, rejection reason, notification creation, friendship/contact upsert, direct-conversation reuse, and no approval side effect from contact.

- [ ] **Step 2: Verify RED, implement, verify GREEN**

Run review service tests until PASS.

- [ ] **Step 3: Load bundled spreadsheet dependencies and write failing export tests**

Assert exact filename, all fields, embedded image media, printable layout metadata, no persistence call, and sensitive download audit.

- [ ] **Step 4: Implement the workbook and verify GREEN**

Use the bundled workbook library. Do not use external image URLs in workbook cells.

- [ ] **Step 5: Render/open a generated fixture workbook and inspect it**

Run `unzip -t`, formula-error scan, and visual rendering/inspection before acceptance.

- [ ] **Step 6: Commit only Task 6 files**

Commit message: `feat: review technician identity applications`

### Task 7: Merchant review, billing activation, and operations APIs

**Files:**
- Create: `backend/src/services/merchant-application-review.service.ts`
- Create: `backend/src/controllers/operations-merchant-application.controller.ts`
- Create: `backend/src/routes/operations-merchant-application.routes.ts`
- Create: `backend/src/validators/operations-merchant-application.validator.ts`
- Create: `backend/tests/merchant-application-review.service.test.ts`
- Create: `backend/tests/operations-merchant-application-api.test.ts`

**Interfaces:**
- Approval consumes `IdentityActivationService` and `SaasBillingPolicyService` in one repository transaction.
- Produces merchant/shop/membership/identity/role/billing/free-period/application/notification/audit records exactly once.

- [ ] **Step 1: Write failing merchant validation/review tests**

Cover corporate registration plus corporate account holder, representative personal account rejection, individual eKYC plus exact holder match, required documents, contract version/hash, lock-on-submit, approval rollback, rejection/resubmit, and trial boundaries.

- [ ] **Step 2: Verify RED, implement minimal review service, verify GREEN**

Run focused service tests until PASS.

- [ ] **Step 3: Write failing operations API tests**

Cover pagination, RBAC, masked bank projection, sensitive-document authorization, approve/reject, required rejection reason, and idempotent repeat review.

- [ ] **Step 4: Implement route layer and verify GREEN**

Run service and API tests; expected PASS.

- [ ] **Step 5: Commit only Task 7 files**

Commit message: `feat: review merchant identity applications`

### Task 8: Affiliate contract activation and withdrawal guard

**Files:**
- Create: `backend/src/controllers/identity-activation.controller.ts`
- Create: `backend/src/routes/identity-activation.routes.ts`
- Create: `backend/src/validators/identity-activation.validator.ts`
- Create: `backend/src/services/affiliate-withdrawal-eligibility.service.ts`
- Create: `backend/tests/affiliate-identity-activation-api.test.ts`
- Create: `backend/tests/affiliate-withdrawal-eligibility.service.test.ts`
- Modify: the formal wallet withdrawal/adjustment service at its existing withdrawal-creation boundary

**Interfaces:**
- `POST /api/v1/identity-activations/affiliate` accepts current contract version/hash and acknowledgement flags.
- `AffiliateWithdrawalEligibilityService.assertEligible` checks verified eKYC, bound bank, and normalized holder match before withdrawal creation.

- [ ] **Step 1: Write failing activation tests**

Cover contract retrieval, required acknowledgements, immediate identity/role activation, duplicate-submit idempotency, system notification, and no IP evidence.

- [ ] **Step 2: Verify RED, implement, verify GREEN**

- [ ] **Step 3: Write failing withdrawal guard tests**

Cover earnings without eKYC, withdrawal blocked without eKYC, blocked without bank, blocked on mismatch, and accepted exact normalized match.

- [ ] **Step 4: Insert the guard at the formal withdrawal boundary and verify GREEN**

- [ ] **Step 5: Commit only Task 8 files**

Commit message: `feat: activate affiliate identity by contract`

### Task 9: Retention, permissions, OpenAPI, and formal wiring

**Files:**
- Create: `backend/src/services/identity-application-purge.service.ts`
- Create: `backend/src/workers/identity-application-purge.worker.ts`
- Create: `backend/tests/identity-application-purge.service.test.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: role-permission seed assignment files
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Produces idempotent `purgeDue(now, pageSize)` worker service.
- Registers all routes, permissions, schemas, binary response, and stable errors.

- [ ] **Step 1: Write failing purge tests**

Cover pending retention, 29-day no-op, 30-day purge, physical media/detail removal, minimal audit retention, no sensitive audit metadata, pagination, and repeated-run idempotency.

- [ ] **Step 2: Verify RED, implement, verify GREEN**

- [ ] **Step 3: Write failing permissions/OpenAPI tests**

Assert every endpoint, request/response schema, pagination contract, binary XLSX response, protected middleware permission, and role assignment.

- [ ] **Step 4: Wire routes and OpenAPI without overwriting existing dirty hunks**

- [ ] **Step 5: Run backend focused and full verification**

Run: `npm --prefix backend test -- --runInBand`  
Run: `npm --prefix backend run lint`  
Run: `npm --prefix backend run build`  
Expected: all exit 0.

- [ ] **Step 6: Commit only Task 9 changes that belong to this feature**

Commit message: `feat: secure identity application operations`

### Task 10: Simulation seed identity matrix

**Files:**
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: relevant simulation plan/config files
- Create: `backend/tests/simulation-identity-matrix.test.ts`
- Modify: formal test-account documentation/export if it lists available identities

**Interfaces:**
- Produces deterministic customer/technician/merchant/affiliate identities and roles for the specified simulation accounts.

- [ ] **Step 1: Write failing deterministic seed assertions**

Assert technician accounts have customer+technician+scout identities, merchant accounts have customer+technician+merchant_owner+scout identities, ordinary customers have customer only, scopes point to real profiles/shops, and repeated seed execution does not duplicate records.

- [ ] **Step 2: Verify RED, implement seed upserts, verify GREEN**

- [ ] **Step 3: Commit only Task 10 files**

Commit message: `feat: seed switchable simulation identities`

### Task 11: Frontend API client and identity settings states

**Files:**
- Create: `src/features/identity-applications/api.ts`
- Create: `src/features/identity-applications/model.ts`
- Create: `src/features/identity-applications/api.test.ts`
- Create: `src/features/identity-applications/IdentitySettingsPage.tsx`
- Create: `src/features/identity-applications/IdentitySettingsPage.test.tsx`
- Modify: `src/auth/rbac.ts`
- Modify: `src/api/auth.ts`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes formal identity-availability and application APIs.
- Produces active/apply/continue/pending/rejected rows and formal switch navigation.

- [ ] **Step 1: Write failing model/API tests**

Cover exact endpoint/method/body contracts and map every server availability state to UI action without local fallback.

- [ ] **Step 2: Verify RED, implement API/model, verify GREEN**

- [ ] **Step 3: Write failing identity settings component tests**

Cover customer base active, ordinary-user application buttons, simulation account switch matrix, pending/rejected states, switch failure, and no unrestricted `canUseUserSessionForClientPortal` behavior.

- [ ] **Step 4: Implement focused page and remove the client-portal bootstrap bypass**

- [ ] **Step 5: Verify frontend focused tests and build**

Run: `npm test -- src/features/identity-applications/IdentitySettingsPage.test.tsx src/auth/rbac.test.ts`  
Run: `npm run build`  
Expected: both exit 0.

- [ ] **Step 6: Commit only Task 11 files**

Commit message: `feat: show formal identity availability`

### Task 12: Technician application and merchant review UI

**Files:**
- Create: `src/features/identity-applications/TechnicianApplicationWizard.tsx`
- Create: `src/features/identity-applications/TechnicianApplicationWizard.test.tsx`
- Create: `src/features/identity-applications/MerchantTechnicianReview.tsx`
- Create: `src/features/identity-applications/MerchantTechnicianReview.test.tsx`
- Modify: `src/App.tsx`
- Modify: merchant-admin navigation/route files only where required to expose the review surface
- Modify: existing i18n translation source

**Interfaces:**
- Consumes Task 5/6 APIs.
- Produces shop search/select, optional detail uploads, submit/withdraw/status, consolidated merchant review, contact-to-chat, and one-resume download.

- [ ] **Step 1: Write failing wizard tests**

Cover search by ID/name/address, pagination, target selection, required name, optional fields, optional media, auto-saved server draft, refresh persistence, submit guard, and withdraw-before-shop-change.

- [ ] **Step 2: Verify RED, implement mobile-first wizard, verify GREEN**

- [ ] **Step 3: Write failing merchant-review tests**

Cover every submitted field/media, OK, rejection reason, contact navigation by returned conversation ID, XLSX warning/download, permission errors, and repeat-action guards.

- [ ] **Step 4: Implement review surface and verify GREEN**

- [ ] **Step 5: Commit only Task 12 files**

Commit message: `feat: add technician application experience`

### Task 13: Merchant wizard, operations review, and affiliate contract UI

**Files:**
- Create: `src/features/identity-applications/MerchantApplicationWizard.tsx`
- Create: `src/features/identity-applications/MerchantApplicationWizard.test.tsx`
- Create: `src/features/identity-applications/OperationsMerchantReview.tsx`
- Create: `src/features/identity-applications/OperationsMerchantReview.test.tsx`
- Create: `src/features/identity-applications/AffiliateContractActivationPage.tsx`
- Create: `src/features/identity-applications/AffiliateContractActivationPage.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx` to expose a read-only application-mode service-display composition
- Modify: `src/App.tsx`
- Modify: operations-admin route/navigation files only where required
- Modify: existing i18n translation source

**Interfaces:**
- Consumes Tasks 7/8 APIs.
- Reuses merchant service-display UI without data-center switch, bottom nav, or operational edit controls.

- [ ] **Step 1: Write failing merchant wizard tests**

Cover close control, service-display draft, corporate/individual branches, required documents, required bank fields, masked re-entry, eKYC gate, holder mismatch, contract rules/examples, acknowledgements, final review, snapshot lock, and rejection editing.

- [ ] **Step 2: Verify RED, extract application-mode service display, implement wizard, verify GREEN**

- [ ] **Step 3: Write failing operations review and affiliate tests**

Cover masked bank data, sensitive documents, approve/reject, system message state, complete affiliate rules/contract, final confirmation, immediate activation, duplicate guard, and contract receipt download.

- [ ] **Step 4: Implement and verify GREEN**

- [ ] **Step 5: Commit only Task 13 files**

Commit message: `feat: complete merchant and affiliate identity flows`

### Task 14: Documentation, full regression, and live acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/api.md`
- Modify: `docs/User Management.md`
- Create or update: focused acceptance checklist under `docs/`

**Interfaces:**
- Documents formal identity matrix, application states, contract evidence, retention, bank matching, trial examples, permissions, and test-account behavior.

- [ ] **Step 1: Update documentation without claiming unverified behavior**

- [ ] **Step 2: Run full static and automated verification**

Run backend Prisma validate, migration/schema contracts, lint, full Jest, and build. Run frontend lint/test/build. Record exact exit codes and failure counts.

- [ ] **Step 3: Start formal local services and perform live acceptance**

Use a mobile viewport and formal accounts. Verify ordinary-user application actions, all simulation switches, technician submission/review/contact/chat/export, merchant wizard/operations approval, affiliate activation, notification persistence, refresh/relogin persistence, and cross-shop denial.

- [ ] **Step 4: Inspect the actual Excel artifact**

Open/render the final workbook, inspect embedded images/text/print layout, run ZIP integrity, and scan formulas/errors.

- [ ] **Step 5: Compare every original requirement against live evidence**

List any unmet item as incomplete; do not substitute passing tests for live UI acceptance.

- [ ] **Step 6: Commit documentation and acceptance evidence only after verification**

Commit message: `docs: verify identity application workflows`

