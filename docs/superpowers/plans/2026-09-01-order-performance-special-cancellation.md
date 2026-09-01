# Order Performance and Special Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate technician acceptance rate from formal order outcomes and let authorized operations staff apply or revoke a reasoned special-cancellation exclusion while preserving immutable audit and order-timeline history.

**Architecture:** Keep `BookingOrder.status` and the existing transition state machine unchanged. Add a one-to-one adverse-outcome assessment, append-only assessment revisions, and a rebuildable technician performance summary. Booking cancellation classification, explicit uncompleted resolution, exclusion changes, summary projection updates, audit writes, and idempotency checks execute in repository transactions; order reads merge compatible `statusHistory` with typed `timelineEvents`.

**Tech Stack:** Node.js 22, Express 4, TypeScript 5.9 strict mode, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7, React 19, Vitest 4.

## Global Constraints

- Execute in an isolated Git worktree created with `using-git-worktrees`; the selected base must contain approved design commit `f33e7e99` as an ancestor.
- This is the first of five microsteps in `docs/superpowers/specs/2026-09-01-formal-home-search-ranking-engagement-and-taxonomy-design.md`; do not start favorites, ranking, taxonomy, or final search cards here.
- Preserve the `BookingOrderStatus` enum and all existing refund, settlement, affiliate, schedule-slot, and notification behavior.
- Never accept an acceptance-rate number from any API or administrative form.
- Do not infer an uncompleted outcome from time elapsed and do not parse free-form cancellation text to infer responsibility.
- A technician cancellation is accountable only when the authenticated transition actor resolves to the order's assigned technician user.
- Special exclusion changes require `publicReason`, `idempotencyKey`, and `expectedRevision`; `internalNote` is optional and authorization-filtered.
- Assessment revisions are append-only. Application code exposes no update or delete operation for a revision row.
- Keep Route → Controller → Service → Repository → Prisma layering, standard response envelopes, Zod validation, OpenAPI, RBAC, audit, i18n, and soft-delete filters.
- Do not add mock data, browser-local persistence, fake results, direct SQL outside the additive migration, or unrelated cleanup.
- Every task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Database and backend domain

- Modify `backend/prisma/schema.prisma`: add performance enums, assessments, immutable revisions, summaries, and relations.
- Create `backend/prisma/migrations/20260901010000_order_performance_special_cancellation/migration.sql`: additive tables, foreign keys, checks, and indexes.
- Create `backend/tests/order-performance-schema.test.ts`: guard schema and migration invariants.
- Create `backend/src/services/order-performance-calculator.ts`: pure basis-point calculation and projection rebuild math.
- Create `backend/tests/order-performance-calculator.test.ts`: lock zero-denominator and exclusion behavior.
- Create `backend/src/repositories/order-performance.repository.ts`: transactional classification, apply/revoke, projection update, idempotency, and timeline reads.
- Create `backend/tests/order-performance.repository.test.ts`: transaction, optimistic concurrency, replay, and append-only coverage.
- Create `backend/src/services/order-performance.service.ts`: authorization-neutral business commands and response mapping.
- Create `backend/tests/order-performance.service.test.ts`: state eligibility, reason, replay, conflict, and audit input coverage.
- Create `backend/src/validators/order-performance.validator.ts`: command bodies and order parameters.
- Create `backend/src/controllers/order-performance.controller.ts`: request/response adaptation only.
- Create `backend/src/routes/order-performance.routes.ts`: backoffice routes and permission declarations.
- Modify `backend/src/app.ts`: dependency injection and route registration.
- Modify `backend/src/constants/permissions.constants.ts`: add the operations write permission.
- Modify `backend/prisma/seed.ts`: assign the permission to approved system roles.
- Modify `backend/src/constants/error-codes.ts`: stable performance error codes.
- Modify `backend/src/api/openapi.ts`: schemas, endpoints, permission, conflicts, and typed timeline events.
- Modify `backend/tests/openapi.test.ts`: machine-readable contract guards.
- Create `backend/tests/order-performance-api.test.ts`: auth, RBAC, envelopes, validation, idempotency, and conflict behavior.
- Create `backend/tests/order-performance-permissions.test.ts`: permission catalog and role assignment.
- Modify `docs/api.md`: document the commands, formula, and timeline visibility.

### Booking integration

- Modify `backend/src/repositories/booking.repository.ts`: classify an assigned-technician cancellation inside the existing transition transaction and return merged timeline inputs.
- Modify `backend/src/services/booking.service.ts`: pass authenticated actor identity/type to the repository classification context without changing transition rules.
- Modify `backend/tests/booking-repository-scope.test.ts`: prove actor-to-technician matching and non-accountable cancellation branches.
- Modify `backend/tests/booking-service.test.ts`: prove transition behavior remains compatible.
- Modify `backend/tests/booking-api.test.ts`: prove `statusHistory` compatibility and typed `timelineEvents`.
- Modify `src/features/booking/api.ts`: add the discriminated timeline event and current performance assessment types.
- Modify `src/pages/user/UserOrderDetailPage.tsx`: render the merged typed timeline, public reasons only.
- Modify `src/pages/user/UserOrderDetailPage.formal.test.tsx` if present; otherwise create it: verify apply/revoke history and internal-note omission.

### Operations UI

- Modify `backend/src/repositories/backoffice.repository.ts`: include current assessment summary and authorized full timeline in order detail projection.
- Modify `backend/src/services/backoffice.service.ts`: expose the detail type without duplicating business logic.
- Modify `src/api/backofficeRealData.ts`: add order-detail and special-cancellation command adapters.
- Modify `src/pages/admin/OrdersAdminPage.tsx`: load detail on drawer open and add apply/revoke controls with required reasons.
- Create `src/pages/admin/OrdersAdminPage.order-performance.test.tsx`: UI state, stale conflict, apply, revoke, and immutable timeline coverage.
- Modify `src/i18n/translations.ts`: add all new user-visible copy in `zh-CN`, `zh-TW`, `ja`, `en`, and `ko`.

### Maintenance

- Create `backend/scripts/rebuild-technician-performance.ts`: compare-first projection rebuild command with explicit apply flag.
- Create `backend/tests/rebuild-technician-performance.test.ts`: dry-run and safe replacement behavior.

---

### Task 1: Add the normalized order-performance schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901010000_order_performance_special_cancellation/migration.sql`
- Create: `backend/tests/order-performance-schema.test.ts`

**Interfaces:**

```prisma
enum OrderPerformanceOutcome {
  TECHNICIAN_CANCELLED
  TECHNICIAN_UNCOMPLETED
}

enum OrderPerformanceTreatment {
  COUNTED
  SPECIAL_EXCLUDED
}

enum OrderPerformanceRevisionAction {
  CLASSIFY_TECHNICIAN_CANCELLED
  CLASSIFY_TECHNICIAN_UNCOMPLETED
  APPLY_SPECIAL_EXCLUSION
  REVOKE_SPECIAL_EXCLUSION
}
```

Add these models with mapped snake-case columns and explicit relation names:

```prisma
model OrderPerformanceAssessment {
  id                  Int                       @id @default(autoincrement())
  bookingOrderId      Int                       @unique @map("booking_order_id")
  technicianProfileId Int                       @map("technician_profile_id")
  outcome             OrderPerformanceOutcome
  treatment           OrderPerformanceTreatment @default(COUNTED)
  version             Int                       @default(1)
  currentRevisionId   Int?                      @unique @map("current_revision_id")
  createdAt           DateTime                  @default(now()) @map("created_at")
  updatedAt           DateTime                  @updatedAt @map("updated_at")
  deletedAt           DateTime?                 @map("deleted_at")
  // bookingOrder, technicianProfile, revisions, currentRevision relations
}

model OrderPerformanceAssessmentRevision {
  id                  Int                              @id @default(autoincrement())
  assessmentId        Int                              @map("assessment_id")
  bookingOrderId      Int                              @map("booking_order_id")
  technicianProfileId Int                              @map("technician_profile_id")
  action              OrderPerformanceRevisionAction
  previousTreatment   OrderPerformanceTreatment?       @map("previous_treatment")
  nextTreatment       OrderPerformanceTreatment        @map("next_treatment")
  publicReason        String?                          @map("public_reason") @db.VarChar(500)
  internalNote        String?                          @map("internal_note") @db.VarChar(1000)
  actorUserId         Int?                             @map("actor_user_id")
  idempotencyKey      String                           @unique @map("idempotency_key") @db.VarChar(160)
  requestFingerprint  String                           @map("request_fingerprint") @db.Char(64)
  assessmentVersion   Int                              @map("assessment_version")
  createdAt           DateTime                         @default(now()) @map("created_at")
  updatedAt           DateTime                         @updatedAt @map("updated_at")
  deletedAt           DateTime?                        @map("deleted_at")
  // assessment, bookingOrder, technicianProfile, actor relations
}

model TechnicianPerformanceSummary {
  id                           Int      @id @default(autoincrement())
  technicianProfileId          Int      @unique @map("technician_profile_id")
  completedOrderCount          Int      @default(0) @map("completed_order_count")
  accountableCancellationCount Int      @default(0) @map("accountable_cancellation_count")
  accountableUncompletedCount  Int      @default(0) @map("accountable_uncompleted_count")
  specialExcludedCount         Int      @default(0) @map("special_excluded_count")
  acceptanceRateBps            Int      @default(10000) @map("acceptance_rate_bps")
  sourceCalculatedAt           DateTime @map("source_calculated_at")
  createdAt                    DateTime @default(now()) @map("created_at")
  updatedAt                    DateTime @updatedAt @map("updated_at")
  deletedAt                    DateTime? @map("deleted_at")
  // technicianProfile relation
}
```

- [ ] **Step 1: Write the failing schema guard**

Assert model/enums, all standard timestamps, unique order assessment, revision idempotency/fingerprint, summary range checks, foreign keys, and indexes on `(technician_profile_id, treatment, deleted_at)` and `(booking_order_id, created_at)`.

- [ ] **Step 2: Run the guard and verify RED**

```bash
npm --prefix backend test -- --runInBand tests/order-performance-schema.test.ts
```

Expected: FAIL because the models and migration do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Add relations to `BookingOrder`, `TechnicianProfile`, and `User`. Keep `currentRevisionId` nullable during assessment creation, then set it in the same transaction.

- [ ] **Step 4: Write the additive migration**

Add database checks for non-negative counts, `acceptance_rate_bps BETWEEN 0 AND 10000`, and `version >= 1`. Do not modify an existing migration.

- [ ] **Step 5: Generate Prisma Client and verify GREEN**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/order-performance-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901010000_order_performance_special_cancellation/migration.sql backend/tests/order-performance-schema.test.ts
git commit -m "feat: add order performance assessment schema"
```

---

### Task 2: Lock the acceptance-rate calculator

**Files:**
- Create: `backend/src/services/order-performance-calculator.ts`
- Create: `backend/tests/order-performance-calculator.test.ts`

**Interfaces:**

```ts
export type TechnicianPerformanceCounts = {
  completedOrderCount: number;
  accountableCancellationCount: number;
  accountableUncompletedCount: number;
  specialExcludedCount: number;
};

export type TechnicianPerformanceProjection = TechnicianPerformanceCounts & {
  acceptanceRateBps: number;
};

export function calculateTechnicianPerformance(
  counts: TechnicianPerformanceCounts
): TechnicianPerformanceProjection;
```

- [ ] **Step 1: Write failing table-driven tests**

Cover: zero denominator → `10000`; 8 completed + 1 cancellation + 1 uncompleted → `8000`; exclusions absent from denominator; integer basis-point rounding uses `Math.round`; negative/non-integer counts are rejected.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/order-performance-calculator.test.ts
```

- [ ] **Step 3: Implement the pure calculator**

```ts
const denominator =
  completedOrderCount + accountableCancellationCount + accountableUncompletedCount;
const acceptanceRateBps = denominator === 0
  ? 10_000
  : Math.round((completedOrderCount * 10_000) / denominator);
```

Validate all inputs before calculation. `specialExcludedCount` is reported but never added to the denominator.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/order-performance-calculator.test.ts
git add backend/src/services/order-performance-calculator.ts backend/tests/order-performance-calculator.test.ts
git commit -m "feat: calculate technician acceptance rate"
```

---

### Task 3: Implement transactional classification and projection updates

**Files:**
- Create: `backend/src/repositories/order-performance.repository.ts`
- Create: `backend/tests/order-performance.repository.test.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/tests/booking-repository-scope.test.ts`

**Interfaces:**

```ts
export type OrderPerformanceCommand = {
  bookingOrderId: number;
  actorUserId: number;
  publicReason: string;
  internalNote: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  expectedRevision: number;
  auditLog: AuditLogCreateInput;
};

export type OrderPerformanceMutationOutcome =
  | { outcome: "ok"; assessment: OrderPerformanceAssessmentPayload; replayed: boolean }
  | { outcome: "not_found" | "ineligible" | "version_conflict" | "idempotency_conflict" };

export interface OrderPerformanceRepositoryPort {
  classifyTechnicianUncompleted(input: OrderPerformanceCommand): Promise<OrderPerformanceMutationOutcome>;
  applySpecialExclusion(input: OrderPerformanceCommand): Promise<OrderPerformanceMutationOutcome>;
  revokeSpecialExclusion(input: OrderPerformanceCommand): Promise<OrderPerformanceMutationOutcome>;
  rebuildTechnicianSummary(technicianProfileId: number): Promise<TechnicianPerformanceSummaryPayload>;
}
```

- [ ] **Step 1: Write failing repository tests**

Prove one transaction writes assessment + revision + summary; same key/same fingerprint replays; same key/different fingerprint conflicts; stale revision conflicts; only counted adverse outcomes can be excluded; only excluded outcomes can be revoked; completed/customer/shop/platform cancellations are ineligible; all historical revisions remain.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/order-performance.repository.test.ts tests/booking-repository-scope.test.ts
```

- [ ] **Step 3: Add shared transaction writers**

Export repository-internal helpers accepting `Prisma.TransactionClient`:

```ts
classifyAdverseOutcomeInTransaction(tx, input)
recalculateTechnicianSummaryInTransaction(tx, technicianProfileId, calculatedAt)
```

The recalculation counts completed, non-deleted assigned orders plus current non-deleted assessments grouped by outcome/treatment. It replaces only the projection row, never source rows.

- [ ] **Step 4: Integrate assigned-technician cancellation classification**

Extend the booking transition input with authenticated identity metadata:

```ts
type OrderTransitionActorContext = {
  userId: number;
  identityId: number | null;
  identityType: string;
};
```

Inside the existing cancellation transaction, compare `actor.userId` with the assigned `TechnicianProfile.userId`. On an exact match, append `CLASSIFY_TECHNICIAN_CANCELLED`, set `COUNTED`, and rebuild the summary. Other actors produce no assessment.

Automatic classification copies the existing cancellation reason when present; otherwise its `publicReason` is null and the typed event title carries the meaning. Special-exclusion apply/revoke commands still require a non-empty public reason.

- [ ] **Step 5: Implement explicit uncompleted classification**

Require an assigned technician, a non-completed terminal/operations-resolved order, and a required reason. Do not classify merely because `endsAt < now`.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/order-performance.repository.test.ts tests/booking-repository-scope.test.ts
git add backend/src/repositories/order-performance.repository.ts backend/src/repositories/booking.repository.ts backend/tests/order-performance.repository.test.ts backend/tests/booking-repository-scope.test.ts
git commit -m "feat: persist accountable order outcomes"
```

---

### Task 4: Add services, commands, permission, validation, and audit

**Files:**
- Create: `backend/src/services/order-performance.service.ts`
- Create: `backend/tests/order-performance.service.test.ts`
- Create: `backend/src/validators/order-performance.validator.ts`
- Create: `backend/src/controllers/order-performance.controller.ts`
- Create: `backend/src/routes/order-performance.routes.ts`
- Create: `backend/tests/order-performance-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Create: `backend/tests/order-performance-permissions.test.ts`

**Routes:**

```text
POST /api/v1/backoffice/orders/:id/technician-uncompleted
POST /api/v1/backoffice/orders/:id/special-cancellation
POST /api/v1/backoffice/orders/:id/special-cancellation/revoke
```

All require `backoffice:order-performance:write`.

**Body:**

```ts
export const orderPerformanceCommandBodySchema = z.object({
  publicReason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().min(1).max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(16).max(160),
  expectedRevision: z.number().int().min(0)
}).strict();
```

- [ ] **Step 1: Write failing service and API tests**

Cover no token, wrong permission, invalid reason/key/revision, success envelope, replay, `409` version/idempotency conflict, `422` ineligible outcome, and audit input containing action, actor, request context, before/after treatment, and order/technician IDs.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/order-performance.service.test.ts tests/order-performance-api.test.ts tests/order-performance-permissions.test.ts
```

- [ ] **Step 3: Implement service error mapping and audit**

Use stable messages:

```text
error.order_performance.not_found
error.order_performance.ineligible
error.order_performance.version_conflict
error.order_performance.idempotency_conflict
```

Create request fingerprints and audit input from canonical command fields in the service. Pass both into the repository so revision, assessment, projection, command replay, and `AuditLog` commit in the same transaction. The controller never hashes or performs state decisions.

- [ ] **Step 4: Register permission and routes**

Assign write permission to `admin` and `operator`; do not grant it to customer, technician, merchant, support, finance, viewer, broker, or scout without a separate product decision.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/order-performance.service.test.ts tests/order-performance-api.test.ts tests/order-performance-permissions.test.ts
git add backend/src/services/order-performance.service.ts backend/src/validators/order-performance.validator.ts backend/src/controllers/order-performance.controller.ts backend/src/routes/order-performance.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/prisma/seed.ts backend/src/constants/error-codes.ts backend/tests/order-performance.service.test.ts backend/tests/order-performance-api.test.ts backend/tests/order-performance-permissions.test.ts
git commit -m "feat: add special cancellation operations commands"
```

---

### Task 5: Add compatible typed order timeline events

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

**Interfaces:**

```ts
export type OrderTimelineEventPayload =
  | { type: "ORDER_STATUS_CHANGED"; id: string; createdAt: Date; actorUserId: number | null; fromStatus: BookingOrderStatusPayload | null; toStatus: BookingOrderStatusPayload; publicReason: string | null }
  | { type: "TECHNICIAN_CANCEL_CLASSIFIED" | "TECHNICIAN_UNCOMPLETED_CLASSIFIED" | "SPECIAL_CANCELLATION_APPLIED" | "SPECIAL_CANCELLATION_REVOKED"; id: string; createdAt: Date; actorUserId: number | null; publicReason: string | null; internalNote?: string };
```

- [ ] **Step 1: Write failing participant-visibility and ordering tests**

Assert `statusHistory` is unchanged, `timelineEvents` is ascending by `createdAt` then stable ID, user/technician reads omit `internalNote`, and authorized backoffice detail includes it.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/booking-api.test.ts tests/openapi.test.ts
```

- [ ] **Step 3: Batch-load and merge timeline events**

Use one order-detail query/include. Prefix event IDs by source (`status:<id>`, `performance:<id>`) so unions cannot collide.

- [ ] **Step 4: Document the discriminated union and compatibility field**

OpenAPI must list all five implemented event types and mark `internalNote` as operations-only. Keep the existing status-history schema and response property.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/booking-api.test.ts tests/openapi.test.ts
git add backend/src/repositories/booking.repository.ts backend/tests/booking-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "feat: expose order performance timeline events"
```

---

### Task 6: Render timeline events and operations controls

**Files:**
- Modify: `src/features/booking/api.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Create or modify: `src/pages/user/UserOrderDetailPage.formal.test.tsx`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/pages/admin/OrdersAdminPage.tsx`
- Create: `src/pages/admin/OrdersAdminPage.order-performance.test.tsx`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write failing frontend contract and render tests**

Prove the participant page shows both apply and later revoke events, never renders `internalNote`, and keeps ordinary status events. Prove the admin drawer loads fresh order detail, requires public reason, submits revision/key, shows internal note, and refreshes after mutation.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/pages/user/UserOrderDetailPage.formal.test.tsx src/pages/admin/OrdersAdminPage.order-performance.test.tsx
```

- [ ] **Step 3: Add typed frontend adapters**

Generate a UUID idempotency key once per submitted intent, not on every render. Preserve it across a network retry and replace it after a definitive success or edited payload.

- [ ] **Step 4: Render the merged timeline**

Map event types to localized titles. Show actor/time/public reason. The user page consumes `timelineEvents`; it falls back to `statusHistory` only when talking to a compatible older backend.

- [ ] **Step 5: Add operations apply/revoke UI**

The drawer must display the current outcome, treatment, version, and all revisions before action buttons. It never contains a percentage input. On `409`, keep the user's text, reload detail, and ask them to review the new revision before resubmitting.

- [ ] **Step 6: Verify five-language copy, GREEN, and commit**

```bash
npm test -- --run src/pages/user/UserOrderDetailPage.formal.test.tsx src/pages/admin/OrdersAdminPage.order-performance.test.tsx
npm test -- --run src/i18n/translations.test.ts
git add src/features/booking/api.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts src/api/backofficeRealData.ts src/pages/admin/OrdersAdminPage.tsx src/pages/admin/OrdersAdminPage.order-performance.test.tsx src/i18n/translations.ts
git commit -m "feat: manage special cancellations in order timeline"
```

---

### Task 7: Add safe summary rebuild and historical classification boundary

**Files:**
- Create: `backend/scripts/rebuild-technician-performance.ts`
- Create: `backend/tests/rebuild-technician-performance.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write failing dry-run tests**

The script must report current versus calculated counts, make no writes by default, require `--apply` for projection replacement, and classify no historical cancellation unless `OrderStatusHistory.actorUserId` exactly equals the assigned technician's user ID.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/rebuild-technician-performance.test.ts
```

- [ ] **Step 3: Implement bounded, paginated rebuild**

Add `performance:rebuild` script. Accept optional `--technician-profile-id=<id>` and `--apply`. Paginate technicians; never load every order into memory.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/rebuild-technician-performance.test.ts
git add backend/scripts/rebuild-technician-performance.ts backend/tests/rebuild-technician-performance.test.ts backend/package.json
git commit -m "chore: add technician performance rebuild command"
```

---

### Task 8: Run the complete microstep gate

- [ ] **Step 1: Verify the physical migration on a disposable MySQL database**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:status
```

Inspect `_prisma_migrations` plus physical tables, checks, foreign keys, unique keys, and indexes; migration status alone is insufficient.

- [ ] **Step 2: Run focused and full backend gates**

```bash
npm --prefix backend test -- --runInBand tests/order-performance-schema.test.ts tests/order-performance-calculator.test.ts tests/order-performance.repository.test.ts tests/order-performance.service.test.ts tests/order-performance-api.test.ts tests/order-performance-permissions.test.ts tests/booking-repository-scope.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/openapi.test.ts tests/rebuild-technician-performance.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 3: Run frontend gates**

```bash
npm test -- --run src/pages/user/UserOrderDetailPage.formal.test.tsx src/pages/admin/OrdersAdminPage.order-performance.test.tsx src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 4: Perform authenticated browser acceptance**

Before opening the page, prove frontend/backend listener PID, cwd, branch, proxy target, and backend origin. In one formal order, verify technician cancellation lowers the rate, apply raises it, both timeline entries remain, revoke after a complaint lowers it again, participant users cannot see the internal note, and no console or request errors occur.

- [ ] **Step 5: Commit any acceptance-only test fixes, then stop**

Do not begin microstep 2 in this branch. Record that local implementation and browser acceptance do not imply push, deployment, or production acceptance.
