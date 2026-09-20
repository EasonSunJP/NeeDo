# Booking Availability and Deployment Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore StagingTest availability/checkout loading under dense schedules and replace the hard-coded splash version with the exact deployed source revision's eight-character identifier.

**Architecture:** Keep booking creation as the authoritative transaction boundary. For availability calls that intentionally include unavailable slots, page the formally eligible slots first and run the existing occupancy/conflict projection only for those page IDs inside the same repeatable-read transaction; retain the existing pre-pagination projection for callers that exclude unavailable rows. Resolve one frontend deployment label from `VITE_DEPLOYMENT_VERSION`, inject it from the immutable staging packager's full source revision, and reuse it on splash and settings surfaces.

**Tech Stack:** TypeScript, React 19, Vite 7, Prisma/MySQL, Jest, Vitest, Node test runner.

## Global Constraints

- Preserve booking locks, capacity checks, overlap checks, idempotency, and repeatable-read transaction semantics.
- Do not solve the failure by increasing the frontend timeout.
- Display `ver：<first 8 Git SHA characters>` for packaged deployments and `ver：dev` when no deployment revision is injected.
- Do not add a second version state source.
- Do not commit, push, deploy, or mutate staging in this task.

---

### Task 1: Bound the include-unavailable occupancy projection

**Files:**
- Modify: `backend/tests/booking-repository-scope.test.ts`
- Modify: `backend/src/repositories/booking.repository.ts`

**Interfaces:**
- Consumes: `BookingRepository.listAvailableSlots(input, visibility, customerUserId)`.
- Produces: `listAvailabilityOccupancy(..., slotIds?: number[])`, where `slotIds` limits conflict projection to a previously selected page.

- [ ] **Step 1: Write the failing regression test**

Add a repository test whose mocked `scheduleSlot.findMany` returns slot `501` for `includeUnavailable: true`. Assert that `findMany` runs before `$queryRaw`, and that the generated occupancy SQL contains an `s.id IN (...)` constraint whose values include `501`.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/booking-repository-scope.test.ts --runInBand`

Expected: FAIL because the current occupancy query runs before pagination and has no page-ID constraint.

- [ ] **Step 3: Implement the minimal repository fast path**

Build the existing formal-slot `where` clause before occupancy evaluation. For `includeUnavailable: true`, fetch the page and count first, then call `listAvailabilityOccupancy` with `list.map(({ id }) => id)`; skip the raw query for an empty page. For `includeUnavailable: false`, retain the existing pre-pagination occupancy projection so blocked slots are excluded before pagination and totals remain correct. Add `AND s.id IN (${Prisma.join(slotIds)})` only when the optional ID list is present.

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/booking-repository-scope.test.ts tests/booking-availability.integration.test.ts --runInBand
```

Expected: PASS, including blocked, replacement, customer-overlap, and Exchange-reservation behavior.

### Task 2: Inject and display the deployed source revision

**Files:**
- Create: `src/config/deploymentVersion.ts`
- Create: `src/config/deploymentVersion.test.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/pages/auth/loginCopyright.test.ts`
- Modify: `scripts/aws-staging-package-application.mjs`
- Modify: `deploy/staging/runtime-contract.test.mjs`

**Interfaces:**
- Consumes: build environment variable `VITE_DEPLOYMENT_VERSION`.
- Produces: `resolveDeploymentVersion(value?: string): string` and `deploymentVersionLabel: string`.

- [ ] **Step 1: Write failing frontend and packaging tests**

Test that the resolver trims and accepts exactly eight hexadecimal characters, falls back to `dev`, the splash imports the shared label instead of containing `0.001`, and the immutable packager passes `revision.slice(0, 8)` as `VITE_DEPLOYMENT_VERSION` to the production build.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm test -- src/config/deploymentVersion.test.ts src/pages/auth/loginCopyright.test.ts
node --test deploy/staging/runtime-contract.test.mjs
```

Expected: FAIL because the resolver and packaging injection do not yet exist and the splash is hard-coded.

- [ ] **Step 3: Implement the shared deployment label**

Create a small resolver that returns a normalized eight-character SHA or `dev`, declare `VITE_DEPLOYMENT_VERSION` in `src/vite-env.d.ts`, import `deploymentVersionLabel` in the splash and settings page, and remove both `0.001` constants.

- [ ] **Step 4: Inject the immutable revision during packaging**

Allow the packager's command helper to receive task-specific environment entries and pass `{ VITE_DEPLOYMENT_VERSION: revision.slice(0, 8) }` only to `verify:production-build`. Keep the full 40-character revision in release metadata unchanged.

- [ ] **Step 5: Run focused tests**

Run the commands from Step 2. Expected: PASS.

### Task 3: Verify the integrated local state

**Files:**
- Review all files changed in Tasks 1 and 2.

**Interfaces:**
- Consumes: the final worktree diff.
- Produces: local-only verification evidence.

- [ ] **Step 1: Run type and build checks**

Run:

```bash
npm run lint
npm --prefix backend run lint
npm --prefix backend run build
VITE_DEPLOYMENT_VERSION=1234abcd npm run build -- --mode formal
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect the production output**

Search generated HTML/assets for `ver：1234abcd` or the injected identifier and confirm `0.001` is absent from the splash source and built assets.

- [ ] **Step 3: Review the diff and status**

Confirm every changed line belongs to the two approved fixes, no timeout/security/booking guards were weakened, and no unrelated files were modified.

