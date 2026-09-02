# Exchange Budget And Target Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a selective Request owner finish a match with fewer selected providers and/or a quote total above the current effective budget only after a server-authored 409 preview and an exact, explicit second confirmation.

**Architecture:** Extend the existing `POST /api/v1/exchange/posts/:id/matching/select` command instead of adding a second adjustment endpoint. The service computes a canonical preview under the existing Request → Matching → Claim locks; missing, stale, unnecessary, or inexact confirmations write nothing, while a valid command atomically updates the effective target/budget, appends version-linked adjustment events, and completes the existing selection transaction. The React decision panel consumes structured error data, shows the exact server proposal, and reuses the same selected claims while issuing a fresh idempotency key for the confirmed payload.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma 7/MySQL 8, Zod, OpenAPI, Jest/Supertest, React 19, Vite/Vitest, existing NeeDo formal `/api/v1` client and five-locale Exchange i18n.

## Global Constraints

- Work only on `codex/exchange-budget-target-adjustment`, created from local `main` at `24027639`, inside the existing isolated worktree.
- Implement only selective-mode budget increase and target reduction through the existing select command.
- A target may only decrease to the selected active-claim count, never to zero and never above the current effective target.
- A budget may only increase to the selected quote total; no independent editing or reduction is allowed.
- Missing, unnecessary, stale, or numerically inexact confirmations return a structured 409 response with zero writes.
- A command that needs both changes must explicitly confirm both exact values in one request and one database transaction.
- Each applied adjustment increments the matching version once and appends one event; the final selective match increments it once more and owns the command idempotency key.
- Keep Request publication financial, WalletHold, Wallet/Ledger, reconciliation, BookingOrder, Payment, and `ScheduleSlot.bookedCount` unchanged.
- Do not implement quick matching, manual close, half-fee settlement, bilateral cancellation, appointment/order conversion, or payment.
- Do not add schema, migration, permission, route, mock, browser business storage, fake success, placeholder, or hard-coded actor authority.
- Preserve Request → Matching → Claims → Technicians lock order, server-side identity/RBAC, optimistic versioning, idempotency, privacy, notification, and audit behavior.
- Visible copy must be complete in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean; claim-authored text remains unchanged.
- Real database/browser fixtures are local-only and marker-owned; do not delete or rewrite Request `62` or unrelated test data.

---

### Task 1: Preserve structured 409 preview data in the formal client

**Files:**
- Modify: `src/api/httpClient.ts`
- Test: `src/api/httpClient.test.ts`

**Interfaces:**
- Consumes: formal error envelope `{ code, message, data }`.
- Produces: `ApiClientError.data: unknown`, without changing existing constructor call sites.

- [ ] **Step 1: Write the failing error-data test**

Add a request test whose fetch response is:

```ts
jsonResponse({
  code: 40999,
  message: "error.exchange.match_target_confirmation_required",
  data: { selectedCount: 1, effectiveTargetProviderCount: 2 }
}, 409)
```

Assert:

```ts
await expect(request).rejects.toMatchObject({
  code: 40999,
  status: 409,
  data: { selectedCount: 1, effectiveTargetProviderCount: 2 }
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/api/httpClient.test.ts`

Expected: FAIL because `ApiClientError` discards the envelope `data` field.

- [ ] **Step 3: Implement the minimal transport change**

Use this backward-compatible shape:

```ts
export type ApiErrorResponse = {
  code: number;
  message: string;
  data: unknown;
};

export class ApiClientError extends Error {
  public readonly code: number;
  public readonly status: number;
  public readonly data: unknown;

  public constructor(message: string, code: number, status: number, data: unknown = null) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.data = data;
  }
}
```

`assertSuccess` must pass the server error payload into `ApiClientError`; locally created client errors continue to default to `null`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/api/httpClient.test.ts`

Expected: PASS with the new structured-error test and all existing client tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/httpClient.ts src/api/httpClient.test.ts
git commit -m "feat(api): preserve structured error previews"
```

### Task 2: Define strict adjustment confirmations and preview contracts

**Files:**
- Modify: `backend/src/validators/exchange-matching.validators.ts`
- Modify: `backend/src/types/exchange-matching.types.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/exchange-matching.validators.test.ts`
- Test: `backend/tests/exchange-matching.routes.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: current select body and shared application error envelope.
- Produces: `ExchangeMatchAdjustmentPreview`, `budgetConfirmation`, and `targetConfirmation`.

- [ ] **Step 1: Write failing validator and OpenAPI tests**

Assert the validator accepts the exact confirmed form:

```ts
expect(selectExchangeMatchSchema.parse({
  selectedClaimIds: [11],
  expectedVersion: 4,
  budgetConfirmation: {
    action: "increase_to_selected_total",
    confirmedBudgetMaxJpy: 24_000
  },
  targetConfirmation: {
    action: "reduce_to_selected_count",
    confirmedTargetProviderCount: 1
  }
})).toEqual(expect.objectContaining({
  budgetConfirmation: expect.objectContaining({ confirmedBudgetMaxJpy: 24_000 }),
  targetConfirmation: expect.objectContaining({ confirmedTargetProviderCount: 1 })
}));
```

Also reject unknown actions, non-positive target values, over-limit money, and extra object keys. Assert OpenAPI documents both nullable confirmation objects and the structured 409 preview schema.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/openapi.test.ts`

Expected: FAIL because the request is still exact-match-only and the preview schemas/error keys are absent.

- [ ] **Step 3: Add the strict contracts**

Normalize omitted confirmation fields to `null`:

```ts
const budgetConfirmationSchema = z.object({
  action: z.literal("increase_to_selected_total"),
  confirmedBudgetMaxJpy: z.number().int().positive().max(1_000_000_000)
}).strict();

const targetConfirmationSchema = z.object({
  action: z.literal("reduce_to_selected_count"),
  confirmedTargetProviderCount: z.number().int().min(1).max(20)
}).strict();

export const selectExchangeMatchSchema = z.object({
  selectedClaimIds: uniqueClaimIds,
  expectedVersion: z.number().int().positive(),
  budgetConfirmation: budgetConfirmationSchema.nullable().optional().default(null),
  targetConfirmation: targetConfirmationSchema.nullable().optional().default(null)
}).strict();
```

Add this response type:

```ts
export interface ExchangeMatchAdjustmentPreview {
  currentVersion: number;
  selectedCount: number;
  selectedQuoteTotalJpy: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  requiredTargetProviderCount: number | null;
  requiredBudgetMaxJpy: number | null;
  requiredBudgetIncreaseJpy: number;
  requiresTargetConfirmation: boolean;
  requiresBudgetConfirmation: boolean;
}
```

Add stable error keys/codes `EXCHANGE_MATCH_TARGET_CONFIRMATION_REQUIRED` and `EXCHANGE_MATCH_BUDGET_CONFIRMATION_REQUIRED`; document that both return 409 and the same preview shape.

- [ ] **Step 4: Run GREEN**

Run the command from Step 2.

Expected: all selected contract suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/exchange-matching.validators.ts backend/src/types/exchange-matching.types.ts backend/src/constants/error-codes.ts backend/src/api/openapi.ts backend/tests/exchange-matching.validators.test.ts backend/tests/exchange-matching.routes.test.ts backend/tests/openapi.test.ts
git commit -m "feat(exchange): define matching adjustment confirmations"
```

### Task 3: Enforce preview-first adjustment semantics in the service

**Files:**
- Modify: `backend/src/services/exchange-matching.service.ts`
- Test: `backend/tests/exchange-matching.service.test.ts`

**Interfaces:**
- Consumes: locked matching record, active claims, normalized confirmation body.
- Produces: a canonical preview or an adjustment-aware `CompleteExchangeSelectionInput`.

- [ ] **Step 1: Write one failing service test per behavior**

Cover these independent cases:

```ts
it("returns a zero-write target preview when fewer providers are selected", async () => {
  await expect(select({ selectedClaimIds: [11], expectedVersion: 4 })).rejects.toMatchObject({
    message: "error.exchange.match_target_confirmation_required",
    data: expect.objectContaining({
      selectedCount: 1,
      effectiveTargetProviderCount: 2,
      requiredTargetProviderCount: 1,
      requiresTargetConfirmation: true
    })
  });
  expect(repository.completeSelection).not.toHaveBeenCalled();
});
```

Add separate tests for over-budget preview, both requirements together, exact target confirmation, exact budget confirmation, both confirmations together, an inexact number, an unnecessary confirmation, selected count above target, stale version, and a changed confirmation under the same idempotency key.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.service.test.ts`

Expected: new preview/confirmation tests FAIL against exact-only validation.

- [ ] **Step 3: Implement canonical preview and exact confirmation checks**

After locking and validating all selected active claims, compute:

```ts
const preview: ExchangeMatchAdjustmentPreview = {
  currentVersion: matching.version,
  selectedCount: exactClaims.length,
  selectedQuoteTotalJpy,
  effectiveTargetProviderCount: matching.effectiveTargetProviderCount,
  effectiveBudgetMaxJpy: matching.effectiveBudgetMaxJpy,
  requiredTargetProviderCount:
    exactClaims.length < matching.effectiveTargetProviderCount ? exactClaims.length : null,
  requiredBudgetMaxJpy:
    selectedQuoteTotalJpy > matching.effectiveBudgetMaxJpy ? selectedQuoteTotalJpy : null,
  requiredBudgetIncreaseJpy: Math.max(0, selectedQuoteTotalJpy - matching.effectiveBudgetMaxJpy),
  requiresTargetConfirmation: exactClaims.length < matching.effectiveTargetProviderCount,
  requiresBudgetConfirmation: selectedQuoteTotalJpy > matching.effectiveBudgetMaxJpy
};
```

Reject count above target before preview. Require confirmation objects if and only if their corresponding preview flag is true, and require exact equality with the server proposal. Include normalized confirmation values in the idempotency fingerprint. Pass `effectiveTargetProviderCountAfter`, `effectiveBudgetMaxJpyAfter`, and ordered adjustment descriptors to the repository.

- [ ] **Step 4: Run GREEN**

Run the command from Step 2.

Expected: service suite PASS and every rejected preview proves `completeSelection` was not called.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/exchange-matching.service.ts backend/tests/exchange-matching.service.test.ts
git commit -m "feat(exchange): require exact matching adjustments"
```

### Task 4: Persist adjustment versions and events atomically

**Files:**
- Modify: `backend/src/repositories/exchange-matching.repository.ts`
- Test: `backend/tests/exchange-matching.repository.test.ts`

**Interfaces:**
- Consumes: ordered zero-to-two adjustment descriptors followed by the existing final selection.
- Produces: `BUDGET_INCREASED`, `TARGET_REDUCED`, and `SELECTIVE_MATCHED` event chain in one transaction.

- [ ] **Step 1: Write failing repository tests**

For a command needing both changes, assert the matching update contains the confirmed effective values and a version delta of three. Assert event calls are ordered and linked:

```ts
expect(eventCreateMany).toHaveBeenCalledWith({ data: [
  expect.objectContaining({ type: "BUDGET_INCREASED", versionBefore: 4, versionAfter: 5, sequence: 5 }),
  expect.objectContaining({ type: "TARGET_REDUCED", versionBefore: 5, versionAfter: 6, sequence: 6 }),
  expect.objectContaining({ type: "SELECTIVE_MATCHED", versionBefore: 6, versionAfter: 7, sequence: 7, idempotencyKey })
] });
```

Also assert exact matching without adjustments remains a one-version/one-event command and that only the final event carries the idempotency key/fingerprint.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.repository.test.ts`

Expected: FAIL because the repository currently writes one final event and does not update effective values.

- [ ] **Step 3: Implement the minimal atomic event chain**

Extend `CompleteExchangeSelectionInput` with:

```ts
effectiveTargetProviderCountAfter: number;
effectiveBudgetMaxJpyAfter: number;
adjustments: Array<
  | { type: "budget_increased"; before: number; after: number }
  | { type: "target_reduced"; before: number; after: number }
>;
```

Use the existing conditional `updateMany` on `(status=open, version=versionBefore)`, set both effective values, and set the final version. Build version-linked events in deterministic budget-then-target-then-match order. Adjustment payloads contain only post ID, before/after amount or count, and status; the final event retains the idempotency evidence and selected claim summary. Audit metadata records the before/after effective values without address, message, telephone, email, or token data.

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-matching.service.test.ts
```

Expected: repository and service suites PASS. The guarded real-MySQL transaction and conservation proof is owned by Task 6's existing `check:exchange-selective-matching-flow` rather than a nonexistent parallel integration file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/exchange-matching.repository.ts backend/tests/exchange-matching.repository.test.ts
git commit -m "feat(exchange): persist matching adjustment events"
```

### Task 5: Add the server-preview confirmation UI in five languages

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/features/exchange/ExchangeReceivedClaims.tsx`
- Test: `src/features/exchange/api.test.ts`
- Test: `src/features/exchange/ExchangeReceivedClaims.test.tsx`

**Interfaces:**
- Consumes: `ApiClientError.data` matching `ExchangeMatchAdjustmentPreview`.
- Produces: exact target/budget confirmation panel and confirmed select payload.

- [ ] **Step 1: Write failing component tests**

Create a two-provider target with one selected claim and mock the first command as:

```ts
new ApiClientError(
  "error.exchange.match_target_confirmation_required",
  40999,
  409,
  {
    currentVersion: 6,
    selectedCount: 1,
    selectedQuoteTotalJpy: 11_000,
    effectiveTargetProviderCount: 2,
    effectiveBudgetMaxJpy: 12_000,
    requiredTargetProviderCount: 1,
    requiredBudgetMaxJpy: null,
    requiredBudgetIncreaseJpy: 0,
    requiresTargetConfirmation: true,
    requiresBudgetConfirmation: false
  }
)
```

Assert the UI renders `2 → 1`, requires an explicit confirmation click, and then calls:

```ts
selectExchangeMatching("41", {
  selectedClaimIds: [1],
  expectedVersion: 6,
  budgetConfirmation: null,
  targetConfirmation: {
    action: "reduce_to_selected_count",
    confirmedTargetProviderCount: 1
  }
}, expect.any(String));
```

Add independent tests for budget-only, both changes, preview invalidation after selection changes or server refresh, exact-match compatibility, retry-key stability per identical payload, absence of Booking/Payment actions, five-locale key completeness, and narrow-layout classes.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx`

Expected: preview-specific component tests FAIL.

- [ ] **Step 3: Implement the minimal confirmation state**

The initial submit remains available for any non-empty selection not above the effective target. On a recognized 409 preview, retain selected IDs and display only the server values. The confirmation action submits the same selected IDs and `currentVersion` with both normalized confirmation fields; any selection change, page reload, non-preview error, or newer matching payload clears the preview. A confirmed payload uses its own retry-stable idempotency key because its fingerprint differs from the initial command.

Add complete locale keys for:

```text
matchingAdjustmentTitle
matchingTargetReductionProposal
matchingBudgetIncreaseProposal
matchingBudgetIncreaseAmount
matchingAdjustmentWarning
matchingConfirmAdjustment
matchingAdjustmentChanged
```

- [ ] **Step 4: Run GREEN and Exchange regression**

Run:

```bash
npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx
npm test -- src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx
```

Expected: focused and full Exchange frontend suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/exchange/types.ts src/features/exchange/i18n.ts src/features/exchange/ExchangeReceivedClaims.tsx src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx
git commit -m "feat(exchange): confirm budget and target adjustments"
```

### Task 6: Extend guarded real-MySQL evidence and documentation

**Files:**
- Modify: `backend/scripts/check-exchange-selective-matching-flow.ts`
- Modify: `backend/tests/exchange-matching-flow-script.test.ts`
- Modify: `README.md`
- Modify: `docs/ledger.md`
- Create: `docs/verification/2026-09-02-exchange-budget-target-adjustment.md`

**Interfaces:**
- Consumes: existing rollback-only local checker and formal matching service.
- Produces: proof of zero-write previews and exact adjustment/event conservation.

- [ ] **Step 1: Write the failing checker-contract test**

Require the checker to exercise a combined confirmation in real MySQL while the focused service, repository, route, and UI suites exercise target-only and budget-only paths independently. Require the checker to report:

```ts
expect(source).toContain("adjustmentPreviewWriteFree");
expect(source).toContain("BUDGET_INCREASED");
expect(source).toContain("TARGET_REDUCED");
expect(source).toContain("adjustmentChainVersionLinked");
expect(source).toContain("walletAndHoldUnchanged");
expect(source).toContain("bookingAndFinancialCountsUnchanged");
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching-flow-script.test.ts`

Expected: FAIL because the checker only covers exact matching.

- [ ] **Step 3: Extend the rollback-contained checker and docs**

Inside the existing outer rollback transaction, use one marker Request with three claims to prove a combined missing confirmation creates no matching/event/participant/claim/audit/notification changes. Confirm the exact server values, prove the ordered budget/target/match version chain and final payload, and retain existing idempotency, privacy, time-lock, wallet/hold/ledger/reconciliation/Booking/bookedCount invariants. The target-only and budget-only branches are independently asserted by automated suites. Update README and ledger docs to mark only budget increase/target reduction complete while keeping quick/close/cancellation/Booking/payment deferred.

- [ ] **Step 4: Run GREEN and the real checker**

Run:

```bash
npm --prefix backend test -- --runInBand tests/exchange-matching-flow-script.test.ts
ENV_FILE=.env.dev npm --prefix backend run check:exchange-selective-matching-flow
```

Expected: contract test PASS; checker reports all adjustment and conservation booleans true, then rolls back and verifies zero marker residue.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/check-exchange-selective-matching-flow.ts backend/tests/exchange-matching-flow-script.test.ts README.md docs/ledger.md docs/verification/2026-09-02-exchange-budget-target-adjustment.md
git commit -m "test(exchange): verify matching adjustments"
```

### Task 7: Run release gates, browser acceptance, and local-main integration

**Files:**
- Modify only if a gate reveals an in-scope defect; each defect starts with a failing regression test.

**Interfaces:**
- Consumes: completed adjustment slice.
- Produces: fresh automated/database/browser/merge evidence; no push or deployment.

- [ ] **Step 1: Run the complete focused automated gate**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/exchange-matching.validators.test.ts tests/exchange-matching.repository.test.ts tests/exchange-matching.service.test.ts tests/exchange-matching.routes.test.ts tests/exchange-claim.repository.test.ts tests/exchange-claim.service.test.ts tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange-matching-flow-script.test.ts tests/openapi.test.ts
ENV_FILE=.env.dev npm --prefix backend run check:exchange-selective-matching-flow
npm test -- src/api/httpClient.test.ts src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx
npm run lint
npm run verify:production-build
git diff --check
```

Expected: zero failures; any intentional environment skip is reported separately and never described as passed coverage.

- [ ] **Step 2: Prove runtime ownership**

Start this worktree's backend/frontend on unused ports. Record PID, listener, `lsof -a -p <pid> -d cwd`, branch, backend `/api/v1/health`, `/api/v1/ready`, and frontend proxy origin before browser conclusions.

- [ ] **Step 3: Perform authenticated browser acceptance**

Use formal local test identities and marker-owned selective Requests to verify target-only, budget-only, and combined previews. Confirm the first command returns 409 with exact server values, the UI shows a second explicit action, the second command returns 200, reload/login preserves effective target/budget and matched participants, selected-provider privacy remains correct, and nonparticipants do not gain data. Check network, console, failed requests, and horizontal overflow at 440×956 and 320×956. Confirm no quick/close/cancellation/Booking/Payment action appears.

- [ ] **Step 4: Prove exact fixture handling and database invariants**

Delete only marker-owned browser fixtures when cleanup is explicitly safe; otherwise retain and report exact IDs without destructive cleanup. Reconcile matching events/versions, publication fee `HELD`, WalletHold active, wallet/ledger/reconciliation/Booking counts, and `ScheduleSlot.bookedCount`.

- [ ] **Step 5: Merge into local main and reverify**

Confirm feature worktree clean and local main's unrelated dirty paths unchanged. Merge the feature branch into local `main` with an explicit merge commit, then rerun the focused backend/frontend tests, build/lint, real MySQL checker, main listener ownership, health/ready, and the served frontend source check. Do not push or deploy.

- [ ] **Step 6: Pause**

Report commit IDs, merge commit, tests, database/browser evidence, retained fixtures, preserved dirty files, and explicit deferred scope. Stop before quick matching, manual close, cancellation, Booking conversion, or payment.
