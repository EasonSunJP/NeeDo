# Exchange Quick Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow eligible providers to claim Quick-mode Exchange Requests, atomically auto-match exactly the target number when their server-authoritative quote total fits the effective budget, and require an exact publisher budget confirmation when it does not.

**Architecture:** Reuse the existing `ExchangeRequestMatching`, `ExchangeMatchParticipant`, `ExchangeMatchEvent`, claim, notification, audit, schedule-conflict, and matched-booking authorities. The claim transaction remains the only creator of a Quick claim and invokes a focused quick-matching coordinator before commit; the existing matching repository supplies the common participant/terminal mutation so Selective and Quick cannot drift. A Quick budget decision stays in the existing `OPEN` matching aggregate, is derived from the locked active claims, blocks further claims at target capacity, and is resolved by a dedicated owner-only confirmation command that selects all active claims server-side.

**Tech Stack:** Node.js 22, TypeScript strict mode, Express, Prisma/MySQL, Zod, Jest/Supertest, React/TSX/Vite, Vitest.

## Global Constraints

- Work only on Quick claiming and Quick matching; manual close, half-fee settlement, appointment-state expansion, service payment, external payment, push, and deployment are outside this microstep.
- Preserve all existing Exchange fixtures and user-owned files; guarded database checks create marker-scoped rows and clean only captured IDs.
- A Quick claim uses the same provider scope, server-owned service/technician/schedule snapshot, budget bounds, soft time hold, idempotency, RBAC, and audit path as a Selective claim.
- When locked active claims reach `effectiveTargetProviderCount`, match all of them only when the exact quote total is at or below `effectiveBudgetMaxJpy`.
- When the exact quote total exceeds the budget, keep the matching aggregate `OPEN`, expose an owner-only exact decision preview, block additional claims, and never choose or rank a subset.
- The only positive publisher decision in this microstep is `increase_to_selected_total` for the exact active-claim total; declining remains a no-write state until an already-supported Request withdrawal or a later separately implemented close action.
- Quick success leaves the Request publication-fee hold unchanged and creates no `BookingOrder`, payment, wallet, ledger, or reconciliation mutation.
- Reuse `exchange:matching:read-own` and `exchange:matching:select-own` for owner read/decision; automatic matching is triggered by `exchange:claims:create` and does not create a client-side “complete Quick match” permission.
- No Prisma schema change is required: `QUICK`, `QUICK_MATCHED`, matching aggregates, Participants, Events, idempotency columns, and required indexes already exist in applied additive migrations. Schema and physical-migration tests must prove this reuse.
- Every production-code change follows RED → GREEN → REFACTOR and every endpoint remains Controller → Service → Repository.

---

## File Structure

- `backend/src/services/exchange-quick-matching.service.ts`: focused Quick threshold, exact-budget-preview, conflict revalidation, automatic completion, and owner confirmation rules.
- `backend/src/services/exchange-claim.service.ts`: admits both formal match modes and invokes the coordinator inside the existing claim transaction.
- `backend/src/services/exchange-matching.service.ts`: exposes the owner Quick budget-confirmation command while retaining Selective selection semantics.
- `backend/src/repositories/exchange-claim.repository.ts`: exposes the current transaction client through explicit matching mutation delegates; no business decisions.
- `backend/src/repositories/exchange-matching.repository.ts`: generalizes the existing terminal mutation for `selective_matched | quick_matched`, provides active-claim aggregate projection, and writes the owner decision notification.
- `backend/src/repositories/exchange.repository.ts`: computes Quick claim/read capabilities from matching status and active-claim capacity.
- `backend/src/types/exchange-matching.types.ts`: adds the owner-only Quick budget preview and `canConfirmQuickBudget` capability.
- `backend/src/validators/exchange-matching.validators.ts`: validates the exact Quick budget-confirmation body.
- `backend/src/controllers/exchange-matching.controller.ts`: forwards the validated owner command only.
- `backend/src/routes/exchange-matching.routes.ts`: adds the authenticated, idempotent, RBAC-protected confirmation route.
- `backend/src/api/openapi.ts`: publishes the request/response/error contract.
- `src/features/exchange/types.ts` and `src/features/exchange/api.ts`: mirror the formal contract and call the new route.
- `src/features/exchange/ExchangeClaimPanel.tsx`: allows Quick providers to use the existing claim form and renders matched/decision states from persisted responses.
- `src/features/exchange/ExchangeReceivedClaims.tsx`: removes Selective checkboxes for Quick, renders the server preview, and submits exact budget confirmation.
- `src/features/exchange/ExchangePostDetailPage.tsx`: routes Quick owner/provider actions into the same established panels.
- `src/features/exchange/i18n.ts`: adds complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean labels.
- `backend/scripts/check-exchange-quick-matching-flow.ts`: guarded rollback-contained MySQL proof.
- `backend/tests/*quick*` and existing Exchange suites: unit, repository, route, OpenAPI, concurrency, and checker safety coverage.
- `README.md` and `docs/ledger.md`: record only verified Quick scope and keep all remaining Exchange work explicit.

---

### Task 1: Define the Quick decision contract

**Files:**
- Modify: `backend/tests/exchange-matching.service.test.ts`
- Modify: `backend/tests/exchange-matching.repository.test.ts`
- Modify: `backend/src/types/exchange-matching.types.ts`
- Modify: `backend/src/repositories/exchange-matching.repository.ts`

**Interfaces:**
- Produces: `ExchangeQuickBudgetDecision` and `ExchangeMatchingPayload.quickBudgetDecision`.
- Produces: `viewer.canConfirmQuickBudget: boolean`.
- Produces: `ExchangeMatchingRepository.lockActiveClaims(exchangePostId)` as the only authoritative source for Quick count and quote total.

- [x] **Step 1: Write failing payload-projection tests**

Add repository/service assertions for an owner viewing an open Quick matching with two active claims totaling `31_000` against `30_000`:

```ts
expect(payload.quickBudgetDecision).toEqual({
  action: "increase_to_selected_total",
  activeClaimCount: 2,
  selectedQuoteTotalJpy: 31_000,
  effectiveBudgetMaxJpy: 30_000,
  requiredBudgetMaxJpy: 31_000,
  requiredBudgetIncreaseJpy: 1_000
});
expect(payload.viewer).toEqual({
  canSelect: false,
  canConfirmQuickBudget: true,
  canCreateBookings: false
});
```

Also assert participant/non-owner projections receive `quickBudgetDecision: null` and `canConfirmQuickBudget: false`.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-matching.repository.test.ts tests/exchange-matching.service.test.ts`

Expected: FAIL because the payload does not yet expose Quick decision state.

- [x] **Step 3: Add the exact public types and repository projection**

Add:

```ts
export interface ExchangeQuickBudgetDecision {
  action: "increase_to_selected_total";
  activeClaimCount: number;
  selectedQuoteTotalJpy: number;
  effectiveBudgetMaxJpy: number;
  requiredBudgetMaxJpy: number;
  requiredBudgetIncreaseJpy: number;
}
```

Extend `matchingInclude.exchangePost` with active-claim IDs and quote amounts. In `mapMatching`, derive the preview only when the viewer is the owner, mode is `quick`, status is `open`, active count exactly equals the effective target, and total exceeds the effective budget. Set `canSelect` only for open Selective matching and `canConfirmQuickBudget` only when the preview exists.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: 2 suites pass with zero failures.

- [x] **Step 5: Commit**

```bash
git add backend/src/types/exchange-matching.types.ts backend/src/repositories/exchange-matching.repository.ts backend/tests/exchange-matching.repository.test.ts backend/tests/exchange-matching.service.test.ts
git commit -m "feat(exchange): expose quick budget decision"
```

### Task 2: Generalize the existing atomic completion mutation

**Files:**
- Modify: `backend/tests/exchange-matching.repository.test.ts`
- Modify: `backend/src/repositories/exchange-matching.repository.ts`

**Interfaces:**
- Consumes: locked `ExchangeMatchingRecord` and `ExchangeMatchingSelectionClaim[]`.
- Produces: `completeMatch(input: CompleteExchangeMatchInput): Promise<ExchangeMatchingPayload | null>`.
- Produces: `matchEventType: "selective_matched" | "quick_matched"`, nullable event actor IDs, and a separate owner `viewerIdentityId`.

- [x] **Step 1: Write failing repository tests for Quick terminal persistence**

Assert one call with `matchEventType: "quick_matched"`:

```ts
expect(client.exchangeMatchEvent.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    type: "QUICK_MATCHED",
    actorUserId: null,
    actorIdentityId: null,
    idempotencyKey: "quick-auto:claim:302"
  })
});
expect(client.exchangePost.update).toHaveBeenCalledWith({
  where: { id: 41 },
  data: { status: "MATCHED" }
});
```

Retain the Selective test and assert it still writes `SELECTIVE_MATCHED`.

- [x] **Step 2: Run the repository test and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-matching.repository.test.ts`

Expected: FAIL because `completeSelection` hard-codes Selective event and actor fields.

- [x] **Step 3: Implement the generalized mutation**

Rename the input and method without changing lock order or Participant/claim/Post writes. Map the event type explicitly:

```ts
const databaseEventType =
  input.matchEventType === "quick_matched"
    ? ExchangeMatchEventType.QUICK_MATCHED
    : ExchangeMatchEventType.SELECTIVE_MATCHED;
```

Use `input.viewerIdentityId` only for the final owner projection. Keep all selected claims matched, all unselected active claims not selected, all `activeKey` values cleared, notification payloads redacted, and the optimistic matching update as the terminal gate.

- [x] **Step 4: Run repository and Selective service regressions**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-matching.repository.test.ts tests/exchange-matching.service.test.ts`

Expected: both suites pass and Selective behavior is unchanged.

- [x] **Step 5: Commit**

```bash
git add backend/src/repositories/exchange-matching.repository.ts backend/tests/exchange-matching.repository.test.ts backend/tests/exchange-matching.service.test.ts
git commit -m "refactor(exchange): share atomic match completion"
```

### Task 3: Auto-match inside Quick claim creation

**Files:**
- Create: `backend/src/services/exchange-quick-matching.service.ts`
- Create: `backend/tests/exchange-quick-matching.service.test.ts`
- Modify: `backend/src/services/exchange-claim.service.ts`
- Modify: `backend/src/repositories/exchange-claim.repository.ts`
- Modify: `backend/tests/exchange-claim.service.test.ts`
- Modify: `backend/tests/exchange-claim.repository.test.ts`
- Modify: `backend/src/routes/exchange-claim.routes.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Produces: `ExchangeQuickMatchingService.attemptAfterClaim(repository, input)` returning `waiting | budget_decision_required | matched`.
- Consumes: the transaction-bound repository after `claim_added` has advanced matching version.
- Produces: refreshed claim status (`active` or `matched`) from the create endpoint.

- [x] **Step 1: Write failing coordinator and claim-service tests**

Cover these independent cases:

```ts
it("keeps a quick request open below target", ...);
it("matches every locked active claim when target and budget are satisfied", ...);
it("keeps all target claims active and records one owner decision notification when over budget", ...);
it("rolls back the triggering claim when a participant or booking conflict appears", ...);
it("never invokes quick matching for selective claims", ...);
```

Assert the success input includes `selectedClaimIds` equal to every locked active claim, `unselectedClaimIds: []`, `matchEventType: "quick_matched"`, `versionBefore` equal to the post-`CLAIM_ADDED` version, a system actor (`null`), and no financial calls.

- [x] **Step 2: Run the focused service tests and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-quick-matching.service.test.ts tests/exchange-claim.service.test.ts`

Expected: FAIL because Quick claims are rejected and the coordinator does not exist.

- [x] **Step 3: Implement the coordinator with exact threshold rules**

Implement the decision core:

```ts
const activeClaims = await repository.lockActiveClaims(input.exchangePostId);
if (activeClaims.length < input.matching.effectiveTargetProviderCount) {
  return { kind: "waiting" };
}
if (activeClaims.length !== input.matching.effectiveTargetProviderCount) {
  throw quickCapacityReached();
}
const quoteTotal = activeClaims.reduce((sum, claim) => sum + claim.quoteAmountJpy, 0);
if (quoteTotal > input.matching.effectiveBudgetMaxJpy) {
  await repository.notifyQuickBudgetDecisionRequired(...);
  return { kind: "budget_decision_required", selectedQuoteTotalJpy: quoteTotal };
}
await revalidateTechniciansAndConflicts(repository, activeClaims);
return { kind: "matched", matching: await repository.completeMatch(...) };
```

The notification contains only post ID, active count, effective budget, required budget, and required increase. It contains no address, message, phone, email, token, wallet ID, or internal identity ID.

- [x] **Step 4: Admit Quick claims and invoke the coordinator before commit**

Change `assertRequestClaimable` to accept `quick | selective`. Extend the locked matching record to include match mode, owner, effective target/budget, and version. After the existing `CLAIM_ADDED` version update and claim audit, invoke the coordinator only for Quick mode, then re-read the created claim so automatic success returns `status: "matched"`.

- [x] **Step 5: Reuse the matching repository from the same transaction client**

Add explicit delegate methods on `ExchangeClaimRepository` that construct `ExchangeMatchingRepository` with the transaction-bound Prisma client. The service sees only declared repository ports; it never receives Prisma and never writes database rows directly.

- [x] **Step 6: Run service and repository tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-quick-matching.service.test.ts tests/exchange-claim.service.test.ts tests/exchange-claim.repository.test.ts tests/exchange-matching.repository.test.ts`

Expected: all suites pass.

- [x] **Step 7: Commit**

```bash
git add backend/src/services/exchange-quick-matching.service.ts backend/src/services/exchange-claim.service.ts backend/src/repositories/exchange-claim.repository.ts backend/src/routes/exchange-claim.routes.ts backend/src/server.ts backend/tests/exchange-quick-matching.service.test.ts backend/tests/exchange-claim.service.test.ts backend/tests/exchange-claim.repository.test.ts backend/tests/exchange-matching.repository.test.ts
git commit -m "feat(exchange): auto match quick claims"
```

### Task 4: Add the exact owner budget-confirmation API

**Files:**
- Modify: `backend/tests/exchange-matching.validators.test.ts`
- Modify: `backend/tests/exchange-matching.service.test.ts`
- Modify: `backend/tests/exchange-matching.routes.test.ts`
- Modify: `backend/tests/exchange-matching.openapi.test.ts`
- Modify: `backend/src/validators/exchange-matching.validators.ts`
- Modify: `backend/src/services/exchange-matching.service.ts`
- Modify: `backend/src/controllers/exchange-matching.controller.ts`
- Modify: `backend/src/routes/exchange-matching.routes.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces: `POST /api/v1/exchange/posts/:id/matching/quick/confirm-budget`.
- Consumes body: `{ expectedVersion, budgetConfirmation: { action: "increase_to_selected_total", confirmedBudgetMaxJpy } }`.
- Requires: `Idempotency-Key`, JWT, and `exchange:matching:select-own`.

- [x] **Step 1: Write failing validator/service/route/OpenAPI tests**

Assert the command rejects missing idempotency, non-owner, Selective mode, non-open/expired Request, stale version, below-target or above-target active count, no-overage confirmation, and any confirmation value other than the exact locked claim total. Assert successful/replayed commands return the same persisted matching and changed payload with the same key returns `error.exchange.match_idempotency_conflict`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-matching.validators.test.ts tests/exchange-matching.service.test.ts tests/exchange-matching.routes.test.ts tests/exchange-matching.openapi.test.ts`

Expected: FAIL because the endpoint and service method do not exist.

- [x] **Step 3: Add the strict Zod body**

```ts
export const confirmQuickExchangeBudgetSchema = z.object({
  expectedVersion: z.number().int().positive(),
  budgetConfirmation: z.object({
    action: z.literal("increase_to_selected_total"),
    confirmedBudgetMaxJpy: z.number().int().positive().max(1_000_000_000)
  }).strict()
}).strict();
```

- [x] **Step 4: Implement the owner command through the existing matching transaction**

Lock Request/matching, validate owner/mode/state/version/expiry, lock every active claim, require count exactly equal to the effective target, calculate the exact total, require an actual overage and exact confirmation, revalidate sorted technicians and time conflicts, then call `completeMatch` with one `budget_increased` adjustment followed by `quick_matched`. The event idempotency key is the request header; the payload fingerprint includes owner IDs, post ID, expected version, and exact confirmation.

- [x] **Step 5: Wire Controller, Route, OpenAPI, RBAC, and errors**

Add the route next to `/matching/select`, use the existing idempotency middleware, and document 200/400/401/403/409 envelopes plus the owner-only preview. Do not add a second matching aggregate or a new wallet endpoint.

- [x] **Step 6: Run focused and Selective regression tests**

Run the command from Step 2 plus `tests/exchange-matching.repository.test.ts`.

Expected: all suites pass and Selective selection remains green.

- [x] **Step 7: Commit**

```bash
git add backend/src/validators/exchange-matching.validators.ts backend/src/services/exchange-matching.service.ts backend/src/controllers/exchange-matching.controller.ts backend/src/routes/exchange-matching.routes.ts backend/src/api/openapi.ts backend/tests/exchange-matching.validators.test.ts backend/tests/exchange-matching.service.test.ts backend/tests/exchange-matching.routes.test.ts backend/tests/exchange-matching.openapi.test.ts backend/tests/exchange-matching.repository.test.ts
git commit -m "feat(exchange): confirm quick match budget"
```

### Task 5: Publish accurate Quick capabilities

**Files:**
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange-claim.repository.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange-claim.repository.test.ts`

**Interfaces:**
- Produces: provider `viewer.canClaim=true` for open Quick matching below capacity.
- Produces: owner `viewer.canViewClaims=true` for Quick and Selective matching.
- Produces: claim-options pagination returning zero choices when Quick capacity is already full.

- [x] **Step 1: Write failing projection and query tests**

Add cases for Quick below target, Quick exactly at target with over-budget decision pending, Quick matched, Request owner, same-user alternate identity, and Selective regression. Assert no provider sees a claim button at/after capacity and the owner continues to see the received-claims/matching panel.

- [x] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange-claim.repository.test.ts`

Expected: FAIL because current projections hard-code Selective mode.

- [x] **Step 3: Implement capacity-aware projections**

Select matching status/effective target and count active claims in `postInclude`. Set `canClaim` only when matching is open and either mode is Selective or Quick has active count below target. Allow owners to view claims for both modes. Update the claim-options SQL to accept both match modes and reject Quick rows whose active count has reached the effective target.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2.

Expected: all suites pass.

- [x] **Step 5: Commit**

```bash
git add backend/src/repositories/exchange.repository.ts backend/src/services/exchange.service.ts backend/src/repositories/exchange-claim.repository.ts backend/tests/exchange.repository.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange-claim.repository.test.ts
git commit -m "feat(exchange): publish quick claim capacity"
```

### Task 6: Connect the five-language Quick UI

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/ExchangeClaimPanel.tsx`
- Modify: `src/features/exchange/ExchangeClaimPanel.test.tsx`
- Modify: `src/features/exchange/ExchangeReceivedClaims.tsx`
- Modify: `src/features/exchange/ExchangeReceivedClaims.test.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Modify: `src/features/exchange/i18n.ts`

**Interfaces:**
- Consumes: `ExchangeMatching.quickBudgetDecision` and `viewer.canConfirmQuickBudget`.
- Produces: `confirmQuickExchangeBudget(postId, input, idempotencyKey)`.

- [x] **Step 1: Write failing API and component tests**

Cover Quick provider claim submission, matched claim rendering without withdrawal, owner received-claim cards without checkboxes, exact over-budget preview content, disabled button during request, retry reuse of the same idempotency key, stale-version refresh, successful persisted match rendering, and absence of subset controls. Test all five locale keys and 320 px/440 px class constraints.

- [x] **Step 2: Run frontend tests and verify RED**

Run: `npx vitest run src/features/exchange/api.test.ts src/features/exchange/ExchangeClaimPanel.test.tsx src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx`

Expected: FAIL because Quick claims and owner confirmation are not connected.

- [x] **Step 3: Add client types and API call**

Mirror the backend preview exactly and add:

```ts
export function confirmQuickExchangeBudget(
  postId: string,
  input: ConfirmQuickExchangeBudgetInput,
  key: string
): Promise<ExchangeMatching> {
  return httpClient.request(`/exchange/posts/${postId}/matching/quick/confirm-budget`, {
    method: "POST",
    headers: idempotencyHeaders(key),
    body: input
  });
}
```

- [x] **Step 4: Reuse the existing panels without parallel UI**

Show `ExchangeClaimPanel` whenever the server says `canClaim`, regardless of mode. In `ExchangeReceivedClaims`, branch only the interaction controls: Selective retains checkboxes and selection preview; Quick shows read-only claim cards and the server-owned exact budget decision. Confirmation sends only `expectedVersion` and the exact budget object and refreshes matching/claims after every 409 or success.

- [x] **Step 5: Add complete five-language copy**

Add labels for “Quick matching waiting”, “Target reached”, “Total quote exceeds budget”, “Increase budget to ¥X and match all”, “Budget changed; refreshed”, and the matched/failed states in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean. Authored provider messages stay unmodified.

- [x] **Step 6: Run frontend tests and build**

Run the command from Step 2, then `npm run build`.

Expected: all focused tests pass and production build exits 0.

- [x] **Step 7: Commit**

```bash
git add src/features/exchange/types.ts src/features/exchange/api.ts src/features/exchange/api.test.ts src/features/exchange/ExchangeClaimPanel.tsx src/features/exchange/ExchangeClaimPanel.test.tsx src/features/exchange/ExchangeReceivedClaims.tsx src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangePostDetailPage.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/i18n.ts
git commit -m "feat(exchange): connect quick matching UI"
```

### Task 7: Add guarded real-MySQL and concurrency proof

**Files:**
- Create: `backend/scripts/check-exchange-quick-matching-flow.ts`
- Create: `backend/tests/exchange-quick-matching-flow-script.test.ts`
- Create: `backend/tests/exchange-quick-matching.repository.integration.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `ENV_FILE=.env.dev npm --prefix backend run check:exchange-quick-matching-flow`.
- Produces: two-connection concurrency proof guarded by explicit local-only environment flags.

- [x] **Step 1: Write failing checker-safety and integration tests**

Assert the checker rejects missing `ENV_FILE`, production/staging flags, remote MySQL hosts, production-looking database names, and databases with unapplied repository migrations. Add two-connection barriers for the final two providers claiming the same Request and for owner budget confirmation racing a replay.

- [x] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-quick-matching-flow-script.test.ts tests/exchange-quick-matching.repository.integration.test.ts`

Expected: safety suite fails because the checker is absent; integration suite is skipped unless its explicit flags are present.

- [x] **Step 3: Implement marker-scoped rollback proof**

Create one below-budget Quick Request and one over-budget Quick Request through the formal service/repository chain. Prove:

```text
below budget: 2 active claims -> one MATCHED aggregate -> 2 Participants -> QUICK_MATCHED once
over budget: 2 active claims -> OPEN -> exact owner preview -> no third claim -> exact confirm -> MATCHED
```

Also assert claim/event/notification/audit counts, selected and unselected states, address privacy, participant time locks, `ScheduleSlot.bookedCount` unchanged, publication fee still `HELD`, exact Wallet/Hold/Ledger/Reconciliation baselines unchanged, zero Booking/Payment rows, idempotent replay, changed-payload conflict, concurrent single terminal winner, and captured-ID cleanup.

- [x] **Step 4: Run the guarded checker on the authorized local database**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:exchange-quick-matching-flow
RUN_EXCHANGE_QUICK_MATCHING_INTEGRATION=true ALLOW_EXCHANGE_QUICK_MATCHING_DEV_INTEGRATION=true ENV_FILE=.env.dev npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-quick-matching.repository.integration.test.ts
```

Expected: migrations up to date, checker reports both scenarios and zero residue, concurrency suite passes.

- [x] **Step 5: Commit**

```bash
git add backend/scripts/check-exchange-quick-matching-flow.ts backend/tests/exchange-quick-matching-flow-script.test.ts backend/tests/exchange-quick-matching.repository.integration.test.ts backend/package.json
git commit -m "test(exchange): verify quick matching flow"
```

### Task 8: Document, regress, and perform authenticated browser acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/ledger.md`
- Create: `docs/verification/2026-09-07-exchange-quick-matching.md`

**Interfaces:**
- Produces: exact local verification record and remaining-scope declaration.

- [x] **Step 1: Update documentation with only verified scope**

Replace “Quick matching deferred” with the exact completed behavior only after automated and database evidence exists. Keep manual matching close/half-fee, complete appointments, service payment, external payment, push, deployment, and staging explicitly deferred. State that Quick matching leaves the publication fee held and does not create Booking orders.

- [x] **Step 2: Run complete related regression**

Run all Exchange claim/matching/post/booking-conversion/cancellation unit, repository, route, OpenAPI, permission, schema, checker-safety, frontend component/API suites, followed by `npm run build` and `git diff --check`.

Expected: zero failures; environment-conditional integration tests may skip only when their explicit flags are absent.

- [x] **Step 3: Start an isolated runtime only after ownership checks**

Before starting, record listener PID, cwd, branch, backend environment file, database host/name, Redis URL, and Vite proxy target. Use non-conflicting ports if `3000/5180` belong to another worktree. Recheck listener liveness after startup and after a delay.

- [x] **Step 4: Perform authenticated real-browser acceptance**

Using persisted test accounts and the formal API/MySQL runtime, verify:

1. A Quick provider sees the correct shop, technician, service, quote bounds, and schedule card and can submit once.
2. The first claim persists and remains withdrawable while below target.
3. The final within-budget claim atomically changes both claims and matching to matched; reload preserves result and full matched privacy.
4. The over-budget Request shows the owner the exact claim count, quote total, current budget, required increase, and one “match all” confirmation; no checkbox/subset UI exists.
5. A third provider cannot claim while the owner decision is pending.
6. Exact confirmation persists one budget event then one Quick-match event; replay creates no duplicates.
7. Provider/owner/shop/technician information cards show the same persisted public IDs, names, avatars, shop, service, schedule, quote, and language across 320 px, 440 px, and desktop widths.
8. No horizontal overflow, console errors, failed API calls, mock/localStorage mutations, Booking rows, payment rows, or financial balance movement occur.

- [x] **Step 5: Reconcile database evidence and clean only browser fixtures**

Query the exact captured post/claim/matching/participant/event/notification/audit IDs and wallet/hold/ledger/reconciliation/Booking counts. Delete only acceptance fixtures, then prove zero marker residue and unchanged protected baselines.

- [x] **Step 6: Commit the verified record**

```bash
git add README.md docs/ledger.md docs/verification/2026-09-07-exchange-quick-matching.md
git commit -m "docs(exchange): record quick matching acceptance"
```

- [ ] **Step 7: Integrate only after the finishing gate**

Run the full related suite again on the final branch tip, inspect `main` for movement, merge/rebase safely without force push, rerun the same tests on the merged `main`, and stop without push, deployment, staging migration, or starting the next Exchange microstep.
