# Shop Membership Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the merchant membership center and add the customer membership wallet on one real shop-scoped data source, with a visible `Test` badge, formal RBAC, transactional audit, and only membership enrollment enabled as a write.

**Architecture:** Add a dedicated `ShopCustomerMembership` aggregate and read-only `ShopMembershipCard` projection in Prisma. A focused Route → Controller → Service → Repository stack exposes merchant shop-scoped and customer self-scoped contracts; React clients render the same contracts in the merchant center and customer personal center. The legacy browser store stays deleted, and card issuing, top-up, redemption, and refund remain absent.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes, Vitest, Node.js 22, Express, Zod, Prisma 7, MySQL 8, Jest, Supertest, OpenAPI.

## Global Constraints

- Work only in `/Users/eason/Documents/New project/.worktrees/restore-shop-membership` on `codex/restore-shop-membership`.
- Do not add mock, demo, placeholder, localStorage, IndexedDB, or fake API data.
- `Test` is a visible feature-stage badge, not a data-source label.
- Merchant APIs never accept `shopId`; resolve it from the authenticated `shop` identity and scope every query again in the repository.
- Customer APIs never accept `userId` or `customerProfileId`; resolve the current customer identity server-side.
- The only mutation is creating a shop membership relation; no card, balance, use-count, refund, coupon, or point mutation.
- All lists are server-paginated and all new request inputs are strict Zod schemas.
- All new user-visible copy is available in `zh-Hans`, `zh-Hant`, `ja`, `en`, and `ko` through the existing i18n layer.
- Run `npm run prisma:generate` after schema changes and never edit an applied migration.

---

## File Map

### Backend domain

- Create `backend/src/validators/shop-membership.validator.ts`: strict route/query/body schemas and inferred types.
- Create `backend/src/repositories/shop-membership.repository.ts`: Prisma-only shop/customer membership reads and transactional enrollment.
- Create `backend/src/services/shop-membership.service.ts`: identity scope, conflict mapping, payload shaping, and audit input.
- Create `backend/src/controllers/shop-membership.controller.ts`: request/response adapters only.
- Create `backend/src/routes/shop-membership.routes.ts`: authenticated RBAC route declarations.
- Modify `backend/src/app.ts`: dependency injection and route registration.
- Modify `backend/src/constants/permissions.constants.ts`: formal permission definitions and owner/staff assignments.
- Modify `backend/src/constants/error-codes.ts`: stable shop-membership conflict code.
- Modify `backend/src/api/openapi.ts`: document every new route and schema.
- Modify `backend/prisma/schema.prisma`: enums, models, and relations.
- Create `backend/prisma/migrations/20260831120000_shop_membership_foundation/migration.sql`: additive tables and indexes only.

### Frontend domain

- Create `src/components/ui/TestFeatureBadge.tsx`: reusable accessible red `Test` badge.
- Create `src/features/shop-member/api.ts`: typed merchant and customer membership clients.
- Replace `src/features/shop-member/ShopMemberCenterPage.tsx`: formal five-view merchant UI.
- Create `src/pages/user/UserMembershipsPage.tsx`: customer list/detail UI.
- Modify `src/pages/user/UserCenterPage.tsx`: real count, route, caption, and badge.
- Modify `src/features/merchant-navigation/merchantModules.ts`: membership badge metadata.
- Modify `src/features/merchant-navigation/MerchantPrimaryNavCarousel.tsx`: render badge without changing other modules.
- Modify `src/auth/featurePermissions.ts`: remove shop-member permissions from the legacy implicit merchant fallback.
- Modify `src/App.tsx`: customer membership list/detail routes.
- Modify `src/i18n/translations.ts`: five-language strings.

### Tests and documentation

- Create `backend/tests/shop-membership-schema.test.ts`.
- Create `backend/tests/shop-membership.repository.test.ts`.
- Create `backend/tests/shop-membership.service.test.ts`.
- Create `backend/tests/shop-membership-api.test.ts`.
- Create `backend/tests/shop-membership-openapi.test.ts`.
- Create `backend/tests/shop-membership-permissions.test.ts`.
- Create `src/features/shop-member/api.test.ts`.
- Create `src/features/shop-member/ShopMemberCenterPage.test.tsx`.
- Create `src/pages/user/UserMembershipsPage.test.tsx`.
- Modify `src/pages/user/UserCenterPage.test.tsx`.
- Modify `src/features/merchant-navigation/merchantModules.test.ts`.
- Update `README.md` with formal membership routes and deferred mutations.

---

### Task 1: Lock the UI contract and `Test` badge in failing tests

**Files:**
- Create: `src/components/ui/TestFeatureBadge.tsx`
- Create: `src/features/shop-member/api.ts`
- Test: `src/features/shop-member/api.test.ts`
- Test: `src/features/shop-member/ShopMemberCenterPage.test.tsx`
- Test: `src/pages/user/UserMembershipsPage.test.tsx`
- Modify: `src/pages/user/UserCenterPage.test.tsx`
- Modify: `src/features/merchant-navigation/merchantModules.test.ts`

**Interfaces:**
- Produces `merchantShopMembershipApi` and `customerShopMembershipApi` with the paths from the design.
- Produces `<TestFeatureBadge />` with `aria-label="Test 功能"` and visible text `Test`.
- Locks merchant section keys to `overview | members | cards | activity | analytics`; legacy `verify` resolves to `activity`.

- [ ] **Step 1: Write API path tests before implementation**

```ts
expect(requestSpy).toHaveBeenCalledWith("/merchant-admin/shop-memberships", {
  query: { page: 2, pageSize: 20, keyword: "u0000000123", status: "active" }
});
expect(requestSpy).toHaveBeenCalledWith("/customer-profile/me/shop-memberships", {
  query: { page: 1, pageSize: 20, status: "active" }
});
```

- [ ] **Step 2: Write source/DOM tests for the restored surfaces**

```ts
expect(screen.getByText("会员中心")).toBeInTheDocument();
expect(screen.getByLabelText("Test 功能")).toHaveTextContent("Test");
expect(screen.getByRole("tab", { name: "会员" })).toBeInTheDocument();
expect(screen.queryByText("扫码核销")).not.toBeInTheDocument();
```

```ts
expect(userCenterSource).toContain('to: "/me/memberships"');
expect(userCenterSource).toContain("查看已加入店铺与会员卡状态");
expect(merchantModules.find((item) => item.key === "members")?.badge).toBe("Test");
```

- [ ] **Step 3: Run the focused frontend tests and confirm RED**

Run:

```bash
npm test -- src/features/shop-member/api.test.ts src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/features/merchant-navigation/merchantModules.test.ts
```

Expected: failures for missing API module, missing customer page, missing `Test` badge, and old `/me` link.

- [ ] **Step 4: Add only the typed contracts and badge component**

```ts
export const merchantShopMembershipApi = {
  overview: () => httpClient.request<ShopMembershipOverview>("/merchant-admin/shop-memberships/overview"),
  list: (query: MembershipListQuery) => httpClient.request<Paginated<MerchantMembershipListItem>>("/merchant-admin/shop-memberships", { query }),
  enroll: (customerNeedoId: string) => httpClient.request<MerchantMembershipDetail>("/merchant-admin/shop-memberships", { method: "POST", body: { customerNeedoId } })
};
```

Keep page tests RED until Tasks 5 and 6; the API tests and badge unit assertions must pass.

- [ ] **Step 5: Commit the contract checkpoint**

```bash
git add src/components/ui/TestFeatureBadge.tsx src/features/shop-member/api.ts src/features/shop-member/api.test.ts src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/features/merchant-navigation/merchantModules.test.ts
git commit -m "test: define shop membership UI contracts"
```

### Task 2: Add the additive Prisma foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260831120000_shop_membership_foundation/migration.sql`
- Test: `backend/tests/shop-membership-schema.test.ts`

**Interfaces:**
- Produces Prisma models `ShopCustomerMembership` and `ShopMembershipCard`.
- Produces enums `ShopCustomerMembershipStatus`, `ShopCustomerMembershipSource`, `ShopMembershipCardType`, and `ShopMembershipCardStatus`.
- Adds relation collections on `Shop`, `CustomerProfile`, and `User` without changing existing columns.

- [ ] **Step 1: Write the migration contract test**

```ts
expect(schema).toContain("model ShopCustomerMembership");
expect(schema).toContain("model ShopMembershipCard");
expect(schema).toContain("shop_customer_memberships_active_key_key");
expect(migration).toContain("CREATE TABLE `shop_customer_memberships`");
expect(migration).toContain("CREATE TABLE `shop_membership_cards`");
expect(migration).not.toContain("INSERT INTO");
```

- [ ] **Step 2: Run the schema test and confirm RED**

Run: `cd backend && npm test -- shop-membership-schema.test.ts`

Expected: FAIL because both models and the migration are absent.

- [ ] **Step 3: Add exact models and migration**

```prisma
model ShopCustomerMembership {
  id                Int                          @id @default(autoincrement())
  publicId          String                       @unique @default(uuid()) @map("public_id") @db.Char(36)
  shopId            Int                          @map("shop_id")
  customerProfileId Int                          @map("customer_profile_id")
  status            ShopCustomerMembershipStatus @default(ACTIVE)
  source            ShopCustomerMembershipSource @default(MERCHANT_MANUAL)
  activeKey         String?                      @unique(map: "shop_customer_memberships_active_key_key") @map("active_key") @db.VarChar(191)
  startedAt         DateTime                     @default(now()) @map("started_at")
  endedAt           DateTime?                    @map("ended_at")
  createdById       Int?                         @map("created_by_id")
  updatedById       Int?                         @map("updated_by_id")
  createdAt         DateTime                     @default(now()) @map("created_at")
  updatedAt         DateTime                     @updatedAt @map("updated_at")
  deletedAt         DateTime?                    @map("deleted_at")
  shop              Shop                         @relation(fields: [shopId], references: [id], onDelete: Restrict)
  customerProfile   CustomerProfile              @relation(fields: [customerProfileId], references: [id], onDelete: Restrict)
  createdBy         User?                        @relation("ShopMembershipCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy         User?                        @relation("ShopMembershipUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  cards             ShopMembershipCard[]
  @@index([shopId, status, startedAt, deletedAt], map: "shop_customer_memberships_shop_status_idx")
  @@index([customerProfileId, status, startedAt, deletedAt], map: "shop_customer_memberships_customer_status_idx")
  @@index([createdById])
  @@index([updatedById])
  @@map("shop_customer_memberships")
}
```

Add the read-only card projection exactly as follows; no route in this plan writes it:

```prisma
model ShopMembershipCard {
  id                  Int                      @id @default(autoincrement())
  publicId            String                   @unique @default(uuid()) @map("public_id") @db.Char(36)
  membershipId        Int                      @map("membership_id")
  cardNo              String                   @unique @map("card_no") @db.VarChar(40)
  name                String                   @db.VarChar(120)
  type                ShopMembershipCardType
  status              ShopMembershipCardStatus @default(ACTIVE)
  principalBalanceJpy Int?                     @map("principal_balance_jpy")
  bonusBalanceJpy     Int?                     @map("bonus_balance_jpy")
  remainingUses       Int?                     @map("remaining_uses")
  totalUses           Int?                     @map("total_uses")
  issuedAt            DateTime                 @map("issued_at")
  expiresAt           DateTime?                @map("expires_at")
  frozenAt            DateTime?                @map("frozen_at")
  createdAt           DateTime                 @default(now()) @map("created_at")
  updatedAt           DateTime                 @updatedAt @map("updated_at")
  deletedAt           DateTime?                @map("deleted_at")
  membership          ShopCustomerMembership   @relation(fields: [membershipId], references: [id], onDelete: Restrict)
  @@index([membershipId, status, deletedAt], map: "shop_membership_cards_membership_status_idx")
  @@index([status, expiresAt, deletedAt], map: "shop_membership_cards_status_expiry_idx")
  @@map("shop_membership_cards")
}
```

- [ ] **Step 4: Generate and validate Prisma, then run the test**

Run:

```bash
cd backend
npm run prisma:generate
npx prisma validate
npm test -- shop-membership-schema.test.ts
```

Expected: Prisma validation succeeds and the schema test passes.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260831120000_shop_membership_foundation/migration.sql backend/tests/shop-membership-schema.test.ts
git commit -m "feat: add formal shop membership schema"
```

### Task 3: Implement repository and service with shop scope and transactional audit

**Files:**
- Create: `backend/src/repositories/shop-membership.repository.ts`
- Create: `backend/src/services/shop-membership.service.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Test: `backend/tests/shop-membership.repository.test.ts`
- Test: `backend/tests/shop-membership.service.test.ts`

**Interfaces:**
- `ShopMembershipRepositoryPort` exposes `getOverview`, `listMemberships`, `findMembershipDetail`, `listCandidates`, `createMembershipWithAudit`, `listCards`, `listActivities`, `getAnalytics`, and customer self-list/detail methods.
- `ShopMembershipService` methods accept `AuthenticatedAccessContext` first; merchant methods resolve `shopId`, customer methods resolve `customerProfileId`.
- `createMembershipWithAudit` accepts an `AuditLogCreateInput` and writes membership + audit in one `$transaction`.

- [ ] **Step 1: Write repository scope and transaction tests**

```ts
expect(client.shopCustomerMembership.findMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ shopId: 71, deletedAt: null }) })
);
expect(transaction.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({ action: "merchant.shop_membership.create" })
});
```

Also assert candidate lookup includes `bookingOrders.some: { shopId, deletedAt: null }`, excludes an active relation, and never performs one query per returned row.

- [ ] **Step 2: Write service identity/conflict tests**

```ts
await expect(service.listMerchantMemberships(nonShopActor, query)).rejects.toMatchObject({
  code: ERROR_CODES.IDENTITY_FORBIDDEN,
  statusCode: 403
});
await expect(service.enrollMerchantMembership(owner, context, { customerNeedoId })).rejects.toMatchObject({
  message: "error.shop_membership.already_active",
  statusCode: 409
});
```

- [ ] **Step 3: Run both tests and confirm RED**

Run: `cd backend && npm test -- shop-membership.repository.test.ts shop-membership.service.test.ts`

Expected: FAIL because repository/service and error code do not exist.

- [ ] **Step 4: Implement bounded repository queries**

Use a single count + bounded `findMany` pair per list, `include` only required shop/customer/user/card fields, filter all soft deletions, and map `Decimal`/dates in Service. Candidate selection must resolve the current shop relationship in SQL/Prisma, not after fetching a platform-wide list.

`createMembershipWithAudit` must:

```ts
return this.client.$transaction(async (transaction) => {
  const membership = await transaction.shopCustomerMembership.create({
    data: { shopId, customerProfileId, activeKey: `shop:${shopId}:customer:${customerProfileId}`, createdById: actorId, updatedById: actorId }
  });
  await this.auditLogRepository.createInTransaction(transaction, auditInput);
  return membership;
});
```

Map Prisma `P2002` on `activeKey` to `ERROR_CODES.SHOP_MEMBERSHIP_ALREADY_ACTIVE` without returning Prisma text.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test -- shop-membership.repository.test.ts shop-membership.service.test.ts`

Expected: PASS.

```bash
git add backend/src/repositories/shop-membership.repository.ts backend/src/services/shop-membership.service.ts backend/src/constants/error-codes.ts backend/tests/shop-membership.repository.test.ts backend/tests/shop-membership.service.test.ts
git commit -m "feat: add scoped shop membership service"
```

### Task 4: Expose strict RBAC APIs and OpenAPI

**Files:**
- Create: `backend/src/validators/shop-membership.validator.ts`
- Create: `backend/src/controllers/shop-membership.controller.ts`
- Create: `backend/src/routes/shop-membership.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/shop-membership-api.test.ts`
- Test: `backend/tests/shop-membership-openapi.test.ts`
- Test: `backend/tests/shop-membership-permissions.test.ts`

**Interfaces:**
- Merchant route permissions exactly match `shop.member.view`, `shop.member.create`, `shop.member.analytics.view`, and `shop.member.operation_log.view`.
- Customer self routes require `customer-profile:read` plus Service identity scope.
- All controllers return `successResponse(...)`; POST returns 201.

- [ ] **Step 1: Write API authorization and validation tests**

Assert 401 without a token, 403 without the exact permission, 400 for unknown query/body keys, 404 for cross-shop candidates/details, 409 for duplicate active enrollment, 201 with safe public payload, and 200 paginated customer self data.

```ts
await request(app)
  .post("/api/v1/merchant-admin/shop-memberships")
  .set("Authorization", `Bearer ${ownerToken}`)
  .send({ customerNeedoId: "u0000000041", shopId: 999 })
  .expect(400);
```

- [ ] **Step 2: Write permission assignment tests**

```ts
expect(assignments.merchant_owner).toEqual(expect.arrayContaining(allMembershipPermissions));
expect(assignments.merchant_staff).toEqual(expect.arrayContaining(["shop.member.view"]));
expect(assignments.merchant_staff).not.toEqual(expect.arrayContaining(["shop.member.create"]));
```

- [ ] **Step 3: Write OpenAPI path/schema assertions and confirm RED**

Run: `cd backend && npm test -- shop-membership-api.test.ts shop-membership-openapi.test.ts shop-membership-permissions.test.ts`

Expected: FAIL for missing routes, permissions, and docs.

- [ ] **Step 4: Implement validators/routes/controllers and register dependencies**

```ts
export const shopMembershipListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().max(100).optional(),
  status: z.enum(["active", "ended"]).optional()
}).strict();

export const shopMembershipCreateBodySchema = z.object({
  customerNeedoId: z.string().trim().regex(/^u\d{10}$/i)
}).strict();
```

Register `createShopMembershipRoutes(config, resolvedDependencies)` after customer profile routes and inject `shopMembershipRepository` through `AppDependencies`.

- [ ] **Step 5: Add permission definitions and OpenAPI**

Define all four permissions in `SYSTEM_PERMISSIONS`. Add all four only to `merchant_owner`; add only `shop.member.view` to `merchant_staff`. Document parameters, request bodies, pagination envelopes, public IDs, enums, and 400/401/403/404/409 responses.

- [ ] **Step 6: Run tests and commit**

Run: `cd backend && npm test -- shop-membership-api.test.ts shop-membership-openapi.test.ts shop-membership-permissions.test.ts openapi.test.ts auth-permissions.test.ts`

Expected: PASS.

```bash
git add backend/src/validators/shop-membership.validator.ts backend/src/controllers/shop-membership.controller.ts backend/src/routes/shop-membership.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/shop-membership-api.test.ts backend/tests/shop-membership-openapi.test.ts backend/tests/shop-membership-permissions.test.ts
git commit -m "feat: expose shop membership APIs and RBAC"
```

### Task 5: Restore the merchant membership center against the formal API

**Files:**
- Replace: `src/features/shop-member/ShopMemberCenterPage.tsx`
- Modify: `src/features/shop-member/api.ts`
- Modify: `src/features/shop-member/ShopMemberCenterPage.test.tsx`
- Modify: `src/features/merchant-navigation/merchantModules.ts`
- Modify: `src/features/merchant-navigation/MerchantPrimaryNavCarousel.tsx`
- Modify: `src/auth/featurePermissions.ts`

**Interfaces:**
- Consumes Task 1 client contracts and Task 4 API envelopes.
- Uses `useAuth().hasPermission("shop.member.create")` to render enrollment; route access requires server-provided `shop.member.view` because all `shop.member.*` codes are removed from legacy implicit fallback.
- Merchant page route sections: base/overview, members, cards, activity, analytics; `verify` redirects to activity for legacy URLs.

- [ ] **Step 1: Extend failing UI tests for all states**

Test overview metrics, tabs, empty member/card/activity states, retry after an API rejection, owner enrollment success, read-only staff without the button, and no deferred mutation labels as clickable buttons.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/features/shop-member/ShopMemberCenterPage.test.tsx src/features/merchant-navigation/merchantModules.test.ts src/auth/rbac.test.ts`

Expected: FAIL because the gate page remains and membership permissions are implicit.

- [ ] **Step 3: Build the page with real request state**

Use a focused reducer/state hook with `{ status: "loading" | "ready" | "error", data, error }`, AbortController for filters, and one component per screen inside the file or a `components/` split if the file exceeds approximately 600 lines. Render:

```tsx
<MobileFullscreenHeader
  action={<TestFeatureBadge />}
  subtitle={t("店铺私域会员与会员卡状态")}
  title={t("会员中心")}
/>
```

Enrollment opens a dialog, searches `candidates`, submits only `customerNeedoId`, disables while saving, retains search on failure, closes and refreshes overview/list/activity on success.

- [ ] **Step 4: Add navigation badge and remove implicit RBAC fallback**

Add `badge?: "Test"` to `MerchantPrimaryModule`; set it only on `members`. Render the red badge absolutely at the top-right of the tile. Remove every `shop.member.*` item from `portalFeaturePermissions.merchant`; do not remove the union types.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/features/shop-member/api.test.ts src/features/shop-member/ShopMemberCenterPage.test.tsx src/features/merchant-navigation/merchantModules.test.ts src/auth/rbac.test.ts`

Expected: PASS.

```bash
git add src/features/shop-member src/components/ui/TestFeatureBadge.tsx src/features/merchant-navigation/merchantModules.ts src/features/merchant-navigation/MerchantPrimaryNavCarousel.tsx src/auth/featurePermissions.ts
git commit -m "feat: restore formal merchant membership center"
```

### Task 6: Add the customer membership wallet and personal-center count

**Files:**
- Create: `src/pages/user/UserMembershipsPage.tsx`
- Modify: `src/pages/user/UserMembershipsPage.test.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/shop-member/api.ts`

**Interfaces:**
- `/me/memberships` shows paginated shop memberships.
- `/me/memberships/:publicId` shows one self-scoped membership and cards.
- `UserCenterPage` fetches only the first active page with `pageSize=1`, uses `total` as the badge count, and renders `—` on request failure.

- [ ] **Step 1: Complete failing list/detail/entry tests**

```ts
expect(screen.getByRole("heading", { name: "我的会员" })).toBeInTheDocument();
expect(screen.getByText("青山护理店")).toBeInTheDocument();
expect(screen.getByText("暂无会员卡")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "会员" })).toHaveAttribute("href", "/me/memberships");
```

Also test expired/frozen status chips, retry, empty state, and that a detail request for another user's public ID shows the 404 state.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx`

Expected: FAIL because the route/page/count are absent.

- [ ] **Step 3: Implement customer list/detail page**

Reuse `MobileShell`, `MobileFullscreenHeader`, theme variables, `TestFeatureBadge`, status chips, and formal retry patterns. Membership cards are store-first; nested cards show type-specific values:

```tsx
{card.type === "stored_value" ? formatJpy(card.principalBalanceJpy + card.bonusBalanceJpy) : null}
{card.type === "count" ? t("剩余 {count} 次", { count: card.remainingUses ?? 0 }) : null}
```

Do not render QR, top-up, redemption, or refund controls.

- [ ] **Step 4: Wire the personal-center tile and routes**

Add route imports and:

```tsx
<Route path="/me/memberships" element={protect("user", <UserMembershipsPage />)} />
<Route path="/me/memberships/:membershipPublicId" element={protect("user", <UserMembershipsPage />)} />
```

Extend `FormalUserCenterData` with `activeShopMembershipCount`; load it alongside orders/profile/wallet using `Promise.all`, but convert only this auxiliary failure to `null` so the entire personal center remains available.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx`

Expected: PASS.

```bash
git add src/pages/user/UserMembershipsPage.tsx src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.test.tsx src/App.tsx src/features/shop-member/api.ts
git commit -m "feat: add customer shop membership wallet"
```

### Task 7: Complete i18n, docs, and formal verification

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `README.md`
- Modify: all tests above if translations require selectors by translated key.

**Interfaces:**
- Every new visible source string is registered in all five locales.
- README distinguishes platform membership level, shop membership, and deferred card mutations.

- [ ] **Step 1: Add translation and documentation assertions**

Add the new source phrases to the existing translation audit fixtures and ensure README contains every new API prefix and the sentence that card issue/top-up/redemption/refund remain deferred.

- [ ] **Step 2: Run i18n audit and fix missing or low-quality translations**

Run:

```bash
npm run i18n:audit
npm run i18n:quality
```

Expected: both commands exit 0; Japanese and English strings are natural product copy, not word-for-word machine fragments.

- [ ] **Step 3: Run database and backend verification**

Run:

```bash
cd backend
npx prisma validate
npm run prisma:generate
npm test -- shop-membership-schema.test.ts shop-membership.repository.test.ts shop-membership.service.test.ts shop-membership-api.test.ts shop-membership-openapi.test.ts shop-membership-permissions.test.ts openapi.test.ts auth-permissions.test.ts
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
npm test -- src/features/shop-member/api.test.ts src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/features/merchant-navigation/merchantModules.test.ts src/auth/rbac.test.ts
npm run lint
npm run verify:production-build
```

Expected: all exit 0 and the production bundle audit finds no mock membership store.

- [ ] **Step 5: Run full regression suites**

Run `npm test` at repository root and `npm test` in `backend/`.

Expected baseline: frontend 256 files / 1579 tests before this feature, backend all suites passing after Prisma generation; final counts must be recorded from fresh output.

- [ ] **Step 6: Browser acceptance in the serving worktree**

Start the formal backend on 3000 and frontend on 5180, prove both listening processes have cwd `/Users/eason/Documents/New project/.worktrees/restore-shop-membership`, then inspect:

- Merchant desktop and 390 px mobile: navigation badge, overview, five sections, empty states, candidate search, read-only staff, no horizontal overflow.
- Customer desktop and 390 px mobile: personal-center badge/count, list, detail, no-card state, ended/frozen/expired chips.
- Light and dark themes, keyboard focus, console errors, failed network requests, and reload persistence.

- [ ] **Step 7: Commit final polish**

```bash
git add src/i18n/translations.ts README.md
git commit -m "docs: finalize shop membership foundation"
```

Do not merge, push, migrate production, or deploy until the verified branch review is complete. Production deployment must include the additive migration, backend, frontend, service restart, fresh login, and live acceptance as one coordinated release.
