# Affiliate Task Expiry Budget Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically end formal affiliate tasks when `now >= taskEndsAt` and return only their currently unallocated frozen NDP to the publisher, while preserving pre-expiry Attribution allocations for later completion settlement.

**Architecture:** A dedicated `AffiliateTaskExpiryWorker` runs immediately at backend startup and then on a configured interval. It calls `AffiliateTaskExpiryService`, which reads one bounded candidate batch and processes every task in its own Prisma transaction through `AffiliateTaskExpiryRepository`; the service locks Task and BudgetReservation, revalidates the budget snapshot, transitions eligible tasks to `ended`, delegates the wallet unfreeze to the existing idempotent `LedgerService.releaseAffiliateTaskBudget`, updates domain aggregates, and writes system audit evidence.

**Tech Stack:** Node.js 22, TypeScript strict mode, Prisma 7/MySQL 8, Zod, Jest, ESLint, Prettier.

## Global Constraints

- Execute only the task-expiry and unallocated-budget-release microstep.
- Do not implement manual early end, refund reversal, alliance splitting, task UI, dashboards, exports or risk operations in this plan.
- Do not add or change a public HTTP API, permission, Prisma model, enum or migration.
- Do not add mock, demo, placeholder or fake production behavior.
- Preserve `allocatedNdp` for every valid Attribution created before `taskEndsAt`; a later service completion must still capture and settle it.
- Revisit already `ended` tasks when a later cancellation/limit invalidation makes new unallocated budget available.
- Every wallet mutation must use `LedgerService` and share the outer per-task Prisma transaction.
- A failed task transaction must roll back task state, reservation aggregates, wallet balances, Ledger, reconciliation and audit, while the remaining candidate tasks continue.
- Use TDD for each production behavior and commit every independently reviewable task.

---

### Task 1: Allow Safe System-Initiated Affiliate Budget Release

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/tests/affiliate-budget-ledger.service.test.ts`

**Interfaces:**
- Consumes: existing `LedgerRepositoryPort` transaction, wallet, ledger, reconciliation and audit methods.
- Produces: `releaseAffiliateTaskBudget` that accepts `actorUserId: number | null` and rejects invalid amounts before repository access.

- [ ] **Step 1: Write failing ledger validation and system-actor tests**

Add one test that calls `releaseAffiliateTaskBudget` with `actorUserId: null` and verifies the resulting LedgerTransaction and audit row retain a null system actor while unfreezing exactly once.

Add a table test for `0`, `-1`, `1.5`, `Number.NaN` and `Number.MAX_SAFE_INTEGER + 1`. Each call must reject with the existing stable wallet mutation error before any wallet lookup, transaction, ledger entry, reconciliation or audit mutation.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-budget-ledger.service.test.ts
```

Expected: TypeScript rejects the null actor and/or invalid amount tests observe repository work.

- [ ] **Step 3: Widen only the affiliate budget actor contract and add the guard**

Change `FreezeAffiliateTaskBudgetInput.actorUserId` to `number | null`; existing submission calls continue to pass an authenticated user ID, while the expiry release can pass null.

At the top of `releaseAffiliateTaskBudget`, before `repository.runInTransaction`, add:

```ts
if (!Number.isSafeInteger(input.amountNdp) || input.amountNdp <= 0) {
  throw this.walletMutationError();
}
```

Do not change the idempotency, wallet identity, frozen-balance, ledger, reconciliation or audit behavior.

- [ ] **Step 4: Run focused ledger tests, lint and build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-budget-ledger.service.test.ts tests/ledger-service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: tests pass, ESLint exits 0, TypeScript build exits 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/services/ledger.service.ts backend/tests/affiliate-budget-ledger.service.test.ts
git commit -m "fix: validate system affiliate budget release"
```

---

### Task 2: Expiry Application Service and Per-Task Transaction Semantics

**Files:**
- Create: `backend/src/services/affiliate-task-expiry.service.ts`
- Create: `backend/tests/affiliate-task-expiry.service.test.ts`
- Modify: `backend/tests/affiliate-state-machine.service.test.ts`

**Interfaces:**
- Consumes: `transitionAffiliateTask`, `calculateAffiliateUnallocatedBudget`, `AffiliateBudgetLedgerPort.releaseAffiliateTaskBudget`.
- Produces: `AffiliateTaskExpiryService.expireDue({ now, batchSize })`, `AffiliateTaskExpiryRepositoryPort`, task outcome and batch-summary types.

- [ ] **Step 1: Strengthen the state-machine expiry tests**

Expand the existing expiry test so every allowed source status (`scheduled`, `active`, `paused`, `budget_exhausted`) succeeds exactly at `taskEndsAt`, fails one millisecond before it, and `ended`, `cancelled`, `rejected`, `draft` and `pending_review` remain terminal/ineligible for `expire`.

- [ ] **Step 2: Write failing service tests with a transactional fake repository**

Create a fake `AffiliateTaskExpiryRepositoryPort` that snapshots Task, Reservation, budget links and audits for each `runInTransaction`, then rolls them back on error. Add tests for:

- a due active task with no allocations ends and releases its complete unallocated budget;
- a due task with captured NDP releases only the remainder;
- a due task with allocated NDP preserves that allocation and releases only unallocated NDP;
- a due task with no unallocated NDP still ends but does not call Ledger;
- an already ended task with newly unallocated NDP releases the increment without rewriting `endedAt`;
- running the batch twice produces no duplicate release;
- two candidate tasks are isolated when one Ledger call fails;
- an invalid or aggregate-mismatched budget snapshot fails without moving wallet/domain state;
- the release idempotency key uses cumulative released NDP: `affiliate-task:<taskId>:expiry-release:to:<releasedAfterNdp>`.

The expected summary shape is:

```ts
{
  scanned: number;
  ended: number;
  released: number;
  failed: number;
  releasedNdp: number;
}
```

- [ ] **Step 3: Run the service/state tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-state-machine.service.test.ts tests/affiliate-task-expiry.service.test.ts
```

Expected: compile failure because the expiry service and repository port do not exist.

- [ ] **Step 4: Implement the expiry orchestration**

Define an expiry record containing Task identity/status/window/publisher counters plus its Reservation snapshot. `expireDue` reads at most `batchSize` candidate IDs and calls a private per-ID transaction, catching an error for that ID and continuing the batch.

Inside the transaction:

1. Lock and reload the Task and Reservation.
2. Return no-op if another transaction already made the row ineligible.
3. Validate safe non-negative budget integers and equality between Task aggregates and Reservation aggregates.
4. For due non-terminal statuses, call `transitionAffiliateTask(status, "expire", context)` and mark the task ended.
5. Compute `releaseAmount` only from the locked snapshot.
6. If positive, call `releaseAffiliateTaskBudget` using the publisher wallet, `actorUserId: null`, the caller transaction client and the cumulative idempotency key.
7. Persist the budget transaction link and cumulative Task/Reservation release state.
8. Write `affiliate.task.expired` for the first status transition and `affiliate.task.expiry_budget_released` only for an actual release.

The Reservation becomes `released` only when `allocatedNdp === 0` and `capturedNdp + releasedAfterNdp === totalFrozenNdp`; otherwise preserve `active`/`exhausted` while outstanding allocated NDP remains.

- [ ] **Step 5: Run focused tests, lint and build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-state-machine.service.test.ts tests/affiliate-task-expiry.service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: focused tests pass and static checks exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/services/affiliate-task-expiry.service.ts backend/tests/affiliate-task-expiry.service.test.ts backend/tests/affiliate-state-machine.service.test.ts
git commit -m "feat: orchestrate affiliate task expiry"
```

---

### Task 3: Prisma Expiry Repository, Row Locks and Cumulative Updates

**Files:**
- Create: `backend/src/repositories/affiliate-task-expiry.repository.ts`
- Create: `backend/tests/affiliate-task-expiry.repository.test.ts`

**Interfaces:**
- Implements: `AffiliateTaskExpiryRepositoryPort` from Task 2.
- Uses: `PrismaClient | Prisma.TransactionClient`, ordered Task/Reservation `FOR UPDATE` locks, guarded `updateMany`, budget-link insert and system AuditLog insert.

- [ ] **Step 1: Write failing repository contract tests**

Add mocked-client tests that verify:

- the class exposes every expiry port method;
- a caller transaction client is reused rather than nesting `$transaction`;
- candidate selection contains only due `SCHEDULED/ACTIVE/PAUSED/BUDGET_EXHAUSTED` tasks or `ENDED` tasks whose Reservation arithmetic has positive unallocated NDP;
- candidates are ordered by Task ID and limited to the configured batch size;
- Task is locked before Reservation and both ignore soft-deleted rows;
- first expiry writes `ENDED`, `endedAt` and increments `lockVersion` without changing historical reserved budget;
- cumulative release increments `AffiliateTask.releasedBudgetNdp` and `AffiliateBudgetReservation.releasedNdp` with guarded previous values;
- Reservation status/releasedAt are set to `RELEASED` only for a fully cleared reservation;
- system audits persist `actorId: null` and required metadata.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-task-expiry.repository.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the repository**

Use a bounded raw SQL candidate query because Prisma cannot directly compare Reservation columns:

```sql
reservation.total_frozen_ndp >
  reservation.allocated_ndp + reservation.captured_ndp + reservation.released_ndp
```

The query must join only non-deleted Reservations and never return draft, review, rejected or cancelled tasks. Lock Task then Reservation in a consistent order. Reload the selected fields after locking.

Use guarded updates against the locked previous status/counters. If a guarded update affects anything other than one row, throw a stable internal conflict so the outer Prisma transaction rolls back.

- [ ] **Step 4: Compose the real repository with the service in tests**

Add a small construction assertion to the repository test:

```ts
const service = new AffiliateTaskExpiryService(
  new AffiliateTaskExpiryRepository(client as never),
  ledger
);
expect(service.expireDue).toEqual(expect.any(Function));
```

Do not add the worker yet.

- [ ] **Step 5: Run focused tests, lint and build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-task-expiry.repository.test.ts tests/affiliate-task-expiry.service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add backend/src/repositories/affiliate-task-expiry.repository.ts backend/tests/affiliate-task-expiry.repository.test.ts
git commit -m "feat: persist affiliate task expiry"
```

---

### Task 4: Worker, Runtime Configuration and Backend Lifecycle

**Files:**
- Create: `backend/src/workers/affiliate-task-expiry.worker.ts`
- Create: `backend/tests/affiliate-task-expiry.worker.test.ts`
- Create: `backend/tests/affiliate-task-expiry-config.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`

**Interfaces:**
- Produces: `AffiliateTaskExpiryWorker.start()`, `stop()`, `runOnce()`.
- Adds config: `AFFILIATE_TASK_EXPIRY_INTERVAL_MS`, `AFFILIATE_TASK_EXPIRY_BATCH_SIZE`.

- [ ] **Step 1: Write failing worker and environment tests**

Mirror the established `IdentityApplicationPurgeWorker` test style. Verify:

- `start()` invokes one immediate run and installs one unref'd timer;
- a second start is idempotent;
- overlapping `runOnce()` calls invoke the service only once;
- success logs only `{ scanned, ended, released, failed, releasedNdp }`;
- top-level failure logs an error and clears `running` so the next invocation can retry;
- `stop()` clears the timer and is idempotent.

Use isolated env imports to verify defaults `300000` and `100`, reject interval below `60000`, and reject batch sizes outside `1..500`.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-task-expiry.worker.test.ts tests/affiliate-task-expiry-config.test.ts
```

Expected: missing worker/config failures.

- [ ] **Step 3: Implement worker and config**

Implement the same no-overlap/timer lifecycle pattern as `IdentityApplicationPurgeWorker`, but call:

```ts
service.expireDue({ now: this.now(), batchSize: this.batchSize })
```

Add Zod config:

```ts
AFFILIATE_TASK_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
AFFILIATE_TASK_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
```

Document both values in all three backend env examples.

- [ ] **Step 4: Wire startup and shutdown**

In `backend/src/server.ts`, compose:

```ts
new AffiliateTaskExpiryWorker(
  new AffiliateTaskExpiryService(
    new AffiliateTaskExpiryRepository(),
    new LedgerService(new LedgerRepository())
  ),
  logger,
  env.AFFILIATE_TASK_EXPIRY_INTERVAL_MS,
  env.AFFILIATE_TASK_EXPIRY_BATCH_SIZE
)
```

Start it after the HTTP server starts, stop it at the beginning of `shutdown`, and retain the existing identity purge worker lifecycle.

- [ ] **Step 5: Run focused tests, lint and build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-task-expiry.worker.test.ts tests/affiliate-task-expiry-config.test.ts tests/identity-application-purge.worker.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: worker/config regressions pass and the server composition type-checks.

- [ ] **Step 6: Commit Task 4**

```bash
git add backend/src/workers/affiliate-task-expiry.worker.ts backend/tests/affiliate-task-expiry.worker.test.ts backend/tests/affiliate-task-expiry-config.test.ts backend/src/config/env.ts backend/src/server.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example
git commit -m "feat: schedule affiliate task expiry"
```

---

### Task 5: Guarded Local MySQL Acceptance Flow

**Files:**
- Create: `backend/scripts/check-affiliate-task-expiry-flow.ts`
- Create: `backend/tests/affiliate-task-expiry-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Reuses: `assertSafeAffiliateCompletionDatabase`, formal Prisma repositories and `LedgerService`.
- Produces: `npm --prefix backend run check:affiliate-task-expiry-flow`.

- [ ] **Step 1: Write the failing script contract test**

Read the future script source and assert it:

- calls `assertSafeAffiliateCompletionDatabase`;
- constructs the real expiry repository/service and real Ledger repository/service;
- checks `affiliate_task_budget_release` Ledger, reconciliation and audit evidence;
- tests repeated and concurrent expiry;
- tests an ended task receiving a later incremental release;
- performs marker-scoped cleanup in `finally`;
- does not contain broad `deleteMany({})` cleanup.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-task-expiry-flow-script.test.ts
```

Expected: missing script failure.

- [ ] **Step 3: Implement the guarded acceptance script**

Create uniquely marked local fixtures for at least:

1. a fully unallocated due task that releases all remaining frozen NDP;
2. a partially allocated and partially captured due task that ends, preserves allocated NDP and releases only unallocated NDP;
3. an already ended task whose allocation is later removed, producing a second cumulative release;
4. a zero-unallocated due task that ends without an empty LedgerTransaction;
5. concurrent service runs against one due task, producing exactly one release.

Assert Task status/`endedAt`, Wallet before/after balances, Reservation allocated/captured/released/status, Task aggregates, budget transaction links, LedgerTransaction, WalletLedger, FinanceReconciliation, system AuditLog and batch summaries.

Use only a local non-production MySQL database and exact marker cleanup. Print one compact success JSON object without credentials or token data.

- [ ] **Step 4: Add the package script and run safety/unit checks**

Add:

```json
"check:affiliate-task-expiry-flow": "tsx scripts/check-affiliate-task-expiry-flow.ts"
```

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-completion-check-safety.test.ts tests/affiliate-task-expiry-flow-script.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 5: Run the real local MySQL acceptance**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-expiry-flow
```

Expected: migration status succeeds and the script proves full, partial, later incremental, zero-release and concurrent behavior before exact cleanup.

- [ ] **Step 6: Commit Task 5**

```bash
git add backend/scripts/check-affiliate-task-expiry-flow.ts backend/tests/affiliate-task-expiry-flow-script.test.ts backend/package.json
git commit -m "test: verify affiliate task expiry flow"
```

---

### Task 6: Documentation, Full Verification and Review

**Files:**
- Modify: `README.md`
- Modify: `docs/00_MASTER_MICRO_STEP_PLAN.md`
- Modify: `docs/ledger.md`

- [ ] **Step 1: Update formal capability documentation**

Document:

- startup-immediate and interval-based task expiry;
- the two new environment values;
- cumulative expiry release idempotency key;
- preservation of pre-expiry allocated Attribution;
- re-scanning ended tasks after later allocation release;
- the guarded MySQL acceptance command.

In the master plan, mark only “任务结束解冻” complete. Keep “完成后退款冲正” and all alliance/UI work explicitly gated.

- [ ] **Step 2: Run all focused tests**

Run:

```bash
npm --prefix backend test -- --runInBand \
  tests/affiliate-state-machine.service.test.ts \
  tests/affiliate-budget-ledger.service.test.ts \
  tests/affiliate-task-expiry.service.test.ts \
  tests/affiliate-task-expiry.repository.test.ts \
  tests/affiliate-task-expiry.worker.test.ts \
  tests/affiliate-task-expiry-config.test.ts \
  tests/affiliate-task-expiry-flow-script.test.ts
```

- [ ] **Step 3: Run complete static and regression verification**

Run:

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix backend run build
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. Do not dismiss unrelated failures; determine whether they pre-existed and report them without changing unrelated code.

- [ ] **Step 4: Re-run real MySQL acceptance after final changes**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-expiry-flow
```

Expected: the final committed code still passes the guarded acceptance and leaves no marker fixtures.

- [ ] **Step 5: Request code review and resolve findings**

Review the complete microstep against the approved design, focusing on:

- row-lock order and multi-instance safety;
- budget conservation and aggregate equality;
- cumulative idempotency after later allocation release;
- system audit actor and metadata;
- worker overlap/error isolation;
- no accidental schema/API/UI expansion.

Fix every valid task-scoped finding and repeat the affected checks.

Final whole-branch review hardening additionally requires:

- an independent bounded revisit cursor so a lower-ID ended task that becomes eligible after cancellation cannot starve behind continuously full higher-ID pages, while the forward cursor still advances;
- a shared bounded production transaction-conflict retry for expiry and formal Booking transitions (`P2034`, MySQL `1213`, SQLSTATE `40001`), with non-transient errors propagated immediately;
- acceptance races that invoke production behavior once and fail after exhausted production retries, never an acceptance-only replay helper;
- focused regression tests for dynamic lower-ID eligibility, forward progress, repository retry wiring, retry classification and the three-attempt bound.

- [ ] **Step 6: Commit documentation/final fixes**

```bash
git add README.md docs/00_MASTER_MICRO_STEP_PLAN.md docs/ledger.md
git commit -m "docs: record affiliate task expiry release"
```

The microstep is complete only after all automated checks, final MySQL acceptance, diff review and clean worktree status pass.
