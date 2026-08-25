# NeeDo Affiliate Task Publishing and Budget Freeze API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver formal merchant/shop affiliate-task draft, submission, full NDP budget freeze, operations review, and rejection-unfreeze APIs backed by MySQL, immutable ledger records, RBAC, audit logs, and OpenAPI.

**Architecture:** Add a focused affiliate task application layer beside the existing affiliate schema and state machines. Controllers only parse HTTP input; the affiliate service owns authorization and transaction boundaries; the affiliate repository owns Prisma access; the existing ledger service remains the sole wallet mutation path. Submission and rejection lock the task and wallet-related records, then change task, reservation, ledger, reconciliation, and audit state in one database transaction.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Zod, Prisma 7.8, MySQL 8.0, Jest 29, Supertest, the existing NeeDo JWT/RBAC, audit, and NDP ledger infrastructure.

## Global Constraints

- Execute only affiliate microstep 2: task list/detail, draft create/update, submit with full budget freeze, and operations approve/reject.
- Do not implement task claims, affiliate codes or URLs, booking attribution, checkout discounts, completion settlement, refunds, pause/resume/end, dashboards, or frontend UI.
- A draft never freezes NDP. Submission freezes the entire `totalBudgetNdp` before the task enters `pending_review`.
- Only fixed integer NDP rewards after completed service are supported. Reservation reward and percentage reward are prohibited.
- A task is published by either the current shop or an authorized merchant account. Never trust arbitrary publisher scope supplied by the client.
- Merchant-account tasks may select only active shops belonging to that merchant account. Shop tasks target only the current shop.
- Every submitted task snapshots formal Shop and Service records. At least one active shop and one eligible service are required.
- Wallet balances are changed only through `LedgerService`; affiliate repositories must not directly write balance columns.
- Submission, rejection, reservation changes, ledger transactions, reconciliation records, and audit logs are atomic.
- Repeated submit and reject requests are idempotent. Optimistic `lockVersion` protects draft updates; row locks serialize state transitions.
- All list APIs are paginated, all input is Zod-validated, all protected routes declare RBAC permission, and all endpoints are documented in OpenAPI.
- Add no mock, demo, placeholder, fake API, seed task, or synthetic metric.
- No Prisma schema change or migration is expected in this microstep. If implementation proves one is required, stop and write a separate schema microstep instead of silently expanding scope.
- Preserve unrelated changes. Each commit stages only the files listed for its task.

## API Contract

Merchant/shop routes:

- `GET /api/v1/merchant-admin/affiliate/tasks`
- `POST /api/v1/merchant-admin/affiliate/tasks`
- `GET /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `PATCH /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/submit`

Operations routes:

- `GET /api/v1/backoffice/affiliate/tasks`
- `GET /api/v1/backoffice/affiliate/tasks/:taskId`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/approve`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/reject`

Permission mapping:

- Merchant read: `page:merchant-affiliate-task`
- Merchant draft create/update: `button:merchant-affiliate-task-create`
- Merchant submit: `button:merchant-affiliate-task-submit`
- Operations read: `page:backoffice-affiliate`
- Operations review: `button:backoffice-affiliate-review`

## Request and State Rules

- Create is a discriminated union by `publisherType`.
- `publisherType = shop` infers the current shop and rejects arbitrary `merchantAccountId` or `shopIds`.
- `publisherType = merchant_account` requires an authorized `merchantAccountId` and non-empty unique `shopIds`.
- Publisher identity cannot change after draft creation.
- Patch accepts the complete editable draft fields plus the current `lockVersion`; successful patch increments it.
- `serviceScopeMode = selected_services` requires non-empty unique `selectedServiceIds`.
- `serviceScopeMode = all_current_services` rejects arbitrary selected-service IDs and snapshots all currently eligible services at submission.
- `rewardNdpPerCompletedOrder` and `totalBudgetNdp` are positive integers, with total budget at least one reward.
- Discount invariants:
  - `none`: fixed amount, percent BPS, and cap are all zero.
  - `fixed_jpy`: fixed amount is positive; percent BPS and cap are zero.
  - `percent`: BPS is 1–10,000 and cap is positive; fixed amount is zero.
- Task and claim windows must be ordered and must not be expired at submission/review.
- Approve transitions `pending_review` to `scheduled` before the task start, otherwise to `active`.
- Reject transitions `pending_review` to `rejected` and releases the full still-frozen reservation back to available balance.

## File Map

- `backend/src/services/ledger.service.ts`: add transactional affiliate budget freeze and release primitives.
- `backend/tests/affiliate-budget-ledger.service.test.ts`: prove ledger balance, idempotency, audit, and insufficient-funds behavior.
- `backend/src/repositories/affiliate-task.repository.ts`: all task, scope, snapshot, reservation, and review persistence.
- `backend/src/services/affiliate-task.service.ts`: authorization, business validation, transaction orchestration, and response mapping.
- `backend/tests/affiliate-task.service.test.ts`: domain/application tests including rollback and concurrency-safe state behavior.
- `backend/src/validators/affiliate-task.validator.ts`: Zod params/query/body schemas.
- `backend/src/controllers/affiliate-task.controller.ts`: request/response adaptation only.
- `backend/src/routes/affiliate-task.routes.ts`: authentication, RBAC, validation, and route mounting.
- `backend/tests/affiliate-task-api.test.ts`: HTTP status, envelope, RBAC, validation, pagination, and OpenAPI behavior.
- `backend/src/app.ts`: dependency construction and route registration.
- `backend/src/api/openapi.ts`: schemas, tags, security, and all nine route definitions.
- `backend/src/validators/ledger.validator.ts`: expose affiliate ledger transaction filters already present in Prisma.
- `backend/src/constants/error-codes.ts`: stable affiliate task errors.
- `backend/scripts/check-affiliate-task-publishing-flow.ts`: guarded local-MySQL acceptance flow with exact cleanup.
- `backend/package.json`: local acceptance script.
- `README.md`, `docs/ledger.md`: capability and verification documentation.

---

### Task 1: Transactional affiliate budget ledger primitives

**Files:**

- Create: `backend/tests/affiliate-budget-ledger.service.test.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/validators/ledger.validator.ts`

**Interfaces:**

```ts
interface FreezeAffiliateTaskBudgetInput {
  taskId: string;
  ownerType: "merchant_account" | "shop";
  ownerId: string;
  amountNdp: number;
  idempotencyKey: string;
  actorUserId: string;
}

interface ReleaseAffiliateTaskBudgetInput {
  taskId: string;
  walletId: string;
  amountNdp: number;
  idempotencyKey: string;
  actorUserId: string;
}

interface AffiliateBudgetLedgerResult {
  transaction: LedgerTransactionRecord;
  walletId: string;
}
```

- [ ] **Step 1: Write failing freeze tests**

Cover available-to-frozen balance movement, `affiliate_task_budget_freeze`, immutable ledger entries, reconciliation, audit, stable idempotent retry, and `error.wallet.insufficient_available_balance` without partial writes.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-budget-ledger.service.test.ts`

Expected: FAIL because the affiliate ledger methods do not exist.

- [ ] **Step 3: Implement the minimal freeze primitive**

Use the existing conditional wallet-delta repository method so concurrent requests cannot overspend. If a Prisma transaction client is supplied, reuse it; otherwise use the ledger repository transaction wrapper. Create the transaction, entries, reconciliation record, and audit record before returning.

- [ ] **Step 4: Add failing release and retry tests**

Cover frozen-to-available movement, `affiliate_task_budget_release`, `unfreeze`/`frozen_credit` direction mapping, repeat release returning the original result, and insufficient frozen balance without partial writes.

- [ ] **Step 5: Implement the minimal release primitive and finance filter enum update**

Release only the requested frozen amount and retain the task ID in business reference metadata. Extend the ledger list validator to accept the two affiliate transaction types already defined by Prisma.

- [ ] **Step 6: Run ledger tests, lint, and type build**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/affiliate-budget-ledger.service.test.ts tests/ledger.service.test.ts tests/affiliate-ledger-vocabulary.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 7: Commit the ledger slice**

```bash
git add backend/src/services/ledger.service.ts backend/src/validators/ledger.validator.ts backend/tests/affiliate-budget-ledger.service.test.ts
git commit -m "feat: add affiliate budget ledger operations"
```

---

### Task 2: Affiliate task repository and application service

**Files:**

- Create: `backend/src/repositories/affiliate-task.repository.ts`
- Create: `backend/src/services/affiliate-task.service.ts`
- Create: `backend/tests/affiliate-task.service.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Repository responsibilities:**

- Run caller-supplied work in one Prisma transaction.
- Resolve current shop and authorized merchant-account publishing scope from formal identity/RBAC records.
- Paginate only tasks visible to the caller or all tasks for operations.
- Fetch details with publisher, snapshot, and reservation/ledger relations.
- Create and update draft tasks with optimistic `lockVersion` comparison.
- Lock task and reservation rows with parameterized `Prisma.sql` plus `FOR UPDATE` before transitions.
- Revalidate active merchant-shop memberships, shops, and services at submission.
- Replace draft selections with immutable current-name/current-price snapshots at submission.
- Create/update the budget reservation and budget-transaction link without direct wallet mutations.

**Service responsibilities:**

- Derive shop publisher from the authenticated access context.
- Authorize merchant account by active owner or matching active scoped role, then validate every selected shop membership.
- Enforce all budget, discount, scope, service, and time invariants.
- Generate server-owned task code, lineage key, version 1, and idempotency keys.
- Keep draft creation/update free of wallet operations.
- On submit: lock, revalidate, call ledger freeze inside the same transaction, create reservation/link, transition to `pending_review`, and audit.
- On approve: lock, require `pending_review`, reject expired windows, transition to `scheduled` or `active`, and audit.
- On reject: lock task/reservation, call ledger release in the same transaction, mark reservation `released`, set released budget, transition to `rejected`, and audit.
- Return repeat submit/reject requests idempotently when the persisted terminal state already proves the requested action completed.

- [ ] **Step 1: Write failing draft and visibility tests**

Cover shop publisher inference, merchant-account authorization, active membership enforcement, no freeze on draft, paginated visibility, detail authorization, valid discount shapes, and `lockVersion` conflicts.

- [ ] **Step 2: Run focused service test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-task.service.test.ts`

Expected: FAIL because repository and service do not exist.

- [ ] **Step 3: Implement draft create/list/detail/update**

Keep publisher immutable. Map responses to an explicit API-facing DTO containing publisher, budget, discount, windows, status, lock version, shops, services, and optional reservation references without exposing internal/sensitive fields.

- [ ] **Step 4: Write failing submit transaction tests**

Cover shop and multi-shop merchant-account wallets, refreshed snapshots, insufficient budget rollback, stale or invalid scope rollback, repeat submit, and serialized invalid-state handling.

- [ ] **Step 5: Implement atomic submit**

Use `transitionAffiliateTask(status, "submit", context)` and call `LedgerService.freezeAffiliateTaskBudget` with the repository transaction client. The task reaches `pending_review` only after all dependent writes succeed.

- [ ] **Step 6: Write failing approve/reject tests**

Cover active versus scheduled approval, expired review rejection, full unfreeze, released reservation, budget-transaction linkage, repeat rejection, and illegal state transitions.

- [ ] **Step 7: Implement atomic operations review**

Use the approved state machine. Reject releases exactly `totalFrozenNdp - allocatedNdp - capturedNdp - releasedNdp`; this microstep permits rejection only before allocation, so the amount must equal the original total frozen budget.

- [ ] **Step 8: Run service tests, lint, and build**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/affiliate-task.service.test.ts tests/affiliate-state-machine.service.test.ts tests/affiliate-budget-ledger.service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 9: Commit the application slice**

```bash
git add backend/src/constants/error-codes.ts backend/src/repositories/affiliate-task.repository.ts backend/src/services/affiliate-task.service.ts backend/tests/affiliate-task.service.test.ts
git commit -m "feat: add affiliate task publishing transactions"
```

---

### Task 3: HTTP, RBAC, validation, and OpenAPI

**Files:**

- Create: `backend/src/validators/affiliate-task.validator.ts`
- Create: `backend/src/controllers/affiliate-task.controller.ts`
- Create: `backend/src/routes/affiliate-task.routes.ts`
- Create: `backend/tests/affiliate-task-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

- [ ] **Step 1: Write failing API tests**

Cover all nine endpoints, standard success/error envelopes, pagination keys, malformed IDs, publisher union errors, field invariants, missing authentication, least-privilege permission denial, permitted merchant/backoffice calls, not-found behavior, and conflict behavior.

- [ ] **Step 2: Run focused API test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-task-api.test.ts`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement Zod validators**

Use strict objects, discriminated unions, finite integer bounds, ISO datetime transforms, unique arrays, cross-field refinements, and existing pagination conventions. Do not read unvalidated `req.body`, `req.params`, or `req.query` in controllers.

- [ ] **Step 4: Implement thin controllers and permissioned routes**

Controllers obtain the validated values and `AuthenticatedAccessContext`, call one service method, and send the common response envelope. Routes apply `authenticate`, exact `authorize(permission)`, and `validateRequest` in that order.

- [ ] **Step 5: Wire dependencies in `createApp`**

Support injected service/repository dependencies for tests and construct Prisma-backed production dependencies by default without global fake state.

- [ ] **Step 6: Add complete OpenAPI contracts**

Document security, tags, request/response schemas, publisher variants, task DTO, pagination, validation errors, RBAC errors, conflicts, insufficient funds, and all nine paths. Add a test asserting every runtime route exists in the OpenAPI document.

- [ ] **Step 7: Run API and regression tests**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/affiliate-task-api.test.ts tests/openapi.test.ts tests/health.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 8: Commit the HTTP slice**

```bash
git add backend/src/api/openapi.ts backend/src/app.ts backend/src/controllers/affiliate-task.controller.ts backend/src/routes/affiliate-task.routes.ts backend/src/validators/affiliate-task.validator.ts backend/tests/affiliate-task-api.test.ts
git commit -m "feat: expose affiliate task review APIs"
```

---

### Task 4: Real MySQL acceptance, documentation, and full verification

**Files:**

- Create: `backend/scripts/check-affiliate-task-publishing-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/ledger.md`

**Acceptance flow:**

1. Abort unless the database URL is explicitly local and non-production.
2. Create uniquely prefixed temporary users, merchant account, shop memberships, shops, services, and wallets.
3. Verify a shop draft creates no reservation, ledger transaction, audit transition, or wallet delta.
4. Submit the shop task; verify exact available/frozen balances, formal snapshots, reservation, ledger links, reconciliation, audit, and `pending_review` state.
5. Retry submit; verify no duplicate freeze or reservation.
6. Attempt an over-budget submission; verify the task remains draft and every dependent table/balance remains unchanged.
7. Submit a merchant-account multi-shop task; verify account-wallet freeze and active membership enforcement.
8. Attempt an out-of-scope shop; verify rejection without partial writes.
9. Approve one task and verify `scheduled`/`active` from its real time window.
10. Reject another task; verify full unfreeze, released reservation, rejected state, ledger/reconciliation/audit records, and idempotent retry.
11. Delete only rows carrying the unique acceptance prefix, in reverse dependency order, inside `finally`.

- [ ] **Step 1: Write the guarded acceptance script**

The script uses formal services and the local Prisma database, prints assertion names, fails non-zero on any mismatch, and always performs exact-prefix cleanup.

- [ ] **Step 2: Add the package script and run against local MySQL**

Run:

```bash
npm --prefix backend run prisma:status
npm --prefix backend run check:affiliate-task-publishing-flow
```

Expected: migrations up to date and every flow assertion PASS.

- [ ] **Step 3: Document the delivered boundary**

Record the APIs, permissions, freeze/release ledger semantics, local acceptance command, and explicit exclusions. State that Afirieito UI and claimant functionality remain later microsteps.

- [ ] **Step 4: Run prohibited-pattern scans**

Run:

```bash
rg -n "TODO|FIXME|not implemented|placeholder|fake API|mock" backend/src/services/affiliate-task.service.ts backend/src/repositories/affiliate-task.repository.ts backend/src/controllers/affiliate-task.controller.ts backend/src/routes/affiliate-task.routes.ts backend/src/validators/affiliate-task.validator.ts backend/scripts/check-affiliate-task-publishing-flow.ts
rg -n "wallet\.(availableBalance|frozenBalance).*update|availableBalance.*=|frozenBalance.*=" backend/src/repositories/affiliate-task.repository.ts
```

Expected: no prohibited implementation markers and no direct affiliate-repository wallet mutation.

- [ ] **Step 5: Run full backend and frontend verification**

Run:

```bash
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm run lint
npm test
npm run build
```

Expected: all commands PASS in the clean isolated worktree.

- [ ] **Step 6: Inspect the final diff and commit documentation/acceptance**

```bash
git status --short
git diff --check
git diff --stat 0792dfc..HEAD
git add backend/scripts/check-affiliate-task-publishing-flow.ts backend/package.json README.md docs/ledger.md
git commit -m "test: verify affiliate task publishing flow"
```

- [ ] **Step 7: Apply verification-before-completion and branch handoff**

Re-run the evidence commands required by the verification skill, inspect the worktree for unrelated files, and use the finishing-development-branch workflow. Do not merge to `main` until the implementation and local MySQL evidence are clean.

## Completion Gate

This microstep is complete only when:

- Draft create/update performs no wallet mutation.
- Submit freezes the complete budget atomically and produces one reservation plus immutable ledger/reconciliation/audit evidence.
- Unauthorized publisher/shop/service scope cannot be persisted or frozen.
- Insufficient funds and all validation failures leave no partial writes.
- Operations approve and reject enforce the state machine; reject fully unfreezes the unused budget atomically.
- Retries do not duplicate financial effects.
- Nine runtime routes, RBAC permissions, Zod contracts, and OpenAPI paths agree.
- Real local MySQL acceptance and all backend/frontend lint, tests, and builds pass.
- Claiming, attribution, completion reward settlement, frontend UI, and analytics remain unimplemented and explicitly documented as later steps.
