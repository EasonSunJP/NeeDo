# Unified Operations and Merchant User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one formally scoped user-management experience shared by operations and merchant portals, including server-side list filters, the merchant-style detail card, localized membership data, received reviews, usage timelines, immutable amendments, partner validity ranges, and collapsed permission tags.

**Architecture:** Extend the existing `BackofficeRepository` managed-user aggregate so it accepts a platform or authenticated-shop scope, then expose the same response contract through operations and merchant routes. Replace the standalone operations table and detail drawer with shared React components; portal-specific capabilities control mutations while the backend remains the authority for scope, audit, concurrency, and pagination. New review/refund amendments and partner validity changes use append-only version tables and Prisma transactions.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Express, Zod, Prisma, MySQL 8, Jest/Supertest, Vitest/Testing Library, OpenAPI.

## Global Constraints

- Execute one task at a time; every task must be runnable, testable, reversible, and committed independently.
- Do not add mock, demo, placeholder, fake API, `TODO`, `FIXME`, or `not implemented` code.
- Protected APIs require JWT authentication, explicit RBAC permission, Zod validation, OpenAPI documentation, and audit records for mutations.
- All list APIs use the standard `{ list, total, page, page_size }` envelope and perform filtering before pagination.
- Merchant scope is resolved exclusively from the authenticated merchant identity; never accept a shop ID from the browser for customer scope.
- User-visible copy is localized for `zh`, `zh-Hant`, `ja`, `en`, and `ko`; stable API codes are never rendered directly.
- Levels are derived only from cumulative EXP and published level rules; no mutation accepts a level value.
- Existing reviews, refund facts, order status history, timeline comments, and audit events are never overwritten or deleted.
- Database changes require a committed Prisma migration and `npm run prisma:generate`.
- Final integration is a local merge to `main`; push, deployment, and production migration remain separate actions.

---

### Task 1: Canonical scoped user-list API

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-user-list.repository.test.ts`
- Modify: `backend/tests/backoffice-user-list.api.test.ts`
- Modify: `backend/tests/backoffice-user-list-openapi.test.ts`
- Modify: `backend/tests/master-data-api.test.ts`

**Interfaces:**
- Produces: `BackofficeManagedUserPayload` with `displayName`, `city`, `privacyMode`, `privacyScope`, actual `email`, scoped `bookingCount`, and existing identity/membership/account fields.
- Produces: `listManagedUsers(input: BackofficeScope & BackofficeManagedUserListQuery, occurredAt: Date)`.
- Produces: `GET /api/v1/merchant-admin/users`, authorized by `merchant-admin:customers:list`.
- Consumes: current `getMerchantScope(actor)` and current platform `/backoffice/users` permission.

- [x] **Step 1: Write failing validator and repository tests**

Add assertions that parse and forward the canonical filters:

```ts
const query = backofficeManagedUserListQuerySchema.parse({
  city: "Tokyo",
  emailState: "set",
  privacy: "enabled",
  minBookings: "2",
  maxBookings: "20",
  sortBy: "city",
  sortDirection: "desc"
});

expect(query).toMatchObject({
  city: "Tokyo",
  emailState: "set",
  privacy: "enabled",
  minBookings: 2,
  maxBookings: 20,
  sortBy: "city",
  sortDirection: "desc"
});
```

Extend the repository fixture with `customerProfile.visibility`, and assert:

```ts
expect(page.list[0]).toMatchObject({
  displayName: "Mia",
  email: "mia@example.test",
  city: "Tokyo",
  privacyMode: true,
  privacyScope: "limited",
  bookingCount: 3
});
```

Add a merchant-scope assertion:

```ts
await repository.listManagedUsers(
  { scope: "merchant", shopId: 11, page: 1, pageSize: 20 },
  now
);

expect(findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({
      AND: expect.arrayContaining([
        { bookingOrders: { some: { shopId: 11, deletedAt: null } } }
      ])
    })
  })
);
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```bash
cd backend
npm test -- backoffice-user-list.repository.test.ts backoffice-user-list.api.test.ts
```

Expected: FAIL because the new query fields, scoped signature, merchant route, and payload fields do not exist.

- [x] **Step 3: Implement the scoped list contract**

Extend the validated query with these exact fields:

```ts
city: z.string().trim().min(1).max(100).optional(),
emailState: z.enum(["set", "unset"]).optional(),
privacy: z.enum(["enabled", "disabled", "public", "privateAll", "limited", "network"]).optional(),
minBookings: z.coerce.number().int().nonnegative().optional(),
maxBookings: z.coerce.number().int().nonnegative().optional(),
sortBy: z.enum(["displayName", "email", "city", "createdAt"]).default("createdAt"),
sortDirection: z.enum(["asc", "desc"]).default("desc")
```

Extend `BackofficeManagedUserPayload`:

```ts
displayName: string;
city: string | null;
privacyMode: boolean;
privacyScope: "public" | "privateAll" | "limited" | "network" | null;
```

Change the repository signature:

```ts
listManagedUsers(
  input: BackofficeScope & BackofficeManagedUserListQuery,
  occurredAt: Date
): Promise<PaginatedResponse<BackofficeManagedUserPayload>>;
```

For merchant scope, add this server-side condition before pagination:

```ts
if (input.scope === "merchant") {
  conditions.push({
    bookingOrders: { some: { shopId: input.shopId, deletedAt: null } }
  });
}
```

Map privacy without flattening the stored scope:

```ts
const privacyScope = customer?.visibility ?? null;
return {
  displayName: customer?.displayName ?? technician?.displayName ?? row.username,
  city: customer?.city ?? technician?.city ?? null,
  privacyMode: privacyScope !== null && privacyScope !== "public",
  privacyScope,
  // existing fields remain unchanged
};
```

Add service/controller/route methods:

```ts
public async listMerchantManagedUsers(
  actor: AuthenticatedAccessContext,
  context: AuthRequestContext,
  input: BackofficeManagedUserListQuery
) {
  const scope = this.getMerchantScope(actor);
  await this.record(actor, context, "merchant_admin.users.list", "User", {
    shopId: scope.shopId,
    filters: Object.keys(input).filter((key) => !["page", "pageSize"].includes(key))
  });
  return this.repository.listManagedUsers({ ...input, ...scope }, this.now());
}
```

Register `GET /merchant-admin/users` with authentication, `merchant-admin:customers:list`, the same query schema, and a distinct OpenAPI operation ID.

- [x] **Step 4: Run focused backend tests and verify GREEN**

Run:

```bash
cd backend
npm test -- backoffice-user-list.repository.test.ts backoffice-user-list.api.test.ts backoffice-user-list-openapi.test.ts
```

Expected: PASS; merchant fixtures prove shop scoping and operations fixtures retain full scope.

- [x] **Step 5: Commit Task 1**

```bash
git add backend/src/validators/backoffice.validator.ts backend/src/services/backoffice.service.ts backend/src/repositories/backoffice.repository.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/api/openapi.ts backend/tests/backoffice-user-list.repository.test.ts backend/tests/backoffice-user-list.api.test.ts backend/tests/backoffice-user-list-openapi.test.ts
git commit -m "feat: add scoped canonical user list"
```

### Task 2: Shared server-filtered user table in both portals

**Files:**
- Create: `src/features/platform-user-management/UnifiedUserDirectory.tsx`
- Create: `src/features/platform-user-management/UnifiedUserTable.tsx`
- Create: `src/features/platform-user-management/UnifiedUserTable.test.tsx`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/api.test.ts`
- Modify: `src/features/platform-user-management/UserFilters.tsx`
- Modify: `src/features/platform-user-management/UserListPage.tsx`
- Modify: `src/features/platform-user-management/UserListPage.test.tsx`
- Modify: `src/features/platform-user-management/i18n.ts`
- Modify: `src/features/platform-user-management/i18n.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

**Interfaces:**
- Consumes: Task 1 response and routes.
- Produces: `UnifiedUserDirectory({ scope: "operations" | "merchant", onSelect })`.
- Produces: URL-backed `UserListQuery` containing all canonical filters and sort state.

- [x] **Step 1: Write failing API and rendering tests**

Add the merchant request assertion:

```ts
await platformUserManagementApi.listUsers("merchant", {
  page: 2,
  page_size: 20,
  city: "Tokyo",
  privacy: "enabled",
  sortBy: "city",
  sortDirection: "desc"
});

expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/users", {
  query: expect.objectContaining({
    page: 2,
    pageSize: 20,
    city: "Tokyo",
    privacy: "enabled",
    sortBy: "city",
    sortDirection: "desc"
  })
});
```

Render a row and assert the visible contract:

```tsx
expect(screen.getByText("mia@example.test")).toBeInTheDocument();
expect(screen.getByText("Tokyo")).toBeInTheDocument();
expect(screen.getByText("黄金会员")).toBeInTheDocument();
expect(screen.getByText("已开启")).toBeInTheDocument();
expect(screen.queryByText("邮箱已绑定")).not.toBeInTheDocument();
```

Click the booking header filter and assert `onQueryChange` receives:

```ts
expect(onQueryChange).toHaveBeenCalledWith(
  expect.objectContaining({ page: 1, minBookings: 10, maxBookings: 50 })
);
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/features/platform-user-management/api.test.ts src/features/platform-user-management/UnifiedUserTable.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: FAIL because the shared components and merchant canonical API do not exist.

- [x] **Step 3: Add shared list types, query serialization, and localized labels**

Extend `PlatformManagedUser` with the Task 1 fields and `UserListQuery` with the exact Task 1 query keys.

Expose:

```ts
type UserDirectoryScope = "operations" | "merchant";

async function listUsers(scope: UserDirectoryScope, query: UserListQuery = {}) {
  const path = scope === "operations" ? "/backoffice/users" : "/merchant-admin/users";
  return decodePage(await httpClient.request<unknown>(path, { query: userQuery(query) }), decodeUser);
}
```

Add localized membership and privacy helpers:

```ts
export const membershipTierText = (code: PlatformTierCode, language: Language) =>
  platformUserManagementCopy[language][`membership.${code}`];

export const privacyModeText = (enabled: boolean, language: Language) =>
  platformUserManagementCopy[language][enabled ? "privacy.enabled" : "privacy.disabled"];
```

Add all five locales for `membership.free`, `membership.silver`, `membership.gold`, `membership.black_diamond`, `privacy.enabled`, `privacy.disabled`, `filter.apply`, and `filter.clear`.

- [x] **Step 4: Implement the shared table and portal adapters**

`UnifiedUserTable` receives server state rather than filtering `rows` locally:

```ts
export type UnifiedUserTableProps = {
  rows: PlatformManagedUser[];
  query: UserListQuery;
  onQueryChange: (next: UserListQuery) => void;
  onSelect: (userId: number) => void;
};
```

Use `TableColumnHeader` only as the popover/trigger UI. Each apply callback updates query state and forces `page: 1`. Render these canonical columns in order:

```ts
const columnKeys = [
  "user",
  "email",
  "city",
  "identities",
  "membership",
  "bookingCount",
  "privacy",
  "ekyc",
  "ndp",
  "state",
  "createdAt",
  "action"
] as const;
```

Replace the operations inline `UserTable` with `UnifiedUserDirectory scope="operations"`. Replace only the merchant `module === "users"` table with `UnifiedUserDirectory scope="merchant"`; leave employee modules untouched.

- [x] **Step 5: Run focused frontend tests and verify GREEN**

Run:

```bash
npm test -- src/features/platform-user-management/api.test.ts src/features/platform-user-management/UnifiedUserTable.test.tsx src/features/platform-user-management/UserListPage.test.tsx src/features/platform-user-management/i18n.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: PASS; the two portals import the same directory component, actual email is visible, raw tier codes are absent, and header actions update server query state.

- [x] **Step 6: Commit Task 2**

```bash
git add src/features/platform-user-management src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
git commit -m "feat: share filtered user directory across portals"
```

### Task 3: Unified merchant-style detail card and core metrics

**Files:**
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-profile-detail-repository.test.ts`
- Modify: `backend/tests/backoffice-user-list.api.test.ts`
- Create: `src/features/platform-user-management/UnifiedUserDetailDrawer.tsx`
- Create: `src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Modify: `src/components/admin/FormalProfileDetailPanels.test.tsx`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/UserListPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Delete: `src/features/platform-user-management/UserDetailDrawer.tsx`
- Delete: `src/features/platform-user-management/UserDetailDrawer.test.tsx`
- Delete: `src/features/platform-user-management/UserDetailDrawer.interaction.test.tsx`

**Interfaces:**
- Consumes: Task 1 scoped managed-user projection.
- Produces: `GET /backoffice/users/:userId` and `GET /merchant-admin/users/:userId` with the same `PlatformManagedUserDetail` shape.
- Produces: `UnifiedUserDetailDrawer({ scope, userId, onClose })` backed by `FormalCustomerDetailPanel`.

- [x] **Step 1: Write failing detail aggregate tests**

Assert both scopes return:

```ts
expect(detail).toMatchObject({
  profile: { displayName: "Mia", city: "Tokyo" },
  privacyMode: true,
  privacyScope: "limited",
  metrics: {
    ndpAvailable: 900,
    usageCount: 3,
    credit: { ratingAverage: 4.8, reviewCount: 12 }
  },
  capabilities: {
    membershipWrite: true,
    reviewAmend: true,
    partnerWrite: true
  }
});
```

For merchant scope assert all booking/review aggregates include `shopId: 11` and all operations capabilities are false.

- [x] **Step 2: Run the tests and verify RED**

Run:

```bash
cd backend
npm test -- backoffice-profile-detail-repository.test.ts backoffice-user-list.api.test.ts
```

Expected: FAIL because scoped managed-user details, metrics, and capabilities are missing.

- [x] **Step 3: Implement the shared detail contract**

Add:

```ts
metrics: {
  ndpAvailable: number;
  usageCount: number;
  credit: { ratingAverage: number; reviewCount: number; latestReviewAt: string | null };
};
capabilities: {
  membershipWrite: boolean;
  reviewAmend: boolean;
  refundAmend: boolean;
  partnerWrite: boolean;
  timelineCommentWrite: boolean;
};
```

Resolve capabilities in the service from the authenticated access context; do not return hard-coded administrator booleans. Add `getMerchantManagedUser` using `getMerchantScope(actor)`, and enforce a matching scoped booking relationship in the repository before returning the user.

- [x] **Step 4: Write the failing shared-detail component test**

Render both scopes and assert the same structure:

```tsx
for (const scope of ["operations", "merchant"] as const) {
  render(<UnifiedUserDetailDrawer scope={scope} userId={41} onClose={() => undefined} />);
  expect(await screen.findByText("Mia")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "基础资料" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "会员等级" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "预约与消费" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "评价" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "权限与账号" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "用户动态" })).toBeInTheDocument();
}
```

- [x] **Step 5: Run the component test and verify RED**

Run:

```bash
npm test -- src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx src/components/admin/FormalProfileDetailPanels.test.tsx
```

Expected: FAIL because the unified drawer, review tab, and metric header do not exist.

- [x] **Step 6: Implement the unified detail component**

Extend customer tabs to:

```ts
export type CustomerDetailTab =
  | "基础资料"
  | "会员等级"
  | "预约与消费"
  | "评价"
  | "权限与账号"
  | "用户动态";
```

Render avatar and identity in the existing green header. Directly below it render NDP, usage count, credit, and privacy. Render membership and EXP below those metrics. `UnifiedUserDetailDrawer` loads the scope-specific route and adapts the canonical detail to `FormalCustomerDetailPanel`; operations mutation controls are passed as actions only when the server capability is true.

Remove the old standalone operations detail component after all imports use the unified drawer.

- [x] **Step 7: Run focused backend and frontend tests and verify GREEN**

Run:

```bash
cd backend
npm test -- backoffice-profile-detail-repository.test.ts backoffice-user-list.api.test.ts backoffice-profile-detail-openapi.test.ts
cd ..
npm test -- src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx src/components/admin/FormalProfileDetailPanels.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: PASS; both portals render the same header and tabs, while merchant detail remains shop-scoped.

- [x] **Step 8: Commit Task 3**

```bash
git add backend/src backend/tests src/components/admin src/features/platform-user-management src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
git commit -m "feat: unify user detail across operations and merchant"
```

### Task 4: Reasoned per-user membership and multiplier adjustments

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260906090000_user_membership_multiplier_adjustments/migration.sql`
- Modify: `backend/src/validators/platform-membership.validator.ts`
- Modify: `backend/src/repositories/platform-membership.repository.ts`
- Modify: `backend/src/services/platform-membership.service.ts`
- Modify: `backend/src/controllers/platform-membership.controller.ts`
- Modify: `backend/src/routes/platform-membership.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/user-membership-adjustment-schema.test.ts`
- Create: `backend/tests/user-membership-adjustment.repository.test.ts`
- Create: `backend/tests/user-membership-adjustment.service.test.ts`
- Modify: `backend/tests/platform-membership-api.test.ts`
- Create: `src/features/platform-user-management/UserMembershipAdjustmentDialog.tsx`
- Create: `src/features/platform-user-management/UserMembershipAdjustmentDialog.test.tsx`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/types.ts`

**Interfaces:**
- Produces: `PATCH /api/v1/backoffice/users/:userId/membership-adjustment`.
- Produces: `UserMembershipAdjustmentInput = { tierCode?: PlatformTierCode; multiplier?: number; reason: string; expectedLockVersion: number | null }`.
- Consumes: existing platform tier publications and user experience event snapshots.

- [ ] **Step 1: Write failing schema and service tests**

Assert the schema contains an append-only override model:

```ts
expect(schema).toContain("model UserMembershipAdjustment");
expect(schema).toContain("multiplierBps");
expect(schema).toContain("reason");
expect(schema).toContain("supersededAt");
expect(schema).toContain("createdById");
```

Assert service validation and audit:

```ts
await expect(
  service.adjustUserMembership(actor, context, 41, {
    multiplier: 1.25,
    reason: " ",
    expectedLockVersion: 2
  })
).rejects.toMatchObject({ statusCode: 400 });

expect(repository.adjustUserMembershipWithAudit).toHaveBeenCalledWith(
  expect.objectContaining({
    userId: 41,
    multiplierBps: 12_500,
    reason: "Manual retention adjustment",
    expectedLockVersion: 2
  })
);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- user-membership-adjustment-schema.test.ts user-membership-adjustment.service.test.ts
```

Expected: FAIL because the model and adjustment service do not exist.

- [ ] **Step 3: Add the migration and transactional repository**

Create `UserMembershipAdjustment` with immutable rows, `multiplierBps Int?`, optional tier entitlement reference, `reason VarChar(500)`, `expected/current lockVersion`, `effectiveFrom`, `supersededAt`, actor relation, and standard timestamps. Add indexes on `(userId, effectiveFrom, supersededAt, deletedAt)` and `createdById`.

In one transaction: lock/read the current adjustment, compare `expectedLockVersion`, supersede it, create the new row, and create the audit log. Do not update historical `UserExperienceEntry.membershipMultiplierBps` values.

- [ ] **Step 4: Add validated route and OpenAPI**

Use this strict body:

```ts
export const userMembershipAdjustmentBodySchema = z
  .object({
    tierCode: platformMembershipTierCodeSchema.optional(),
    multiplier: z.number().positive().max(100).optional(),
    reason: z.string().trim().min(1).max(500),
    expectedLockVersion: z.number().int().positive().nullable()
  })
  .strict()
  .refine((value) => value.tierCode !== undefined || value.multiplier !== undefined, {
    message: "tierCode or multiplier is required"
  });
```

The service derives all future multiplier snapshots from the active override plus published tier data. The request and response contain no `level` field.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- user-membership-adjustment-schema.test.ts user-membership-adjustment.repository.test.ts user-membership-adjustment.service.test.ts platform-membership-api.test.ts platform-membership-openapi.test.ts
```

Expected: PASS; blank reasons fail, concurrency conflicts return 409, and historical experience snapshots remain unchanged.

- [ ] **Step 6: Write failing dialog test, implement, and verify GREEN**

Assert each field has its own right-side button and reason is mandatory:

```tsx
expect(screen.getByRole("button", { name: "修改会员类型" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "修改会员倍率" })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "保存调整" }));
expect(screen.getByText("请填写调整理由")).toBeInTheDocument();
expect(platformUserManagementApi.adjustMembership).not.toHaveBeenCalled();
```

Implement a dialog that submits only the selected field, `reason`, and `expectedLockVersion`; reload the detail after success.

Run:

```bash
npm test -- src/features/platform-user-management/UserMembershipAdjustmentDialog.test.tsx src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add backend/prisma backend/src backend/tests src/components/admin src/features/platform-user-management
git commit -m "feat: add audited user membership adjustments"
```

### Task 5: Received reviews tab and immutable review amendments

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260906100000_order_review_amendments/migration.sql`
- Create: `backend/src/validators/backoffice-user-review.validator.ts`
- Create: `backend/src/repositories/backoffice-user-review.repository.ts`
- Create: `backend/src/services/backoffice-user-review.service.ts`
- Create: `backend/src/controllers/backoffice-user-review.controller.ts`
- Create: `backend/src/routes/backoffice-user-review.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/backoffice-user-review-schema.test.ts`
- Create: `backend/tests/backoffice-user-review.repository.test.ts`
- Create: `backend/tests/backoffice-user-review.service.test.ts`
- Create: `backend/tests/backoffice-user-review-api.test.ts`
- Create: `backend/tests/backoffice-user-review-openapi.test.ts`
- Create: `src/features/platform-user-management/UserReceivedReviews.tsx`
- Create: `src/features/platform-user-management/UserReceivedReviews.test.tsx`
- Create: `src/features/platform-user-management/ReviewAmendmentDialog.tsx`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`

**Interfaces:**
- Produces: `GET /backoffice/users/:userId/received-reviews` and merchant equivalent, fixed `page_size=10` in the UI.
- Produces: `POST /backoffice/reviews/:reviewId/amendments` with reason and optimistic version.
- Consumes: formal `OrderReview`, `OrderReviewTag`, completed `BookingOrder`, and authenticated merchant scope.

- [ ] **Step 1: Write failing schema, repository, and API tests**

Assert the result shape:

```ts
expect(page).toEqual({
  list: [
    expect.objectContaining({
      reviewId: 77,
      targetType: "customer",
      rating: 4,
      tags: ["punctual", "polite"],
      order: expect.objectContaining({ id: 88, serviceName: "Home care" }),
      reviewer: expect.objectContaining({ needoId: "s0000000042" }),
      amendmentVersion: 0
    })
  ],
  total: 1,
  page: 1,
  page_size: 10
});
```

Assert merchant queries contain the authenticated `shopId`, target only `customer`, require completed orders, and filter `deletedAt: null`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- backoffice-user-review-schema.test.ts backoffice-user-review.repository.test.ts backoffice-user-review-api.test.ts
```

Expected: FAIL because the review read model and amendment tables/routes do not exist.

- [ ] **Step 3: Add immutable review amendment models**

Create `OrderReviewAmendment` with `orderReviewId`, monotonic `version`, nullable replacement `rating` and `comment`, required `reason`, `revisedById`, `createdAt`, `updatedAt`, `deletedAt`; create `OrderReviewAmendmentTag` linked to one amendment. Add unique `(orderReviewId, version)` and read indexes.

The repository transaction reads the current effective version, compares `expectedVersion`, creates a new amendment and amendment tags, and records audit. It never updates `OrderReview` or `OrderReviewTag`.

- [ ] **Step 4: Implement routes, service, permissions, and OpenAPI**

Use:

```ts
export const reviewAmendmentBodySchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  reason: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative()
}).strict().refine(
  (value) => value.rating !== undefined || value.comment !== undefined || value.tags !== undefined,
  { message: "rating, comment or tags is required" }
);
```

Read permissions are `backoffice:users:read` and `merchant-admin:customers:list`. Mutation requires `backoffice:customers:write`; no merchant mutation route is registered.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- backoffice-user-review-schema.test.ts backoffice-user-review.repository.test.ts backoffice-user-review.service.test.ts backoffice-user-review-api.test.ts backoffice-user-review-openapi.test.ts order-review-api.test.ts order-review-repository.test.ts
```

Expected: PASS; merchant cross-shop reads return 404, blank reasons return 400, version conflicts return 409, and original reviews stay unchanged.

- [ ] **Step 6: Write failing UI test, implement the tab, and verify GREEN**

Assert 10-row pagination and localized tags:

```tsx
expect(platformUserManagementApi.listReceivedReviews).toHaveBeenCalledWith(
  "operations",
  41,
  { page: 1, page_size: 10 }
);
expect(await screen.findByText("准时")).toBeInTheDocument();
expect(screen.queryByText("punctual")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
```

Implement `UserReceivedReviews` as the body of the shared `评价` tab. Show order, service time, reviewer, score, body, tag chips, created time, and amendment version. Show the amendment action only for `capabilities.reviewAmend`.

Run:

```bash
npm test -- src/features/platform-user-management/UserReceivedReviews.test.tsx src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx src/features/platform-user-management/i18n.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add backend/prisma backend/src backend/tests src/components/admin src/features/platform-user-management
git commit -m "feat: add scoped received reviews and amendments"
```

### Task 6: Usage list, fulfillment timeline, comments, and refund amendments

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260906110000_order_refund_amendments/migration.sql`
- Create: `backend/src/validators/backoffice-user-usage.validator.ts`
- Create: `backend/src/repositories/backoffice-user-usage.repository.ts`
- Create: `backend/src/services/backoffice-user-usage.service.ts`
- Create: `backend/src/controllers/backoffice-user-usage.controller.ts`
- Create: `backend/src/routes/backoffice-user-usage.routes.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/backoffice-user-usage-schema.test.ts`
- Create: `backend/tests/backoffice-user-usage.repository.test.ts`
- Create: `backend/tests/backoffice-user-usage-api.test.ts`
- Create: `src/features/platform-user-management/UserUsageList.tsx`
- Create: `src/features/platform-user-management/UserUsageList.test.tsx`
- Create: `src/features/platform-user-management/UserFulfillmentTimelineDrawer.tsx`
- Create: `src/features/platform-user-management/UserFulfillmentTimelineDrawer.test.tsx`
- Create: `src/features/platform-user-management/RefundAmendmentDialog.tsx`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`

**Interfaces:**
- Produces: scoped user bookings list with `page_size=10`, presets and custom date range.
- Produces: scoped order detail timeline based on existing order status history and comments.
- Produces: operations comment and refund-amendment routes; no delete route.

- [ ] **Step 1: Write failing date-range, scope, and append-only tests**

Assert date presets resolve in `Asia/Tokyo` and repository bounds are half-open UTC instants:

```ts
expect(resolveUsagePeriod("last7days", now)).toEqual({
  from: new Date("2026-08-31T15:00:00.000Z"),
  to: new Date("2026-09-07T15:00:00.000Z")
});
```

Assert usage pages contain 10 items, merchant queries include authenticated `shopId`, and comment/refund amendment repositories only call `create`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- backoffice-user-usage-schema.test.ts backoffice-user-usage.repository.test.ts backoffice-user-usage-api.test.ts
```

Expected: FAIL because user usage routes and refund amendment persistence do not exist.

- [ ] **Step 3: Implement formal usage read routes**

Validate:

```ts
const usagePeriodSchema = z.enum(["last7days", "thisWeek", "last30days", "thisMonth", "thisYear", "custom"]);

export const userUsageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.literal(10).default(10),
  keyword: z.string().trim().max(100).optional(),
  period: usagePeriodSchema.default("last30days"),
  from: z.string().date().optional(),
  to: z.string().date().optional()
}).strict().superRefine(refineUsageDateRange);
```

Expose platform and merchant user usage routes. Return order summary fields plus the existing formal order detail identifier. The detail route reuses `BackofficeRepository.findOrderById` and its existing timeline event mapper.

- [ ] **Step 4: Add immutable refund amendment persistence**

Create `OrderRefundAmendment` containing `bookingOrderId`, monotonic `version`, nullable corrected display reference and note, required `reason`, `revisedById`, and standard timestamps. This table changes administrative refund metadata only; payment status, ledger transactions, refund amount, and original `BookingOrder.paymentRefund*` facts remain unchanged.

Use a strict body with `reason`, at least one amended metadata field, and `expectedVersion`. Create the amendment and audit row in one transaction.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- backoffice-user-usage-schema.test.ts backoffice-user-usage.repository.test.ts backoffice-user-usage-api.test.ts order-fulfillment-api.test.ts order-fulfillment-openapi.test.ts order-review-service.test.ts
```

Expected: PASS; comments and amendments are append-only, and existing fulfillment behavior stays green.

- [ ] **Step 6: Write failing UI tests and implement usage/timeline UI**

Assert all presets, 10-row paging, timeline opening, and mandatory comments:

```tsx
for (const label of ["近7天", "本周", "近30天", "本月", "今年", "自定义日期"]) {
  expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
}
expect(platformUserManagementApi.listUsage).toHaveBeenCalledWith(
  "operations",
  41,
  expect.objectContaining({ page: 1, page_size: 10 })
);
expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
```

Render `UserUsageList` above audit records in `用户动态`. Open `UserFulfillmentTimelineDrawer` from each row. Append comments through the formal API and reload the timeline after success. Show refund amendment only when a refund exists and capability is true.

Run:

```bash
npm test -- src/features/platform-user-management/UserUsageList.test.tsx src/features/platform-user-management/UserFulfillmentTimelineDrawer.test.tsx src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add backend/prisma backend/src backend/tests src/components/admin src/features/platform-user-management
git commit -m "feat: add user usage fulfillment history"
```

### Task 7: Versioned partner validity ranges and collapsed permission tags

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260906120000_platform_partner_validity_ranges/migration.sql`
- Modify: `backend/src/validators/platform-partner.validator.ts`
- Modify: `backend/src/repositories/platform-partner.repository.ts`
- Modify: `backend/src/services/platform-partner.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/platform-partner-api.test.ts`
- Modify: `backend/tests/platform-partner.service.test.ts`
- Modify: `backend/tests/platform-partner-openapi.test.ts`
- Create: `backend/tests/platform-partner-validity-migration.test.ts`
- Create: `src/features/platform-user-management/PlatformPartnerRangeEditor.tsx`
- Create: `src/features/platform-user-management/PlatformPartnerRangeEditor.test.tsx`
- Create: `src/features/platform-user-management/PermissionTagDisclosure.tsx`
- Create: `src/features/platform-user-management/PermissionTagDisclosure.test.tsx`
- Modify: `src/features/platform-user-management/UnifiedUserDetailDrawer.tsx`
- Modify: `src/api/platformPartners.ts`

**Interfaces:**
- Produces: partner profile payload with `startsAt`, `endsAt`, `permanent`, and immutable history.
- Produces: `PermissionTagDisclosure` collapsed by default.

- [ ] **Step 1: Write failing partner range tests**

Validate permanent and dated ranges:

```ts
expect(platformPartnerProfileBodySchema.parse({
  partnerType: "agent",
  startsAt: "2026-09-06T00:00:00+09:00",
  endsAt: null,
  permanent: true,
  reason: "Signed agency contract"
})).toMatchObject({ permanent: true, endsAt: null });

expect(() => platformPartnerProfileBodySchema.parse({
  partnerType: "agent",
  startsAt: "2026-10-01T00:00:00+09:00",
  endsAt: "2026-09-30T00:00:00+09:00",
  permanent: false,
  reason: "Invalid range"
})).toThrow();
```

Add repository tests proving overlapping ranges for the same user/type return `overlap`, while different partner types may overlap.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- platform-partner-validity-migration.test.ts platform-partner.service.test.ts platform-partner-api.test.ts
```

Expected: FAIL because `endsAt`, permanent semantics, and overlap handling do not exist.

- [ ] **Step 3: Implement migration and transactional range checks**

Add nullable `endsAt` to `PlatformPartnerProfile`; rename API semantics from `activatedAt` to `startsAt` while mapping the existing database value for backward migration. Backfill existing records with `endsAt = NULL`. Add `(userId, partnerType, activatedAt, endsAt, deletedAt)` index.

Within the repository transaction reject any active row satisfying:

```ts
existing.startsAt < newEndsOrInfinity &&
newStartsAt < existing.endsAtOrInfinity
```

Create new rows rather than modifying prior validity records. `endsAt: null` is the only permanent representation.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- platform-partner-validity-migration.test.ts platform-partner.service.test.ts platform-partner-api.test.ts platform-partner-openapi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing disclosure/editor tests and implement**

Assert independent fields per partner type and collapsed permissions:

```tsx
expect(screen.getAllByLabelText("开始日期")).toHaveLength(3);
expect(screen.getAllByLabelText("永久")).toHaveLength(3);
expect(screen.getByRole("button", { name: "展开权限" })).toHaveAttribute("aria-expanded", "false");
expect(screen.queryByText("backoffice:users:read")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "展开权限" }));
expect(screen.getByText("backoffice:users:read")).toBeInTheDocument();
```

Render one range editor for each of `agent`, `franchisee`, and `supplier`. Disable the end date input when permanent is checked. Render roles and permissions as tags; permissions remain unmounted until expanded.

Run:

```bash
npm test -- src/features/platform-user-management/PlatformPartnerRangeEditor.test.tsx src/features/platform-user-management/PermissionTagDisclosure.test.tsx src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add backend/prisma backend/src backend/tests src/api/platformPartners.ts src/features/platform-user-management
git commit -m "feat: version partner ranges and collapse permissions"
```

### Task 8: Full verification, browser acceptance, and local-main integration

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1–7.
- Create: `docs/acceptance/2026-09-06-unified-user-management.md`

**Interfaces:**
- Consumes: every prior task.
- Produces: reproducible test, runtime, browser, and merge evidence.

- [ ] **Step 1: Run static and automated verification**

Run:

```bash
cd backend
npm run prisma:generate
npm run lint
npm run build
npm test -- backoffice-user-list repository platform-partner user-membership-adjustment backoffice-user-review backoffice-user-usage order-review order-fulfillment
cd ..
npm run lint
npm run build
npm test -- src/features/platform-user-management src/components/admin/FormalProfileDetailPanels.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: every command exits 0 with no new warnings.

- [ ] **Step 2: Start and prove the formal runtime**

Run the formal backend and frontend using repository scripts. Record listener PID, listener cwd, branch, commit, backend `/api/v1/health`, backend `/api/v1/ready`, and frontend proxy origin before browser acceptance.

- [ ] **Step 3: Perform operations browser acceptance**

Using a real operations session, verify global search, every header filter, pagination/URL restoration, actual email, city, scoped booking count, privacy mode, localized membership, shared detail layout, membership reason validation, received reviews, usage date presets, timeline comments, review/refund amendments, partner ranges, collapsed permissions, console errors, and horizontal overflow.

- [ ] **Step 4: Perform merchant browser acceptance**

Using a real merchant session, verify the same list/detail layout, current-shop booking counts/reviews/usages, no cross-shop data, no operations-only actions, localized labels, console errors, and horizontal overflow.

- [ ] **Step 5: Record acceptance evidence**

Write `docs/acceptance/2026-09-06-unified-user-management.md` with:

```md
# Unified User Management Acceptance

- Branch and commit:
- Backend PID, cwd, origin, health, ready:
- Frontend PID, cwd, origin:
- Operations account and observed scope:
- Merchant account and observed shop scope:
- Automated commands and exit codes:
- Browser interactions and observed results:
- Console and overflow results:
- Database migration status:
- Deferred push, deployment, and production migration:
```

Replace each label with the observed value; do not claim unperformed checks.

- [ ] **Step 6: Commit acceptance evidence**

```bash
git add docs/acceptance/2026-09-06-unified-user-management.md
git commit -m "docs: record unified user management acceptance"
```

- [ ] **Step 7: Review and merge locally**

Use `superpowers:requesting-code-review`, resolve findings, rerun affected tests, then use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch`. Verify `main` is clean and merge `codex/unified-user-management-revision` into local `main` with a non-destructive merge. Do not push, deploy, or apply production migrations without a separate user request.
