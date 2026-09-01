# Exchange Selective Exact Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one formal selective Request matching slice where the owner selects exactly the target number of active claims within the current budget and the server atomically persists the match, participant time locks, claim/post terminal states, notifications, audit, privacy projection, and high-fidelity UI.

**Architecture:** Add a one-to-one `ExchangeRequestMatching` aggregate, immutable `ExchangeMatchParticipant` reservation snapshots, and append-only `ExchangeMatchEvent`. A new layered matching route locks Request → Matching → claims → technicians, validates the owner/version/headcount/budget/schedule invariants, and commits all success evidence without creating Booking, Payment, or ledger movement. Existing Exchange projection and claim/Booking conflict checks consume Participant locks.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma 7/MySQL 8, Zod, OpenAPI, Jest/Supertest, React 19, Vite/Vitest, existing NeeDo i18n and formal `/api/v1` client.

## Global Constraints

- Work from isolated detached worktree baseline `ef2a31e9`; preserve unrelated work and never push or deploy.
- Implement only selective exact matching: selected count must equal the published target and selected quote total must remain within the initial effective budget.
- Do not implement quick matching, budget augmentation, target reduction, manual matching close, bilateral cancellation, BookingOrder creation, Payment, IM conversation creation, or any wallet/ledger mutation.
- Matching success leaves the existing Request publication fee and WalletHold in `HELD/active` with identical balances and ledger counts.
- Do not add mock, localStorage business state, fake API, placeholder, disabled replacement UI, or hard-coded actor authority.
- All write APIs use Zod, OpenAPI, RBAC, idempotency, optimistic versioning, audit, and stable application errors.
- All relations use Restrict, all business tables include standard timestamps and soft-delete columns, and list APIs remain paginated.
- Exchange never returns telephone or email; only the owner and matched participants may see every filled address line and publisher identity.
- Visible copy is complete in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean; authored claim messages remain unchanged.
- Real database/browser fixtures must be marker-owned, local-only, and exactly cleaned without deleting existing test data.

---

### Task 1: Add matching persistence and migration contracts

**Files:**
- Create: `backend/prisma/migrations/20260901232000_exchange_selective_exact_matching/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Test: `backend/tests/exchange-matching-schema.test.ts`

**Interfaces:**
- Consumes: existing `ExchangePost`, `ExchangeDemand`, `ExchangeClaim`, `ScheduleSlot`, `Notification`, and `AuditLog` relations.
- Produces: Prisma enums `ExchangeMatchingStatus`, `ExchangeMatchEventType`; models `ExchangeRequestMatching`, `ExchangeMatchParticipant`, `ExchangeMatchEvent`; post statuses `MATCHED/CLOSED`; claim statuses `MATCHED/NOT_SELECTED/MATCHING_CLOSED`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
test("defines exact matching aggregates and Restrict evidence", () => {
  expect(schema).toContain("model ExchangeRequestMatching");
  expect(schema).toContain("model ExchangeMatchParticipant");
  expect(schema).toContain("model ExchangeMatchEvent");
  expect(schema).toContain("activeReservationKey");
  expect(migration).toContain("exchange_request_matchings");
  expect(migration).toContain("exchange_match_participants");
  expect(migration).toContain("exchange_match_events");
  expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
});
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching-schema.test.ts`  
Expected: FAIL because the migration and models do not exist.

- [ ] **Step 3: Add the minimal schema and additive SQL**

```prisma
model ExchangeRequestMatching {
  id                           Int                    @id @default(autoincrement())
  exchangePostId               Int                    @unique @map("exchange_post_id")
  status                       ExchangeMatchingStatus @default(OPEN)
  effectiveTargetProviderCount Int                    @map("effective_target_provider_count")
  effectiveBudgetMaxJpy        Int                    @map("effective_budget_max_jpy")
  selectedQuoteTotalJpy        Int                    @default(0) @map("selected_quote_total_jpy")
  version                      Int                    @default(1)
  matchedAt                    DateTime?              @map("matched_at")
  closedAt                     DateTime?              @map("closed_at")
  createdAt                    DateTime               @default(now()) @map("created_at")
  updatedAt                    DateTime               @updatedAt @map("updated_at")
  deletedAt                    DateTime?              @map("deleted_at")
  exchangePost                 ExchangePost           @relation(fields: [exchangePostId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  participants                 ExchangeMatchParticipant[]
  events                       ExchangeMatchEvent[]
  @@index([status, updatedAt])
  @@index([deletedAt])
  @@map("exchange_request_matchings")
}
```

The migration backfills every non-deleted Demand. `effective_budget_max_jpy` is `budget_max_jpy` for total mode and `budget_max_jpy * target_provider_count` for per-provider mode. It adds the three matching permissions and default owner grants without applying unrelated pending migrations.

- [ ] **Step 4: Run GREEN and Prisma validation/generation**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching-schema.test.ts && npm --prefix backend run prisma:generate`  
Expected: PASS and generated client success.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901232000_exchange_selective_exact_matching/migration.sql backend/tests/exchange-matching-schema.test.ts
git commit -m "feat(exchange): add selective matching persistence"
```

### Task 2: Add typed API, validation, RBAC, route, and OpenAPI contracts

**Files:**
- Create: `backend/src/types/exchange-matching.types.ts`
- Create: `backend/src/validators/exchange-matching.validators.ts`
- Create: `backend/src/controllers/exchange-matching.controller.ts`
- Create: `backend/src/routes/exchange-matching.routes.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/exchange-matching.validators.test.ts`
- Test: `backend/tests/exchange-matching.routes.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedAccessContext`, `AuthRequestContext`, existing exchange idempotency header schema, authorize/validate middleware.
- Produces: `GET /api/v1/exchange/posts/:id/matching`; `POST /api/v1/exchange/posts/:id/matching/select`; permissions `exchange:matching:read-own` and `exchange:matching:select-own`.

- [ ] **Step 1: Write failing validator and route tests**

```ts
expect(selectExchangeMatchSchema.parse({ selectedClaimIds: [9, 4], expectedVersion: 3 }))
  .toEqual({ selectedClaimIds: [9, 4], expectedVersion: 3 });
expect(() => selectExchangeMatchSchema.parse({ selectedClaimIds: [9, 9], expectedVersion: 3 }))
  .toThrow();
expect(openapi.paths["/api/v1/exchange/posts/{id}/matching/select"].post["x-permission"])
  .toBe("exchange:matching:select-own");
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/openapi.test.ts`  
Expected: FAIL on missing schema/route/OpenAPI path.

- [ ] **Step 3: Add strict contracts**

```ts
export const selectExchangeMatchSchema = z.object({
  selectedClaimIds: z.array(z.number().int().positive()).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  expectedVersion: z.number().int().positive()
}).strict();

export interface ExchangeMatchingPayload {
  exchangePostId: number;
  status: "open" | "matched" | "closed";
  version: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  selectedQuoteTotalJpy: number;
  matchedAt: string | null;
  participants: ExchangeMatchParticipantPayload[];
}
```

`ExchangeMatchingController` only parses and delegates. The select route requires `Idempotency-Key`, owner RBAC, and returns 200 for both first success and idempotent replay.

- [ ] **Step 4: Run GREEN**

Run: same command as Step 2.  
Expected: all selected suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/tests/exchange-matching.validators.test.ts backend/tests/exchange-matching.routes.test.ts backend/tests/openapi.test.ts
git commit -m "feat(exchange): define selective matching API"
```

### Task 3: Implement exact-match repository and service with TDD

**Files:**
- Create: `backend/src/repositories/exchange-matching.repository.ts`
- Create: `backend/src/services/exchange-matching.service.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/exchange-matching.repository.test.ts`
- Test: `backend/tests/exchange-matching.service.test.ts`
- Test: `backend/tests/exchange-matching.repository.integration.test.ts`

**Interfaces:**
- Consumes: `ExchangeActorLookup/Record`, Request/claim rows, audit mapping, Notification table.
- Produces: `ExchangeMatchingService.getMatching()` and `selectExactMatch(access, postId, body, key, context)`.

- [ ] **Step 1: Write failing service behavior tests**

```ts
test("matches exactly the target within budget and rejects stale commands", async () => {
  repository.lockMatching.mockResolvedValue(openMatching({ version: 4, target: 2, budget: 20000 }));
  repository.lockActiveClaims.mockResolvedValue([activeClaim(11, 9000), activeClaim(12, 10000)]);
  const result = await service.selectExactMatch(ownerAccess, 41, {
    selectedClaimIds: [11, 12], expectedVersion: 4
  }, "match-key-00000001", requestContext);
  expect(result.status).toBe("matched");
  expect(repository.completeExactMatch).toHaveBeenCalledWith(expect.objectContaining({
    selectedClaimIds: [11, 12], selectedQuoteTotalJpy: 19000
  }));
});
```

Add individual tests for non-owner 404/403, non-selective Request, wrong count, over-budget, cross-Request claim, inactive claim, duplicate IDs, stale version, schedule conflict, idempotent replay, changed-payload conflict, and unique-race replay.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.service.test.ts tests/exchange-matching.repository.test.ts`  
Expected: FAIL because repository/service are missing.

- [ ] **Step 3: Implement minimal transaction authority**

```ts
return repository.runInTransaction(async (tx) => {
  const replay = await tx.findEventByIdempotencyKey(idempotencyKey);
  if (replay) return unwrapReplay(replay, fingerprint);
  const request = await tx.lockOwnedSelectiveRequest(postId, actor.ownerIdentityId ?? actor.identityId);
  const matching = await tx.lockMatching(postId);
  assertOpenVersion(request, matching, input.expectedVersion, now);
  const claims = await tx.lockActiveClaims(postId, [...input.selectedClaimIds].sort((a, b) => a - b));
  assertExactTargetAndBudget(claims, matching);
  await tx.lockTechnicians([...new Set(claims.map((claim) => claim.technicianProfileId))].sort((a, b) => a - b));
  await assertNoBookingOrParticipantConflict(tx, claims);
  return tx.completeExactMatch({ request, matching, claims, idempotencyKey, fingerprint, actor, context, now });
});
```

`completeExactMatch` creates Participant rows, marks selected claims `MATCHED`, all other active claims `NOT_SELECTED`, clears every claim active key, changes Request/Matching to matched, increments version once, writes one `SELECTIVE_MATCHED` event, one audit, selected success notifications and loser notifications. No wallet or booking call is available to this service.

- [ ] **Step 4: Run GREEN and real-concurrency integration test**

Run: `npm --prefix backend test -- --runInBand tests/exchange-matching.service.test.ts tests/exchange-matching.repository.test.ts`  
Then: `RUN_EXCHANGE_MATCHING_INTEGRATION=true ALLOW_EXCHANGE_MATCHING_DEV_INTEGRATION=true ENV_FILE=.env.dev npm --prefix backend test -- --runTestsByPath tests/exchange-matching.repository.integration.test.ts --runInBand`  
Expected: unit/repository suites PASS; real MySQL test proves two simultaneous owner commands produce one matched aggregate and one terminal event.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/exchange-matching.repository.ts backend/src/services/exchange-matching.service.ts backend/src/server.ts backend/src/app.ts backend/tests/exchange-matching*.test.ts
git commit -m "feat(exchange): complete exact selective matching"
```

### Task 4: Preserve matching version and participant locks across existing flows

**Files:**
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/repositories/exchange-claim.repository.ts`
- Modify: `backend/src/services/exchange-claim.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Test: `backend/tests/exchange-claim.repository.test.ts`
- Test: `backend/tests/exchange-claim.service.test.ts`
- Test: `backend/tests/booking.repository.test.ts`
- Test: `backend/tests/exchange.service.test.ts`

**Interfaces:**
- Consumes: matching aggregate and Participant active reservation rows.
- Produces: version increment/event on claim create/withdraw; Request withdrawal/expiry closes OPEN matching; claim and Booking overlap checks include Participant locks.

- [ ] **Step 1: Write failing regression tests**

```ts
expect(sqlForClaimOptions).toContain("exchange_match_participants");
expect(await repository.hasOverlappingMatchParticipant(technicianId, start, end)).toBe(true);
expect(bookingConflictWhere).toIncludeMatchedParticipantOverlap();
```

Also assert Request withdrawal/expiry never rewrites a MATCHED Request and does not release/capture its held publication fee through the pre-match terminal path.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-claim.repository.test.ts tests/exchange-claim.service.test.ts tests/booking.repository.test.ts tests/exchange.service.test.ts`  
Expected: new Participant-lock assertions FAIL.

- [ ] **Step 3: Extend the existing authorities**

Add Participant `NOT EXISTS` overlap clauses to options and booking conflict queries. Claim create/withdraw updates the OPEN matching version and appends the corresponding event in the same transaction. Publication creates matching; Request withdrawal/expiry closes only OPEN matching while preserving their existing full capture/release rules.

- [ ] **Step 4: Run GREEN**

Run: same command as Step 2.  
Expected: all selected regression suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories backend/src/services backend/tests
git commit -m "fix(exchange): enforce matched participant reservations"
```

### Task 5: Add matched privacy projection and claim terminal vocabulary

**Files:**
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/types/exchange-claim.types.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/repositories/exchange-claim.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/exchange.repository.test.ts`
- Test: `backend/tests/exchange.service.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: Participant relation by current owner identity.
- Produces: post/claim statuses `matched/not_selected`; `viewer.canSelectMatch`; matched participant full address/publisher projection.

- [ ] **Step 1: Write failing privacy tests**

```ts
expect(projectPost(matchedParticipant).demand?.address).toMatchObject({
  line1: "A1", line2: "A2", line3: "A3", disclosure: "matched_participant"
});
expect(projectPost(losingClaimant).demand?.address).toMatchObject({ line2: null, line3: null });
expect(JSON.stringify(projectPost(matchedParticipant))).not.toMatch(/phone|email/i);
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/openapi.test.ts`  
Expected: matched participant still receives the general projection.

- [ ] **Step 3: Implement server-side relationship projection**

The repository includes only a boolean/count proving that the current identity has a non-deleted Participant for this Request. It never returns all participants through the post endpoint. Owner or matched participant receives complete address and publisher; other viewers retain current projection.

- [ ] **Step 4: Run GREEN**

Run: same command as Step 2.  
Expected: privacy and OpenAPI suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types backend/src/repositories/exchange.repository.ts backend/src/repositories/exchange-claim.repository.ts backend/src/services/exchange.service.ts backend/src/api/openapi.ts backend/tests
git commit -m "feat(exchange): project matched participant access"
```

### Task 6: Upgrade the high-fidelity received-claims UI

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/features/exchange/ExchangeReceivedClaims.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Test: `src/features/exchange/api.test.ts`
- Test: `src/features/exchange/ExchangeReceivedClaims.test.tsx`
- Test: `src/features/exchange/ExchangePostDetailPage.test.tsx`

**Interfaces:**
- Consumes: matching read/select API and `viewer.canSelectMatch`.
- Produces: exact-selection UI and matched state; no quick/adjust/close/booking/payment controls.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(screen.getByText("0 / 2")).toBeTruthy();
await user.click(screen.getByRole("checkbox", { name: /provider a/i }));
await user.click(screen.getByRole("checkbox", { name: /provider b/i }));
expect(screen.getByText("¥19,000 / ¥20,000")).toBeTruthy();
await user.click(screen.getByRole("button", { name: "完成匹配" }));
expect(selectExchangeMatch).toHaveBeenCalledWith("41", {
  selectedClaimIds: [11, 12], expectedVersion: 4
}, expect.any(String));
```

Add tests for disabled submit until exact count, over-budget server error, retry key retention, success refresh, terminal claim labels, five-language keys, 320px-friendly `min-w-0`, and absence of booking/payment actions.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx`  
Expected: FAIL because matching client/UI do not exist.

- [ ] **Step 3: Implement the minimal high-fidelity decision UI**

Use the current received-claims cards and tokens. Load claims plus matching state, keep selected IDs in component state, show exact count/quote totals, retain one idempotency key for identical retry, submit the server command, and replace the decision controls with persisted matched participants on success.

- [ ] **Step 4: Run GREEN and Exchange frontend regression**

Run: command from Step 2, then `npm test -- src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx`  
Expected: selected and existing Exchange suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx
git commit -m "feat(exchange): add selective matching decision UI"
```

### Task 7: Add guarded real-MySQL acceptance and documentation

**Files:**
- Create: `backend/scripts/check-exchange-selective-matching-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/ledger.md`
- Create: `docs/verification/2026-09-01-exchange-selective-exact-matching.md`

**Interfaces:**
- Consumes: formal repository/service and local-only environment guard.
- Produces: `npm --prefix backend run check:exchange-selective-matching-flow`.

- [ ] **Step 1: Implement a rollback-contained checker**

The checker refuses production/staging flags, non-local MySQL hosts, and production-looking database names. Inside one transaction it creates marker-owned exact identities, Request, held financial snapshot, two active claims and schedules; invokes the real matching service; asserts Participant/Event/notifications/audit, claim/post states, address privacy, wallet/hold/ledger/reconciliation/Booking/bookedCount invariants; tests idempotent replay and changed payload; rolls back the entire fixture transaction.

- [ ] **Step 2: Run the checker**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:exchange-selective-matching-flow`  
Expected: PASS with exact invariants and transaction rollback; no persistent fixture count delta.

- [ ] **Step 3: Update documentation with exact current capability and deferred scope**

README must state selective exact matching is available and keep quick, budget addition, target reduction, close, booking and payment explicitly deferred. Ledger docs must state successful matching leaves the publication fee held.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/check-exchange-selective-matching-flow.ts backend/package.json README.md docs/ledger.md docs/verification/2026-09-01-exchange-selective-exact-matching.md
git commit -m "test(exchange): verify selective exact matching flow"
```

### Task 8: Run full gates and real browser acceptance

**Files:**
- Modify only if a failing gate reveals an in-scope defect; use a new failing regression test before each fix.

**Interfaces:**
- Consumes: completed selective exact matching slice.
- Produces: fresh verification evidence only; no push/deploy/merge.

- [ ] **Step 1: Prove listener ownership before browser work**

Start backend/frontend on unused ports with this worktree's ignored `.env.dev`. Record listener PID, `lsof -a -p <pid> -d cwd`, detached HEAD, backend `/api/v1/health`, `/api/v1/ready`, and frontend proxy origin.

- [ ] **Step 2: Run backend gates**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/exchange-matching-schema.test.ts tests/exchange-matching.validators.test.ts tests/exchange-matching.repository.test.ts tests/exchange-matching.service.test.ts tests/exchange-matching.routes.test.ts tests/exchange-claim.repository.test.ts tests/exchange-claim.service.test.ts tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/openapi.test.ts
ENV_FILE=.env.dev npm --prefix backend run check:exchange-selective-matching-flow
```

Expected: zero failures; any environment-conditional skip is reported separately.

- [ ] **Step 3: Run frontend and production gates**

```bash
npm test -- src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx
npm run lint
npm run verify:production-build
```

Expected: zero failures and bundle audit within current budgets.

- [ ] **Step 4: Perform authenticated browser acceptance**

Using formal local test accounts, publish or use a marker-owned selective Request with exactly two active claims. As owner, select both, complete matching, refresh, log out/in, and confirm persisted matched state. As selected provider, confirm full filled address and publisher identity; as losing/nonparticipant identity, confirm private lines and identity remain hidden. Inspect network responses, console, 440×956 and 320×956 horizontal overflow, and verify no Booking/Payment action appears.

- [ ] **Step 5: Prove exact cleanup and final scope**

Clean only browser-created marker fixtures through captured IDs or a deliberately rolled-back transaction. Requery marker residue, wallet/hold/ledger/reconciliation/Booking counts, and `git status --short`. Stop after reporting; do not begin budget, reduction, quick, close, cancellation, appointment, or payment work.
