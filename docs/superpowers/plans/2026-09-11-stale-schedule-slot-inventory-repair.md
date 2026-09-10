# Stale Schedule Slot Inventory Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale service-linked schedule slots from appearing as bookable inventory and provide a local-only, audited, digest-guarded preview/apply/rollback repair for future unbooked rows.

**Architecture:** The existing public booking repository receives a reusable relational-validity predicate so pagination and API results exclude stale inventory in MySQL. A pure repair domain classifies slots and resolves only exact, unique current service pairs; a maintenance repository performs bulk replacement/soft-delete and rollback transactions, while a service and CLI enforce local-database, actor-permission, plan-digest, and audit requirements.

**Tech Stack:** Node.js 22, TypeScript strict mode, Prisma/MySQL, Jest/Supertest, React/Vite consumer verification.

## Global Constraints

- Work only on `codex/repair-stale-schedule-slots` in the current linked worktree.
- Never touch, stop, restart, or test port 5180; use verified-free non-5180 ports.
- No push, PR, tag, deployment, SSH, remote database, mock, fake API, or invented mapping.
- Preserve every past, booked, order-linked, route-linked, Exchange-linked, financial, and audit record.
- A replacement must preserve shop, technician, name, category, currency, price, duration, and service mode exactly.
- Every apply must require the exact preview digest and an active local administrator who has `schedule:slots:write`.

---

### Task 1: Close the public inventory query gap

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/tests/booking-repository-scope.test.ts`

**Interfaces:**
- Consumes: `BookingRepository.listAvailableSlots(input: AvailabilityListInput)`.
- Produces: `buildBookableScheduleSlotWhere(): Prisma.ScheduleSlotWhereInput`, reused by public listing and booking creation filters.

- [x] **Step 1: Write the failing repository tests**

Add assertions that technician-only public queries always require every present service relation to be current, including published/non-deleted shop service and approved/active/bookable/non-deleted technician service with active category, technician profile, and user. Assert the same predicate is included in both `findMany` and `count` pagination queries.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand --runTestsByPath tests/booking-repository-scope.test.ts`

Expected: FAIL because technician-only queries currently contain no relation-validity predicate and technician-service filters omit `reviewStatus: "APPROVED"`.

- [x] **Step 3: Implement the minimal shared predicate**

Create one private predicate that requires at least one source relation, treats a missing optional source as acceptable, and requires every present source to be currently bookable. Apply it to `listAvailableSlots` and both booking-slot reads without changing historical order projections.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 2: Build deterministic preview and repair planning

**Files:**
- Create: `backend/src/domain/schedule-slot-inventory-repair.ts`
- Create: `backend/tests/schedule-slot-inventory-repair.domain.test.ts`

**Interfaces:**
- Produces: `classifyStaleScheduleSlot(slot, now)`, `resolveExactScheduleSlotReplacement(slot, inventory)`, and `digestScheduleSlotRepairPlan(plan)`.
- Classification values: `current`, `protected`, `repair_replace`, and `repair_remove`; each stale entry includes stable reason codes and candidate counts.

- [x] **Step 1: Write failing pure-domain tests**

Cover deleted/unpublished shop services; inactive/unbookable/unapproved/deleted technician services; past, booked, and related protected slots; exact unique mappings; price/duration/name/category/shop/technician mismatches; ambiguous mappings; and stable digests independent of input order.

- [x] **Step 2: Run the domain test and verify RED**

Run: `npm test -- --runInBand --runTestsByPath tests/schedule-slot-inventory-repair.domain.test.ts`

Expected: FAIL because the domain module does not exist.

- [x] **Step 3: Implement the pure planner**

Implement classification and exact pair matching without database access. A slot with any business relation or nonzero `bookedCount` is always protected. A current service candidate must be published/non-deleted and exact on service semantics; a technician-service candidate must additionally be approved, active, bookable, owned by the same technician, and linked to the mapped shop service when both sources exist.

- [x] **Step 4: Run the domain test and verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 3: Add local-only audited preview/apply/rollback

**Files:**
- Create: `backend/src/repositories/schedule-slot-inventory-repair.repository.ts`
- Create: `backend/src/services/schedule-slot-inventory-repair.service.ts`
- Create: `backend/scripts/repair-stale-schedule-slots.ts`
- Create: `backend/tests/schedule-slot-inventory-repair.service.test.ts`
- Create: `backend/tests/schedule-slot-inventory-repair.repository.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- CLI preview: `ENV_FILE=... npm run repair:stale-schedule-slots -- --preview --actor-email <email>`.
- CLI apply: append `--apply --plan-digest <sha256>`.
- CLI rollback: `--rollback <batch-id> --actor-email <email>`.
- Result includes masked `databaseTarget`, counts by reason/action, protected IDs sample, unmapped sample, plan digest, batch ID, and zero-mutation preview proof.

- [x] **Step 1: Write failing service and repository tests**

Assert local MySQL safety gates, active-admin/permission enforcement, preview zero writes, digest drift rejection, protection recheck inside the transaction, bulk replacement markers, source-semantic preservation, audit rows, idempotent apply refusal/replay reporting, rollback refusal after replacement usage, and successful rollback restoring original availability while retaining audit history.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --runInBand --runTestsByPath tests/schedule-slot-inventory-repair.service.test.ts tests/schedule-slot-inventory-repair.repository.test.ts`

Expected: FAIL because the repair service/repository do not exist.

- [x] **Step 3: Implement repository, service, and CLI**

The repository reads slots and current inventory in paged/bulk queries. Apply rechecks the complete plan, creates equivalent replacement rows with repair-scoped idempotency keys, soft-deletes only eligible originals, and writes immutable per-slot audit metadata in the same transaction. Rollback locates replacements through those markers, refuses any replacement with business usage, soft-deletes replacements, restores originals, and appends rollback audit records.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 4: Produce local database and API/UI evidence

**Files:**
- Create: `docs/verification/2026-09-11-stale-schedule-slot-inventory-repair.md`
- Modify: `README.md`

**Interfaces:**
- Consumes the CLI output from Task 3 and existing `/api/v1/schedule/availability` contract.
- Produces a reproducible evidence record with preview/apply/rollback counts and exact local commands.

- [x] **Step 1: Verify a free non-5180 runtime tuple**

Use `lsof` before binding an isolated frontend/API runtime. Record PID, cwd, branch, health, and proxy target.

- [x] **Step 2: Run preview, controlled apply, API check, rollback proof, and final apply**

Run the preview against the explicit main local `.env.dev`, apply only the matching digest, verify stale IDs are absent from the public API and consumer view, exercise rollback on a controlled repair batch, then leave the requested local repair in the applied state. Never inspect or mutate port 5180.

- [x] **Step 3: Run fresh verification**

Run focused Jest tests, complete backend Jest, backend lint/build, root Vitest/lint/formal build, `git diff --check`, and a read-only post-apply reconciliation showing zero stale usable inventory and unchanged protected relations.

- [x] **Step 4: Commit the branch**

Commit only this bounded repair and report `READY_FOR_INTEGRATION`; do not merge local main or touch 5180.
