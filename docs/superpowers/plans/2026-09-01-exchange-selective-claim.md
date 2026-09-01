# Exchange Selective Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one formal, persisted, concurrency-safe selective-mode Exchange claim slice with real schedule eligibility, provider time holds, withdrawal, owner visibility, and high-fidelity browser acceptance.

**Architecture:** Add a focused Exchange Claim module alongside the existing Exchange publication module. `ExchangeClaimService` owns identity, budget and state decisions; `ExchangeClaimRepository` owns Prisma access and transaction locks while reusing `TechnicianShopAffiliation`, `Service`/`TechnicianService`, `ScheduleSlot`, `BookingOrder`, `AuditLog`, and the current Request terminal transaction. The existing detail page composes new claim components and never creates Match, BookingOrder, Payment, ledger movement, localStorage state, or fake success.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Node.js 22, Express, Zod, Prisma 7, MySQL 8, Jest, Supertest, OpenAPI.

## Global Constraints

- Execute only the selective-mode claim microstep approved in `docs/superpowers/specs/2026-09-01-exchange-selective-claim-design.md`.
- Preserve the formal high-fidelity Exchange UI and all existing Exchange database/API/privacy behavior.
- Do not add mock, demo, placeholder, fake API, fake payment, Match, BookingOrder or Payment creation.
- Every write uses `/api/v1`, Zod, RBAC, audit, a database transaction and stable error keys.
- Every list response is paginated and filters `deletedAt IS NULL`.
- Use TDD for every production-code change: failing test, observed failure, minimal implementation, observed pass.
- Do not modify unrelated dirty files, push, deploy or trigger a real payment.
- Browser acceptance must use a formal backend, real local database and real test-account identities.

---

## File Map

**New backend files**

- `backend/src/types/exchange-claim.types.ts`: API payloads and claim states.
- `backend/src/validators/exchange-claim.validators.ts`: params, pagination and create-body schemas.
- `backend/src/repositories/exchange-claim.repository.ts`: option projection, row locks, overlap checks and claim persistence.
- `backend/src/services/exchange-claim.service.ts`: authorization, state machine, budget validation and audit orchestration.
- `backend/src/controllers/exchange-claim.controller.ts`: request/response adaptation only.
- `backend/src/routes/exchange-claim.routes.ts`: authentication, permission and validation middleware.
- `backend/prisma/migrations/20260901100000_exchange_selective_claim/migration.sql`: table, indexes, checks, foreign keys and permissions.
- `backend/tests/exchange-claim-schema.test.ts`: schema/migration/RBAC contract.
- `backend/tests/exchange-claim.validators.test.ts`: Zod contract.
- `backend/tests/exchange-claim.repository.test.ts`: query scope and mutation outcome tests.
- `backend/tests/exchange-claim.service.test.ts`: business/state tests.
- `backend/tests/exchange-claim.routes.test.ts`: authenticated API and RBAC tests.
- `backend/tests/exchange-claim.openapi.test.ts`: OpenAPI path and permission tests.
- `backend/tests/exchange-claim.repository.integration.test.ts`: local MySQL duplicate/overlap transaction proof.
- `backend/scripts/check-exchange-selective-claim-flow.ts`: formal local database acceptance with exact cleanup.
- `src/features/exchange/ExchangeClaimPanel.tsx`: provider option selection, submit and own-claim withdrawal UI.
- `src/features/exchange/ExchangeClaimPanel.test.tsx`: provider UI behavior.
- `src/features/exchange/ExchangeReceivedClaims.tsx`: Request-owner paginated received-claim list.
- `src/features/exchange/ExchangeReceivedClaims.test.tsx`: owner list behavior.

**Modified backend files**

- `backend/prisma/schema.prisma`: claim enum/model and relations.
- `backend/src/constants/error-codes.ts`: stable claim error codes.
- `backend/src/constants/permissions.constants.ts`: permission definitions and role assignment.
- `backend/src/types/exchange.types.ts`: `viewer.canClaim` and `viewer.canViewClaims`.
- `backend/src/repositories/exchange.repository.ts`: terminal claim cancellation and viewer mapping support.
- `backend/src/services/exchange.service.ts`: viewer capability decoration and terminal claim audit.
- `backend/src/api/openapi.ts`: schemas and five claim paths.
- `backend/src/app.ts`: optional claim-service dependency and router registration.
- `backend/src/server.ts`: production construction of the claim service.
- `backend/tests/exchange.repository.test.ts`: terminal cancellation and viewer fixtures.
- `backend/tests/exchange.service.test.ts`: viewer flags and terminal cancellation.
- `backend/tests/exchange-post-expiry.worker.test.ts`: expiry releases active claims through the service.
- Existing Exchange fixture tests: extend `viewer` with the two new boolean fields.

**Modified frontend files**

- `src/features/exchange/types.ts`: claim types, option page and viewer flags.
- `src/features/exchange/api.ts`: claim read/write functions.
- `src/features/exchange/api.test.ts`: endpoint and idempotency headers.
- `src/features/exchange/ExchangePostDetailPage.tsx`: compose real claim components into the current layout.
- `src/features/exchange/ExchangePostDetailPage.test.tsx`: selective provider and owner entry behavior.
- `src/features/exchange/i18n.ts`: five-language claim copy.
- `src/pages/mobile/NeedoRoutePages.test.tsx`: replace the obsolete assertion that forbids claim UI with formal-boundary assertions.

### Task 1: Persist Claim and RBAC Contracts

**Files:**
- Create: `backend/tests/exchange-claim-schema.test.ts`
- Create: `backend/prisma/migrations/20260901100000_exchange_selective_claim/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/constants/permissions.constants.ts`

**Interfaces:**
- Produces: Prisma `ExchangeClaimStatus`, `ExchangeClaim`, relation fields, and five permission constants consumed by all later tasks.

- [ ] **Step 1: Write the failing schema and permission test**

```ts
expect(enumBlock("ExchangeClaimStatus")).toMatch(/ACTIVE\s+@map\("active"\)/);
expect(modelBlock("ExchangeClaim")).toMatch(/activeKey\s+String\?\s+@unique/);
expect(modelBlock("ExchangeClaim")).toMatch(/scheduleSlotId\s+Int/);
expect(migration).toContain("exchange_claims_exactly_one_service_ref");
expect(EXCHANGE_PERMISSIONS).toMatchObject({
  claimOptionList: "exchange:claim-options:list",
  claimCreate: "exchange:claims:create",
  claimReadOwn: "exchange:claims:read-own",
  claimListOwnedRequest: "exchange:claims:list-owned-request",
  claimWithdrawOwn: "exchange:claims:withdraw-own"
});
```

- [ ] **Step 2: Run the schema test and observe the expected failure**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim-schema.test.ts`  
Expected: FAIL because `ExchangeClaimStatus`, `ExchangeClaim`, migration and permission keys do not exist.

- [ ] **Step 3: Add the Prisma enum, model and relations**

Use these exact state names and uniqueness semantics:

```prisma
enum ExchangeClaimStatus {
  ACTIVE            @map("active")
  WITHDRAWN         @map("withdrawn")
  REQUEST_WITHDRAWN @map("request_withdrawn")
  REQUEST_EXPIRED   @map("request_expired")

  @@map("exchange_claim_status")
}

model ExchangeClaim {
  id                       Int                 @id @default(autoincrement())
  exchangePostId           Int                 @map("exchange_post_id")
  claimantUserId           Int                 @map("claimant_user_id")
  claimantIdentityId       Int                 @map("claimant_identity_id")
  shopId                   Int                 @map("shop_id")
  technicianProfileId      Int                 @map("technician_profile_id")
  serviceId                Int?                @map("service_id")
  technicianServiceId      Int?                @map("technician_service_id")
  scheduleSlotId           Int                 @map("schedule_slot_id")
  quoteAmountJpy           Int                 @map("quote_amount_jpy")
  currency                 String              @default("JPY") @db.VarChar(3)
  message                  String?             @db.VarChar(1000)
  status                   ExchangeClaimStatus @default(ACTIVE)
  activeKey                String?             @unique(map: "exchange_claims_active_key_key") @map("active_key") @db.VarChar(191)
  idempotencyKey           String              @unique(map: "exchange_claims_idempotency_key_key") @map("idempotency_key") @db.VarChar(191)
  payloadFingerprint       String              @map("payload_fingerprint") @db.Char(64)
  withdrawnAt              DateTime?           @map("withdrawn_at")
  terminalAt               DateTime?           @map("terminal_at")
  createdAt                DateTime             @default(now()) @map("created_at")
  updatedAt                DateTime             @updatedAt @map("updated_at")
  deletedAt                DateTime?            @map("deleted_at")

  exchangePost      ExchangePost      @relation(fields: [exchangePostId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  claimantUser      User              @relation(fields: [claimantUserId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  claimantIdentity  UserIdentity      @relation(fields: [claimantIdentityId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  shop              Shop              @relation(fields: [shopId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  technicianProfile TechnicianProfile @relation(fields: [technicianProfileId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  service           Service?          @relation(fields: [serviceId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  technicianService TechnicianService? @relation(fields: [technicianServiceId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  scheduleSlot      ScheduleSlot      @relation(fields: [scheduleSlotId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@index([exchangePostId, status, createdAt], map: "exchange_claims_post_status_created_idx")
  @@index([claimantIdentityId, createdAt], map: "exchange_claims_identity_created_idx")
  @@index([technicianProfileId, status, deletedAt], map: "exchange_claims_technician_status_deleted_idx")
  @@index([technicianProfileId, createdAt], map: "exchange_claims_technician_created_idx")
  @@index([shopId, createdAt], map: "exchange_claims_shop_created_idx")
  @@index([scheduleSlotId], map: "exchange_claims_schedule_slot_idx")
  @@index([deletedAt], map: "exchange_claims_deleted_idx")
  @@map("exchange_claims")
}
```

- [ ] **Step 4: Add the migration and RBAC seed SQL**

Create the table with the schema above, then add both checks:

```sql
CONSTRAINT `exchange_claims_exactly_one_service_ref`
  CHECK ((`service_id` IS NULL) <> (`technician_service_id` IS NULL)),
CONSTRAINT `exchange_claims_active_key_matches_status`
  CHECK ((`status` = 'active' AND `active_key` IS NOT NULL)
      OR (`status` <> 'active' AND `active_key` IS NULL))
```

Insert all five permissions into `permissions`, assign provider permissions to `merchant_owner`, `merchant_staff`, `technician`, and assign `exchange:claims:list-owned-request` to `customer` and `merchant_owner`. Use the repository's existing `INSERT ... SELECT` role-permission pattern and keep every identifier at most 64 characters.

- [ ] **Step 5: Add permission constants and role arrays**

```ts
export const EXCHANGE_PERMISSIONS = {
  // existing keys remain unchanged
  claimOptionList: "exchange:claim-options:list",
  claimCreate: "exchange:claims:create",
  claimReadOwn: "exchange:claims:read-own",
  claimListOwnedRequest: "exchange:claims:list-owned-request",
  claimWithdrawOwn: "exchange:claims:withdraw-own"
} as const;
```

- [ ] **Step 6: Generate Prisma and run schema tests**

Run: `cd backend && npm run prisma:generate`  
Expected: Prisma client generation succeeds.  
Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim-schema.test.ts tests/exchange-permissions.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit the independently reviewable database contract**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901100000_exchange_selective_claim/migration.sql backend/src/constants/permissions.constants.ts backend/tests/exchange-claim-schema.test.ts backend/tests/exchange-permissions.test.ts
git commit -m "feat(exchange): add selective claim persistence contract"
```

### Task 2: Define Claim Types, Validation and Stable Errors

**Files:**
- Create: `backend/src/types/exchange-claim.types.ts`
- Create: `backend/src/validators/exchange-claim.validators.ts`
- Create: `backend/tests/exchange-claim.validators.test.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/types/exchange.types.ts`

**Interfaces:**
- Produces: `ExchangeClaimPayload`, `ExchangeClaimOptionPayload`, `ExchangeClaimPage`, `ExchangeClaimOptionPage`, `CreateExchangeClaimBody`, `ExchangeClaimListQuery`, and two viewer capability flags.

`backend/src/types/exchange-claim.types.ts` imports `PaginatedResponse` from `../utils/pagination`; `backend/src/validators/exchange-claim.validators.ts` imports `z` from `zod`.

- [ ] **Step 1: Write failing validator tests**

```ts
expect(createExchangeClaimSchema.parse({ scheduleSlotId: 91, quoteAmountJpy: 15000 })).toEqual({
  scheduleSlotId: 91,
  quoteAmountJpy: 15000,
  message: null
});
expect(() => createExchangeClaimSchema.parse({ scheduleSlotId: 0, quoteAmountJpy: 0 })).toThrow();
expect(exchangeClaimListQuerySchema.parse({ page: "2", page_size: "20" })).toEqual({
  page: 2,
  page_size: 20
});
```

- [ ] **Step 2: Run the validator test and observe missing exports**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.validators.test.ts`  
Expected: FAIL because the claim validator module does not exist.

- [ ] **Step 3: Add exact Zod schemas**

```ts
export const createExchangeClaimSchema = z.object({
  scheduleSlotId: z.coerce.number().int().positive(),
  quoteAmountJpy: z.coerce.number().int().positive().max(1_000_000_000),
  message: z.string().trim().max(1_000).nullable().optional().default(null)
}).strict();

export const exchangeClaimListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  shop_id: z.coerce.number().int().positive().optional(),
  technician_profile_id: z.coerce.number().int().positive().optional(),
  service_ref: z.string().regex(/^(?:shop|technician):[1-9]\d*$/u).optional()
}).strict();

export const exchangeClaimIdParamSchema = z.object({
  claimId: z.coerce.number().int().positive()
}).strict();
```

- [ ] **Step 4: Add exact API payload shapes**

```ts
export type ExchangeClaimStatus =
  | "active"
  | "withdrawn"
  | "request_withdrawn"
  | "request_expired";

export interface ExchangeClaimOptionPayload {
  scheduleSlotId: number;
  shop: { id: number; name: string };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: `shop:${number}` | `technician:${number}`; name: string; durationMinutes: number };
  startsAt: string;
  endsAt: string;
}

export interface ExchangeClaimPayload {
  id: number;
  exchangePostId: number;
  status: ExchangeClaimStatus;
  provider: { publicId: string; displayName: string; avatarUrl: string | null };
  shop: { id: number; name: string };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: `shop:${number}` | `technician:${number}`; name: string; durationMinutes: number };
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  message: string | null;
  estimatedStartsAt: string;
  estimatedEndsAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  terminalAt: string | null;
}

export type ExchangeClaimOptionPage = PaginatedResponse<ExchangeClaimOptionPayload>;
export type ExchangeClaimPage = PaginatedResponse<ExchangeClaimPayload>;
```

Export `CreateExchangeClaimBody` and `ExchangeClaimListQuery` directly from the Zod inference types so controller, service and tests share one transport definition:

```ts
export type CreateExchangeClaimBody = z.infer<typeof createExchangeClaimSchema>;
export type ExchangeClaimListQuery = z.infer<typeof exchangeClaimListQuerySchema>;
```

Extend `ExchangeViewerState` with required `canClaim` and `canViewClaims` booleans; update existing fixtures rather than making the fields optional.

- [ ] **Step 5: Add stable error codes**

Add constants for the ten `error.exchange.claim_*` keys listed in the design spec, with 409 used for state, duplicate, schedule, time and budget conflicts; 403 for not allowed; 404 for unavailable option/claim.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.validators.test.ts`  
Expected: PASS.  
Run: `cd backend && npm run build`  
Expected: PASS after every Exchange viewer fixture contains both capability fields.

- [ ] **Step 7: Commit the transport contract**

```bash
git add backend/src/types/exchange-claim.types.ts backend/src/validators/exchange-claim.validators.ts backend/src/constants/error-codes.ts backend/src/types/exchange.types.ts backend/tests/exchange-claim.validators.test.ts backend/tests
git commit -m "feat(exchange): define selective claim API contract"
```

### Task 3: Implement Repository Eligibility and Transaction Primitives

**Files:**
- Create: `backend/tests/exchange-claim.repository.test.ts`
- Create: `backend/tests/exchange-claim.repository.integration.test.ts`
- Create: `backend/src/repositories/exchange-claim.repository.ts`

**Interfaces:**
- Consumes: Prisma `ExchangeClaim`, `ScheduleSlot`, `BookingOrder`, `TechnicianShopAffiliation`.
- Produces: `ExchangeClaimRepositoryPort` with `runInTransaction`, `listOptions`, `lockRequest`, `lockOption`, `findIdempotent`, `findMine`, `listReceived`, `lockClaim`, `hasOverlappingActiveClaim`, `create`, `withdraw`, and `createAudit`.

- [ ] **Step 1: Write failing option-scope repository tests**

Test that the Prisma where-clause enforces all of these predicates in one query: published/selective Request window, current merchant shop or current technician profile, active affiliation, published unsuspended shop, available capacity, service ownership, no overlapping active claim, and `deletedAt: null`.

```ts
await repository.listOptions({
  postId: 41,
  actor: { kind: "technician", technicianProfileId: 81 },
  page: 1,
  pageSize: 20,
  now
});
expect(scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({ technicianProfileId: 81, deletedAt: null })
}));
```

- [ ] **Step 2: Run and observe the missing repository failure**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.repository.test.ts`  
Expected: FAIL because `ExchangeClaimRepository` does not exist.

- [ ] **Step 3: Implement paginated option projection**

Use `toPrismaPagination`/`buildPaginatedResponse`, `startsAt >= request.serviceStartAt`, `endsAt <= request.serviceEndAt`, `status: AVAILABLE`, `bookedCount < capacity`, active affiliations, current pricing mode, and anti-overlap against `ExchangeClaim.status = ACTIVE`. Map each row to the exact `ExchangeClaimOptionPayload` from Task 2.

- [ ] **Step 4: Write failing mutation primitive tests**

Cover exact outcomes:

```ts
type ExchangeClaimCreateRepositoryResult =
  | { outcome: "created"; claim: ExchangeClaimPayload }
  | { outcome: "idempotent"; claim: ExchangeClaimPayload; fingerprint: string }
  | { outcome: "request_unavailable" | "option_unavailable" | "duplicate" | "time_conflict" };
```

Assert Request and technician locks occur before overlap check and claim creation, and that `activeKey` is `request:41:technician:81`.

- [ ] **Step 5: Implement transaction and lock primitives**

Use `Prisma.TransactionIsolationLevel.ReadCommitted` plus the repository's existing `runWithTransactionConflictRetry`. Lock in this order:

```sql
SELECT id FROM exchange_posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE;
SELECT id FROM technician_profiles WHERE id = ? AND deleted_at IS NULL FOR UPDATE;
SELECT id FROM schedule_slots WHERE id = ? AND deleted_at IS NULL FOR UPDATE;
```

After locking, re-read the option, active claims and booking conflicts; never trust the preflight list response. Translate Prisma unique conflicts into `duplicate` or idempotency outcomes without exposing Prisma errors.

- [ ] **Step 6: Add a guarded local-MySQL concurrency integration test**

Require `RUN_EXCHANGE_CLAIM_INTEGRATION=true` and an explicit loopback `ENV_FILE` database whose name is not production-like. In one rollback-cleaned fixture, fire two simultaneous creates for the same technician and overlapping times and assert exactly one becomes `ACTIVE`.

- [ ] **Step 7: Run repository unit tests**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.repository.test.ts`  
Expected: PASS.

- [ ] **Step 8: Commit the repository layer**

```bash
git add backend/src/repositories/exchange-claim.repository.ts backend/tests/exchange-claim.repository.test.ts backend/tests/exchange-claim.repository.integration.test.ts
git commit -m "feat(exchange): add claim eligibility repository"
```

### Task 4: Implement Claim Service State Machine

**Files:**
- Create: `backend/tests/exchange-claim.service.test.ts`
- Create: `backend/src/services/exchange-claim.service.ts`

**Interfaces:**
- Consumes: `ExchangeClaimRepositoryPort`, `Pick<ExchangeRepositoryPort, "resolveActor">`, `AuthenticatedAccessContext`, `AuthRequestContext`.
- Produces: `listOptions`, `createClaim`, `getMine`, `listReceived`, `withdrawClaim`.

- [ ] **Step 1: Write failing identity and budget tests**

Cover merchant current-shop scope, technician own-profile/affiliated-shop scope, owner self-claim denial, quick-mode denial, minimum quote, maximum quote, expired Request, duplicate and time conflict.

```ts
await expect(service.createClaim(technicianAccess, 41, {
  scheduleSlotId: 91,
  quoteAmountJpy: 30_001,
  message: null
}, "claim-key-00000001", requestContext)).rejects.toMatchObject({
  message: "error.exchange.claim_quote_above_budget",
  statusCode: 409
});
```

- [ ] **Step 2: Run and observe the missing service failure**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.service.test.ts`  
Expected: FAIL because `ExchangeClaimService` does not exist.

- [ ] **Step 3: Implement actor resolution and provider scope**

Resolve the exact active identity through the existing Exchange actor resolver. Accept only merchant-family identities with a current shop scope or technician identity with its own technician profile. Reject personal publishers and Request owners with `error.exchange.claim_not_allowed`.

- [ ] **Step 4: Implement create orchestration inside one repository transaction**

The service must execute this exact sequence inside `runInTransaction`: lock Request, verify `DEMAND/PUBLISHED/SELECTIVE` and expiry, lock option and technician, verify actor scope and affiliation, verify budget, verify Request window, verify slot capacity/order conflicts/active-claim overlap, resolve idempotency, create claim, and create `exchange.claim.create` audit.

Fingerprint only these normalized fields:

```ts
const fingerprintInput = {
  postId,
  claimantIdentityId: actor.identityId,
  scheduleSlotId: input.scheduleSlotId,
  quoteAmountJpy: input.quoteAmountJpy,
  message: input.message?.trim() || null
};
```

- [ ] **Step 5: Write failing read and withdrawal tests**

Assert `getMine` only uses current identity, `listReceived` requires Request ownership and remains paginated, withdrawal only accepts `ACTIVE`, and audit metadata excludes `message` and address fields.

- [ ] **Step 6: Implement read and withdrawal methods**

Withdrawal writes `WITHDRAWN`, `activeKey = null`, `withdrawnAt = now`, `terminalAt = now`, then writes `exchange.claim.withdraw` in the same transaction.

- [ ] **Step 7: Run the service suite**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.service.test.ts`  
Expected: PASS.

- [ ] **Step 8: Commit the service layer**

```bash
git add backend/src/services/exchange-claim.service.ts backend/tests/exchange-claim.service.test.ts
git commit -m "feat(exchange): enforce selective claim state rules"
```

### Task 5: Expose Authenticated Claim APIs and OpenAPI

**Files:**
- Create: `backend/src/controllers/exchange-claim.controller.ts`
- Create: `backend/src/routes/exchange-claim.routes.ts`
- Create: `backend/tests/exchange-claim.routes.test.ts`
- Create: `backend/tests/exchange-claim.openapi.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces: five `/api/v1/exchange` endpoints with stable success envelopes, permission metadata and idempotency enforcement.

- [ ] **Step 1: Write failing route tests**

Assert these exact routes and status codes:

```text
GET  /api/v1/exchange/posts/41/claim-options        200
POST /api/v1/exchange/posts/41/claims               201
GET  /api/v1/exchange/posts/41/claims               200
GET  /api/v1/exchange/posts/41/claims/mine          200
POST /api/v1/exchange/claims/301/withdraw            200
```

Also assert missing JWT is 401, missing permission is 403, invalid body is 400, and missing/short `Idempotency-Key` is 400.

- [ ] **Step 2: Run and observe route 404 failures**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.routes.test.ts`  
Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Add controller and router**

Controller methods only parse the already-validated params/body/query, call the service with `getAuthenticatedAccess`/`getRequestContext`, and wrap with `successResponse`. Router order must put `/claims/mine` before any path that could interpret `mine` as an ID.

- [ ] **Step 4: Register dependency construction**

Add `exchangeClaimService?: ExchangeClaimService` to `AppDependencies`, mount `createExchangeClaimRoutes` next to the existing Exchange routes, and construct the real service in `server.ts` using `ExchangeClaimRepository` plus the existing `ExchangePostRepository` actor resolver.

- [ ] **Step 5: Write failing OpenAPI assertions**

```ts
expect(document.paths["/api/v1/exchange/posts/{id}/claims"].post["x-required-permission"])
  .toBe("exchange:claims:create");
expect(document.paths["/api/v1/exchange/posts/{id}/claim-options"].get.parameters)
  .toEqual(expect.arrayContaining([expect.objectContaining({ name: "page_size" })]));
```

- [ ] **Step 6: Add OpenAPI schemas, errors and path operations**

Document the exact payloads from Task 2, pagination envelope, `Idempotency-Key`, all five required permissions and every stable claim error key. Do not document Match, Booking or Payment responses.

- [ ] **Step 7: Run route, OpenAPI and global OpenAPI tests**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim.routes.test.ts tests/exchange-claim.openapi.test.ts tests/openapi.test.ts`  
Expected: PASS.

- [ ] **Step 8: Commit the HTTP boundary**

```bash
git add backend/src/controllers/exchange-claim.controller.ts backend/src/routes/exchange-claim.routes.ts backend/src/app.ts backend/src/server.ts backend/src/api/openapi.ts backend/tests/exchange-claim.routes.test.ts backend/tests/exchange-claim.openapi.test.ts
git commit -m "feat(exchange): expose selective claim APIs"
```

### Task 6: Release Claim Holds on Request Terminal States

**Files:**
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange-post-expiry.worker.test.ts`

**Interfaces:**
- Produces: atomic `cancelActiveClaimsByPost(postId, status, at): Promise<number>` inside the existing Request withdrawal/expiry transaction, plus viewer claim capability flags.

- [ ] **Step 1: Write failing terminal-state tests**

For Request withdrawal expect `ACTIVE -> REQUEST_WITHDRAWN`, `activeKey -> null`, `terminalAt -> now`; for expiry expect `ACTIVE -> REQUEST_EXPIRED`. Assert Intelligence posts perform no claim update and existing NDP capture/release calls remain unchanged.

- [ ] **Step 2: Run focused terminal tests and observe missing calls**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange-post-expiry.worker.test.ts`  
Expected: FAIL because terminalization does not update claims or emit claim terminal audit metadata.

- [ ] **Step 3: Add repository terminal update**

```ts
await tx.exchangeClaim.updateMany({
  where: { exchangePostId: postId, status: "ACTIVE", deletedAt: null },
  data: { status, activeKey: null, terminalAt: at }
});
```

Return the updated count so the service can include it in one aggregate audit record without reading claim messages.

- [ ] **Step 4: Invoke terminal cancellation in existing Request transactions**

Call it after the post lock and before the existing post/ledger terminal mutations. Write `exchange.claim.request_withdrawn` or `exchange.claim.request_expired` only when count is positive. Preserve existing publication-fee full capture on withdrawal and full release on natural expiry.

- [ ] **Step 5: Add viewer capability decoration**

For a live selective Demand:

```ts
viewer.canClaim = providerIdentityTypes.has(actor.identityType) && !viewer.canWithdraw;
viewer.canViewClaims = viewer.canWithdraw;
```

Both flags are false for Intelligence, quick mode and terminal posts.

- [ ] **Step 6: Run terminal and existing Exchange regression suites**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange-post-expiry.worker.test.ts tests/exchange.routes.test.ts`  
Expected: PASS with existing Request ledger behavior unchanged.

- [ ] **Step 7: Commit terminal integration**

```bash
git add backend/src/repositories/exchange.repository.ts backend/src/services/exchange.service.ts backend/src/types/exchange.types.ts backend/tests/exchange.repository.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange-post-expiry.worker.test.ts backend/tests/exchange.routes.test.ts
git commit -m "feat(exchange): release claim holds on request terminal states"
```

### Task 7: Add the High-Fidelity Claim UI

**Files:**
- Create: `src/features/exchange/ExchangeClaimPanel.tsx`
- Create: `src/features/exchange/ExchangeClaimPanel.test.tsx`
- Create: `src/features/exchange/ExchangeReceivedClaims.tsx`
- Create: `src/features/exchange/ExchangeReceivedClaims.test.tsx`
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/pages/mobile/NeedoRoutePages.test.tsx`

**Interfaces:**
- Consumes: the five formal claim endpoints.
- Produces: provider claim composer/own card and Request-owner received list inside the existing detail page.

- [ ] **Step 1: Write failing frontend API tests**

```ts
expect(httpClient.request).toHaveBeenCalledWith("/exchange/posts/41/claims", {
  method: "POST",
  headers: { "Idempotency-Key": "claim-key" },
  body: { scheduleSlotId: 91, quoteAmountJpy: 15000, message: null }
});
```

Cover option pagination, received pagination, own claim read and withdrawal idempotency.

- [ ] **Step 2: Run and observe missing API exports**

Run: `npm test -- src/features/exchange/api.test.ts`  
Expected: FAIL because claim API functions do not exist.

- [ ] **Step 3: Add frontend claim types and API functions**

Mirror backend fields exactly. Export `listExchangeClaimOptions`, `createExchangeClaim`, `listReceivedExchangeClaims`, `getMyExchangeClaim`, and `withdrawExchangeClaim`; `claims/mine` transports the nullable value inside a non-null `{ claim }` payload before the client unwraps it, all writes use a generated `Idempotency-Key`, and all lists map `page_size`.

- [ ] **Step 4: Write failing provider panel tests**

Test a merchant option explicitly displays selected technician, service and time; a technician option explicitly displays selected shop; required labels contain `*`; message is optional; submit uses the chosen `scheduleSlotId`; server errors preserve form values; refresh loads `claims/mine`; active claim withdrawal requires confirmation and then displays server terminal state.

- [ ] **Step 5: Implement `ExchangeClaimPanel` using the existing design tokens**

Render a dark rounded sheet/card consistent with the approved Exchange composer and detail page. Load real option pages, render selectable option cards containing shop/technician/service/time, support “加载更多”, require one option and integer quote, and show no success state until the POST resolves.

- [ ] **Step 6: Write failing owner-list tests**

Assert only server rows render, quotation/message stay in original language, “加载更多” appends the next page, and there is no select/match/add-budget/booking/payment control.

- [ ] **Step 7: Implement `ExchangeReceivedClaims`**

Render provider public identity, shop, technician, service, quote, time, message and status. Keep it read-only in this microstep.

- [ ] **Step 8: Compose both components into the existing detail page**

Show `ExchangeClaimPanel` only when `post.viewer.canClaim`; show `ExchangeReceivedClaims` only when `post.viewer.canViewClaims`. Preserve the existing footer for Intelligence and quick Demand. Remove the obsolete source assertion that forbids all claim UI, but retain assertions that forbid localStorage, fake booking and fake payment.

- [ ] **Step 9: Add all five languages**

Add keys for claim, quote, service option, shop, technician, estimated time, optional message, submit/pending/success, withdraw/confirm, option unavailable, budget bounds, time conflict, duplicate, received claims, empty state and load more in `zh`, `zh-Hant`, `ja`, `en`, `ko`.

- [ ] **Step 10: Run focused UI tests**

Run: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeClaimPanel.test.tsx src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/pages/mobile/NeedoRoutePages.test.tsx`  
Expected: PASS.

- [ ] **Step 11: Commit the user-visible slice**

```bash
git add src/features/exchange src/pages/mobile/NeedoRoutePages.test.tsx
git commit -m "feat(exchange): add formal selective claim UI"
```

### Task 8: Verify Formal Database, Concurrency and Browser Behavior

**Files:**
- Create: `backend/scripts/check-exchange-selective-claim-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-01-exchange-selective-claim-design.md`

**Interfaces:**
- Produces: repeatable formal flow checker and final evidence; no new product capability.

- [ ] **Step 1: Write the failing checker contract test**

Add a source-level safety test asserting the checker requires an explicit local environment file, rejects production runtime/database names, uses a unique namespace, never logs tokens/secrets, and deletes only rows created under that namespace.

- [ ] **Step 2: Run and observe the missing checker failure**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim-flow-script.test.ts`  
Expected: FAIL because the checker script does not exist.

- [ ] **Step 3: Implement the formal flow checker**

The checker must use the real services/repositories to create one isolated selective Request fixture, one eligible schedule option and one claim; prove persistence, idempotent replay, duplicate rejection, overlapping-time rejection, withdrawal release and Request expiry release; then delete only namespace-owned claim/request/audit/schedule fixture rows in reverse foreign-key order.

- [ ] **Step 4: Apply and inspect the migration locally**

Run: `cd backend && npm run prisma:migrate:deploy`  
Expected: `20260901100000_exchange_selective_claim` applies once.  
Run: `cd backend && npm run prisma:status`  
Expected: schema is up to date.  
Inspect `information_schema.TABLES`, `COLUMNS`, `STATISTICS`, `TABLE_CONSTRAINTS`, `REFERENTIAL_CONSTRAINTS` and `_prisma_migrations`; verify the physical table, checks, indexes and restrictive foreign keys independently.

- [ ] **Step 5: Run the local MySQL concurrency and formal checker**

Run: `cd backend && RUN_EXCHANGE_CLAIM_INTEGRATION=true ENV_FILE=.env.dev npm test -- --runTestsByPath tests/exchange-claim.repository.integration.test.ts`  
Expected: PASS with exactly one active overlapping claim.  
Run: `cd backend && ENV_FILE=.env.dev npm run check:exchange-selective-claim-flow`  
Expected: PASS and exact cleanup summary.

- [ ] **Step 6: Run complete relevant automated gates**

Run: `cd backend && npm test -- --runTestsByPath tests/exchange-claim-schema.test.ts tests/exchange-claim.validators.test.ts tests/exchange-claim.repository.test.ts tests/exchange-claim.service.test.ts tests/exchange-claim.routes.test.ts tests/exchange-claim.openapi.test.ts tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange-post-expiry.worker.test.ts tests/exchange.routes.test.ts tests/exchange.openapi.test.ts`  
Expected: PASS.  
Run: `cd backend && npm run lint && npm run build`  
Expected: PASS.  
Run: `npm test -- src/features/exchange && npm run lint && npm run verify:production-build`  
Expected: PASS without raising bundle budgets.

- [ ] **Step 7: Start an isolated formal runtime and prove process ownership**

Run with unused ports, for example: `FRONTEND_PORT=5194 FORMAL_BACKEND_PORT=3014 FORMAL_BACKEND_ENV_FILE=/Users/eason/Documents/New\ project/backend/.env.dev npm run dev`.

Before browser acceptance, record `lsof` listener PIDs, each PID's cwd, branch `codex/exchange-claim-selective-slice`, frontend proxy target `3014`, `/api/v1/health`, and the exact migration state. Do not reuse an unrelated worktree listener.

- [ ] **Step 8: Complete authenticated real-browser acceptance**

At 440×956 or narrower, use real test identities and verify:

1. Request owner publishes or opens a selective Request with a valid budget and service window.
2. Merchant identity sees only its shop options, must choose an affiliated technician, sees `*` labels, and submits a valid claim.
3. Reload and re-login preserve the own claim.
4. Duplicate submission, above-budget quote and overlapping-time submission show server-authoritative errors.
5. Request owner sees the persisted claim and cannot see matching/booking/payment controls.
6. Claimant withdraws; reload shows withdrawn state and the time becomes available again.
7. Console contains no uncaught error; page has no horizontal overflow; footer and sheet remain usable above the mobile safe area.

- [ ] **Step 9: Update documentation with exact verified boundary**

Document the implemented selective claim endpoints, permissions, state names, test commands, browser identities and the explicit exclusions: quick matching, provider selection, budget augmentation, early-close half fee, bilateral cancellation, BookingOrder and Payment.

- [ ] **Step 10: Run final clean-tree and diff review**

Run: `git status --short`, `git diff --check`, `git diff --stat 550a0c6c...HEAD`, and inspect every changed path. Expected: only files named in this plan, no secrets, no generated build output, no mock/localStorage/fake payment.

- [ ] **Step 11: Commit verification assets and documentation**

```bash
git add backend/scripts/check-exchange-selective-claim-flow.ts backend/tests/exchange-claim-flow-script.test.ts backend/package.json README.md docs/superpowers/specs/2026-09-01-exchange-selective-claim-design.md docs/superpowers/plans/2026-09-01-exchange-selective-claim.md
git commit -m "test(exchange): verify selective claim flow"
```

## Execution Choice

The user requested continued work in this task and one microstep at a time. Execute this plan inline with checkpointed TDD cycles; do not dispatch unrelated parallel implementation, and stop after Task 8 without beginning quick matching, selection, booking or payment.
