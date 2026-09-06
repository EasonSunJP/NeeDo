# Completed-Order Refund Case Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the formal backend workflow for a customer-requested refund on a completed order while permanently preserving any settled Affiliate reward.

**Architecture:** Add a dedicated OrderRefundCase aggregate with immutable transition events and an optional complaint/dispute aggregate. A focused service enforces actor scope, state transitions, idempotency, optimistic versions, and audit inputs; a Prisma repository locks the case and order and commits every change atomically. Existing BookingOrder.paymentRefund fields remain the final projection and are updated only when the customer confirms receipt.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma, MySQL 8, Zod, Jest, Supertest, OpenAPI.

## Global Constraints

- Cover only persisted COMPLETED orders; cancellation, no-show, and non-completion responsibility are excluded.
- A customer creates the refund request; merchants cannot create one for the customer.
- Merchant approval records responsibility=SHOP and opens the refund-evidence stage.
- Merchant rejection does not involve operations unless the customer or scoped merchant explicitly complains.
- Operations may resolve only a persisted open dispute.
- Merchant evidence never completes the refund; only the booking customer confirms receipt.
- A settled Affiliate reward stays SETTLED. Create no reversal/recovery transaction, alter no reversal counters, and mutate no claimant wallet balance.
- Every mutation requires a trimmed 8-160 character idempotency key. Initial request creation requires `expectedVersion: 0`; every later mutation requires a positive expected version equal to the current aggregate version.
- Every route has Zod, RBAC, OpenAPI, structured errors, repository scope, immutable history, and audit.
- Add no mock, static fallback, negative-wallet handling, or frontend reward-choice field.
- Work test-first: prove RED, implement the minimum, run focused GREEN, and commit.

---

## File Structure

New files:

- backend/prisma/migrations/20260907020000_order_refund_cases/migration.sql
- backend/src/services/order-refund-case-state-machine.ts
- backend/src/services/order-refund-case.service.ts
- backend/src/repositories/order-refund-case.repository.ts
- backend/src/validators/order-refund-case.validator.ts
- backend/src/controllers/order-refund-case.controller.ts
- backend/src/routes/order-refund-case.routes.ts
- backend/tests/order-refund-case-schema.test.ts
- backend/tests/order-refund-case-permissions.test.ts
- backend/tests/order-refund-case-state-machine.test.ts
- backend/tests/order-refund-case-validator.test.ts
- backend/tests/order-refund-case.service.test.ts
- backend/tests/order-refund-case.repository.test.ts
- backend/tests/order-refund-case-api.test.ts
- backend/scripts/check-order-refund-case-flow.ts
- backend/tests/order-refund-case-flow-script.test.ts

Modified files:

- backend/prisma/schema.prisma
- backend/src/constants/error-codes.ts
- backend/src/constants/permissions.constants.ts
- backend/src/app.ts
- backend/src/api/openapi.ts
- backend/package.json
- docs/00_MASTER_MICRO_STEP_PLAN.md

---

### Task 1: Schema, migration, errors, and RBAC

**Files:**
- Modify: backend/prisma/schema.prisma
- Create: backend/prisma/migrations/20260907020000_order_refund_cases/migration.sql
- Modify: backend/src/constants/error-codes.ts
- Modify: backend/src/constants/permissions.constants.ts
- Create: backend/tests/order-refund-case-schema.test.ts
- Create: backend/tests/order-refund-case-permissions.test.ts

**Interfaces:**
- Consumes: BookingOrder, User, Shop, Identity, AuditLog, AffiliateReward, and system roles.
- Produces: refund case/event/dispute/revision models and four permissions.

- [ ] **Step 1: Write failing schema and permission tests**

Create this schema contract:

~~~ts
const names = [
  "enum OrderRefundCaseStatus",
  "enum OrderRefundCaseAction",
  "enum OrderRefundDisputeStatus",
  "enum OrderRefundDisputeResolution",
  "model OrderRefundCase",
  "model OrderRefundCaseEvent",
  "model OrderRefundDispute",
  "model OrderRefundDisputeRevision"
];
it.each(names)("declares %s", (name) => expect(schema).toContain(name));
expect(migration).toContain("order_refund_cases_active_key_key");
expect(migration).toContain("order_refund_disputes_active_key_key");
expect(migration).toContain("CHECK (responsibility = 'shop')");
expect(migration).toContain("CHECK (refund_amount_jpy > 0)");
expect(migration).toContain("CHECK (version > 0)");
~~~

Extend permission tests with:

~~~ts
expect(byRole.customer).toContain("user:order-refund:write");
expect(byRole.merchant_owner).toContain("merchant-admin:order-refund:write");
expect(byRole.merchant_staff).toContain("merchant-admin:order-refund:write");
expect(byRole.operator).toEqual(expect.arrayContaining([
  "backoffice:order-refund-dispute:read",
  "backoffice:order-refund-dispute:resolve"
]));
expect(byRole.support).toContain("backoffice:order-refund-dispute:read");
expect(byRole.support).not.toContain("backoffice:order-refund-dispute:resolve");
expect(byRole.finance).not.toContain("backoffice:order-refund-dispute:resolve");
~~~

- [ ] **Step 2: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case-schema.test.ts order-refund-case-permissions.test.ts --runInBand
~~~

Expected: FAIL because the schema, migration, and permissions are absent.

- [ ] **Step 3: Add exact Prisma enums**

~~~prisma
enum OrderRefundCaseStatus {
  MERCHANT_REVIEW_PENDING       @map("merchant_review_pending")
  REFUND_PENDING                @map("refund_pending")
  CUSTOMER_CONFIRMATION_PENDING @map("customer_confirmation_pending")
  MERCHANT_REJECTED             @map("merchant_rejected")
  DISPUTED                      @map("disputed")
  REFUNDED                      @map("refunded")
  DISPUTE_REJECTED              @map("dispute_rejected")
  @@map("order_refund_case_status")
}

enum OrderRefundCaseAction {
  REQUEST                  @map("request")
  MERCHANT_APPROVE         @map("merchant_approve")
  MERCHANT_REJECT          @map("merchant_reject")
  OPEN_COMPLAINT           @map("open_complaint")
  RESOLVE_DISPUTE_REFUND   @map("resolve_dispute_refund")
  RESOLVE_DISPUTE_REJECT   @map("resolve_dispute_reject")
  SUBMIT_REFUND_EVIDENCE   @map("submit_refund_evidence")
  CONFIRM_CUSTOMER_RECEIPT @map("confirm_customer_receipt")
  @@map("order_refund_case_action")
}

enum OrderRefundDisputeStatus {
  OPEN     @map("open")
  RESOLVED @map("resolved")
  @@map("order_refund_dispute_status")
}

enum OrderRefundDisputeResolution {
  REFUND @map("refund")
  REJECT @map("reject")
  @@map("order_refund_dispute_resolution")
}
~~~

- [ ] **Step 4: Add four models and SQL guards**

OrderRefundCase contains publicId; order, shop, and customer foreign keys; status; responsibility fixed to shop; amount/currency; version; nullable unique activeKey; request, merchant-decision, evidence, and customer-confirmation fields; timestamps; events; disputes. Index order chronology, shop/status chronology, customer/status chronology, and deletedAt.

OrderRefundCaseEvent contains case/order foreign keys, action, nullable fromStatus, toStatus, actor user/identity, unique idempotencyKey, requestFingerprint char(64), optional metadata, timestamps, and chronology/actor indexes.

OrderRefundDispute contains case/order/shop/customer foreign keys, status, nullable resolution, version, nullable unique activeKey, opener user/identity, reason, resolver, public resolution reason, internal note, timestamps, and case/status/shop indexes.

OrderRefundDisputeRevision contains dispute/case/order foreign keys, resolution, previous/next version, resolver, public reason, internal note, unique idempotencyKey, fingerprint, timestamps, and dispute/case/resolver indexes.

Add matching inverse relations to BookingOrder, Shop, User, and Identity. Migration uses utf8mb4, RESTRICT foreign keys, positive amount/version checks, and:

~~~sql
ALTER TABLE order_refund_cases
  ADD CONSTRAINT order_refund_cases_shop_responsibility_chk
    CHECK (responsibility = 'shop');
ALTER TABLE order_refund_cases
  ADD CONSTRAINT order_refund_cases_amount_chk
    CHECK (refund_amount_jpy > 0);
ALTER TABLE order_refund_disputes
  ADD CONSTRAINT order_refund_disputes_version_chk
    CHECK (version > 0);
~~~

Do not rewrite order, Affiliate, wallet, or ledger tables.

- [ ] **Step 5: Add stable errors and permissions**

~~~ts
ORDER_REFUND_CASE_NOT_FOUND: 40436,
ORDER_REFUND_DISPUTE_NOT_FOUND: 40437,
ORDER_REFUND_CASE_INVALID_STATE: 41027,
ORDER_REFUND_CASE_VERSION_CONFLICT: 41028,
ORDER_REFUND_CASE_IDEMPOTENCY_CONFLICT: 41029,
ORDER_REFUND_CASE_ACTIVE_CONFLICT: 41030,
ORDER_REFUND_CASE_SCOPE_MISMATCH: 41031,
ORDER_REFUND_DISPUTE_REQUIRED: 41032,
ORDER_REFUND_AFFILIATE_INVARIANT_FAILED: 41033,
~~~

Add permission definitions:

~~~ts
createPermission("user:order-refund:write", "用户订单退款", "api", "order", "为本人已完成订单申请退款、确认到账或投诉"),
createPermission("merchant-admin:order-refund:write", "商户订单退款", "api", "order", "在授权店铺处理退款申请、提交退款凭证或投诉"),
createPermission("backoffice:order-refund-dispute:read", "退款争议读取", "api", "backoffice", "分页读取已投诉的订单退款争议"),
createPermission("backoffice:order-refund-dispute:resolve", "退款争议裁定", "api", "backoffice", "裁定已正式投诉的订单退款争议")
~~~

Assign customer write to customer, merchant write to both merchant roles, read/resolve to operator, and read only to support. Admin inherits all. Do not grant resolution to finance, support, viewer, customer, merchant, or technician.

- [ ] **Step 6: Generate, run GREEN, and commit**

~~~bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- order-refund-case-schema.test.ts order-refund-case-permissions.test.ts --runInBand
git add backend/prisma/schema.prisma backend/prisma/migrations/20260907020000_order_refund_cases/migration.sql backend/src/constants/error-codes.ts backend/src/constants/permissions.constants.ts backend/tests/order-refund-case-schema.test.ts backend/tests/order-refund-case-permissions.test.ts
git commit -m "feat: add completed-order refund case foundation"
~~~

Expected: Prisma generation and both suites pass.

---

### Task 2: Pure state machine and Zod contracts

**Files:**
- Create: backend/src/services/order-refund-case-state-machine.ts
- Create: backend/src/validators/order-refund-case.validator.ts
- Create: backend/tests/order-refund-case-state-machine.test.ts
- Create: backend/tests/order-refund-case-validator.test.ts

**Interfaces:**
- Consumes: Task 1 lowercase statuses.
- Produces: transitionOrderRefundCase and inferred request types.

- [ ] **Step 1: Write exhaustive RED transition tests**

~~~ts
const allowed = [
  ["merchant_review_pending", "merchant_approve", "refund_pending"],
  ["merchant_review_pending", "merchant_reject", "merchant_rejected"],
  ["merchant_rejected", "open_complaint", "disputed"],
  ["disputed", "resolve_dispute_refund", "refund_pending"],
  ["disputed", "resolve_dispute_reject", "dispute_rejected"],
  ["refund_pending", "submit_refund_evidence", "customer_confirmation_pending"],
  ["customer_confirmation_pending", "confirm_customer_receipt", "refunded"]
] as const;
it.each(allowed)("transitions %s with %s to %s", (status, action, next) => {
  expect(transitionOrderRefundCase(status, action)).toEqual({ ok: true, status: next });
});
~~~

Generate every other status/action pair and expect {ok:false, reason:"invalid_transition"}.

- [ ] **Step 2: Write RED validator tests**

Use a creation envelope for the initial request and an update envelope for every later mutation:

~~~ts
const idempotencyKey = z.string().trim().min(8).max(160);
const createEnvelope = z.object({
  idempotencyKey,
  expectedVersion: z.literal(0)
}).strict();
const updateEnvelope = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  expectedVersion: z.number().int().positive()
}).strict();
~~~

The request schema extends `createEnvelope` with a trimmed 2-500 reason. Complaint extends `updateEnvelope` with a trimmed 2-500 reason; approve/reject extend it with a trimmed 2-500 note; evidence extends it with a trimmed 2-120 reference; receipt confirmation uses only `updateEnvelope`; dispute resolution extends it with resolution refund|reject, 2-500 publicReason, and optional nullable 2-1000 internalNote. Add strict positive order params, UUID case/dispute params, and pagination default 1/20, maximum 100, optional open/resolved status, and optional trimmed 100-character search.

- [ ] **Step 3: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case-state-machine.test.ts order-refund-case-validator.test.ts --runInBand
~~~

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement exact public types**

~~~ts
export type OrderRefundCaseStatus =
  | "merchant_review_pending" | "refund_pending"
  | "customer_confirmation_pending" | "merchant_rejected"
  | "disputed" | "refunded" | "dispute_rejected";
export type OrderRefundCaseAction =
  | "merchant_approve" | "merchant_reject" | "open_complaint"
  | "resolve_dispute_refund" | "resolve_dispute_reject"
  | "submit_refund_evidence" | "confirm_customer_receipt";
export type OrderRefundCaseTransition =
  | { ok: true; status: OrderRefundCaseStatus }
  | { ok: false; reason: "invalid_transition" };

export const transitionOrderRefundCase = (
  status: OrderRefundCaseStatus,
  action: OrderRefundCaseAction
): OrderRefundCaseTransition => {
  const next = TRANSITIONS[status]?.[action];
  return next ? { ok: true, status: next } : { ok: false, reason: "invalid_transition" };
};
~~~

Keep TRANSITIONS private and immutable. Export inferred validator types.

- [ ] **Step 5: Run GREEN and commit**

~~~bash
npm --prefix backend test -- order-refund-case-state-machine.test.ts order-refund-case-validator.test.ts --runInBand
git add backend/src/services/order-refund-case-state-machine.ts backend/src/validators/order-refund-case.validator.ts backend/tests/order-refund-case-state-machine.test.ts backend/tests/order-refund-case-validator.test.ts
git commit -m "feat: define refund case state contracts"
~~~

Expected: both suites pass with no Prisma dependency in the state machine.

---

### Task 3: Service contract and actor-scoped commands

**Files:**
- Create: backend/src/services/order-refund-case.service.ts
- Create: backend/tests/order-refund-case.service.test.ts

**Interfaces:**
- Consumes: auth contexts, Task 2 types, AuditLogService.createInput, and repository outcomes.
- Produces: OrderRefundCaseService, OrderRefundCaseRepositoryPort, commands, and public views.

- [ ] **Step 1: Write RED service tests**

Cover request by booking customer only; merchant shop scope; complaint only from merchant_rejected; dispute resolution only through global/platform identity; evidence by merchant; receipt confirmation by booking customer; exact replay; fingerprint conflict; stable 404/409/500 errors; and rejection of responsibility or Affiliate fields in public input.

Require audit actions:

~~~ts
const actions = [
  "order_refund.requested",
  "order_refund.merchant_approved",
  "order_refund.merchant_rejected",
  "order_refund.complaint_opened",
  "order_refund.dispute_resolved_refund",
  "order_refund.dispute_resolved_reject",
  "order_refund.evidence_submitted",
  "order_refund.customer_receipt_confirmed"
];
~~~

- [ ] **Step 2: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case.service.test.ts --runInBand
~~~

Expected: FAIL because the service is absent.

- [ ] **Step 3: Define public and repository contracts**

Public view:

~~~ts
type OrderRefundCaseView = {
  publicId: string;
  orderNo: string;
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  status: OrderRefundCaseStatus;
  responsibility: "shop";
  refundAmountJpy: number;
  currency: string;
  version: number;
  requestReason: string;
  merchantDecisionNote: string | null;
  refundReference: string | null;
  requestedAt: string;
  merchantDecisionAt: string | null;
  refundSubmittedAt: string | null;
  customerConfirmedAt: string | null;
  dispute: null | {
    publicId: string;
    status: "open" | "resolved";
    resolution: "refund" | "reject" | null;
    version: number;
    reason: string;
    openedAt: string;
    resolvedAt: string | null;
    publicResolutionReason: string | null;
  };
  affiliateReward: null | { status: "settled"; rewardNdp: number };
  createdAt: string;
  updatedAt: string;
};
~~~

Repository port:

~~~ts
interface OrderRefundCaseRepositoryPort {
  request(input: RequestRefundCommand): Promise<OrderRefundMutationResult>;
  merchantDecision(input: MerchantRefundDecisionCommand): Promise<OrderRefundMutationResult>;
  submitEvidence(input: SubmitRefundEvidenceCommand): Promise<OrderRefundMutationResult>;
  confirmCustomerReceipt(input: ConfirmRefundReceiptCommand): Promise<OrderRefundMutationResult>;
  openComplaint(input: OpenRefundComplaintCommand): Promise<OrderRefundMutationResult>;
  resolveDispute(input: ResolveRefundDisputeCommand): Promise<OrderRefundMutationResult>;
  listDisputes(input: ListRefundDisputesInput): Promise<PaginatedRefundDisputes>;
}
~~~

Every command carries actor user/identity, scope, idempotency key, fingerprint, expected version, and audit. Merchant commands include authenticated shopId. Operations resolution includes a global/platform identity assertion.

- [ ] **Step 4: Implement normalization, fingerprints, audit, and errors**

Use SHA-256 over action, IDs, actor, identity, shop scope, normalized payload, and expected version. Never fingerprint only the idempotency key.

Repository outcomes are created|updated|replayed or not_found|invalid_state|version_conflict|idempotency_conflict|active_conflict|scope_mismatch|dispute_required|affiliate_invariant_failed. Map hidden scope/not found to 404, ordinary conflicts to 409, and forbidden Affiliate mutation to stable 500.

- [ ] **Step 5: Run GREEN and commit**

~~~bash
npm --prefix backend test -- order-refund-case.service.test.ts --runInBand
git add backend/src/services/order-refund-case.service.ts backend/tests/order-refund-case.service.test.ts
git commit -m "feat: add completed-order refund case service"
~~~

Expected: service tests pass without Express or Prisma.

---

### Task 4: Atomic Prisma repository and Affiliate invariant

**Files:**
- Create: backend/src/repositories/order-refund-case.repository.ts
- Create: backend/tests/order-refund-case.repository.test.ts

**Interfaces:**
- Consumes: Tasks 1-3, toAuditLogCreateData, identity resolution, and transaction-conflict retry.
- Produces: persisted mutations and paginated dispute reads.

- [ ] **Step 1: Write RED transaction tests**

Prove: completed paid customer-owned request; server-derived amount/currency; merchant approval as shop responsibility; merchant rejection without dispute; complaint by customer or scoped merchant; operations blocked without open dispute; refund/reject rulings; evidence without final refund; customer-confirmed final projection; exact Affiliate/wallet preservation; zero reversal/recovery; rollback; replay; stale version; concurrent active-case conflict; cross-shop hiding; deleted-row filtering; and matching count/list pagination.

- [ ] **Step 2: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case.repository.test.ts --runInBand
~~~

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement stable locks and replay**

Use runWithTransactionConflictRetry and one Prisma transaction. Lock in order: booking_order, refund_case, refund_dispute. Skip a later lock only when the row is being created. Resolve idempotency from immutable case events/dispute revisions and return current aggregate only for an exact fingerprint.

Request eligibility:

~~~ts
const eligible =
  order.status === BookingOrderStatus.COMPLETED &&
  order.customerUserId === input.actorUserId &&
  order.paymentStatus === ServicePaymentStatus.CONFIRMED &&
  order.paymentAmountJpy > 0 &&
  order.paymentRefundedAt === null;
~~~

Create activeKey booking:{orderId}. Derive refundAmountJpy and currency from the order.

- [ ] **Step 4: Implement decisions and dispute flow**

Merchant approval queries through shopId, writes decision fields and shop responsibility, moves to REFUND_PENDING, and increments version. Rejection moves to MERCHANT_REJECTED.

Complaint requires MERCHANT_REJECTED, creates one active dispute, moves case to DISPUTED, and writes event/audit without an operations actor.

Resolution requires an open locked dispute. Refund resolution closes the dispute and moves case to REFUND_PENDING while retaining case activeKey. Reject resolution closes both active keys and moves case to DISPUTE_REJECTED. Persist an immutable dispute revision.

- [ ] **Step 5: Implement evidence and customer confirmation**

Evidence requires REFUND_PENDING, stores reference, moves to CUSTOMER_CONFIRMATION_PENDING, and leaves BookingOrder unchanged.

Before customer confirmation snapshot:

~~~ts
const affiliateBefore = await tx.affiliateReward.findFirst({
  where: { bookingOrderId: order.id, deletedAt: null },
  select: {
    id: true, status: true, rewardNdp: true, platformFeeNdp: true,
    reversalRequiredNdp: true, reversedNdp: true, outstandingRecoveryNdp: true,
    claimantWallet: { select: { id: true, availableBalance: true, frozenBalance: true } },
    transactions: {
      where: { deletedAt: null },
      select: { id: true, kind: true, ledgerTransactionId: true, amountNdp: true }
    }
  }
});
if (affiliateBefore && affiliateBefore.status !== AffiliateRewardStatus.SETTLED) {
  return { kind: "affiliate_invariant_failed" as const };
}
~~~

Then atomically update the case to REFUNDED, clear activeKey, set customer confirmation; update only a COMPLETED, CONFIRMED, not-yet-refunded order to paymentStatus REFUNDED; update OrderFinancial final projection; write event/audit/notifications; re-read the same Affiliate and wallet fields and require exact equality. Any mismatch throws inside the transaction and rolls back.

- [ ] **Step 6: Add bounded dispute pagination**

Use identical where clauses for findMany/count, deletedAt null, optional status/search, openedAt/id descending, skip=(page-1)*pageSize, and take=pageSize. Search only orderNo, case publicId, customer needoId, shopNo, and shop name. Never expose internalNote to customer/merchant projections.

- [ ] **Step 7: Run GREEN, regressions, and commit**

~~~bash
npm --prefix backend test -- order-refund-case.repository.test.ts affiliate-checkout.service.test.ts affiliate-budget-ledger.service.test.ts manual-payment-service.test.ts --runInBand
git add backend/src/repositories/order-refund-case.repository.ts backend/tests/order-refund-case.repository.test.ts
git commit -m "feat: persist completed-order refund cases"
~~~

Expected: all focused tests pass and ledger.service.ts remains unchanged.

---

### Task 5: Authenticated APIs and OpenAPI

**Files:**
- Create: backend/src/controllers/order-refund-case.controller.ts
- Create: backend/src/routes/order-refund-case.routes.ts
- Modify: backend/src/app.ts
- Modify: backend/src/api/openapi.ts
- Create: backend/tests/order-refund-case-api.test.ts
- Modify: backend/tests/openapi.test.ts

**Interfaces:**
- Consumes: Tasks 2-4 and standard auth/response helpers.
- Produces: formal JSON endpoints.

- [ ] **Step 1: Write RED Supertest cases**

Cover 401, 403, 400, hidden 404, conflict 409, success, and replay for:

~~~text
POST /api/v1/orders/:id/refund-requests
POST /api/v1/orders/:id/refund-requests/:caseId/confirm-receipt
POST /api/v1/orders/:id/refund-requests/:caseId/complaints
POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/approve
POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/reject
POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/refund-evidence
POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/complaints
GET  /api/v1/backoffice/refund-disputes
POST /api/v1/backoffice/refund-disputes/:id/resolve
~~~

Create returns 201, exact replay 200, mutation 200, and list includes list/total/page/page_size. Explicitly prove operations resolution without complaint returns error.order_refund.dispute_required.

- [ ] **Step 2: Write RED OpenAPI assertions**

Require bearer auth, exact x-permission, strict bodies, documented 400/401/403/404/409, and pagination query definitions.

- [ ] **Step 3: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case-api.test.ts openapi.test.ts --runInBand
~~~

Expected: FAIL because routes and OpenAPI paths are absent.

- [ ] **Step 4: Implement controller and routes**

Controller methods use successResponse, getAuthenticatedAccess, and getRequestContext; contain no state or Prisma logic.

Route permissions:

~~~ts
export const ORDER_REFUND_CASE_ROUTE_PERMISSIONS = {
  userWrite: "user:order-refund:write",
  merchantWrite: "merchant-admin:order-refund:write",
  disputeRead: "backoffice:order-refund-dispute:read",
  disputeResolve: "backoffice:order-refund-dispute:resolve"
} as const;
~~~

Add orderRefundCaseRepository to AppDependencies, inject repository/audit service, and mount the router for shared, merchant-admin, and backoffice portal groups.

- [ ] **Step 5: Add OpenAPI**

Document lowercase statuses and Task 3 public fields. Never expose database IDs, fingerprint, internal note, wallet balances, or Affiliate transaction internals. Every x-permission matches routes.

- [ ] **Step 6: Run GREEN, lint, build, and commit**

~~~bash
npm --prefix backend test -- order-refund-case-api.test.ts openapi.test.ts --runInBand
npm --prefix backend run lint
npm --prefix backend run build
git add backend/src/controllers/order-refund-case.controller.ts backend/src/routes/order-refund-case.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/order-refund-case-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose completed-order refund case API"
~~~

Expected: API/OpenAPI tests, lint, and build pass.

---

### Task 6: Real-MySQL evidence and backend closure

**Files:**
- Create: backend/scripts/check-order-refund-case-flow.ts
- Create: backend/tests/order-refund-case-flow-script.test.ts
- Modify: backend/package.json
- Modify: docs/00_MASTER_MICRO_STEP_PLAN.md

**Interfaces:**
- Consumes: formal MySQL, generated Prisma client, and completed Affiliate fixtures.
- Produces: npm run check:order-refund-case-flow and current status documentation.

- [ ] **Step 1: Write RED checker-contract test**

Require proof labels merchant-approved-refund, merchant-rejected-without-operations, customer-complaint-platform-refund, merchant-complaint-platform-reject, customer-receipt-required, affiliate-reward-preserved, claimant-wallet-preserved, no-affiliate-reversal-transactions, idempotent-replay, stale-version-conflict, cross-shop-hidden, cleanup-complete. Reject DROP TABLE and TRUNCATE TABLE.

- [ ] **Step 2: Run RED**

~~~bash
npm --prefix backend test -- order-refund-case-flow-script.test.ts --runInBand
~~~

Expected: FAIL because checker and package command are absent.

- [ ] **Step 3: Implement guarded checker**

Load the repository dev environment; refuse production; create uniquely prefixed customer, merchant, shop, service, schedule, completed order, Affiliate attribution/reward, wallets, and settlement transaction; snapshot reward/wallet; execute approval and dispute paths; prove rejection alone never invokes operations; prove evidence does not finish refund; prove customer confirmation does; prove byte-for-byte reward/wallet preservation and zero reversal/recovery; exercise replay/version/scope; print one JSON proof object; clean only prefixed rows in reverse FK order inside finally.

Add:

~~~json
"check:order-refund-case-flow": "tsx scripts/check-order-refund-case-flow.ts"
~~~

- [ ] **Step 4: Run final gates**

~~~bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- order-refund-case-schema.test.ts order-refund-case-permissions.test.ts order-refund-case-state-machine.test.ts order-refund-case-validator.test.ts order-refund-case.service.test.ts order-refund-case.repository.test.ts order-refund-case-api.test.ts order-refund-case-flow-script.test.ts affiliate-checkout.service.test.ts affiliate-budget-ledger.service.test.ts manual-payment-service.test.ts openapi.test.ts --runInBand
npm --prefix backend run check:order-refund-case-flow
npm --prefix backend run lint
npm --prefix backend run build
~~~

Expected: all suites pass, proof labels are true, lint/build pass.

- [ ] **Step 5: Verify cleanup and update status**

Require zero active prefixed cases, disputes, events, revisions, orders, rewards, transactions, and wallets. Add to the master plan:

~~~markdown
- 服务完成后退款：已完成后端正式案件、投诉门禁、用户到账确认与联盟奖励保留；三端页面验收尚未开始。
- 服务完成前取消/未完成责任与联盟奖励：未开始，保持独立财务能力门禁。
~~~

- [ ] **Step 6: Commit**

~~~bash
git add backend/scripts/check-order-refund-case-flow.ts backend/tests/order-refund-case-flow-script.test.ts backend/package.json docs/00_MASTER_MICRO_STEP_PLAN.md
git commit -m "test: verify completed-order refund case flow"
~~~

Expected: checker, contract, package command, and precise status only.

---

## Final Verification Checklist

- [ ] No unowned implementation changes.
- [ ] Record branch, worktree, listener PID/cwd, proxy, health, and ready before runtime acceptance.
- [ ] Apply migration only after proving it is physically absent.
- [ ] Run Prisma generation/validation, focused tests, lint, and build from one commit.
- [ ] Real MySQL proves customer receipt is required and reward/wallet are exactly preserved.
- [ ] No Affiliate reversal/recovery transaction exists.
- [ ] No active test fixture remains.
- [ ] Distinguish complete backend from unstarted UIs and unstarted cancellation/non-completion responsibility.
- [ ] Do not push, deploy, or merge unrelated work without separate authority.

## Deferred Follow-up Plans

1. User, merchant, and operations refund-case UI with i18n and responsive browser acceptance.
2. Pre-completion cancellation/no-show/non-completion responsibility and Affiliate settlement/release.
3. Support Conversation linkage to an existing dispute without making chat messages financial truth.
