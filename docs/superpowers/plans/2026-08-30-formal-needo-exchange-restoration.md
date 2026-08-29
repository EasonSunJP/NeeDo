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

## Task 8: Restore formal detail, comments, likes, shares, and withdrawal

**Files:**

- Create: `src/features/exchange/ExchangePostDetailPage.tsx`
- Create: `src/features/exchange/ExchangeInteractions.tsx`
- Modify: `src/pages/mobile/NeedoRoutePages.tsx`
- Modify: `src/App.tsx`
- Modify: relevant files under `src/i18n/`
- Test: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Test: `src/features/exchange/ExchangeInteractions.test.tsx`

### 8.1 RED — test persisted interaction flows

- [ ] Add detail tests for direct navigation, missing post, withdrawn post, expired post, current actor ownership, and reload.
- [ ] Add comment tests for pagination, 3–10 seeded comments displayed from the API, direct comment creation, retry idempotency, and server error behavior.
- [ ] Add like tests proving the icon and count follow server-returned state across like, unlike, reload, and re-login.
- [ ] Add share tests with this order: invoke the native share sheet when supported, otherwise copy the canonical URL; record the share only after the share/copy operation succeeds.
- [ ] Prove native-share cancellation and clipboard failure do not call the share endpoint and do not increment the displayed count.
- [ ] Add withdrawal tests proving only the author sees the action, confirmation is required, and a successful server response removes the post from the live feed.
- [ ] Prove the obsolete `/posts/:postId/customer` route is absent and no customer-profile mock bridge is followed.
- [ ] Run focused tests and confirm RED.

### 8.2 GREEN — implement the formal detail experience

- [ ] Load detail and comments independently from formal endpoints; do not derive detail from an in-memory feed item.
- [ ] Use canonical route URLs for sharing and server-authoritative counts for every interaction result.
- [ ] Preserve keyboard, focus, disabled, and pending states so rapid repeated taps cannot create duplicate writes.
- [ ] Render withdrawn/expired states without exposing interaction controls.
- [ ] Remove obsolete customer-detail route declarations and update all card links to the canonical post detail route.
- [ ] Keep offer, match, appointment, booking, order, and payment absent.
- [ ] Run focused tests and frontend typecheck until green.

### 8.3 Commit

- [ ] Commit as `feat(exchange): restore persisted social interactions`.

## Task 9: Remove every old Exchange mock path and document retirement

**Files:**

- Modify: `src/pages/mobile/NeedoExchangePage.tsx`
- Modify: `src/pages/mobile/NeedoRoutePages.tsx`
- Modify: `src/App.tsx`
- Delete: any additional Exchange-only legacy source named in the checked-in retirement inventory created in step 9.1
- Modify: `src/data/mockRetirement.test.ts`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`
- Modify: `README.md`
- Test: `src/data/mockRetirement.test.ts`
- Test: add a backend source guard test beside existing source-policy tests

### 9.1 RED — make residue detectable

- [ ] Inventory current source and formal entrypoints with `rg`; record each exact legacy file or symbol in the retirement map before deletion.
- [ ] Extend the source guard so current Exchange code and production bundles reject these markers:

```text
data/mock
localStorage
needoExchangeBridge
hashSystemId
getSeedPosts
getExtraPosts
error.feature_unavailable
needo.exchange.composed
正式需求与情报功能尚未启用
```

- [ ] Add a guard that rejects old Exchange namespace rows in the formal simulation checker while allowing unrelated historical records.
- [ ] Assert current Exchange source contains no generated identity builder, static post/comment array, random counter, or hidden fallback import.
- [ ] Run the guard tests and confirm RED while old residue remains.

### 9.2 GREEN — delete legacy runtime paths

- [ ] Remove every retired Exchange mock module, localStorage migration, bridge, fallback, generated identity helper, and capability-gate branch that is no longer imported.
- [ ] Remove stale exports and imports rather than leaving compatibility aliases.
- [ ] Update `docs/MOCK_RETIREMENT_MAP.md` with old source, new formal endpoint/table, removal commit, and verification command.
- [ ] Update `README.md` with the formal Exchange routes, roles, seed/check commands, and explicit deferred capabilities.
- [ ] Build formal entrypoints and scan emitted assets for all forbidden markers.
- [ ] Run guard tests until green.

### 9.3 Commit

- [ ] Commit as `chore(exchange): remove legacy mock implementation`.

## Task 10: Reconcile, migrate, seed, and complete browser acceptance

**Files:**

- Modify only files required by failures discovered in this task
- Record verification evidence in the implementation task summary; do not add generated credentials or database dumps to Git

### 10.1 Reconcile migration state before writing to the database

- [ ] Confirm the intended local services on ports 3000, 5180, 3307, and 6379 and inspect `/api/v1/health` plus `/api/v1/ready`.
- [ ] Compare repository migration directories, Prisma schema, MySQL `_prisma_migrations`, and actual Exchange tables. Do not rely on `prisma migrate status` alone.
- [ ] Stop and repair any missing dependency migration before applying the Exchange migration; never rewrite an applied migration.
- [ ] Capture pre-seed counts for Exchange tables and unrelated formal tables needed to prove scoped writes.

### 10.2 Apply and verify formal local data

- [ ] Apply with the repository's development environment file:

```bash
cd backend
ENV_FILE=.env.dev npx prisma migrate deploy
npm run seed:formal-exchange-test
npm run check:formal-exchange-test
npm run seed:formal-exchange-test
npm run check:formal-exchange-test
```

- [ ] Prove the second seed creates no duplicate rows.
- [ ] Query exact formal totals: 20 live demand posts, 20 live intelligence posts, every post with 3–10 live comments, 10–66 unique live likes, and 2–15 unique live shares.
- [ ] Join every author and interaction actor to an existing user, identity, and public NeeDo ID; prove subtype/identity rules.
- [ ] Prove no old Exchange namespace rows remain and unrelated formal data counts/history are unchanged.

### 10.3 Run automated verification

- [ ] Run focused backend and frontend tests from Tasks 1–9.
- [ ] Run the full backend unit/integration suite, full frontend suite, lint, typecheck, i18n validation, and formal production build.
- [ ] Use the formal build command if the normal build is intentionally blocked by the project's production safety gate.
- [ ] Scan current source and emitted assets for forbidden Exchange mock markers and for deferred feature route/control names.
- [ ] Run `git diff --check` and inspect `git status --short`; preserve unrelated user changes.

### 10.4 Perform real browser acceptance

- [ ] Start the formal backend on 3000 and frontend on 5180. Use `domcontentloaded` for browser navigation because SSE may keep connections open.
- [ ] Log in with an existing customer test account and verify `user.html#/needo`: default demand tab, publish demand, comment, like/unlike, successful share, withdraw own post, reload, and re-login persistence.
- [ ] Log in with an existing technician test account and verify `technician.html#/technician/needo`: default intelligence tab, publish intelligence, comment, like, share, and persistence.
- [ ] Log in with an existing merchant test account and verify `store-admin.html#/merchant/needo`: default intelligence tab, publish intelligence, comment, like, share, and persistence.
- [ ] On every portal, inspect both tabs and a direct detail URL at 390 px, 440 px, and desktop width. Check overflow, fixed navigation, composer fields, action menus, disabled states, and focus behavior.
- [ ] Verify network responses come only from `/api/v1/exchange/*`, actor/public IDs map to the database, and there are no console errors.
- [ ] Stop the backend and verify the page shows a localized error without mock content; restart and confirm recovery.
- [ ] Confirm no offer, match, booking, order, appointment, or payment control/request appeared during acceptance.

### 10.5 Final commit and handoff

- [ ] Fix only verified failures, rerun the smallest affected checks, then rerun the full acceptance gate.
- [ ] Commit any acceptance-only correction with a narrowly scoped message such as `fix(exchange): resolve formal acceptance findings`.
- [ ] Report local completion separately from push, deployment, and live acceptance. Do not push or deploy without explicit authorization.

## Completion gate

The implementation is complete only when all of the following are simultaneously true:

- [ ] Formal schema, migration, permissions, audit, OpenAPI, and lifecycle worker are present and passing.
- [ ] Exactly 20 demand and 20 intelligence simulation posts exist from real formal test identities.
- [ ] Every post meets the actor-linked comment, like, and share ranges.
- [ ] Customer, technician, and merchant browser flows persist across reload and re-login.
- [ ] Old Exchange mocks and runtime fallback markers are absent from source, database namespace checks, and formal bundles.
- [ ] Five-language UI strings pass validation while authored content remains unchanged.
- [ ] Offer-taking, matching, booking, order, and payment remain deferred and absent.
- [ ] Focused tests, full tests, lint, typecheck, formal build, database checker, and responsive browser acceptance all pass.
