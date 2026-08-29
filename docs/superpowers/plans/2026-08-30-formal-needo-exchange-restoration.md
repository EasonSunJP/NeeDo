# Formal NeeDo Exchange Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Keep every task independently runnable, tested, and committed.

**Goal:** Restore the NeeDo Exchange demand/intelligence experience on formal APIs and persisted data, using only existing real test accounts and identities, with exactly 20 seeded demand posts and 20 seeded intelligence posts plus actor-linked comments, likes, and shares.

**Architecture:** Add a dedicated Exchange domain to the existing Express/Prisma backend, expose paginated `/api/v1/exchange/*` endpoints behind JWT/RBAC, and replace the frontend capability gate with two real API-backed tabs. Keep offer-taking, matching, booking, and payment out of this phase. Seeded simulation data is deterministic, idempotent, local/test-only, and isolated by namespace so old Exchange mock data can be removed without deleting unrelated formal records.

**Tech Stack:** React, TypeScript, Vite, Express, Zod, Prisma, MySQL, Redis, Jest, Supertest.

## Non-negotiable constraints

- Preserve the two-tab product model: `DEMAND` and `INTELLIGENCE` only.
- Customer identities may publish demand; technician and merchant identities may publish intelligence.
- Direct publication is allowed after server-side identity and permission checks; no review workflow is introduced.
- Use existing formal test users and existing formal identities. Never invent a frontend identity or accept actor IDs from the request body.
- Store every post, comment, like, and share as a database record tied to the authenticated user and active identity.
- Seed exactly 20 demand posts and 20 intelligence posts. Each post has 3–10 comments, 10–66 unique likes, and 2–15 unique shares.
- Remove old Exchange arrays, generators, localStorage state, bridges, fake IDs, counters, and capability-gate copy from current source and formal bundles.
- Do not add offer, match, booking, order, or payment endpoints or controls.
- Keep user-authored content in its original language. Localize controls, labels, validation, and errors in all five supported UI languages.
- Do not push, deploy, publish, or alter production data as part of this plan.

## Stable public contracts

Backend responses must never expose internal `authorUserId`, `authorIdentityId`, `actorUserId`, or `actorIdentityId`. Use this public shape throughout repository mapping, services, controllers, OpenAPI, and frontend types:

```ts
export type ExchangeActor = {
  needoId: string;
  identityType: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ExchangeInteractionCounts = {
  comments: number;
  likes: number;
  shares: number;
};

export type ExchangeViewerState = {
  liked: boolean;
  canWithdraw: boolean;
};

export type ExchangePostPayload = {
  id: string;
  type: "DEMAND" | "INTELLIGENCE";
  status: "PUBLISHED" | "WITHDRAWN" | "EXPIRED";
  title: string;
  detail: string;
  contentLocale: string;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  publishedAt: string;
  publisher: ExchangeActor;
  counts: ExchangeInteractionCounts;
  viewer: ExchangeViewerState;
  demand: null | { budgetMinJpy: number; budgetMaxJpy: number };
  intelligence: null | {
    serviceMode: "STORE" | "ONSITE" | "FLEXIBLE";
    addressLabel: string | null;
    serviceAreas: string[];
    originalPriceJpy: number | null;
    campaignPriceJpy: number;
  };
};
```

All write endpoints accept an `Idempotency-Key` header of 16–191 characters. The server derives the actor from `getAuthenticatedAccess(response)` and returns the standard `{ code, message, data }` envelope.

## Task 1: Add formal Exchange schema, migration, and permissions

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260830040000_formal_needo_exchange/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Test: `backend/tests/unit/permissions.constants.test.ts`

### 1.1 RED — lock the permission matrix

- [ ] Add failing assertions that these exact permission codes exist once and are assigned only to the intended authenticated roles:

```ts
const EXCHANGE_PERMISSION_CODES = [
  "exchange:posts:list",
  "exchange:posts:detail",
  "exchange:posts:create-demand",
  "exchange:posts:create-intelligence",
  "exchange:posts:withdraw-own",
  "exchange:comments:list",
  "exchange:comments:create",
  "exchange:likes:write",
  "exchange:shares:create",
] as const;
```

- [ ] Assert customer receives `create-demand` but not `create-intelligence`; technician and merchant receive `create-intelligence` but not `create-demand`.
- [ ] Run `npm test -- --runInBand tests/unit/permissions.constants.test.ts` from `backend/` and confirm the new assertions fail for missing codes.

### 1.2 GREEN — add models and an additive migration

- [ ] Add enums `ExchangePostType`, `ExchangePostStatus`, and `ExchangeServiceMode`.
- [ ] Add `ExchangePost`, `ExchangeDemand`, `ExchangeIntelligence`, `ExchangeComment`, `ExchangeLike`, and `ExchangeShare` models. Every model must include `id`, `createdAt`, `updatedAt`, and `deletedAt`.
- [ ] Add explicit inverse relations to `User` and `UserIdentity` with named relations so Prisma validation is unambiguous.
- [ ] Use these ownership and uniqueness rules:

```prisma
model ExchangePost {
  id                    String             @id @default(cuid())
  authorUserId          String
  authorIdentityId      String
  publisherNeedoId      String
  publisherIdentityType IdentityType
  publisherDisplayName  String
  publisherAvatarUrl    String?
  type                  ExchangePostType
  status                ExchangePostStatus @default(PUBLISHED)
  title                 String             @db.VarChar(120)
  detail                String             @db.Text
  contentLocale         ContentLocale
  areaLabel             String             @db.VarChar(120)
  serviceStartAt        DateTime
  serviceEndAt          DateTime
  expiresAt             DateTime
  publishedAt           DateTime           @default(now())
  withdrawnAt           DateTime?
  idempotencyKey        String             @unique @db.VarChar(191)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
  deletedAt             DateTime?
  demand                ExchangeDemand?
  intelligence          ExchangeIntelligence?
  comments              ExchangeComment[]
  likes                 ExchangeLike[]
  shares                ExchangeShare[]

  @@index([type, status, publishedAt])
  @@index([expiresAt, status])
  @@index([authorUserId, authorIdentityId])
  @@index([deletedAt])
}
```

- [ ] Make `ExchangeDemand.postId` and `ExchangeIntelligence.postId` unique foreign keys with cascading deletion.
- [ ] Store intelligence `serviceAreas` as JSON and validate its array shape in the service layer.
- [ ] Give `ExchangeLike` a unique constraint on `[postId, actorUserId]` so unlike/relike restores the soft-deleted record rather than creating duplicates.
- [ ] Give `ExchangeShare` a unique constraint on `[postId, actorUserId]` for the first formal phase; repeat successful shares by one user must be idempotent.
- [ ] Add composite indexes for live list/comment queries and actor ownership checks; every repository query later must filter `deletedAt: null`.
- [ ] Write the SQL migration as additive DDL only. Do not edit an already-applied migration.
- [ ] Add the nine permissions to `SYSTEM_PERMISSIONS`, `buildRolePermissionAssignments()`, and the formal permission seed.
- [ ] Run `npx prisma format && npx prisma validate` and the focused permission test until they pass.

### 1.3 Commit

- [ ] Stage only the schema, new migration, permission constants, seed change, and focused test.
- [ ] Commit with `feat(exchange): add formal schema and permissions`.

## Task 2: Build validation, DTO mapping, and the read repository

**Files:**

- Create: `backend/src/validators/exchange.validators.ts`
- Create: `backend/src/types/exchange.types.ts`
- Create: `backend/src/repositories/exchange.repository.ts`
- Test: `backend/tests/unit/exchange.validators.test.ts`
- Test: `backend/tests/unit/exchange.repository.test.ts`

### 2.1 RED — specify input boundaries and safe output

- [ ] Add validator tests for `page >= 1`, `1 <= page_size <= 100`, enum filters, and ISO-8601 timestamps with explicit `Z` or numeric offset.
- [ ] Use a discriminated union for publication:

```ts
export const publishExchangePostSchema = z.discriminatedUnion("type", [
  demandPublishSchema,
  intelligencePublishSchema,
]);
```

- [ ] Demand validation must require `budgetMinJpy <= budgetMaxJpy`.
- [ ] Intelligence validation must require `campaignPriceJpy <= originalPriceJpy` when an original price exists.
- [ ] Both variants must require `serviceStartAt < serviceEndAt <= expiresAt`, nonblank title/detail/area, and an `Idempotency-Key` of 16–191 characters.
- [ ] Add repository tests proving live list queries exclude soft-deleted, withdrawn, expired-status, and time-expired records; apply the requested tab filter before pagination.
- [ ] Add mapping tests proving internal user and identity IDs are absent from serialized payloads.
- [ ] Run the two focused test files and confirm they fail before implementation.

### 2.2 GREEN — implement types and read queries

- [ ] Define `ExchangeActor`, `ExchangeInteractionCounts`, `ExchangeViewerState`, `ExchangePostPayload`, filter DTOs, and write command types in `backend/src/types/exchange.types.ts`.
- [ ] Implement validator exports for list, path IDs, publish, comment, and idempotency header parsing.
- [ ] Implement repository methods with explicit selects and bounded pagination:

```ts
listPosts(input: ExchangeListInput): Promise<ExchangePostRow[]>;
countPosts(input: ExchangeListInput): Promise<number>;
findPostById(id: string): Promise<ExchangePostRow | null>;
listComments(postId: string, page: number, pageSize: number): Promise<ExchangeCommentRow[]>;
countComments(postId: string): Promise<number>;
```

- [ ] Fetch aggregate counts without N+1 queries. Use Prisma `_count` or grouped queries scoped to the page IDs and live rows.
- [ ] Centralize row-to-payload mapping so list and detail responses cannot drift.
- [ ] Ensure viewer state is computed from the authenticated user, while publisher information comes from server-owned snapshots captured at write time.
- [ ] Run focused validator/repository tests until green.

### 2.3 Commit

- [ ] Commit as `feat(exchange): add validation and read repository`.

## Task 3: Implement formal write services, routes, RBAC, and audit

**Files:**

- Create: `backend/src/services/exchange.service.ts`
- Create: `backend/src/controllers/exchange.controller.ts`
- Create: `backend/src/routes/exchange.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/unit/exchange.service.test.ts`
- Test: `backend/tests/integration/exchange.routes.test.ts`

### 3.1 RED — lock business rules with service tests

- [ ] Add tests for the exact service surface:

```ts
listPosts(actor: ExchangeActorContext, input: ExchangeListInput): Promise<PaginatedExchangePosts>;
getPost(actor: ExchangeActorContext, postId: string): Promise<ExchangePostPayload>;
publish(actor: ExchangeActorContext, input: PublishExchangePostInput, key: string): Promise<ExchangePostPayload>;
withdraw(actor: ExchangeActorContext, postId: string, key: string): Promise<ExchangePostPayload>;
listComments(actor: ExchangeActorContext, postId: string, input: PaginationInput): Promise<PaginatedExchangeComments>;
comment(actor: ExchangeActorContext, postId: string, input: CreateExchangeCommentInput, key: string): Promise<ExchangeCommentPayload>;
like(actor: ExchangeActorContext, postId: string, key: string): Promise<ExchangeInteractionCounts>;
unlike(actor: ExchangeActorContext, postId: string, key: string): Promise<ExchangeInteractionCounts>;
share(actor: ExchangeActorContext, postId: string, key: string): Promise<ExchangeInteractionCounts>;
expireDue(now: Date, batchSize: number): Promise<number>;
```

- [ ] Prove identity rules: customer can publish demand; merchant/technician can publish intelligence; wrong identity types are rejected even if a client forges payload fields.
- [ ] Prove active identity ownership is loaded from the database and matches `currentIdentityId`, `currentIdentityType`, and scope in the access token.
- [ ] Prove publish/comment/share retries with the same key return the original result without duplicate rows.
- [ ] Prove like is a unique actor state, unlike soft-deletes it, and relike restores it.
- [ ] Prove only the original author can withdraw a published post, and withdrawn/expired posts reject new interactions.
- [ ] Prove every mutation writes an audit event inside the same transaction.
- [ ] Run the focused service test and confirm RED.

### 3.2 RED — define the HTTP contract

- [ ] Add Supertest coverage for these exact routes under `/api/v1`:

```text
GET    /exchange/posts
GET    /exchange/posts/:id
POST   /exchange/posts
POST   /exchange/posts/:id/withdraw
GET    /exchange/posts/:id/comments
POST   /exchange/posts/:id/comments
PUT    /exchange/posts/:id/like
DELETE /exchange/posts/:id/like
POST   /exchange/posts/:id/shares
```

- [ ] Assert authentication, per-route permissions, Zod failures, pagination envelope, standard error envelope, and absence of internal actor IDs.
- [ ] Assert there are no offer, match, booking, order, or payment routes in the Exchange router.
- [ ] Run the route test and confirm missing routes fail.

### 3.3 GREEN — implement service/controller/router

- [ ] Resolve the actor once per request from authenticated access plus a database lookup of the active identity and public NeeDo ID.
- [ ] Use one Prisma transaction for each mutation, including ownership checks, record change, count readback, and audit write.
- [ ] On publish, persist only the subtype row matching `type` and reject mixed subtype fields.
- [ ] On read, treat `expiresAt <= now` as unavailable even before the expiry worker runs.
- [ ] Keep controllers limited to validated request extraction, service calls, and standard response envelopes.
- [ ] Attach one required permission declaration to each route, mount `exchangeRouter` in `backend/src/app.ts`, and support dependency injection through `AppDependencies` for tests.
- [ ] Run focused unit and integration tests until green.

### 3.4 Commit

- [ ] Commit as `feat(exchange): add formal API and interactions`.

## Task 4: Add expiry processing, configuration, and OpenAPI

**Files:**

- Create: `backend/src/workers/exchange-post-expiry.worker.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.test.example`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/unit/exchange-post-expiry.worker.test.ts`
- Test: `backend/tests/unit/openapi.test.ts`

### 4.1 RED — specify bounded lifecycle behavior

- [ ] Add worker tests proving one tick claims at most the configured batch size, never overlaps with an in-flight tick, converts only live `PUBLISHED` rows whose `expiresAt <= now`, and records one audit event per transition.
- [ ] Add tests proving start/stop are idempotent and a failed tick is logged without terminating the process.
- [ ] Add OpenAPI assertions for all nine Exchange routes, authentication, permissions, enums, pagination, idempotency header, and public response schemas.
- [ ] Run both focused test files and confirm RED.

### 4.2 GREEN — implement lifecycle and docs

- [ ] Follow the existing booking reward expiry worker structure while keeping Exchange state transitions in `ExchangeService.expireDue`.
- [ ] Add parsed environment settings with these defaults:

```text
EXCHANGE_EXPIRY_WORKER_ENABLED=true
EXCHANGE_EXPIRY_INTERVAL_MS=300000
EXCHANGE_EXPIRY_BATCH_SIZE=100
```

- [ ] Start the worker only after backend dependencies are ready and stop it during graceful shutdown.
- [ ] Document all Exchange endpoints and both subtype schemas in `backend/src/api/openapi.ts`; examples must use fictional prose but never become runtime seed data.
- [ ] Run worker/OpenAPI tests and `npm run typecheck` from `backend/` until green.

### 4.3 Commit

- [ ] Commit as `feat(exchange): add expiry worker and API docs`.

## Task 5: Create deterministic formal simulation data and an independent checker

**Files:**

- Create: `backend/src/simulation/exchange-simulation-plan.ts`
- Create: `backend/src/scripts/seed-formal-exchange-test.ts`
- Create: `backend/src/scripts/check-formal-exchange-test.ts`
- Modify: `backend/src/simulation/simulation-seed-config.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/unit/exchange-simulation-plan.test.ts`
- Test: `backend/tests/integration/exchange-simulation-seed.test.ts`

### 5.1 RED — prove distribution and actor authenticity

- [ ] Add a seeded PRNG fixture and tests showing the same seed produces byte-for-byte identical plans; prohibit `Math.random()` in the generator.
- [ ] Assert the plan contains exactly 20 demand posts and 20 intelligence posts.
- [ ] Assert every demand author is an existing customer identity and every intelligence author is an existing technician or merchant identity.
- [ ] Assert every post has 3–10 comments, 10–66 unique actor likes, and 2–15 unique actor shares.
- [ ] Assert every comment, like, and share actor resolves to an existing formal test user and existing identity; never construct generated IDs or anonymous actors.
- [ ] Assert timestamp ordering is plausible and deterministic, authored text has an explicit `contentLocale`, and interaction timestamps do not predate publication.
- [ ] Run the generator tests and confirm RED.

### 5.2 GREEN — implement a fail-closed, idempotent seed

- [ ] Implement `buildExchangeSimulationPlan` using the existing formal simulation account discovery and the configured seed.
- [ ] Fail with a clear diagnostic before writing if there are not enough eligible real test accounts to satisfy unique actor ranges. Do not relax the requested counts.
- [ ] Require local/test environment plus the repository's explicit simulation seed flag. Refuse production-like database URLs.
- [ ] Namespace every seed idempotency key with `needo_exchange_simulation:`.
- [ ] Upsert the namespaced rows transactionally. A second run must be a no-op except for restoring the exact deterministic fixture if a namespaced row is incomplete.
- [ ] Delete only legacy Exchange simulation rows identified by the old known Exchange namespaces during the seed transaction. Preserve manual posts, unrelated formal data, and all non-Exchange modules.
- [ ] Add scripts:

```json
{
  "seed:formal-exchange-test": "tsx src/scripts/seed-formal-exchange-test.ts",
  "check:formal-exchange-test": "tsx src/scripts/check-formal-exchange-test.ts"
}
```

- [ ] Implement the checker independently from the plan generator: query the database, verify exact totals/ranges, validate real user and identity joins, detect old namespaces, and exit nonzero on any mismatch.
- [ ] Add an integration test that seeds twice, proves no duplicates, and proves an unrelated manual record survives.
- [ ] Run focused generator and integration tests until green.

### 5.3 Commit

- [ ] Commit as `feat(exchange): seed formal test-account simulation`.

## Task 6: Add the typed frontend Exchange client and resource state

**Files:**

- Create: `src/features/exchange/types.ts`
- Create: `src/features/exchange/api.ts`
- Create: `src/features/exchange/useExchangeFeed.ts`
- Test: `src/features/exchange/api.test.ts`
- Test: `src/features/exchange/useExchangeFeed.test.tsx`

### 6.1 RED — define API and state behavior

- [ ] Add compile-time fixtures matching `ExchangePostPayload` exactly and tests proving unknown internal fields are not used by the UI.
- [ ] Mock the existing `httpClient.request` pattern and assert each frontend method calls the exact formal route, method, query keys, and idempotency header.
- [ ] Add hook tests for initial loading, pagination, tab switching, refresh, mutation reconciliation, authenticated errors, permission errors, and backend-unavailable errors.
- [ ] Prove errors render as errors and never install a local array or retain stale success state as a hidden fallback.
- [ ] Run the focused frontend tests and confirm RED.

### 6.2 GREEN — implement typed formal access

- [ ] Mirror the stable public contracts in `src/features/exchange/types.ts` and define discriminated publish inputs.
- [ ] Implement these API methods through the shared authenticated client:

```ts
listExchangePosts(input: ExchangeListInput): Promise<Paginated<ExchangePost>>;
getExchangePost(postId: string): Promise<ExchangePost>;
publishExchangePost(input: PublishExchangePostInput, key: string): Promise<ExchangePost>;
withdrawExchangePost(postId: string, key: string): Promise<ExchangePost>;
listExchangeComments(postId: string, input: PaginationInput): Promise<Paginated<ExchangeComment>>;
createExchangeComment(postId: string, content: string, key: string): Promise<ExchangeComment>;
likeExchangePost(postId: string, key: string): Promise<ExchangeInteractionCounts>;
unlikeExchangePost(postId: string, key: string): Promise<ExchangeInteractionCounts>;
recordExchangeShare(postId: string, key: string): Promise<ExchangeInteractionCounts>;
```

- [ ] Generate write keys with `crypto.randomUUID()` at the UI action boundary. Do not persist payloads or counters in localStorage.
- [ ] Implement a resource hook that aborts obsolete tab/page requests, keeps one canonical item map, and replaces counts with server-returned counts after mutations.
- [ ] Run focused tests and the frontend typecheck until green.

### 6.3 Commit

- [ ] Commit as `feat(exchange): add formal frontend client`.

## Task 7: Restore the two-tab feed and identity-specific composer

**Files:**

- Create: `src/features/exchange/ExchangeFeedPage.tsx`
- Create: `src/features/exchange/ExchangeComposer.tsx`
- Modify: `src/pages/mobile/NeedoExchangePage.tsx`
- Modify: `src/pages/mobile/NeedoRoutePages.tsx`
- Modify: relevant files under `src/i18n/`
- Test: `src/features/exchange/ExchangeFeedPage.test.tsx`
- Test: `src/features/exchange/ExchangeComposer.test.tsx`

### 7.1 RED — describe the restored visible behavior

- [ ] Add feed tests proving only `需求` and `情报` tabs exist and each tab loads its matching server filter.
- [ ] Prove route defaults: `/needo` opens demand for a customer, while `/merchant/needo` and `/technician/needo` open intelligence.
- [ ] Prove visible cards render publisher, locale-preserved title/detail, area/time, subtype fields, and server counts.
- [ ] Prove loading, empty, unauthorized, forbidden, and service-unavailable states are explicit and contain no capability-gate wording.
- [ ] Add composer tests proving a customer sees only the demand form; merchant/technician see only the intelligence form; unsupported identity sees no publish control.
- [ ] Prove the client never offers an identity selector that could override the active authenticated identity.
- [ ] Prove there are no offer-taking, match, appointment, booking, order, or payment controls or API calls.
- [ ] Run the focused component tests and confirm RED.

### 7.2 GREEN — implement feed and direct publication

- [ ] Replace unconditional `error.feature_unavailable` stubs and the gate card in `NeedoExchangePage.tsx` with the formal feed wrapper.
- [ ] Keep the existing user/merchant/technician shells and route structure; pass the authenticated portal context into one shared Exchange feature.
- [ ] Implement accessible tabs, pull/refresh or explicit refresh, pagination, stable loading layout, and responsive cards.
- [ ] Build separate demand and intelligence schemas in the composer and submit only the permitted subtype.
- [ ] After successful publication, close the composer, insert the server-returned record into the correct tab, and allow a reload to re-fetch the persisted record.
- [ ] Add all controls, field labels, validation, error, empty, and status copy in the five supported locales. Render authored content without translating it.
- [ ] Run focused component tests and frontend typecheck until green.

### 7.3 Commit

- [ ] Commit as `feat(exchange): restore formal feed and publishing`.
