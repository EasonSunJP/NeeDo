# Merchant Affiliate Task Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production merchant Affiliate task workspace for current-shop and merchant-account multi-shop publishing, mark the Affiliate identity as `TEST`, and keep every new Affiliate change isolated from `main` until a later major release.

**Architecture:** Extend the existing Affiliate task domain without adding a parallel state machine. A focused merchant task-context service supplies authenticated publisher, shop, service, and read-only fee-preview resources; the existing task write endpoints remain authoritative for draft creation, editing, localization, and submission. The React workspace uses a typed API client, server pagination, a shared six-step editor, and the existing merchant layout and drawer components.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Express, Zod, Prisma 7, MySQL 8, Redis, Jest, Supertest, OpenAPI, existing NeeDo RBAC and ledger services.

## Global Constraints

- Work only in branch `codex/affiliate-merchant-task-workspace` at `.worktrees/affiliate-merchant-task-workspace`.
- Do not merge, cherry-pick, push, deploy, or copy these commits into `main` without later explicit user approval.
- Preserve the root worktree and every unrelated dirty file; never stage paths outside this Affiliate worktree.
- Reuse the existing `AffiliateTaskService` write endpoints and state machine; do not add a second draft store or browser fallback.
- Do not create new mock, demo, placeholder, fake API, empty menu, or inactive future page.
- All new backend routes use `/api/v1`, strict Zod validation, OpenAPI, RBAC, pagination where applicable, soft-delete filtering, and safe errors.
- Read permission is `page:merchant-affiliate-task`; edit permission is `button:merchant-affiliate-task-create`; submit permission is `button:merchant-affiliate-task-submit`.
- Display `taskCode`, shop `publicId`, and talent `needoId` where the relevant entity is shown.
- Never render service `serviceId`, `merchantAccountId`, database `shopId`, internal `userId`, internal `identityId`, or internal `AffiliateTask.id` as a public identifier.
- Do not expose `coverMediaAssetId` as a numeric form field. New drafts send `null`; existing drafts preserve the server value until a separately designed formal merchant media picker exists.
- Use API locale codes `ja`, `en`, `ko`, `zh-TW`, `zh-CN`; show the corresponding five human-language labels.
- Fee preview is read-only. Final submit revalidates current publisher scope, shop/service eligibility, fee consistency, wallet balance, and idempotent freezing in one transaction.
- Frontend user-visible copy must be complete in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean.
- No Prisma schema change is expected. If implementation proves a schema change is unavoidable, stop the current task and return to design review before creating a migration.
- Each task below ends with a focused commit on the isolated feature branch.

## File Map

### Backend files to create

- `backend/src/services/merchant-affiliate-task-context.service.ts` — authenticated publisher/shop/service reads and fee preview.
- `backend/src/repositories/merchant-affiliate-task-context.repository.ts` — scoped Prisma queries with pagination and public shop identifiers.
- `backend/src/validators/merchant-affiliate-task-context.validator.ts` — strict query/body schemas.
- `backend/src/controllers/merchant-affiliate-task-context.controller.ts` — request/response adapter only.
- `backend/src/routes/merchant-affiliate-task-context.routes.ts` — authentication, RBAC, validation, and route wiring.
- `backend/tests/merchant-affiliate-task-context.service.test.ts` — domain and fee-preview rules.
- `backend/tests/merchant-affiliate-task-context.repository.test.ts` — Prisma query boundaries and pagination.
- `backend/tests/merchant-affiliate-task-context-api.test.ts` — HTTP envelopes, validation, authentication, RBAC, and OpenAPI.
- `backend/scripts/check-merchant-affiliate-task-workspace.ts` — guarded local MySQL/Redis acceptance checker.
- `backend/tests/merchant-affiliate-task-workspace-script.test.ts` — checker safety and coverage contract.

### Backend files to modify

- `backend/src/app.ts` — dependency injection and route registration.
- `backend/src/api/openapi.ts` — context resources and fee-preview schemas/routes.
- `backend/src/controllers/affiliate-task.controller.ts` — apply the merchant display projection to merchant task responses only.
- `backend/src/routes/affiliate-task.routes.ts` — inject the display projector without changing the task state machine.
- `backend/tests/affiliate-task-api.test.ts` — public task-display response coverage.
- `backend/src/constants/error-codes.ts` — safe missing-public-ID error code.
- `backend/package.json` — guarded checker command.

### Frontend files to create

- `src/api/merchantAffiliateTasks.ts` — typed production API client.
- `src/api/merchantAffiliateTasks.test.ts` — exact request contract tests.
- `src/features/merchant-affiliate-task/model.ts` — pure form, scope, locale, preview, and display transformations.
- `src/features/merchant-affiliate-task/model.test.ts` — domain-model unit tests.
- `src/features/merchant-affiliate-task/MerchantAffiliateTaskTable.tsx` — server-page table with public identifiers only.
- `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx` — shared six-step editor and write orchestration.
- `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx` — editor interaction and persistence tests.
- `src/features/merchant-affiliate-task/MerchantAffiliateTaskDetail.tsx` — read-only status, snapshots, and timeline.
- `src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx` — page resource state, filters, drawer, and pagination.
- `src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx` — page, permission, ID visibility, and error tests.
- `src/pages/merchant-admin/merchantAffiliateTaskCopy.ts` — five-language UI copy.
- `src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts` — copy completeness.

### Frontend files to modify

- `src/features/settings/UnifiedSettingsPages.tsx` — `TEST` badge on Affiliate identity only.
- `src/features/settings/UnifiedSettingsPages.test.ts` — identity badge regression contract.
- `src/components/merchant-admin/MerchantAdminLayout.tsx` — permission-protected Affiliate section with one item.
- `src/components/merchant-admin/MerchantAdminLayout.test.ts` — navigation visibility and no-empty-menu assertions.
- `src/App.tsx` — permission-protected workspace route.

### Evidence file to create after implementation

- `docs/superpowers/evidence/2026-08-30-affiliate-major-release-quarantine.md` — worktree/branch/HEAD inventory and explicit no-merge status.

---

### Task 1: Mark the Affiliate identity as `TEST`

**Files:**
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`

**Interfaces:**
- Consumes: existing `IdentityRow.kind`, where the Affiliate row is exactly `"affiliate"`.
- Produces: `AffiliateTestBadge` and a title node whose accessible text is `联盟营销 TEST` in Simplified Chinese.

- [ ] **Step 1: Write the failing identity-row assertions**

Add this case inside `describe("UnifiedSettingsPortalPage", ...)`:

```ts
it("marks only the affiliate identity as a TEST surface", () => {
  expect(portalPageSource).toContain('row.kind === "affiliate" ? <AffiliateTestBadge /> : null');
  expect(source).toContain("function AffiliateTestBadge()");
  expect(source).toContain('aria-label="TEST"');
  expect(portalPageSource).not.toContain('row.kind === "merchant" ? <AffiliateTestBadge />');
  expect(portalPageSource).not.toContain('row.kind === "technician" ? <AffiliateTestBadge />');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: FAIL because `AffiliateTestBadge` and the Affiliate-only title branch are absent.

- [ ] **Step 3: Add the inert themed badge and compose the title**

Add beside `SettingsPortalSelectionIndicator`:

```tsx
function AffiliateTestBadge() {
  return (
    <span
      aria-label="TEST"
      className="inline-flex rounded-full border border-[color:var(--client-primary)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--client-primary)]"
    >
      TEST
    </span>
  );
}
```

Change only the `title` prop of `SettingsPortalActionRow`:

```tsx
title={
  <span className="inline-flex min-w-0 items-center gap-2">
    <span>{t(label)}</span>
    {row.kind === "affiliate" ? <AffiliateTestBadge /> : null}
  </span>
}
```

Do not change `onClick`, `disabled`, `actionLabel`, switching, or application behavior.

- [ ] **Step 4: Run identity and auth regressions**

Run:

```bash
npm test -- src/features/settings/UnifiedSettingsPages.test.ts src/auth/rbac.test.ts src/pages/auth/LoginPage.test.ts
```

Expected: all selected tests PASS; the existing portal entry expectations remain unchanged.

- [ ] **Step 5: Commit the isolated badge**

```bash
git add src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts
git commit -m "feat: mark affiliate identity as test"
```

### Task 2: Define the merchant Affiliate task-context domain

**Files:**
- Create: `backend/src/services/merchant-affiliate-task-context.service.ts`
- Create: `backend/tests/merchant-affiliate-task-context.service.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**
- Consumes: `AuthenticatedAccessContext`, `PaginatedResponse`, `AffiliatePlatformFeeService.resolveForTask(shopIds, effectiveAt)`.
- Produces: `MerchantAffiliateTaskContextService`, `MerchantAffiliateTaskContextRepositoryPort`, resource types, query types, and `previewFee`.

- [ ] **Step 1: Write failing service tests with an in-memory repository port**

Define fixtures with a current shop `11`, public ID `shop0000000011`, merchant account `31`, in-scope shops `11/12`, outsider shop `99`, and services `101/102/999`. Cover these exact outcomes:

```ts
expect(await service.listPublishers(shopActor, { page: 1, pageSize: 20 })).toEqual({
  list: [
    expect.objectContaining({
      publisherType: "shop",
      shopId: 11,
      merchantAccountId: null,
      publicId: "shop0000000011"
    }),
    expect.objectContaining({
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopId: null,
      displayName: "NeeDo Group"
    })
  ],
  total: 2,
  page: 1,
  page_size: 20
});

await expect(
  service.listShops(shopActor, {
    publisherType: "merchant_account",
    merchantAccountId: 88,
    page: 1,
    pageSize: 20
  })
).rejects.toMatchObject({ statusCode: 403, message: "error.affiliate.publisher_scope_invalid" });

await expect(
  service.listServices(shopActor, {
    publisherType: "merchant_account",
    merchantAccountId: 31,
    shopIds: [11, 99],
    page: 1,
    pageSize: 20
  })
).rejects.toMatchObject({ statusCode: 403, message: "error.affiliate.publisher_scope_invalid" });
```

Add preview assertions:

```ts
expect(await service.previewFee(shopActor, {
  publisherType: "merchant_account",
  merchantAccountId: 31,
  shopIds: [11, 12],
  totalBudgetNdp: 2_000_000
})).toEqual({
  evaluatedAt: now,
  effectiveAt: now,
  platformFeeBps: 1000,
  commissionBudgetNdp: 2_000_000,
  platformFeeReserveNdp: 200_000,
  grossFreezeNdp: 2_200_000,
  shopRateStatus: "consistent"
});
expect(repository.writeCalls).toBe(0);
```

Make the fake fee port throw `error.affiliate.platform_fee_rate_mismatch` for mixed rates and assert the error propagates without repository writes.

Add one page-projection assertion and one broken-data assertion:

```ts
const presented = await service.presentTaskPage({
  list: [shopTask, merchantTask],
  total: 2,
  page: 1,
  page_size: 20
});
expect(presented.list).toEqual([
  expect.objectContaining({
    publisherDisplayName: "Shibuya Shop",
    shops: [expect.objectContaining({ publicId: "shop0000000011" })]
  }),
  expect.objectContaining({
    publisherDisplayName: "NeeDo Group",
    shops: [expect.objectContaining({ publicId: "shop0000000012" })]
  })
]);
expect(repository.findTaskDisplayResources).toHaveBeenCalledTimes(1);

repository.taskDisplayResources.shops[0].publicId = null;
await expect(service.presentTask(shopTask)).rejects.toMatchObject({
  code: 40954,
  statusCode: 409,
  message: "error.affiliate.shop_public_id_unavailable"
});
```

- [ ] **Step 2: Run the service test and confirm RED**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context.service.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Create the complete public types and ports**

Add the isolated branch's next available error code before compiling the service:

```ts
AFFILIATE_SHOP_PUBLIC_IDENTIFIER_UNAVAILABLE: 40954,
```

Use these exact exported shapes:

```ts
export type MerchantAffiliatePublisherType = "shop" | "merchant_account";

export interface MerchantAffiliatePublisherOption {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId: number | null;
  shopId: number | null;
  publicId: string | null;
  displayName: string;
  current: boolean;
  manageableShopCount: number;
}

export interface MerchantAffiliateShopOption {
  shopId: number;
  publicId: string;
  name: string;
  city: string;
  activeServiceCount: number;
}

export interface MerchantAffiliateServiceOption {
  serviceId: number;
  shopId: number;
  serviceName: string;
  priceJpy: number;
  shopName: string;
  shopPublicId: string;
}

export interface MerchantAffiliateFeePreview {
  evaluatedAt: Date;
  effectiveAt: Date;
  platformFeeBps: number;
  commissionBudgetNdp: number;
  platformFeeReserveNdp: number;
  grossFreezeNdp: number;
  shopRateStatus: "consistent";
}

export type MerchantAffiliateTaskView = Omit<AffiliateTaskRecord, "shops"> & {
  publisherDisplayName: string;
  shops: Array<AffiliateTaskShopSnapshot & { publicId: string }>;
};
```

The repository port must expose only read methods:

```ts
export interface MerchantAffiliateTaskContextRepositoryPort {
  findCurrentShopPublisher(input: {
    shopId: number;
    keyword?: string;
  }): Promise<MerchantAffiliatePublisherOption | null>;
  listManageableMerchantPublishers(input: {
    userId: number;
    keyword?: string;
    offset: number;
    limit: number;
    now: Date;
  }): Promise<{ list: MerchantAffiliatePublisherOption[]; total: number }>;
  isManageableMerchantAccount(userId: number, merchantAccountId: number): Promise<boolean>;
  listCurrentShop(input: {
    shopId: number;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>>;
  listMerchantShops(input: {
    merchantAccountId: number;
    keyword?: string;
    page: number;
    pageSize: number;
    now: Date;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>>;
  countEligibleShops(input: {
    publisherType: MerchantAffiliatePublisherType;
    currentShopId: number | null;
    merchantAccountId: number | null;
    shopIds: number[];
    now: Date;
  }): Promise<number>;
  listServices(input: {
    shopIds: number[];
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateServiceOption>>;
  findTaskDisplayResources(input: {
    merchantAccountIds: number[];
    shopIds: number[];
  }): Promise<{
    merchantAccounts: Array<{ id: number; name: string }>;
    shops: Array<{ id: number; publicId: string | null }>;
  }>;
}
```

- [ ] **Step 4: Implement service validation and calculations**

Implement `listPublishers`, `listShops`, `listServices`, `previewFee`, `presentTask`, and `presentTaskPage` with these invariants:

```ts
const normalizedShopIds = [...new Set(input.shopIds)].sort((left, right) => left - right);
if (normalizedShopIds.length === 0 || normalizedShopIds.length !== input.shopIds.length) {
  throw new AppError({
    code: ERROR_CODES.VALIDATION,
    message: "error.affiliate.publisher_scope_invalid",
    statusCode: 400
  });
}

const platformFeeReserveNdp = Math.ceil(
  input.totalBudgetNdp * feeSnapshot.feeBps / 10_000
);
const grossFreezeNdp = input.totalBudgetNdp + platformFeeReserveNdp;
if (!Number.isSafeInteger(grossFreezeNdp)) {
  throw new AppError({
    code: ERROR_CODES.VALIDATION,
    message: "error.affiliate.budget_invalid",
    statusCode: 400
  });
}
```

For a shop publisher, require `actor.currentIdentityScopeType === "shop"`, use only `actor.currentIdentityScopeId`, and reject a non-null `merchantAccountId`. For a merchant-account publisher, call `isManageableMerchantAccount` before any shop or service query. Before listing services or resolving fees, require `countEligibleShops(...) === normalizedShopIds.length`.

`listPublishers` must combine at most one current-shop row with a database-paginated merchant-account slice. Compute `offset = (page - 1) * pageSize`, consume the current shop only when it matches the keyword and falls within that offset, then request only the remaining merchant rows. Mark the shop row current when the actor's scope is that shop; mark a merchant row current when the actor scope type is `merchant` or `merchant_account` and its scope ID equals that account ID. Return the original requested `page` and normalized `page_size`.

`presentTaskPage` collects unique merchant-account and shop IDs across the whole current page, calls `findTaskDisplayResources` once, and maps every task to `MerchantAffiliateTaskView`. `presentTask` delegates through the same batch projector with one task. A shop task uses its matching `shopNameSnapshot` as `publisherDisplayName`; a merchant-account task uses the returned current merchant name. If a merchant publisher record is missing, return the existing safe task-not-found error. If an active formal shop public ID is missing, throw an `AppError` with code `40954`, status `409`, and message `error.affiliate.shop_public_id_unavailable`; never substitute an internal ID.

- [ ] **Step 5: Run the service test and confirm GREEN**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context.service.test.ts
```

Expected: PASS with shop scope, merchant scope, outsider rejection, fee math, mismatch propagation, and zero-write assertions.

- [ ] **Step 6: Commit the domain service**

```bash
git add backend/src/services/merchant-affiliate-task-context.service.ts backend/tests/merchant-affiliate-task-context.service.test.ts backend/src/constants/error-codes.ts
git commit -m "feat: add merchant affiliate task context service"
```

### Task 3: Implement scoped Prisma resource queries

**Files:**
- Create: `backend/src/repositories/merchant-affiliate-task-context.repository.ts`
- Create: `backend/tests/merchant-affiliate-task-context.repository.test.ts`

**Interfaces:**
- Consumes: `MerchantAffiliateTaskContextRepositoryPort` from Task 2 and the generated Prisma client.
- Produces: `MerchantAffiliateTaskContextRepository` implementing every read method without mutation or N+1 queries.

- [ ] **Step 1: Write failing repository query-contract tests**

Use a mocked Prisma client and assert:

```ts
expect(client.merchantAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    deletedAt: null,
    status: "active",
    OR: expect.arrayContaining([
      { ownerUserId: 7 },
      expect.objectContaining({ id: { in: [31] } })
    ])
  }),
  skip: 0,
  take: 20
}));

expect(client.merchantShopMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    merchantAccountId: 31,
    activeKey: { not: null },
    deletedAt: null,
    shop: expect.objectContaining({ deletedAt: null })
  })
}));

expect(client.service.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    shopId: { in: [11, 12] },
    status: { in: ["active", "published"] },
    currency: "JPY",
    deletedAt: null
  })
}));
```

Assert each shop query selects an active `PublicIdentifier` with kind `SHOP`, status `ACTIVE`, and `deletedAt: null`; assert service prices are mapped with `priceAmount.toNumber()`; assert shop and service counts use batch queries rather than one query per row.

For `findTaskDisplayResources`, assert exactly one merchant-account query and one shop/public-identifier query are used for a whole task page, duplicates are removed before querying, and missing identifiers map to `publicId: null` for the Service layer to reject safely.

- [ ] **Step 2: Run the repository test and confirm RED**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context.repository.test.ts
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement the Prisma repository**

Use these shared filters exactly:

```ts
const activeShopWhere = {
  status: { in: ["active", "published"] },
  deletedAt: null,
  publicIdentifier: {
    is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
  }
} satisfies Prisma.ShopWhereInput;

const activeMembershipWhere = (now: Date) => ({
  activeKey: { not: null },
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  deletedAt: null
}) satisfies Prisma.MerchantShopMembershipWhereInput;
```

For manageable merchant accounts, derive scoped account IDs from non-deleted `UserRole` rows whose scope is `merchant` or `merchant_account`, whose role code is `merchant_owner` or `merchant_staff`, then query active accounts using `ownerUserId === userId OR id IN scopedIds`. Count active memberships for the returned account IDs with one `groupBy` query.

For shop/service result mapping, require the selected public identifier and return only the public ID plus the technical keys required for subsequent API calls. Do not return merchant account code, owner number, owner user ID, service public UUID, or membership IDs.

- [ ] **Step 4: Run repository and existing task-repository regressions**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context.repository.test.ts tests/affiliate-task.repository.test.ts
```

Expected: PASS; no writes are present in the new repository.

- [ ] **Step 5: Commit the repository**

```bash
git add backend/src/repositories/merchant-affiliate-task-context.repository.ts backend/tests/merchant-affiliate-task-context.repository.test.ts
git commit -m "feat: add scoped affiliate publisher resources"
```

### Task 4: Expose context and fee-preview HTTP contracts

**Files:**
- Create: `backend/src/validators/merchant-affiliate-task-context.validator.ts`
- Create: `backend/src/controllers/merchant-affiliate-task-context.controller.ts`
- Create: `backend/src/routes/merchant-affiliate-task-context.routes.ts`
- Create: `backend/tests/merchant-affiliate-task-context-api.test.ts`
- Modify: `backend/src/controllers/affiliate-task.controller.ts`
- Modify: `backend/src/routes/affiliate-task.routes.ts`
- Modify: `backend/tests/affiliate-task-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Consumes: `MerchantAffiliateTaskContextService` and repository from Tasks 2–3.
- Produces: four authenticated `/api/v1/merchant-admin/affiliate/*` resource endpoints and matching OpenAPI schemas.

- [ ] **Step 1: Write failing Supertest and OpenAPI assertions**

Create a fixture with merchant read permission, no-permission merchant, and unauthenticated request. Assert the exact calls:

```ts
await request(app)
  .get("/api/v1/merchant-admin/affiliate/publishers?page=1&pageSize=20")
  .set("Authorization", authorization)
  .expect(200);

await request(app)
  .get("/api/v1/merchant-admin/affiliate/shops?publisherType=merchant_account&merchantAccountId=31&page=1&pageSize=20")
  .set("Authorization", authorization)
  .expect(200);

await request(app)
  .get("/api/v1/merchant-admin/affiliate/services?publisherType=merchant_account&merchantAccountId=31&shopIds=11,12&page=1&pageSize=20")
  .set("Authorization", authorization)
  .expect(200);

await request(app)
  .post("/api/v1/merchant-admin/affiliate/tasks/fee-preview")
  .set("Authorization", authorization)
  .send({
    publisherType: "merchant_account",
    merchantAccountId: 31,
    shopIds: [11, 12],
    totalBudgetNdp: 2_000_000
  })
  .expect(200);
```

Also assert `401`, `403`, invalid comma-list rejection, duplicate shop rejection, `pageSize=101` rejection, strict-body rejection for an unknown key, and that OpenAPI includes all four paths.

- [ ] **Step 2: Run the API test and confirm RED**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context-api.test.ts
```

Expected: FAIL because validators, controller, routes, and OpenAPI paths are absent.

- [ ] **Step 3: Implement strict Zod schemas**

Use a comma-list preprocessor that rejects empty tokens and non-positive integers:

```ts
const shopIdsQuerySchema = z.preprocess(
  (value) => typeof value === "string" ? value.split(",") : value,
  z.array(z.coerce.number().int().positive()).min(1).max(1_000)
);

export const merchantAffiliateServicesQuerySchema = z.object({
  publisherType: z.enum(["shop", "merchant_account"]),
  merchantAccountId: z.coerce.number().int().positive().optional(),
  shopIds: shopIdsQuerySchema,
  keyword: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
}).strict();
```

Define equivalent publisher/shop queries and a discriminated fee-preview body. The `shop` variant rejects `merchantAccountId`; the `merchant_account` variant requires it. Fee budget is an integer from `1` through `2_000_000_000`.

- [ ] **Step 4: Wire controller, route, dependencies, and permission**

Define one permission constant:

```ts
export const MERCHANT_AFFILIATE_TASK_CONTEXT_PERMISSION = "page:merchant-affiliate-task";
```

Every route must use, in order, `authenticate()`, `createAuthorizeMiddleware(...)`, `validateRequest(...)`, then a controller method. Add optional `merchantAffiliateTaskContextRepository` and `merchantAffiliateTaskContextService` dependencies to `AppDependencies`, instantiate production defaults in the context route factory, and register that route factory immediately before `createAffiliateTaskRoutes`.

Controller methods parse with the exported schemas, call the corresponding service method with `response.locals.auth`, and wrap results with `successResponse` only.

- [ ] **Step 5: Project merchant task responses into public display views**

Before documenting the routes, keep `AffiliateTaskService` and `AffiliateTaskRepository` unchanged. Extend `AffiliateTaskController` with a `MerchantAffiliateTaskContextService` projector and map only merchant task responses:

```ts
const page = await this.service.listPublisherTasks(actor, query);
response.status(200).json(successResponse(await this.presenter.presentTaskPage(page)));

const created = await this.service.createDraft(actor, body);
response.status(201).json(successResponse(await this.presenter.presentTask(created)));
```

Apply `presentTask` to merchant create, get, patch, locale, and submit responses. Apply `presentTaskPage` to the merchant list response. Keep all four backoffice review responses on their existing record contract so the current operations UI and tests do not change.

Reuse error code `40954` added in Task 2. Extend the Affiliate task route factory to use `dependencies.merchantAffiliateTaskContextService` when supplied, otherwise construct the same production projector from `MerchantAffiliateTaskContextRepository` and `AffiliatePlatformFeeService`, then inject it into `AffiliateTaskController`. Update the `affiliate-task-api` fixture with a fake projector so tests never fall through to Prisma. Add API assertions that a shop task returns `publisherDisplayName: "Shibuya Shop"`, a merchant-account task returns `publisherDisplayName: "NeeDo Group"`, and both return `shops[].publicId`. Assert backoffice service calls and response shapes remain unchanged.

- [ ] **Step 6: Add exact OpenAPI schemas and paths**

Add schemas for:

```text
MerchantAffiliatePublisherOption
MerchantAffiliatePublisherPage
MerchantAffiliateShopOption
MerchantAffiliateShopPage
MerchantAffiliateServiceOption
MerchantAffiliateServicePage
MerchantAffiliateFeePreviewRequest
MerchantAffiliateFeePreview
```

Mark technical request/response fields as integer keys for API use. Schema descriptions must state that `merchantAccountId`, `shopId`, and `serviceId` are not public display identifiers. Add a `MerchantAffiliateTaskView` schema with `publisherDisplayName` and required `shops[].publicId`, and use it only on merchant task endpoints. The fee-preview operation description must state that it performs no wallet, reservation, ledger, or task mutation.

- [ ] **Step 7: Run HTTP, repository, OpenAPI, and production-safety tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context-api.test.ts tests/affiliate-task-api.test.ts tests/openapi.test.ts tests/production-safety.test.ts
```

Expected: PASS with four documented, authenticated, permission-protected endpoints.

- [ ] **Step 8: Commit the HTTP slice**

```bash
git add backend/src/validators/merchant-affiliate-task-context.validator.ts backend/src/controllers/merchant-affiliate-task-context.controller.ts backend/src/routes/merchant-affiliate-task-context.routes.ts backend/src/controllers/affiliate-task.controller.ts backend/src/routes/affiliate-task.routes.ts backend/tests/affiliate-task-api.test.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/merchant-affiliate-task-context-api.test.ts
git commit -m "feat: expose merchant affiliate task resources"
```

### Task 5: Add the typed frontend API and pure editor model

**Files:**
- Create: `src/api/merchantAffiliateTasks.ts`
- Create: `src/api/merchantAffiliateTasks.test.ts`
- Create: `src/features/merchant-affiliate-task/model.ts`
- Create: `src/features/merchant-affiliate-task/model.test.ts`

**Interfaces:**
- Consumes: four new context endpoints and six existing merchant task endpoints.
- Produces: `merchantAffiliateTasksApi`, task/resource types, `MerchantAffiliateTaskForm`, payload builders, and scope-reset helpers.

- [ ] **Step 1: Write failing API request tests**

Mock `httpClient.request` and assert exact methods and paths for:

```ts
await merchantAffiliateTasksApi.listTasks({ page: 2, pageSize: 20, status: "draft" });
await merchantAffiliateTasksApi.listPublishers({ page: 1, pageSize: 20 });
await merchantAffiliateTasksApi.listShops({
  publisherType: "merchant_account",
  merchantAccountId: 31,
  page: 1,
  pageSize: 20
});
await merchantAffiliateTasksApi.listServices({
  publisherType: "merchant_account",
  merchantAccountId: 31,
  shopIds: "11,12",
  page: 1,
  pageSize: 20
});
await merchantAffiliateTasksApi.previewFee({
  publisherType: "merchant_account",
  merchantAccountId: 31,
  shopIds: [11, 12],
  totalBudgetNdp: 2_000_000
});
```

Assert create uses `POST`, update uses `PATCH`, locale save uses `PUT`, submit uses `POST`, and no method catches a failure to return fallback data.

- [ ] **Step 2: Write failing pure-model tests**

Cover these transformations:

```ts
expect(changePublisher(form, shopPublisher)).toMatchObject({
  publisherType: "shop",
  merchantAccountId: null,
  shopIds: [],
  selectedServiceIds: [],
  feePreview: null
});

expect(removeShop(form, 12, serviceOptions)).toMatchObject({
  shopIds: [11],
  selectedServiceIds: [101],
  feePreview: null
});

expect(buildScopePayload({
  ...form,
  serviceScopeMode: "all_current_services"
})).toMatchObject({ selectedServiceIds: [] });

expect(taskDisplayRows(task).join(" ")).not.toMatch(/merchantAccountId|serviceId|userId|identityId/);
```

- [ ] **Step 3: Run both tests and confirm RED**

Run:

```bash
npm test -- src/api/merchantAffiliateTasks.test.ts src/features/merchant-affiliate-task/model.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement the API client types and methods**

Define the API types from OpenAPI, including all current `AffiliateTaskRecord` fields used by list, detail, translation, finance, and status views. The client object must expose:

```ts
export const merchantAffiliateTasksApi = {
  listTasks,
  getTask,
  createDraft,
  updateDraft,
  updateLocale,
  submit,
  listPublishers,
  listShops,
  listServices,
  previewFee
};
```

All paths are relative to the existing `/api/v1` base in `httpClient`.

- [ ] **Step 5: Implement the pure model**

Use one serializable form type:

```ts
export interface MerchantAffiliateTaskForm {
  taskId: number | null;
  taskCode: string | null;
  lockVersion: number | null;
  publisherType: "shop" | "merchant_account";
  merchantAccountId: number | null;
  shopIds: number[];
  selectedServiceIds: number[];
  sourceLocale: AffiliateContentLocale;
  name: string;
  description: string;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  customerDiscountType: "none" | "fixed_jpy" | "percent";
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  minimumOrderAmountJpy: number;
  claimStartsAt: string;
  claimEndsAt: string;
  taskStartsAt: string;
  taskEndsAt: string;
  attributionWindowDays: number;
  maxCompletedOrdersPerClaim: number | null;
  maxCompletedOrdersPerCustomer: number | null;
  serviceScopeMode: "all_current_services" | "selected_services";
  translations: AffiliateTaskTranslations;
  feePreview: MerchantAffiliateFeePreview | null;
}
```

Define the locale type before the form:

```ts
export type AffiliateContentLocale = "ja" | "en" | "ko" | "zh-TW" | "zh-CN";
```

`buildCreatePayload` omits `merchantAccountId` and `shopIds` for shop publishing and includes both for merchant-account publishing. `buildUpdatePayload` always includes `lockVersion`; it includes `shopIds` only for merchant-account tasks. All-current-services always emits `selectedServiceIds: []`.

`removeShop(form, shopId, serviceOptions)` uses the supplied service-to-shop mapping to remove services owned by the removed shop. `taskDisplayRows(task)` returns only `taskCode`, localized task name, `publisherDisplayName`, shop names/public IDs, status, finance values, windows, and timestamps; it never includes internal ID keys or values.

- [ ] **Step 6: Run API and model tests and confirm GREEN**

Run:

```bash
npm test -- src/api/merchantAffiliateTasks.test.ts src/features/merchant-affiliate-task/model.test.ts
```

Expected: PASS with exact request contracts and no fallback source.

- [ ] **Step 7: Commit the frontend foundation**

```bash
git add src/api/merchantAffiliateTasks.ts src/api/merchantAffiliateTasks.test.ts src/features/merchant-affiliate-task/model.ts src/features/merchant-affiliate-task/model.test.ts
git commit -m "feat: add merchant affiliate task client model"
```

### Task 6: Add the permission-protected task list workspace

**Files:**
- Create: `src/features/merchant-affiliate-task/MerchantAffiliateTaskTable.tsx`
- Create: `src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx`
- Create: `src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx`
- Create: `src/pages/merchant-admin/merchantAffiliateTaskCopy.ts`
- Create: `src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `merchantAffiliateTasksApi.listTasks`, authenticated session permissions, `MerchantAdminLayout`, `Badge`, `Button`, and existing theme tokens.
- Produces: `/merchant-admin/affiliate/tasks`, server-paginated filters, task row selection, and one visible Affiliate menu item.

- [ ] **Step 1: Write failing copy and route/navigation tests**

In copy tests, require all five languages for every key and exact task ID terminology:

```ts
for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
  const copy = getMerchantAffiliateTaskCopy(language);
  expect(copy.title.trim()).not.toBe("");
  expect(copy.taskCode.trim()).not.toBe("");
  expect(copy.shopPublicId.trim()).not.toBe("");
  expect(copy.createTask.trim()).not.toBe("");
  expect(copy.retry.trim()).not.toBe("");
}
```

In layout/page tests, assert:

```ts
expect(layoutSource).toContain('key: "affiliate"');
expect(layoutSource).toContain('title: "联盟营销"');
expect(layoutSource).toContain('label: "我的联盟营销"');
expect(layoutSource).toContain('permission: "page:merchant-affiliate-task"');
expect(layoutSource).not.toContain("达人广场");
expect(layoutSource).not.toContain("达人动态");
expect(layoutSource).not.toContain("营销热榜");
expect(appSource).toContain('path="/merchant-admin/affiliate/tasks"');
expect(appSource).toContain('protectPermission("merchant", "page:merchant-affiliate-task"');
```

- [ ] **Step 2: Write failing rendered list-page tests**

Mock `merchantAffiliateTasksApi.listTasks` with `total: 41`, `page: 2`, `page_size: 20`. Render the content, then assert:

```ts
expect(container.textContent).toContain("AFF-2026-000081");
expect(container.textContent).toContain("shop0000000011");
expect(container.textContent).not.toContain("merchantAccountId");
expect(container.textContent).not.toContain("serviceId");
expect(container.textContent).not.toContain("第 2 / 1 页");
expect(container.textContent).toContain("第 2 / 3 页");
expect(apiMocks.listTasks).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
```

Also cover loading, empty, `401`, `403`, `500`, retry, keyword/status/publisher changes resetting page to 1, and row click.

- [ ] **Step 3: Run page, layout, and copy tests and confirm RED**

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts
```

Expected: FAIL because the route, menu, copy, page, and table are absent.

- [ ] **Step 4: Implement five-language copy and safe error mapping**

Export:

```ts
export const merchantAffiliateTaskLanguages = ["ja", "en", "ko", "zh-Hant", "zh"] as const;
export function getMerchantAffiliateTaskCopy(language: Language): MerchantAffiliateTaskCopy;
export function merchantAffiliateTaskStatusLabel(status: AffiliateTaskStatus, language: Language): string;
export function describeMerchantAffiliateTaskError(error: unknown, language: Language): string;
```

Map `401`, `403`, conflict, publisher scope, service scope, missing formal shop public ID, rate mismatch, insufficient wallet, content missing, not editable, and server/network failure without exposing raw internal errors.

- [ ] **Step 5: Implement the server-page table**

Use a semantic table inside `HorizontalScrollArea`, not `DataTable`, because `DataTable` performs local pagination. Accept these props:

```ts
type MerchantAffiliateTaskTableProps = {
  copy: MerchantAffiliateTaskCopy;
  rows: MerchantAffiliateTask[];
  onSelect: (taskId: number) => void;
};
```

Render only `taskCode`, localized name with its current locale label, `publisherDisplayName`, shop names/public IDs, status, reward/fee/gross values, windows, and `updatedAt`. Technical IDs may be passed to `onSelect` but never rendered or placed in `title`, `aria-label`, or copy controls.

- [ ] **Step 6: Implement page resource state and server pagination**

Use one request effect keyed by `keyword`, `status`, `publisherType`, `page`, and `revision`. Abort stale requests with `AbortController` only if `httpClient` supports a signal; otherwise use an effect-local `cancelled` flag and ignore stale responses.

Pagination must calculate:

```ts
const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
```

Create/retry/view actions update page state but do not synthesize rows. The page initially opens no editor; that is added in Task 7.

- [ ] **Step 7: Wire navigation and route permission**

Change `MerchantAdminNavItem.permission` to `string`, add exactly:

```ts
{
  key: "affiliate",
  title: "联盟营销",
  items: [{
    label: "我的联盟营销",
    to: "/merchant-admin/affiliate/tasks",
    icon: "联",
    children: ["任务", "多店范围", "预算"],
    permission: "page:merchant-affiliate-task"
  }]
}
```

Import `MerchantAffiliateTasksPage` in `src/App.tsx` and add:

```tsx
<Route
  path="/merchant-admin/affiliate/tasks"
  element={protectPermission(
    "merchant",
    "page:merchant-affiliate-task",
    <MerchantAffiliateTasksPage />
  )}
/>
```

- [ ] **Step 8: Run list workspace tests and confirm GREEN**

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/auth/rbac.test.ts
```

Expected: PASS with formal API use, server pagination, one menu item, and correct permission gating.

- [ ] **Step 9: Commit the list workspace**

```bash
git add src/features/merchant-affiliate-task/MerchantAffiliateTaskTable.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx src/pages/merchant-admin/merchantAffiliateTaskCopy.ts src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts src/components/merchant-admin/MerchantAdminLayout.tsx src/components/merchant-admin/MerchantAdminLayout.test.ts src/App.tsx
git commit -m "feat: add merchant affiliate task workspace"
```

### Task 7: Build persisted draft editing for basic, scope, reward, and time steps

**Files:**
- Create: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx`
- Create: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx`
- Modify: `src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 form/payload builders and API methods plus Task 6 copy/page.
- Produces: draft creation, draft reload/edit, publisher/shop/service selection, steps 1–4, and a drawer/full-width responsive editor.

- [ ] **Step 1: Write failing editor interaction tests**

Cover single-shop and multi-shop flows:

```ts
expect(apiMocks.listPublishers).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
expect(apiMocks.listShops).toHaveBeenCalledWith(expect.objectContaining({
  publisherType: "merchant_account",
  merchantAccountId: 31
}));
expect(apiMocks.listServices).toHaveBeenCalledWith(expect.objectContaining({
  publisherType: "merchant_account",
  merchantAccountId: 31,
  shopIds: "11,12"
}));
```

After changing publisher or removing shop `12`, assert selected service `102` disappears and preview becomes null. When saving a new shop draft, assert create body omits merchant account and shop IDs. When saving a merchant draft, assert both are present. Assert the create body contains the selected `sourceLocale`, sends `coverMediaAssetId: null` for a new draft, and the rendered editor contains no numeric cover-media ID input. Unmount and rerender the page, reload the task through `getTask`, and assert the saved server values return.

Assert visible editor text contains `shop0000000011` but not technical IDs `31`, `101`, or `102` as standalone labels.

- [ ] **Step 2: Run editor tests and confirm RED**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx
```

Expected: FAIL because the editor is absent.

- [ ] **Step 3: Implement the six-step shell and steps 1–4**

Define the stable step order:

```ts
const editorSteps = [
  "basic",
  "scope",
  "reward",
  "timing",
  "locales",
  "finance"
] as const;
```

Steps 1–4 render controlled fields from `MerchantAffiliateTaskForm`. Use `inputMode="numeric"` for integer NDP/JPY/bps fields and `datetime-local` values converted to/from ISO strings in the pure model. Enforce the same client relationships as backend Zod, while preserving backend errors as authoritative. Keep `coverMediaAssetId` out of the visible form: new drafts use `null`, and updates preserve the value loaded from the server.

The scope step must:

- load publishers from the formal endpoint;
- load shops for the selected publisher;
- load services only after at least one valid shop is selected;
- show shop name and public ID;
- show service name, JPY price, and owning shop name;
- never render merchant/service/internal IDs;
- clear invalid descendant selections and fee preview on parent changes.

- [ ] **Step 4: Persist the first save and later edits**

On first save:

```ts
const created = await merchantAffiliateTasksApi.createDraft(buildCreatePayload(form));
setForm(taskToForm(created));
onPersisted(created);
```

On later save:

```ts
if (form.taskId === null || form.lockVersion === null) return;
const updated = await merchantAffiliateTasksApi.updateDraft(
  form.taskId,
  buildUpdatePayload(form)
);
setForm(taskToForm(updated));
onPersisted(updated);
```

Disable writes unless `button:merchant-affiliate-task-create` is present. Tasks whose status is not `draft` render the same fields read-only.

- [ ] **Step 5: Attach the editor to the existing Drawer**

Use:

```tsx
<Drawer
  defaultWidth={900}
  maxWidth={1180}
  minWidth={420}
  onClose={closeEditor}
  open={editorOpen}
  title={selectedTaskId ? copy.editTask : copy.createTask}
  widthStorageKey="needo.merchant-affiliate-task.drawer.width"
>
  <MerchantAffiliateTaskEditor {...editorProps} />
</Drawer>
```

The existing Drawer already becomes full-width on narrow screens. Keep editor actions within its footer/body flow so long forms remain fully scrollable.

- [ ] **Step 6: Run editor, model, and task API regressions**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/features/merchant-affiliate-task/model.test.ts src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx
cd backend
npm test -- --runInBand tests/affiliate-task-api.test.ts tests/affiliate-task.service.test.ts
```

Expected: PASS with real draft writes and existing backend write semantics unchanged.

- [ ] **Step 7: Commit draft editing**

```bash
git add src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx
git commit -m "feat: add merchant affiliate draft editor"
```

### Task 8: Add five-language editing and optimistic-conflict recovery

**Files:**
- Modify: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx`
- Modify: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx`
- Modify: `src/features/merchant-affiliate-task/model.ts`
- Modify: `src/features/merchant-affiliate-task/model.test.ts`
- Modify: `src/pages/merchant-admin/merchantAffiliateTaskCopy.ts`
- Modify: `src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts`

**Interfaces:**
- Consumes: existing locale update endpoint and `lockVersion` returned after every write.
- Produces: independent five-language saves, explicit sync-all, conflict-preserving state, and reload action.

- [ ] **Step 1: Write failing localization and 409 tests**

Assert the five API codes render in this display order:

```ts
expect(renderedLocaleCodes).toEqual(["ja", "en", "ko", "zh-TW", "zh-CN"]);
```

Save English with:

```ts
expect(apiMocks.updateLocale).toHaveBeenCalledWith(task.id, "en", {
  lockVersion: 4,
  name: "English campaign",
  description: "English instructions",
  syncToAll: false
});
```

Trigger explicit sync and assert `syncToAll: true`. Make update reject with `new ApiClientError("error.affiliate.task_conflict", 40918, 409)`; assert typed text remains, the conflict panel appears, and `getTask` is called only after the user clicks reload.

- [ ] **Step 2: Run localization tests and confirm RED**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/features/merchant-affiliate-task/model.test.ts src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts
```

Expected: FAIL because step 5 and conflict recovery are absent.

- [ ] **Step 3: Implement locale draft state and independent save**

Keep editable locale text separate from the last server snapshot:

```ts
type LocaleEditorState = Record<AffiliateContentLocale, {
  name: string;
  description: string;
  dirty: boolean;
}>;
```

After a successful locale save, replace the whole form from the returned task so the newest `lockVersion` is authoritative. `syncToAll` requires an explicit confirmation action and updates all locale states only after the server succeeds.

- [ ] **Step 4: Implement conflict preservation and reload**

On `40918`, store:

```ts
setConflict({
  localForm: form,
  localeState,
  message: copy.conflictMessage
});
```

Do not call `getTask` automatically. The reload button fetches the current task, replaces the editor state, clears fee preview, and keeps the discarded local values visible in the conflict comparison panel until the user closes it.

- [ ] **Step 5: Run localization and existing backend locale tests**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/features/merchant-affiliate-task/model.test.ts src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts
cd backend
npm test -- --runInBand tests/affiliate-task.service.test.ts tests/affiliate-task-localization-flow-script.test.ts
```

Expected: PASS with independent saves, explicit sync, no automatic overwrite, and correct five-language copy.

- [ ] **Step 6: Commit localization and conflict recovery**

```bash
git add src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/features/merchant-affiliate-task/model.ts src/features/merchant-affiliate-task/model.test.ts src/pages/merchant-admin/merchantAffiliateTaskCopy.ts src/pages/merchant-admin/merchantAffiliateTaskCopy.test.ts
git commit -m "feat: add affiliate task localization workflow"
```

### Task 9: Add fee confirmation, submission, and read-only detail

**Files:**
- Create: `src/features/merchant-affiliate-task/MerchantAffiliateTaskDetail.tsx`
- Modify: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx`
- Modify: `src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx`
- Modify: `src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx`
- Modify: `src/pages/merchant-admin/merchantAffiliateTaskCopy.ts`

**Interfaces:**
- Consumes: `previewFee`, `submit`, `getTask`, permissions, server task snapshots.
- Produces: step 6 financial confirmation, idempotent submit UI, and read-only task status/detail timeline.

- [ ] **Step 1: Write failing finance and submission tests**

Assert preview presentation:

```ts
expect(container.textContent).toContain("2,000,000 NDP");
expect(container.textContent).toContain("10%");
expect(container.textContent).toContain("200,000 NDP");
expect(container.textContent).toContain("2,200,000 NDP");
```

Assert preview does not call create/update/submit. After submit click, assert exactly one API request while pending, then task status becomes `pending_review`, editor becomes read-only, and list reloads.

Cover rate mismatch, insufficient balance, missing locale, publisher change, invalid service, not-editable, and network retry. Assert a failed submit keeps form values and does not synthesize `pending_review`.

- [ ] **Step 2: Write failing detail visibility tests**

Render a task containing internal task, shop, service, wallet, user, and identity IDs. Assert visible text includes `taskCode`, shop public ID, names/prices, status, rejection reason, fee snapshots, and timestamps, while internal IDs are absent.

- [ ] **Step 3: Run finance/detail tests and confirm RED**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx
```

Expected: FAIL because finance submission and detail are incomplete.

- [ ] **Step 4: Implement preview invalidation and finance display**

Generate a stable preview key from sorted shops plus budget:

```ts
const previewKey = [
  form.publisherType,
  form.merchantAccountId ?? "shop",
  [...form.shopIds].sort((a, b) => a - b).join(","),
  form.totalBudgetNdp
].join(":");
```

Store the key with the preview. Any publisher, shop, service-scope, budget, or conflict reload change clears it. The submit button is enabled only when the stored key equals the current key, the task is a persisted draft, the user has submit permission, and no request is in flight.

- [ ] **Step 5: Implement authoritative submit handling**

Use:

```ts
setSubmitting(true);
try {
  const submitted = await merchantAffiliateTasksApi.submit(form.taskId);
  setForm(taskToForm(submitted));
  onPersisted(submitted);
  onSubmitted(submitted);
} catch (error) {
  setSubmitError(describeMerchantAffiliateTaskError(error, language));
} finally {
  setSubmitting(false);
}
```

Do not mutate wallet, status, reservation, or fee values locally before success.

- [ ] **Step 6: Implement read-only detail and timeline**

`MerchantAffiliateTaskDetail` accepts a server task and renders public business information only. Build the timeline from non-null `createdAt`, `submittedAt`, `reviewedAt`, `activatedAt`, and `updatedAt`; do not invent audit events. Display service name, price, and owning shop name without `serviceId`. Display merchant name without `merchantAccountId` when that name is returned by the task detail contract.

- [ ] **Step 7: Run finance, page, API, and task-service regressions**

Run:

```bash
npm test -- src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx src/api/merchantAffiliateTasks.test.ts
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-context.service.test.ts tests/affiliate-task.service.test.ts tests/affiliate-task-api.test.ts tests/affiliate-platform-fee.service.test.ts tests/affiliate-budget-ledger.service.test.ts
```

Expected: PASS with preview-only reads and existing atomic submit behavior intact.

- [ ] **Step 8: Commit finance and detail**

```bash
git add src/features/merchant-affiliate-task/MerchantAffiliateTaskDetail.tsx src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.tsx src/features/merchant-affiliate-task/MerchantAffiliateTaskEditor.test.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.tsx src/pages/merchant-admin/MerchantAffiliateTasksPage.test.tsx src/pages/merchant-admin/merchantAffiliateTaskCopy.ts
git commit -m "feat: complete affiliate task submission workflow"
```

### Task 10: Add guarded formal-data acceptance and complete regression verification

**Files:**
- Create: `backend/scripts/check-merchant-affiliate-task-workspace.ts`
- Create: `backend/tests/merchant-affiliate-task-workspace-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: production repositories/services, local MySQL, local Redis, existing formal test-user cleanup helpers.
- Produces: `npm run check:merchant-affiliate-task-workspace` and evidence that preview is read-only and submit freezes exactly once.

- [ ] **Step 1: Write the checker safety contract first**

Assert the checker rejects production/staging, remote databases, production-looking database names, and any database other than `needo_dev` or `needo_test`. Assert the source contains exact markers for:

```ts
for (const evidence of [
  "publisher list pagination",
  "shop public identifier",
  "merchant task display projection",
  "fee preview has zero finance mutation",
  "single-shop exact freeze",
  "multi-shop exact freeze",
  "rate mismatch has zero finance mutation",
  "insufficient balance has zero finance mutation",
  "duplicate submit freezes once",
  "cleanup residue verification"
]) {
  expect(source).toContain(evidence);
}
```

Assert cleanup uses marker-scoped IDs and does not contain `deleteMany({})`.

- [ ] **Step 2: Run the checker contract and confirm RED**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-workspace-script.test.ts
```

Expected: FAIL because the checker and package script do not exist.

- [ ] **Step 3: Implement the guarded checker**

Create uniquely marked users, active public shop identifiers, merchant account/memberships, services, fee rules, wallets, and permissions. In `try/finally`, verify:

1. Publisher/shop/service resources return only authorized records and server pagination totals.
2. Merchant task display projection contains publisher names and shop `publicId`; technical IDs remain request keys rather than public display identifiers.
3. Fee preview returns exact fee math and leaves wallet, Reservation, Ledger, Reconciliation, AuditLog, and task counts unchanged.
4. Single-shop submit freezes commission plus platform fee exactly once.
5. Multi-shop equal-rate submit freezes commission plus platform fee exactly once.
6. Mixed-rate, outsider shop, invalid service, insufficient balance, and repeat submission create no extra finance mutation.
7. Draft, five languages, submitted state, and snapshots survive fresh repository/service instances.

The `finally` block deletes only records tied to captured task, wallet, service, shop, account, category, and user IDs, in reverse foreign-key order. After cleanup, query every marker-bearing table and throw if residue remains.

Register:

```json
"check:merchant-affiliate-task-workspace": "tsx scripts/check-merchant-affiliate-task-workspace.ts"
```

- [ ] **Step 4: Run checker contract, backend lint/build, and full backend tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-affiliate-task-workspace-script.test.ts
npm run lint
npm run build
npm test -- --runInBand
```

Expected: lint/build PASS; full backend summary has zero failed suites. Existing guarded integration suites may remain skipped unless explicitly enabled.

- [ ] **Step 5: Run the local formal-data checker**

Precondition checks:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
```

Then run:

```bash
cd backend
ENV_FILE=.env.dev npm run check:merchant-affiliate-task-workspace
```

Expected: every named evidence line prints `PASS`, final cleanup residue verification passes, and the command exits 0. If readiness is not `ready`, recover MySQL/Redis and restart the formal backend before rerunning; do not substitute a mock backend.

- [ ] **Step 6: Run frontend quality gates and full tests**

Run:

```bash
npm run lint
npm run i18n:audit
npm run i18n:quality
npm test
npm run verify:production-build
```

Expected: all commands exit 0; no production-bundle safety refusal remains.

- [ ] **Step 7: Perform authenticated browser acceptance**

Start the formal stack from this worktree and verify port ownership before opening the page. In desktop and narrow viewport, test current-shop and merchant-account multi-shop flows, all six steps, five-language saves, fee mismatch, insufficient balance, 409 conflict, refresh, re-login, and backend restart.

Record these objective results:

```text
desktop full-scroll: PASS/FAIL
narrow full-scroll: PASS/FAIL
horizontal overflow: PASS/FAIL
hidden/covered actions: PASS/FAIL
console errors: PASS/FAIL
shop public ID visible: PASS/FAIL
service and merchant IDs absent: PASS/FAIL
Affiliate TEST tag: PASS/FAIL
server persistence after reload/restart: PASS/FAIL
```

Do not mark the task complete while any required line is `FAIL`.

- [ ] **Step 8: Commit the checker and any verified corrective edits**

```bash
git add backend/scripts/check-merchant-affiliate-task-workspace.ts backend/tests/merchant-affiliate-task-workspace-script.test.ts backend/package.json
git commit -m "test: verify merchant affiliate task workspace"
```

If browser QA required code corrections, commit those source/test files in a separate focused commit before this checker commit.

### Task 11: Quarantine every active Affiliate branch in a worktree

**Files:**
- Create: `docs/superpowers/evidence/2026-08-30-affiliate-major-release-quarantine.md`

**Interfaces:**
- Consumes: local Git branch/worktree state after Task 10.
- Produces: one unique worktree for every active `codex/affiliate-*` branch, a release inventory, and proof that `main` did not receive this feature.

- [ ] **Step 1: Capture exact branch and worktree state**

Run from the repository root without staging root-worktree files:

```bash
git worktree list --porcelain
git branch --list 'codex/affiliate-*'
git merge-base --is-ancestor codex/affiliate-merchant-task-workspace main
git status --short --branch
```

Expected: the ancestor check exits non-zero because the new feature HEAD is not in `main`; the root status may show unrelated user work and must remain unchanged.

- [ ] **Step 2: Add a missing worktree only for an existing active Affiliate branch**

For the currently known active branch without a worktree, first verify both the branch and destination:

```bash
git show-ref --verify refs/heads/codex/affiliate-invitations-integration
test ! -e .worktrees/affiliate-invitations-integration
git worktree add .worktrees/affiliate-invitations-integration codex/affiliate-invitations-integration
```

Expected: the existing branch is checked out at `.worktrees/affiliate-invitations-integration`. If the destination already exists or the branch has been retired, do not delete or recreate anything; record the current state in the evidence file.

Repeat the read-only inventory after the add. Every active `codex/affiliate-*` branch must map to one unique worktree path; unrelated branches and worktrees remain untouched.

- [ ] **Step 3: Write the major-release quarantine evidence**

Return to `.worktrees/affiliate-merchant-task-workspace` before creating or staging the evidence file. Do not create the file in the root `main` worktree.

Use this table with actual values:

```markdown
| Branch | Worktree | HEAD | Baseline | Verification | Main inclusion |
|---|---|---|---|---|---|
| codex/affiliate-merchant-task-workspace | .worktrees/affiliate-merchant-task-workspace | exact SHA | exact base SHA | full result | not merged |
```

Add sections for every active Affiliate branch, current migration dependencies, expected RED tests, formal-data verification, browser acceptance, and the rule: “Do not merge, cherry-pick, push, or deploy until the user approves the Affiliate major release.”

- [ ] **Step 4: Verify isolation and a clean current feature worktree**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline --decorate -12
git merge-base --is-ancestor HEAD main
```

Expected: `git diff --check` exits 0; only the evidence file is pending before commit; the ancestor check exits non-zero; no `main` commit contains this feature.

- [ ] **Step 5: Commit the quarantine inventory**

```bash
git add docs/superpowers/evidence/2026-08-30-affiliate-major-release-quarantine.md
git commit -m "docs: quarantine affiliate major release"
```

- [ ] **Step 6: Final verification before completion claim**

Use the `verification-before-completion` skill. Re-run the focused changed-area tests, inspect the final feature-branch diff from its base, confirm the current worktree is clean, and report separately:

```text
implementation complete on isolated branch
automated verification status
formal MySQL/Redis acceptance status
browser acceptance status
Affiliate worktree inventory status
main merge status: not merged
push status: not pushed
deployment status: not deployed
```

Do not offer or perform a merge into `main` at this stage.
