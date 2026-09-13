# Shop Privacy Visibility Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist shop-scoped visibility and enforce it for every public discovery, direct-read, engagement, and booking boundary without changing the same account's customer or technician identity visibility.

**Architecture:** Add a `Shop.visibility` source of truth and one repository policy that converts the authenticated viewer into a Prisma shop predicate and supports direct authorization. Public query repositories compose that predicate before pagination, while merchant-only commands update the field through scoped, audited API methods. Optional authentication is carried through formerly anonymous reads so owners, reciprocal friends, and formal network relations can receive their permitted view without making public responses private-by-default.

**Tech Stack:** TypeScript, Express, Zod, Prisma/MySQL, Jest/Supertest, React 19, Vite/Vitest.

## Global Constraints

- Work only in `codex/fix-shop-privacy-visibility-20260913` until the verified local commit is ready.
- Do not use, stop, restart, or occupy port 5180 during branch development.
- Do not access or mutate staging, production, remote databases, Git remotes, CI/CD, SSH, pull requests, or deployment systems.
- `privateAll` permits only the shop owner; `limited` also permits reciprocal friends; `network` also permits active formal shop relations and active introducer relations.
- Shop visibility applies to the shop identity and shop-owned data only; customer and technician profiles keep their own visibility authorities.
- All list filtering must happen before pagination and totals; direct denials return the existing not-found contract to avoid existence disclosure.
- Every mutation remains merchant-shop scoped, Zod-validated, RBAC-protected, and audit logged.

---

### Task 1: Persisted shop visibility and relationship policy

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260913150000_shop_visibility/migration.sql`
- Create: `backend/prisma/migrations/20260913150000_shop_visibility/rollback.sql`
- Create: `backend/src/repositories/shop-visibility.repository.ts`
- Create: `backend/tests/shop-visibility.repository.test.ts`
- Create: `backend/tests/shop-visibility-schema.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedAccessContext` projected to `{ userId, identityId, identityType, identityScopeType, identityScopeId }`.
- Produces: `ShopVisibility = "public" | "privateAll" | "limited" | "network"`, `ShopVisibilityViewer`, `buildVisibleShopWhere(viewer)`, and `ShopVisibilityRepository.canView(shopId, viewer)`.

- [ ] **Step 1: Write failing policy and schema tests**

```ts
expect(buildVisibleShopWhere(undefined)).toEqual({ visibility: "public" });
expect(ownerWhere.OR).toContainEqual({ ownerUserId: 91 });
expect(friendWhere).toRequireReciprocalActiveContacts();
expect(networkWhere).toContainActiveMerchantMembershipTechnicianAffiliationAndAgentReferralBranches();
expect(schema).toContain('visibility String @default("public")');
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/shop-visibility.repository.test.ts tests/shop-visibility-schema.test.ts --runInBand`
Expected: FAIL because the field, migration, and policy module do not exist.

- [ ] **Step 3: Implement minimal schema, migration, rollback, and policy**

```ts
export const buildVisibleShopWhere = (viewer?: ShopVisibilityViewer): Prisma.ShopWhereInput =>
  viewer ? { OR: publicOwnerFriendAndNetworkBranches(viewer) } : { visibility: "public" };
```

- [ ] **Step 4: Run the same tests to verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/shop-visibility.repository.test.ts tests/shop-visibility-schema.test.ts --runInBand`
Expected: PASS.

### Task 2: Scoped and audited merchant visibility API

**Files:**
- Create: `backend/src/validators/shop-visibility.validator.ts`
- Create: `backend/src/services/shop-visibility.service.ts`
- Create: `backend/src/controllers/shop-visibility.controller.ts`
- Create: `backend/src/routes/shop-visibility.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/shop-visibility.service.test.ts`
- Create: `backend/tests/shop-visibility-api.test.ts`
- Create: `backend/tests/shop-visibility-openapi.test.ts`

**Interfaces:**
- Consumes: authenticated merchant actor, `shopId`, `{ visibility }`, request context, existing `merchant-admin:shop:read/write` permissions.
- Produces: `GET/PUT /api/v1/merchant-admin/shops/:shopId/visibility` returning `{ shopId, visibility, updatedAt, updatedBy }`.

- [ ] **Step 1: Write failing validator/service/API/OpenAPI tests**

```ts
await service.update(actor, context, 21, "privateAll");
expect(repository.update).toHaveBeenCalledWith(21, "privateAll", actor.userId);
expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "merchant_admin.shop.visibility.update", targetId: 21 }));
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/shop-visibility.service.test.ts tests/shop-visibility-api.test.ts tests/shop-visibility-openapi.test.ts --runInBand`
Expected: FAIL because the command API is absent.

- [ ] **Step 3: Implement the minimum scoped read/update API and docs**

```ts
router.put("/shops/:shopId/visibility", authenticate(), authorize("merchant-admin:shop:write"), validateRequest({ params, body }), controller.update);
```

- [ ] **Step 4: Run the same tests to verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/shop-visibility.service.test.ts tests/shop-visibility-api.test.ts tests/shop-visibility-openapi.test.ts --runInBand`
Expected: PASS.

### Task 3: Enforce discovery, detail, favorite/share, and booking boundaries

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/controllers/core-read.controller.ts`
- Modify: `backend/src/routes/core-read.routes.ts`
- Modify: `backend/src/repositories/entity-engagement.repository.ts`
- Modify: `backend/src/services/entity-engagement.service.ts`
- Modify: `backend/src/routes/entity-engagement.routes.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/src/controllers/pricing-mode.controller.ts`
- Modify: `backend/src/routes/pricing-mode.routes.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: relevant repository/service/API tests.

**Interfaces:**
- Consumes: the same `ShopVisibilityViewer` on all optional-auth reads and authenticated engagement/booking commands.
- Produces: filtered service/shop lists and totals; 404 for denied shop/service/detail/navigation/share/favorite targets; booking refusal before transaction; technician identity payloads retained with denied shop affiliation omitted.

- [ ] **Step 1: Write failing coverage for anonymous, owner, unrelated, reciprocal friend, active network relation, inactive/reversed relation, favorites, share, direct detail, and booking navigation/create**

```ts
expect(searchWhere).toContainShopVisibility(viewer);
await expect(service.getShopDetail(hiddenShop, stranger)).rejects.toMatchObject({ statusCode: 404 });
await expect(booking.createBooking(stranger, hiddenShopInput)).rejects.toMatchObject({ statusCode: 404 });
await expect(repository.findTechnicianDetail(technicianId, stranger)).resolves.toMatchObject({ id: technicianId, shop: null });
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/entity-engagement.repository.test.ts tests/entity-engagement-service.test.ts tests/pricing-mode-service.test.ts tests/booking-service.test.ts --runInBand`
Expected: new assertions FAIL on missing visibility enforcement.

- [ ] **Step 3: Compose the shared predicate at repository boundaries and direct checks at command boundaries**

```ts
const where = { ...publishedShopWhere, AND: [buildVisibleShopWhere(viewer)] };
if (!(await shopVisibility.canView(shopId, viewer))) throw notFound("error.shop.not_found");
```

- [ ] **Step 4: Re-run focused tests to verify GREEN**

Run the command from Step 2.
Expected: PASS with all positive and negative relationship cases.

### Task 4: Merchant UI persistence, cache safety, integrated verification, and local merge

**Files:**
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/features/pricing-mode/api.test.ts`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.test.tsx`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/features/pricing-mode/api.test.ts`
- Modify: `backend/src/middlewares/cache.middleware.ts`
- Modify: `backend/tests/observability.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: formal shop visibility GET/PUT API and optional bearer auth on public read calls.
- Produces: persisted merchant switch state, authenticated relationship-aware reads when a session exists, and `no-store` caching for authorization-bearing responses.

- [ ] **Step 1: Write failing frontend and cache tests**

```ts
expect(shopVisibilityApi.update(21, "privateAll")).toRequest("PUT", "/shops/21/visibility");
expect(coreReadFetch).toCarryOptionalAuth();
expect(authenticatedCacheHeader).toBe("no-store");
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/features/shop-visibility/api.test.ts src/features/core-read/api.test.ts src/pages/mobile/MerchantPortalPage.test.tsx`
Expected: FAIL because persistence and optional-auth transport are absent.

- [ ] **Step 3: Implement persistence and cache isolation**

```ts
const saved = await shopVisibilityApi.update(storeApiId, enabled ? visibility : "public");
setStorePrivacyEnabled(saved.visibility !== "public");
```

- [ ] **Step 4: Verify changed and surrounding behavior**

Run focused backend/frontend tests, backend lint/build, root lint/build, migration status/checks available locally, and inspect `git diff --check` plus the exact staged diff.

- [ ] **Step 5: Commit, merge into local main, and verify the final integrated state on port 5180**

```bash
git commit -m "fix: enforce shop privacy visibility"
git merge --no-ff codex/fix-shop-privacy-visibility-20260913
```

Expected: clean merge with no conflicts; final local main health/API/page/core-flow checks pass on the existing 5180 runtime after confirming its PID, cwd, branch, and proxy. No push, PR, deployment, CI/CD, or remote mutation occurs.
