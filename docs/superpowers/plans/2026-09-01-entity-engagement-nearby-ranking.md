# Entity Engagement and Nearby Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist account-owned shop/technician favorites and successful entity shares, add private technician service-base coordinates, and rank eligible technicians from a 3 km radius with exact 1 km expansion and deterministic business tie-breakers.

**Architecture:** Add separate favorite and append-only share-event tables with exactly-one-target constraints. Keep favorite ownership on `User`, make NeeDo message creation plus share-event recording one repository transaction, and count system shares only after a successful client capability invocation. Resolve one private technician distance from the minimum of personal base and active affiliated-shop locations; the backend expands radius before pagination and sorts the complete final-radius set.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Express 4, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7.

## Global Constraints

- Start only after the order-performance microstep is merged and verified; use an isolated worktree containing approved design commit `f33e7e99`.
- Do not implement technician service/contact-card changes, shop taxonomy, or final card styling in this microstep.
- A favorite belongs to the authenticated user account, never the active identity.
- Shop and technician favorites are distinct targets; every favorite/share row has exactly one target.
- A NeeDo share increments only when the formal message and share event both commit. A failed message produces no event.
- A system share request is sent only after the platform capability reports successful invocation; retries reuse the same key.
- Do not use Social post likes/bookmarks/shares for entity counts.
- Coordinates on `TechnicianProfile` are private, must be both present or both absent, and never appear in public/contact DTOs.
- Search without an origin still returns matching technicians but no distance, radius, rank, or medal data.
- Radius starts at exactly 3 km and grows in exact 1 km steps. Once the stopping radius is found, rebuild and rank every technician inside it before pagination.
- Preserve fuzzy-name and any-branch OR semantics. Missing coordinates and service fields are never invented.
- Page/card code must use batched favorite status and aggregate counts; one request per result card is forbidden.
- Keep formal layering, Zod, OpenAPI, permission declarations, audit for protected profile writes, standard envelopes, soft deletes, and additive migrations.
- Every task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Database

- Modify `backend/prisma/schema.prisma`: `EntityFavorite`, `EntityShareEvent`, relations, and technician base coordinate fields.
- Create `backend/prisma/migrations/20260901020000_entity_engagement_nearby_ranking/migration.sql`: tables, checks, generated/active keys, indexes, and coordinate pair constraint.
- Create `backend/tests/entity-engagement-schema.test.ts`: guard exact-target, idempotency, uniqueness, privacy fields, and indexes.

### Favorites and shares

- Create `backend/src/validators/entity-engagement.validator.ts`.
- Create `backend/src/repositories/entity-engagement.repository.ts`.
- Create `backend/src/services/entity-engagement.service.ts`.
- Create `backend/src/controllers/entity-engagement.controller.ts`.
- Create `backend/src/routes/entity-engagement.routes.ts`.
- Modify `backend/src/app.ts`: inject/register the module.
- Modify `backend/src/constants/permissions.constants.ts`: authenticated entity-engagement permissions.
- Modify `backend/prisma/seed.ts`: role assignments.
- Modify `backend/src/constants/error-codes.ts`.
- Modify `backend/src/api/openapi.ts` and `backend/tests/openapi.test.ts`.
- Create `backend/tests/entity-engagement.repository.test.ts`.
- Create `backend/tests/entity-engagement.service.test.ts`.
- Create `backend/tests/entity-engagement-api.test.ts`.
- Modify `backend/src/repositories/realtime.repository.ts`: atomic NeeDo share message + event writer.
- Modify `backend/src/services/realtime.service.ts`: membership/block/message-eligibility checks for entity share.
- Modify `backend/tests/realtime-service.test.ts` and `backend/tests/realtime-api.test.ts`.
- Create `src/features/entity-engagement/api.ts` and `src/features/entity-engagement/api.test.ts`.
- Create `src/shared/engagement/formatCompactCount.ts` and `src/shared/engagement/formatCompactCount.test.ts`.

### Technician location and nearby ranking

- Modify `backend/src/validators/technician-profile.validator.ts`.
- Modify `backend/src/repositories/technician-profile.repository.ts`.
- Modify `backend/src/services/technician-profile.service.ts`.
- Modify `backend/tests/technician-profile-validator.test.ts`, `backend/tests/technician-profile.repository.test.ts`, and `backend/tests/technician-profile-api.test.ts`.
- Modify `src/features/core-read/technicianProfileApi.ts` and its tests.
- Create `backend/src/services/nearby-technician-ranking.service.ts`.
- Create `backend/tests/nearby-technician-ranking.service.test.ts`.
- Modify `backend/src/validators/core-read.validator.ts`.
- Modify `backend/src/repositories/core-read.repository.ts`.
- Modify `backend/src/services/core-read.service.ts`.
- Modify `backend/tests/core-read.repository.test.ts` and `backend/tests/core-read-api.test.ts`.
- Create `src/features/location/searchOrigin.ts` and `src/features/location/searchOrigin.test.ts`.
- Modify `src/pages/user/CategoryPage.tsx`: pass a resolved coordinate pair and show the no-location guidance state; retain current compact result presentation until microstep 5.
- Modify `src/pages/user/CategoryPage.render.test.ts` and `src/i18n/translations.ts`.
- Modify `docs/api.md`.

---

### Task 1: Add entity engagement and private service-base schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901020000_entity_engagement_nearby_ranking/migration.sql`
- Create: `backend/tests/entity-engagement-schema.test.ts`

**Models:**

```prisma
enum EntityShareChannel {
  NEEDO_MESSAGE
  SYSTEM_SHARE
}

model EntityFavorite {
  id                  Int                @id @default(autoincrement())
  userId              Int                @map("user_id")
  shopId              Int?               @map("shop_id")
  technicianProfileId Int?               @map("technician_profile_id")
  activeKey           String?            @unique @map("active_key") @db.VarChar(191)
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")
  deletedAt           DateTime?          @map("deleted_at")
  // user, shop, technicianProfile relations
}

model EntityShareEvent {
  id                  Int                @id @default(autoincrement())
  actorUserId         Int                @map("actor_user_id")
  actorIdentityId     Int                @map("actor_identity_id")
  shopId              Int?               @map("shop_id")
  technicianProfileId Int?               @map("technician_profile_id")
  channel             EntityShareChannel
  recipientUserId     Int?               @map("recipient_user_id")
  recipientIdentityId Int?               @map("recipient_identity_id")
  conversationId      Int?               @map("conversation_id")
  messageId           Int?               @unique @map("message_id")
  idempotencyKey      String             @map("idempotency_key") @db.VarChar(160)
  requestFingerprint  String             @map("request_fingerprint") @db.Char(64)
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")
  deletedAt           DateTime?          @map("deleted_at")
  // actor/recipient/entity/conversation/message relations

  @@unique([actorUserId, idempotencyKey], map: "entity_share_actor_idempotency_key")
}
```

Add `baseLatitude Decimal? @db.Decimal(10,7)` and `baseLongitude Decimal? @db.Decimal(10,7)` to `TechnicianProfile`.

- [ ] **Step 1: Write the failing schema test**

Guard standard business columns, exactly-one-target checks for both tables, channel-specific message checks, user/target indexes, actor/key uniqueness, unique message reference, and `(base_latitude IS NULL) = (base_longitude IS NULL)`.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/entity-engagement-schema.test.ts
```

- [ ] **Step 3: Add models, relations, and migration**

The migration must check:

```sql
(shop_id IS NOT NULL) + (technician_profile_id IS NOT NULL) = 1
```

For `NEEDO_MESSAGE`, `conversation_id` and `message_id` are non-null. For `SYSTEM_SHARE`, they are null. Do not expose a delete route for share events.

- [ ] **Step 4: Generate and verify GREEN**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/entity-engagement-schema.test.ts
```

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901020000_entity_engagement_nearby_ranking/migration.sql backend/tests/entity-engagement-schema.test.ts
git commit -m "feat: add entity engagement and technician location schema"
```

---

### Task 2: Implement idempotent account-owned favorites

**Files:**
- Create: `backend/src/validators/entity-engagement.validator.ts`
- Create: `backend/src/repositories/entity-engagement.repository.ts`
- Create: `backend/src/services/entity-engagement.service.ts`
- Create: `backend/src/controllers/entity-engagement.controller.ts`
- Create: `backend/src/routes/entity-engagement.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Create: `backend/tests/entity-engagement.repository.test.ts`
- Create: `backend/tests/entity-engagement.service.test.ts`
- Create: `backend/tests/entity-engagement-api.test.ts`

**Routes:**

```text
PUT    /api/v1/me/entity-favorites/:targetType/:publicId
DELETE /api/v1/me/entity-favorites/:targetType/:publicId
GET    /api/v1/me/entity-favorites?page=1&pageSize=20&targetType=technician
POST   /api/v1/me/entity-favorites/statuses
```

**Types:**

```ts
export type EntityTargetType = "shop" | "technician";
export type EntityFavoriteState = {
  targetType: EntityTargetType;
  publicId: string;
  isFavorited: boolean;
  favoriteCount: number;
};

export type EntityFavoriteStatusesBody = {
  targets: Array<{ targetType: EntityTargetType; publicId: string }>;
};
```

- [ ] **Step 1: Write failing repository/service/API tests**

Cover account ownership across identity switches, target visibility, duplicate PUT, duplicate DELETE, restore after delete, separate shop/technician target keys, maximum 100 batched targets, pagination, RBAC, and authoritative count returned after each mutation.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement.service.test.ts tests/entity-engagement-api.test.ts
```

- [ ] **Step 3: Implement target resolution and transaction**

Resolve only active published entities with active public identifiers. In one transaction, find the historical user/target tuple including soft-deleted rows, restore/update that row when favoriting, or soft-delete it when unfavoriting; return a fresh count filtered by `deletedAt: null`.

- [ ] **Step 4: Register authenticated permissions**

Use `entity-favorite:read` and `entity-favorite:write`; grant them to authenticated customer, technician, merchant roles, and system operators according to existing role conventions. Repository ownership remains `actor.userId` even when current identity changes.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement.service.test.ts tests/entity-engagement-api.test.ts
git add backend/src/validators/entity-engagement.validator.ts backend/src/repositories/entity-engagement.repository.ts backend/src/services/entity-engagement.service.ts backend/src/controllers/entity-engagement.controller.ts backend/src/routes/entity-engagement.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/prisma/seed.ts backend/src/constants/error-codes.ts backend/tests/entity-engagement.repository.test.ts backend/tests/entity-engagement.service.test.ts backend/tests/entity-engagement-api.test.ts
git commit -m "feat: persist entity favorites by user account"
```

---

### Task 3: Record successful NeeDo and system shares

**Files:**
- Modify: `backend/src/validators/entity-engagement.validator.ts`
- Modify: `backend/src/repositories/entity-engagement.repository.ts`
- Modify: `backend/src/services/entity-engagement.service.ts`
- Modify: `backend/src/controllers/entity-engagement.controller.ts`
- Modify: `backend/src/routes/entity-engagement.routes.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/tests/entity-engagement.repository.test.ts`
- Modify: `backend/tests/entity-engagement.service.test.ts`
- Modify: `backend/tests/entity-engagement-api.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Routes and bodies:**

```text
POST /api/v1/entities/:targetType/:publicId/shares/needo
POST /api/v1/entities/:targetType/:publicId/shares/system
```

```ts
type NeedoEntityShareBody = {
  conversationId: number;
  recipientIdentityId: number;
  idempotencyKey: string;
};

type SystemEntityShareBody = {
  idempotencyKey: string;
};
```

- [ ] **Step 1: Write failing atomicity and retry tests**

Prove message failure/blocked recipient/non-member/inactive target produce no event; message and event use one transaction; repeated key/same payload returns the original event/count; repeated key/different payload returns `409`; different keys count repeated shares; system retry counts once.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement.service.test.ts tests/entity-engagement-api.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts
```

- [ ] **Step 3: Add the atomic realtime repository operation**

```ts
export type CreateNeedoEntityShareInput = {
  actorUserId: number;
  actorIdentityId: number;
  conversationId: number;
  recipientIdentityId: number;
  target: ResolvedEntityTarget;
  idempotencyKey: string;
  requestFingerprint: string;
};
```

Validate normal message-send eligibility first, then create the typed system/share message and `EntityShareEvent` inside one Prisma `$transaction`. The event references the committed message ID.

- [ ] **Step 4: Implement system-share recording**

The server accepts the success report but never invokes browser capabilities itself. The frontend adapter added in Task 8 must call this endpoint only after capability success.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement.service.test.ts tests/entity-engagement-api.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts
git add backend/src/validators/entity-engagement.validator.ts backend/src/repositories/entity-engagement.repository.ts backend/src/services/entity-engagement.service.ts backend/src/controllers/entity-engagement.controller.ts backend/src/routes/entity-engagement.routes.ts backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/tests/entity-engagement.repository.test.ts backend/tests/entity-engagement.service.test.ts backend/tests/entity-engagement-api.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts
git commit -m "feat: count successful entity shares"
```

---

### Task 4: Add private technician service-base editing

**Files:**
- Modify: `backend/src/validators/technician-profile.validator.ts`
- Modify: `backend/src/repositories/technician-profile.repository.ts`
- Modify: `backend/src/services/technician-profile.service.ts`
- Modify: `backend/tests/technician-profile-validator.test.ts`
- Modify: `backend/tests/technician-profile.repository.test.ts`
- Modify: `backend/tests/technician-profile-api.test.ts`
- Modify: `src/features/core-read/technicianProfileApi.ts`
- Modify or create: `src/features/core-read/technicianProfileApi.test.ts`

**Contract:**

```ts
type TechnicianServiceBase = {
  latitude: number;
  longitude: number;
} | null;
```

- [ ] **Step 1: Write failing pair/range/privacy tests**

Accept both coordinates or both null; reject one-sided values, latitude outside `[-90, 90]`, longitude outside `[-180, 180]`, non-technician scope, and attempts to read coordinates through public core-read or directory DTOs.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile-api.test.ts
npm test -- --run src/features/core-read/technicianProfileApi.test.ts
```

- [ ] **Step 3: Extend only the self-profile contract**

Map decimal values to numbers for `GET /technician-profile/me`; update both in the existing audited profile transaction. Do not add them to `CoreTechnicianCard`, technician public detail, or directory contact details.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile-api.test.ts
npm test -- --run src/features/core-read/technicianProfileApi.test.ts
git add backend/src/validators/technician-profile.validator.ts backend/src/repositories/technician-profile.repository.ts backend/src/services/technician-profile.service.ts backend/tests/technician-profile-validator.test.ts backend/tests/technician-profile.repository.test.ts backend/tests/technician-profile-api.test.ts src/features/core-read/technicianProfileApi.ts src/features/core-read/technicianProfileApi.test.ts
git commit -m "feat: manage private technician service base"
```

---

### Task 5: Implement the pure radius and ranking policy

**Files:**
- Create: `backend/src/services/nearby-technician-ranking.service.ts`
- Create: `backend/tests/nearby-technician-ranking.service.test.ts`

**Interfaces:**

```ts
export type Coordinates = { latitude: number; longitude: number };
export type NearbyTechnicianCandidate = {
  technicianProfileId: number;
  locations: Coordinates[];
  ratingAverage: string | null;
  completedOrderCount: number;
  reviewCount: number;
  registeredAt: Date;
};

export type RankedNearbyTechnician = NearbyTechnicianCandidate & {
  distanceKm: number;
  nearbyRank: 1 | 2 | 3 | null;
  resolvedRadiusKm: number;
};
```

- [ ] **Step 1: Write failing policy tests**

Cover Haversine minimum across locations; two inside 3 km plus one at 3.6 km resolves to 4 km; all candidates inside 4 km are re-ranked; three inside 3 km stop expansion; fewer than three globally return available ranks; and sort order is rating desc, completed desc, reviews desc, registration asc, ID asc.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/nearby-technician-ranking.service.test.ts
```

- [ ] **Step 3: Implement deterministic pure functions**

Export `haversineDistanceKm`, `minimumCandidateDistanceKm`, `resolveNearbyRadius`, and `rankNearbyTechnicians`. Treat missing/invalid locations as ineligible, not zero distance.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/nearby-technician-ranking.service.test.ts
git add backend/src/services/nearby-technician-ranking.service.ts backend/tests/nearby-technician-ranking.service.test.ts
git commit -m "feat: define nearby technician ranking policy"
```

---

### Task 6: Integrate ranking into formal technician search

**Files:**
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`

**Query extension:**

```ts
latitude?: number;
longitude?: number;
```

Both must be present or absent.

- [ ] **Step 1: Write failing validator/repository/API tests**

Assert incomplete pairs return `400`; no pair keeps existing search and omits ranking fields; location search includes personal base plus published active affiliated shops; uses nearest location; excludes private/deleted/unpublished/non-S-identity profiles; preserves all OR branches; and paginates only after final-radius rank.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
```

- [ ] **Step 3: Add repository ports that separate count, radius candidates, and mapping**

```ts
countEligibleLocatedTechnicians(input): Promise<number>
findEligibleTechniciansWithinBounds(input, radiusKm): Promise<NearbyTechnicianCandidate[]>
loadTechnicianCardsByRankedIds(ids): Promise<Map<number, TechnicianCardPayload>>
```

Use indexed latitude/longitude bounding boxes before Haversine filtering. Count unique technicians, not location rows. Stop when at least three candidates exist or the within-radius unique count equals the total eligible located count.

- [ ] **Step 4: Return additive ranking fields**

Add optional `distanceKm`, `nearbyRank`, and `resolvedRadiusKm` to backend technician cards. They remain absent when no origin is supplied; frontend final typing/style lands in microstep 5.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
git add backend/src/validators/core-read.validator.ts backend/src/repositories/core-read.repository.ts backend/src/services/core-read.service.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts
git commit -m "feat: rank nearby technicians before pagination"
```

---

### Task 7: Document engagement and ranking contracts

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing OpenAPI guards**

Guard favorite routes, batch status body limit, share routes, idempotency conflicts, coordinate pair semantics, optional rank fields, and privacy statement excluding technician coordinates.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts
```

- [ ] **Step 3: Add schemas and examples, then verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "docs: define entity engagement and nearby search APIs"
```

---

### Task 8: Add frontend adapters, exact count formatting, and search-origin policy

**Files:**
- Create: `src/features/entity-engagement/api.ts`
- Create: `src/features/entity-engagement/api.test.ts`
- Create: `src/shared/engagement/formatCompactCount.ts`
- Create: `src/shared/engagement/formatCompactCount.test.ts`
- Create: `src/features/location/searchOrigin.ts`
- Create: `src/features/location/searchOrigin.test.ts`
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.render.test.ts`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write failing formatter and adapter tests**

Lock `0`, `999`, `1000`, `1999`, `2000`, and `999999` as `"0"`, `"999"`, `"1k"`, `"1k"`, `"2k"`, and `"999k"`. Prove status batching, optimistic favorite rollback to authoritative response, stable retry key, and system endpoint invocation only after successful platform share capability resolution.

- [ ] **Step 2: Write failing origin tests**

Resolution order is selected homepage service location, then an already-authorized/current device location, then `null`. A denied prompt is not reopened automatically on every search render.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/features/entity-engagement/api.test.ts src/shared/engagement/formatCompactCount.test.ts src/features/location/searchOrigin.test.ts src/pages/user/CategoryPage.render.test.ts
```

- [ ] **Step 4: Implement adapters and pass coordinates to search**

Keep current compact result cards. When origin is null, show translated location guidance separately from the no-results state and send no coordinate query fields.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm test -- --run src/features/entity-engagement/api.test.ts src/shared/engagement/formatCompactCount.test.ts src/features/location/searchOrigin.test.ts src/pages/user/CategoryPage.render.test.ts
git add src/features/entity-engagement/api.ts src/features/entity-engagement/api.test.ts src/shared/engagement/formatCompactCount.ts src/shared/engagement/formatCompactCount.test.ts src/features/location/searchOrigin.ts src/features/location/searchOrigin.test.ts src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.render.test.ts src/i18n/translations.ts
git commit -m "feat: connect entity engagement and search origin"
```

---

### Task 9: Run the complete microstep gate

- [ ] **Step 1: Verify physical schema**

Generate Prisma Client, apply the additive migration to a disposable MySQL database, and independently inspect checks, generated/active keys, unique constraints, foreign keys, and indexes.

- [ ] **Step 2: Run backend gates**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/entity-engagement-schema.test.ts tests/entity-engagement.repository.test.ts tests/entity-engagement.service.test.ts tests/entity-engagement-api.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile-api.test.ts tests/nearby-technician-ranking.service.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 3: Run frontend gates**

```bash
npm test -- --run src/features/entity-engagement/api.test.ts src/shared/engagement/formatCompactCount.test.ts src/features/location/searchOrigin.test.ts src/features/core-read/technicianProfileApi.test.ts src/pages/user/CategoryPage.render.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 4: Perform authenticated browser and data acceptance**

Verify listener PID/cwd/branch/proxy/backend origin first. Prove favorite identity switching does not duplicate, unfavorite/re-favorite count changes, NeeDo share failure does not count, repeated share retry counts once, two technicians inside 3 km expand to 4 km for a third, three inside 3 km do not expand, no location shows no medals plus guidance, and no precise technician coordinates appear in network responses.

- [ ] **Step 5: Stop at the microstep boundary**

Do not start service/contact-card or final search-card work in this branch. Local acceptance is not push, deployment, or production acceptance.
