# Formal Field Job Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate `/admin/field-jobs` with a formal, paginated and privacy-preserving projection of existing home-service Booking orders.

**Architecture:** `BookingOrder` remains the only fulfillment state authority. A focused field-job repository reads only `fulfillment_mode = 'home'` orders and their existing address, technician, state-history, service-session, receipt, refund/dispute, overdue, performance and SOS relations; the service removes exact address and SOS facts unless the actor holds their specific permissions. The React page consumes a strict adapter and links all mutations to the existing formal order center.

**Tech Stack:** React, TypeScript, Vite, Express, Zod, Prisma/MySQL, Jest/Supertest, Vitest.

## Global Constraints

- No mock, demo, placeholder or fake API/data.
- Do not create a parallel FieldJob state table; BookingOrder is authoritative.
- All list reads are paginated and all inputs are strict Zod schemas.
- Require `backoffice:field-jobs:read`; exact address additionally requires `backoffice:field-jobs:address:read`; SOS summaries additionally require `sos:list`.
- Never return service verification codes, verification hashes, customer email/phone, payment references, refund evidence or internal exception notes.
- No field-job assignment, reassignment, photo upload, navigation or completion mutation is introduced in this slice.
- Development UI verification uses a non-5180 port. Port 5180 is allowed only after local-main integration.

---

### Task 1: Lock the Projection, Privacy and RBAC Contract

**Files:**

- Create: `backend/tests/field-job-service.test.ts`
- Create: `backend/tests/field-job-api.test.ts`
- Create: `backend/tests/field-job-openapi.test.ts`
- Create: `backend/tests/field-job-schema.test.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/prisma/migrations/20260913143000_formal_field_job_projection/migration.sql`

**Interfaces:**

- Produces `FIELD_JOB_PERMISSIONS = { read, addressRead }`.
- Produces strict list query `{ page, pageSize, keyword?, status?, assignment? }` and positive numeric `id` params.
- Produces paginated summary and detail payloads whose address disclosure is `region_only | full`.

- [ ] Write tests asserting authentication, `backoffice:field-jobs:read`, optional address/SOS disclosure, audit events, not-found behavior, strict Zod rejection, OpenAPI schemas, permission migration and the fulfillment-mode index.
- [ ] Run the focused tests and verify they fail because the field-job contract does not exist.
- [ ] Add the two system permissions, grant read/address to admin and operator, add the BookingOrder query index and additive migration.
- [ ] Re-run the permission/schema tests.

### Task 2: Implement the BookingOrder-backed API Projection

**Files:**

- Create: `backend/src/validators/field-job.validator.ts`
- Create: `backend/src/services/field-job.service.ts`
- Create: `backend/src/repositories/field-job.repository.ts`
- Create: `backend/src/controllers/field-job.controller.ts`
- Create: `backend/src/routes/field-job.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**

- `FieldJobRepositoryPort.list(input): Promise<PaginatedResponse<FieldJobSourceRecord>>`
- `FieldJobRepositoryPort.findById(id): Promise<FieldJobSourceRecord | null>`
- `FieldJobService.list(actor, context, query)` and `get(actor, context, id)` return redacted public payloads.
- `GET /api/v1/backoffice/field-jobs` and `GET /api/v1/backoffice/field-jobs/:id`.

- [ ] Implement the repository query with `deletedAt: null`, `fulfillmentMode: "home"`, deterministic `createdAt/id` ordering, projection-only relation selects and no N+1 reads.
- [ ] Implement service disclosure: exact address only with address permission, SOS count only with `sos:list`, credential state without code/hash, and read audit metadata without PII.
- [ ] Mount authenticated/RBAC/validated routes and document exact OpenAPI request/response/error contracts.
- [ ] Run field-job unit/API/OpenAPI tests until green, then run related Booking/Order tests.

### Task 3: Activate the Operations Page Without Fake Actions

**Files:**

- Create: `src/api/fieldJobs.ts`
- Create: `src/api/fieldJobs.test.ts`
- Modify: `src/pages/admin/FieldJobsPage.tsx`
- Modify: `src/pages/admin/FieldJobsPage.test.ts`
- Create: `src/pages/admin/FieldJobsPage.interaction.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**

- `fieldJobsApi.list(query, signal?)` validates the paginated envelope and exact item shape.
- `fieldJobsApi.get(id, signal?)` validates the exact detail shape.

- [ ] Write failing adapter and page tests for server pagination, status/assignment/search filters, error/empty states, detail drawer, permission-dependent address display, credential secrecy, exception badges and formal-order handoff.
- [ ] Implement the strict adapter and a production page using existing Admin layout, DataTable, Badge, Drawer, DetailGrid and Button patterns.
- [ ] Gate navigation with `backoffice:field-jobs:read`; add complete visible-text translations; do not render write actions.
- [ ] Run the focused frontend tests, lint and build.

### Task 4: Prove Existing Local Formal Data Projects Exactly Once

**Files:**

- Create: `backend/scripts/check-field-job-projection.ts`
- Create: `backend/tests/field-job-check-script.test.ts`
- Modify: `backend/package.json`
- Create: `docs/field-job-projection.md`
- Modify: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**

- `npm --prefix backend run check:field-job-projection` is read-only and refuses non-loopback, staging/production-looking or non-dev/test/local databases.

- [ ] Write a failing checker contract test for its safety guard and independent BookingOrder oracle.
- [ ] Implement the read-only checker: independently collect every non-deleted `fulfillmentMode=home` order, page through the repository, compare exact IDs/counts and prove redacted/full address projections without printing PII.
- [ ] Run the checker against the configured local formal database; fail if no formal home order exists.
- [ ] Document authority, privacy, RBAC, evidence and explicitly unsupported mutations.

### Task 5: Verify, Integrate, Clean, Push and Deploy Staging

**Files:**

- Modify only files required by regressions found during verification.

- [ ] Run `git diff --check`, focused tests, backend lint/build/full isolated Jest inventory, frontend tests/lint/build and non-5180 UI verification.
- [ ] Commit the feature branch and verify its ancestry and clean state.
- [ ] Merge into local `main`, re-run the integrated verification, then use 5180 for final local UI/API validation.
- [ ] Audit all branches/worktrees/processes/deployment references; remove only merged, clean, inactive task branches/worktrees and keep a cleanup record.
- [ ] Push `main` to GitHub, deploy through the repository's documented staging workflow, verify deployed revision/health/authenticated field-job reads/UI, and report any acceptance gap without fabricating success.
