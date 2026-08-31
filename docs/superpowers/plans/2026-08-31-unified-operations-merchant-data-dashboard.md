# Unified Operations and Merchant Data Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate operations and merchant overview/analytics pages with one formal, filterable data dashboard per portal, backed by a named aggregate contract and signed merchant shop context.

**Architecture:** Keep the existing `/api/v1/backoffice/dashboard` and `/api/v1/merchant-admin/dashboard` routes, but replace their loose metric/preview payload with one named DTO assembled from bounded repository aggregates. A signed `merchantShopPublicId` token claim is resolved and revalidated server-side into the numeric shop scope used by every merchant-admin service; the frontend never sends an arbitrary `shopId` to dashboard APIs. Shared React dashboard primitives render server-provided buckets with native SVG/CSS, while each portal owns only its metric selection and page composition.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, native SVG, Express, Zod, Prisma, MySQL 8, Redis, JWT, Vitest, Jest, Supertest, OpenAPI.

## Global Constraints

- Execute as Step 12 only; every task is a separate red-green-review-commit checkpoint.
- Use only formal MySQL/Prisma, order finance, wallet ledger/holds, scheduling, identity, merchant membership, SaaS billing, and audit data.
- Do not add mock, demo, placeholder, static chart series, browser business state, or a parallel analytics API.
- Keep `/api/v1/backoffice/dashboard` and `/api/v1/merchant-admin/dashboard`; do not add a second Dashboard DTO.
- Use `Asia/Tokyo`; custom ranges are inclusive calendar dates and at most 366 days.
- Default period is `last7days`; supported periods are `today|last7days|last30days|week|month|year|custom`.
- Do not add a chart dependency; charts use accessible native SVG and CSS.
- Formal NDP is primary; Test NDP is separately labeled and never enters withdrawal or settlement values.
- Membership remains unavailable data: `memberCount: null`, `memberDataStatus: "not_available"`; do not create membership tables or migrations.
- Do not add or alter Prisma models or migrations in this microstep.
- Delete both old analytics pages, their tests, routes, duplicate menus, and the operations “数据大屏” duplicate link.
- Preserve operations read-only merchant preview behavior and unrelated dirty files.
- Do not push, deploy, publish, or mutate shared/production data.

## Locked Response Contract

The backend and frontend must use these names exactly:

```ts
export type DashboardPeriod =
  | "today"
  | "last7days"
  | "last30days"
  | "week"
  | "month"
  | "year"
  | "custom";

export type DashboardGranularity = "hour" | "day" | "month";

export interface DashboardMetricComparison {
  current: number;
  previous: number;
  changeRatePercent: number | null;
}

export interface DashboardNdpPair {
  ndp: number;
  testNdp: number;
}

export interface DashboardBucketPayload {
  key: string;
  label: string;
  orderCount: number;
  serviceGmvJpy: number;
  platformNetRevenueNdp: number;
  frozenNdp: number;
  shopCount: number;
  registeredTechnicianCount: number;
  shopEstimatedGrossProfitJpy: number;
  scheduleTotalHours: number;
  scheduleAvailableHours: number;
  scheduleBookedHours: number;
}

export interface BackofficeDashboardPayload {
  filter: {
    period: DashboardPeriod;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    timeZone: "Asia/Tokyo";
    granularity: DashboardGranularity;
    city: string | null;
    availableCities: string[];
  };
  summary: {
    availableScheduleSlots: DashboardMetricComparison;
    activeTechnicians: DashboardMetricComparison;
    registeredTechnicians: DashboardMetricComparison;
    shopCount: DashboardMetricComparison | null;
    newCustomers: DashboardMetricComparison | null;
    pendingOrders: number;
    serviceGmvJpy: number;
  };
  series: { buckets: DashboardBucketPayload[] };
  finance: {
    platformNetRevenue: DashboardNdpPair;
    frozen: DashboardNdpPair;
    userReward: DashboardNdpPair;
    walletStock: DashboardNdpPair & {
      cityFilterApplied: false;
      scopeLabel: "platform_global";
    };
    withdrawn: DashboardNdpPair & {
      cityFilterApplied: false;
      scopeLabel: "platform_global";
    };
    shopNdpCost: null | {
      totalNdp: number;
      platformNdp: number;
      userRewardNdp: number;
    };
  };
  shop: null | {
    publicId: string;
    name: string;
    city: string;
    address: string;
    status: string;
    billing: {
      cadence: "monthly" | "annual" | "free";
      state: "trial" | "paid" | "free" | "overdue";
      trialEndsAt: string | null;
      paidThrough: string | null;
    } | null;
    wallet: {
      status: "available" | "not_opened";
      currency: "NDP";
      availableBalance: number | null;
      frozenBalance: number | null;
    };
  };
  membership: null | {
    memberCount: null;
    memberDataStatus: "not_available";
    completedCustomerCount: number;
  };
  scope:
    | { kind: "platform"; shopPublicId: null }
    | { kind: "shop"; shopPublicId: string };
}
```

The platform response has non-null `summary.shopCount` and `summary.newCustomers`, plus `shop: null`, `membership: null`, and `finance.shopNdpCost: null`. The merchant response returns `summary.shopCount: null` and `summary.newCustomers: null` because those platform-only cards are not applicable there. Empty available metrics return zeroes and a complete zero-valued bucket skeleton; unavailable or inapplicable metrics return `null`, never a fabricated zero.

---

### Task 1: Dashboard query validation and Tokyo period windows

**Files:**
- Create: `backend/src/domain/dashboard-period.ts`
- Create: `backend/tests/dashboard-period.test.ts`
- Modify: `backend/src/validators/backoffice.validator.ts:27-92,216-222`
- Create: `backend/tests/dashboard-query.validator.test.ts`

**Interfaces:**
- Consumes: `BackofficeDashboardQuery` from the Zod schema and a server `now: Date`.
- Produces: `resolveDashboardWindow(query, now): DashboardWindow` with current/previous UTC bounds and stable bucket descriptors.

```ts
export interface DashboardWindow {
  period: DashboardPeriod;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  fromDate: string;
  toDate: string;
  fromInclusive: Date;
  toExclusive: Date;
  previousFromDate: string;
  previousToDate: string;
  previousFromInclusive: Date;
  previousToExclusive: Date;
  buckets: Array<{
    key: string;
    label: string;
    fromInclusive: Date;
    toExclusive: Date;
  }>;
}
```

- [ ] **Step 1: Write failing period tests**

```ts
it.each([
  ["today", "hour", "2026-08-31", "2026-08-31", 24],
  ["last7days", "day", "2026-08-25", "2026-08-31", 7],
  ["last30days", "day", "2026-08-02", "2026-08-31", 30],
  ["week", "day", "2026-08-31", "2026-09-06", 7],
  ["month", "day", "2026-08-01", "2026-08-31", 31],
  ["year", "month", "2026-01-01", "2026-12-31", 12]
])("resolves %s in Tokyo", (period, granularity, from, to, buckets) => {
  const result = resolveDashboardWindow({ period }, new Date("2026-08-31T03:00:00.000Z"));
  expect(result).toMatchObject({ period, granularity, fromDate: from, toDate: to });
  expect(result.buckets).toHaveLength(buckets);
});
```

Also assert Monday week start, leap day, inclusive custom end, a 366-day valid custom range, a 367-day rejection, equal-duration previous windows, and monthly bucketing for custom ranges longer than 92 days.

- [ ] **Step 2: Run the period test and confirm RED**

Run: `cd backend && npm test -- --runInBand tests/dashboard-period.test.ts`
Expected: FAIL because `dashboard-period.ts` does not exist.

- [ ] **Step 3: Implement the pure calendar/window module**

Move the reusable Tokyo calendar helpers out of `backoffice.service.ts` without changing technician-ranking behavior. Build buckets from civil dates, use half-open UTC bounds internally, and freeze labels on the server (`HH:00`, `MM-DD`, or `YYYY-MM`).

- [ ] **Step 4: Add the strict Dashboard Zod schema**

```ts
export const backofficeDashboardQuerySchema = z
  .object({
    period: z.enum(["today", "last7days", "last30days", "week", "month", "year", "custom"]).default("last7days"),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    city: z.string().trim().min(1).max(100).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const hasBoundaries = Boolean(value.from || value.to);
    if (value.period === "custom" && (!value.from || !value.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [!value.from ? "from" : "to"], message: "custom period requires from and to" });
    }
    if (value.period !== "custom" && hasBoundaries) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [value.from ? "from" : "to"], message: "date boundaries require custom period" });
    }
  });
```

Add a merchant schema by omitting `city`; prove `city`, `shopId`, unknown keys, invalid dates, and invalid custom bounds return validation failures.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd backend && npm test -- --runInBand tests/dashboard-period.test.ts tests/dashboard-query.validator.test.ts tests/backoffice-api.test.ts`
Expected: PASS. Existing Dashboard API tests may still assert the old payload but must not regress at this task boundary.

Commit:

```bash
git add backend/src/domain/dashboard-period.ts backend/src/validators/backoffice.validator.ts backend/tests/dashboard-period.test.ts backend/tests/dashboard-query.validator.test.ts
git commit -m "feat(dashboard): define Tokyo reporting windows"
```

### Task 2: Activity, supply, and cumulative Dashboard aggregates

**Files:**
- Create: `backend/src/domain/dashboard.ts`
- Create: `backend/src/repositories/dashboard.repository.ts`
- Create: `backend/tests/dashboard-activity.repository.test.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts:227-368`
- Modify: `backend/src/services/backoffice.service.ts:186-203,603,676-695`

**Interfaces:**
- Consumes: `DashboardAggregateInput { scope, city, window }`.
- Produces: `DashboardActivityFacts` for current/previous summaries and every requested bucket.

```ts
export interface DashboardAggregateInput {
  scope: { kind: "platform" } | { kind: "shop"; shopId: number };
  city: string | null;
  window: DashboardWindow;
}

export interface DashboardActivityFacts {
  current: {
    availableScheduleSlots: number;
    activeTechnicians: number;
    registeredTechnicians: number;
    shopCount: number | null;
    newCustomers: number | null;
    pendingOrders: number;
    serviceGmvJpy: number;
    completedCustomerCount: number;
  };
  previous: Omit<DashboardActivityFacts["current"], "pendingOrders">;
  buckets: Array<Pick<DashboardBucketPayload,
    "key" | "label" | "orderCount" | "serviceGmvJpy" | "shopCount" |
    "registeredTechnicianCount" | "scheduleTotalHours" |
    "scheduleAvailableHours" | "scheduleBookedHours"
  >>;
}
```

- [ ] **Step 1: Write repository contract tests with a query-recording Prisma double**

Assert these exact rules:

- available slots use `ScheduleSlot.status = AVAILABLE`, `deletedAt IS NULL`, and overlap the selected window;
- active technicians are the distinct union of slot technicians and non-cancelled order technicians;
- registered technicians and shops are cumulative as of each period/bucket end and include unpublished rows;
- platform new users count undeleted `CustomerProfile.createdAt` within the period and use `CustomerProfile.city` for the optional city filter; merchant aggregation does not query or expose this platform-only card;
- order series uses service `startsAt`; service GMV requires completed and not refunded;
- completed customers are distinct `customerUserId` from completed, non-refunded orders;
- schedule hours clip every non-deleted `AVAILABLE` or `BOOKED` slot to the bucket boundary, convert milliseconds to decimal hours once, and satisfy `scheduleTotalHours = scheduleAvailableHours + scheduleBookedHours`; the chart renders the total and two components as side-by-side groups rather than stacking the total again;
- merchant scope always applies `shopId`; platform city scope joins the formal shop/city;
- no query is issued once per bucket, shop, technician, customer, or wallet.

- [ ] **Step 2: Run the activity repository test and confirm RED**

Run: `cd backend && npm test -- --runInBand tests/dashboard-activity.repository.test.ts`
Expected: FAIL because `DashboardRepository` does not exist.

- [ ] **Step 3: Implement bounded aggregate methods**

Create one focused repository with fixed-count grouped queries. Use Prisma filters for scalar current/previous counts and parameterized `Prisma.sql` grouped queries for server bucket keys. Seed the returned map from `window.buckets` before merging query rows so empty periods still return a complete zero skeleton.

The order predicate must include:

```ts
const completedGmvWhere: Prisma.BookingOrderWhereInput = {
  deletedAt: null,
  status: "COMPLETED",
  paymentStatus: { notIn: ["REFUND_PENDING", "REFUNDED"] },
  startsAt: { gte: window.fromInclusive, lt: window.toExclusive },
  ...(shopId ? { shopId } : {}),
  ...(city ? { shop: { city, deletedAt: null } } : {})
};
```

Count order volume with all undeleted statuses, as required by the approved design, and keep GMV/completed customers on the stricter completed/non-refunded predicate.

- [ ] **Step 4: Delegate the existing repository method without leaving two implementations**

`BackofficeRepository.getDashboard` becomes a thin call to the focused `DashboardRepository`. Remove the old `latestOrders`, six-row technician/shop previews, `metrics`, and all current-only aggregation code. Update the repository port to accept `DashboardAggregateInput` rather than the old bare scope.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd backend && npm test -- --runInBand tests/dashboard-activity.repository.test.ts tests/backoffice-dashboard-counts.test.ts`
Expected: PASS after replacing the old preview-count assertions with named summary assertions.

Commit:

```bash
git add backend/src/domain/dashboard.ts backend/src/repositories/dashboard.repository.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts backend/tests/dashboard-activity.repository.test.ts backend/tests/backoffice-dashboard-counts.test.ts
git commit -m "feat(dashboard): aggregate formal activity and supply"
```

### Task 3: NDP, wallet stock, withdrawals, profit, billing, and shop snapshot

**Files:**
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Create: `backend/tests/dashboard-finance.repository.test.ts`
- Create: `backend/tests/dashboard-merchant.repository.test.ts`
- Modify: `backend/src/domain/dashboard.ts`
- Modify: `backend/src/services/backoffice.service.ts`

**Interfaces:**
- Produces: `DashboardFinanceFacts` and `DashboardMerchantFacts`; Task 4 composes these with Task 2.

```ts
export interface DashboardFinanceFacts {
  platformNetRevenue: DashboardNdpPair;
  frozen: DashboardNdpPair;
  userReward: DashboardNdpPair;
  walletStock: DashboardNdpPair;
  withdrawn: DashboardNdpPair;
  shopNdpCost: BackofficeDashboardPayload["finance"]["shopNdpCost"];
  bucketPlatformNetRevenueNdp: Map<string, number>;
  bucketFrozenNdp: Map<string, number>;
  bucketShopEstimatedGrossProfitJpy: Map<string, number>;
}
```

- [ ] **Step 1: Write failing finance tests**

Use NDP and TEST_NDP records in the same fixtures and assert:

- reward counts only `UserRewardStatus.PAID` by `userRewardGrantedAt`;
- platform net revenue is actual platform fee plus actual request fee minus paid user reward;
- historical frozen stock uses hold creation/capture/release timestamps at each bucket end;
- historical wallet stock uses the last non-deleted `WalletLedger.availableBalanceAfter + frozenBalanceAfter` at the period end and sums only positive wallet totals;
- withdrawals require `WITHDRAWAL`, `APPROVED`, a linked applied ledger transaction, and formal `NDP`; returned Test NDP is zero;
- city applies to order-linked revenue/reward/holds, but not wallet stock or withdrawals;
- merchant NDP cost is `total = bPlatformFeeActualNdp`, `platform = total - paid reward`, `userReward = paid reward`;
- merchant frozen value includes only remaining current-shop platform-fee holds;
- merchant profit sums `shopEstimatedGrossProfitJpy` only for completed, non-refunded rows whose income status is `reported` or `confirmed`;
- missing wallet produces `status: "not_opened"`, not a zero-balance wallet.

- [ ] **Step 2: Run finance tests and confirm RED**

Run: `cd backend && npm test -- --runInBand tests/dashboard-finance.repository.test.ts tests/dashboard-merchant.repository.test.ts`
Expected: FAIL on missing repository methods.

- [ ] **Step 3: Implement fixed-count finance queries**

Use `OrderFinancial.ndpCurrency`, `userRewardStatus`, `userRewardGrantedAt`, `WalletHold`, `WalletLedger`, `WalletAdjustmentRequest`, and linked `LedgerTransaction`. Do not read `Wallet.availableBalance` for historical stock. Keep city-independent values explicitly marked in the DTO in Task 4.

For profit, preserve the existing compensation result by summing only numeric `shopEstimatedGrossProfitJpy` values from `technician_income_estimated` timeline event metadata. Do not reconstruct profit from `technicianNetIncomeJpy`, and do not invent a browser or repository fallback when the persisted gross-profit snapshot is absent.

- [ ] **Step 4: Implement shop/billing/current wallet snapshot**

Load current shop public ID, name, city, address, status, matching active `SaasBillingProfile`, active technician count, and formal shop wallet in one bounded shop query. Resolve billing state through `SaasBillingPolicyService.resolveState`; do not duplicate trial/paid/free/overdue policy.

- [ ] **Step 5: Run finance regression tests and commit**

Run:

```bash
cd backend
npm test -- --runInBand tests/dashboard-finance.repository.test.ts tests/dashboard-merchant.repository.test.ts tests/backoffice-ndp-reporting.repository.test.ts tests/backoffice-ndp-summary.service.test.ts tests/compensation-engine-service.test.ts
```

Expected: PASS with formal/Test separation and the existing compensation formula unchanged.

Commit:

```bash
git add backend/src/domain/dashboard.ts backend/src/repositories/dashboard.repository.ts backend/src/services/backoffice.service.ts backend/tests/dashboard-finance.repository.test.ts backend/tests/dashboard-merchant.repository.test.ts
git commit -m "feat(dashboard): aggregate formal finance and merchant facts"
```

### Task 4: Named Dashboard DTO, controller validation, audit, RBAC, and OpenAPI

**Files:**
- Modify: `backend/src/services/backoffice.service.ts:676-695`
- Modify: `backend/src/controllers/backoffice.controller.ts:1-66`
- Modify: `backend/src/routes/backoffice.routes.ts:13-29,83-89,171-176`
- Modify: `backend/src/api/openapi.ts:10427-10437,10960-10971`
- Modify: `backend/tests/backoffice-api.test.ts:1034-1065`
- Modify: `backend/tests/openapi.test.ts:435-575`
- Create: `backend/tests/dashboard-service.test.ts`

**Interfaces:**
- `getPlatformDashboard(actor, context, query): Promise<BackofficeDashboardPayload>`.
- `getMerchantDashboard(actor, context, query): Promise<BackofficeDashboardPayload>`.
- Both call the same repository aggregate contract with different server-derived scope.

- [ ] **Step 1: Write failing service/API tests for the complete DTO**

```ts
expect(response.body.data).toMatchObject({
  filter: {
    period: "last7days",
    timeZone: "Asia/Tokyo",
    granularity: "day"
  },
  summary: {
    availableScheduleSlots: { current: 8, previous: 5, changeRatePercent: 60 },
    activeTechnicians: expect.any(Object),
    registeredTechnicians: expect.any(Object)
  },
  series: { buckets: expect.any(Array) },
  finance: {
    userReward: { ndp: 100, testNdp: 20 },
    walletStock: expect.objectContaining({ cityFilterApplied: false }),
    withdrawn: expect.objectContaining({ testNdp: 0 })
  }
});
expect(response.body.data).not.toHaveProperty("metrics");
expect(response.body.data).not.toHaveProperty("orders");
expect(response.body.data).not.toHaveProperty("technicians");
expect(response.body.data).not.toHaveProperty("shops");
```

Also assert `current=0, previous=0` gives `changeRatePercent: null`, `previous=0, current>0` gives `null`, and otherwise the service rounds to two decimal places.

- [ ] **Step 2: Run service/API tests and confirm RED**

Run: `cd backend && npm test -- --runInBand tests/dashboard-service.test.ts tests/backoffice-api.test.ts`
Expected: FAIL against the old loose payload and missing query validation.

- [ ] **Step 3: Wire query parsing and service composition**

Controllers parse only with `backofficeDashboardQuerySchema` or `merchantDashboardQuerySchema`. The service resolves the window, calls the repository once, shapes comparisons, returns `null` for merchant-only inapplicable `shopCount`/`newCustomers`, adds available cities for platform scope, returns the locked DTO, and records audit metadata `{ period, from, to, city, shopId }`.

- [ ] **Step 4: Publish the exact OpenAPI schema**

Add reusable schemas for period, comparison, NDP pair, bucket, shop snapshot, membership, and Dashboard response. Platform parameters include `period`, `from`, `to`, `city`; merchant parameters include only `period`, `from`, `to`. Document stable 400, 401, and 403 responses.

- [ ] **Step 5: Run backend contract tests and commit**

Run:

```bash
cd backend
npm test -- --runInBand tests/dashboard-service.test.ts tests/backoffice-api.test.ts tests/openapi.test.ts tests/auth-permissions.test.ts
npm run lint
npm run build
```

Expected: PASS.

Commit:

```bash
git add backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/api/openapi.ts backend/tests/dashboard-service.test.ts backend/tests/backoffice-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat(dashboard): expose named aggregate contract"
```

### Task 5: Signed merchant shop context and token rotation

**Files:**
- Create: `backend/src/repositories/merchant-shop-context.repository.ts`
- Create: `backend/src/services/merchant-shop-scope.ts`
- Create: `backend/tests/merchant-shop-context.repository.test.ts`
- Create: `backend/tests/merchant-shop-switch-api.test.ts`
- Modify: `backend/src/services/auth-token.service.ts:9-53,98-123`
- Modify: `backend/src/services/auth.service.ts:38-73,898-1033,1075-1117,1426-1503`
- Modify: `backend/src/validators/auth.validator.ts:89-117`
- Modify: `backend/src/controllers/auth.controller.ts:303-338`
- Modify: `backend/src/routes/auth.routes.ts:85-100`
- Modify: `backend/src/routes/auth-service.factory.ts:1-22`
- Modify: `backend/src/app.ts:166-252,286-303`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**

```ts
export interface MerchantShopContextRepositoryPort {
  listManageableShops(input: {
    identityScopeType: string | null;
    identityScopeId: number | null;
    selectedShopPublicId: string | null;
    now: Date;
    page: number;
    pageSize: number;
  }): Promise<ManageableMerchantShopPage>;
  resolveShop(input: {
    merchantAccountId: number;
    shopPublicId: string;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null>;
  resolveDefaultShop(input: {
    merchantAccountId: number;
    now: Date;
  }): Promise<{ shopId: number; shopPublicId: string } | null>;
}

export interface ManageableMerchantShop {
  publicId: string;
  name: string;
  city: string;
  status: string;
  selected: boolean;
}

export interface ManageableMerchantShopPage {
  list: ManageableMerchantShop[];
  total: number;
  page: number;
  page_size: number;
}
```

- [ ] **Step 1: Write failing repository and API tests**

Prove shop identity lists only itself; merchant-account identity lists only active, non-deleted memberships whose account/shop are active; ended/deleted/cross-account memberships are rejected; `page`/`page_size` are honored with a stable total and deterministic ordering; response contains no numeric shop, merchant account, membership, or user IDs.

- [ ] **Step 2: Add a signed public-ID claim**

```ts
export interface AuthTokenSubject {
  id: number;
  email: string;
  currentIdentityId?: number;
  merchantShopPublicId?: string;
  sessionGeneration?: number;
}
```

Add the optional string to the Zod JWT payload. `authenticateAccessToken` resolves it through `MerchantShopContextRepositoryPort` and sets `selectedMerchantShopId` plus `selectedMerchantShopPublicId` on `AuthenticatedAccessContext`. A merchant-account token with a revoked relation fails closed with stable `40305 / error.identity.forbidden`.

- [ ] **Step 3: Preserve or clear context at every token boundary**

Extract an async subject builder used by password login, Google login, identity switch, and refresh. For a merchant-account identity without a claim, select the deterministic first active membership ordered by `startsAt`, then membership ID; a shop identity uses its fixed identity shop and has no merchant-account claim; leaving merchant identity clears the claim. Refresh re-resolves the membership before issuing the new access token.

- [ ] **Step 4: Implement the shop switch endpoint**

Add strict body `{ refreshToken: string; shopPublicId: string }` and:

```text
POST /api/v1/auth/merchant-shop/switch
```

Require an authenticated merchant-account identity and `auth:me:read`. Verify refresh ownership/generation/current identity, resolve the active membership, rotate refresh token atomically, blacklist the old access token, and audit `auth.merchant_shop.switch` with previous/next public IDs plus the internal shop ID only inside audit metadata. Return token pair, unchanged formal `me`, and `{ shopPublicId }`.

- [ ] **Step 5: Run auth/security tests and commit**

Run:

```bash
cd backend
npm test -- --runInBand tests/merchant-shop-context.repository.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.test.ts tests/auth.repository.test.ts tests/auth-session.store.test.ts tests/openapi.test.ts
```

Expected: PASS; old access/refresh tokens fail after switch and revoked memberships fail on refresh.

Commit:

```bash
git add backend/src/repositories/merchant-shop-context.repository.ts backend/src/services/merchant-shop-scope.ts backend/src/services/auth-token.service.ts backend/src/services/auth.service.ts backend/src/validators/auth.validator.ts backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/routes/auth-service.factory.ts backend/src/app.ts backend/src/constants/error-codes.ts backend/src/api/openapi.ts backend/tests/merchant-shop-context.repository.test.ts backend/tests/merchant-shop-switch-api.test.ts backend/tests/auth.test.ts backend/tests/openapi.test.ts
git commit -m "feat(auth): sign and rotate merchant shop context"
```

### Task 6: One merchant shop scope resolver across protected merchant services

**Files:**
- Modify: `backend/src/services/merchant-shop-scope.ts`
- Modify: `backend/src/services/backoffice.service.ts:1515-1530`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/services/compensation-profile.service.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/services/merchant-finance-rules.service.ts`
- Modify: `backend/src/services/order-finance.service.ts`
- Modify: `backend/src/services/payroll-schedule-policy.service.ts`
- Modify: `backend/src/services/payroll.service.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/src/services/technician-shop-affiliation.service.ts`
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/merchant-selected-shop-scope.test.ts`
- Modify: affected focused service/API tests beside each service.

**Interfaces:**

```ts
export function requireMerchantShopId(actor: AuthenticatedAccessContext): number;
export function assertMerchantShopId(actor: AuthenticatedAccessContext, requestedShopId: number): number;
```

Resolution order is operations read-only preview shop, direct shop identity, then the authenticated/revalidated merchant-account selected shop. No route reads a client-provided shop header except the existing operations preview middleware.

- [ ] **Step 1: Write a failing cross-service integration test**

Issue one merchant-account access token selected to Shop B. Assert Dashboard, orders, schedule, finance, employees, payroll policy, pricing, compensation, wallet, and shop settings read/write only Shop B. Assert a path containing Shop A returns 403 and does not invoke its repository mutation.

- [ ] **Step 2: Run the scope test and confirm RED**

Run: `cd backend && npm test -- --runInBand tests/merchant-selected-shop-scope.test.ts`
Expected: FAIL because private guards accept only direct shop identity.

- [ ] **Step 3: Replace private scope checks with the shared helper**

Remove duplicated `currentIdentityScopeType === "shop"` guards from the listed merchant-admin services. Preserve merchant-account publisher behavior in Affiliate and order-acceptance modules where merchant-account scope is the business subject rather than a selected shop; use selected shop only when the endpoint is explicitly shop-scoped.

- [ ] **Step 4: Add the manageable-shops route**

Add:

```text
GET /api/v1/merchant-admin/manageable-shops
```

Use `merchant-admin:dashboard:read`, strict Zod pagination (`page >= 1`, bounded `page_size`), the context repository, standard paginated response fields, strict safe row fields, and audit action `merchant_admin.manageable_shops.read`. Shop identities receive one row with `selected: true`; merchant accounts receive only the requested deterministic page and exactly one selected row across the complete logical result.

- [ ] **Step 5: Run merchant regression tests and commit**

Run focused suites for Backoffice, Booking, Ledger, Order Finance, employees, compensation, payroll, pricing, and OpenAPI, then `npm run lint && npm run build` in `backend/`.

Expected: PASS with operations preview tests unchanged.

Commit:

```bash
git add backend/src/services/merchant-shop-scope.ts backend/src/services/backoffice.service.ts backend/src/services/booking.service.ts backend/src/services/compensation-profile.service.ts backend/src/services/ledger.service.ts backend/src/services/merchant-finance-rules.service.ts backend/src/services/order-finance.service.ts backend/src/services/payroll-schedule-policy.service.ts backend/src/services/payroll.service.ts backend/src/services/pricing-mode.service.ts backend/src/services/technician-shop-affiliation.service.ts backend/src/validators/backoffice.validator.ts backend/src/routes/backoffice.routes.ts backend/src/controllers/backoffice.controller.ts backend/src/api/openapi.ts backend/tests/merchant-selected-shop-scope.test.ts
git commit -m "refactor(merchant): enforce selected shop scope everywhere"
```

### Task 7: Frontend Dashboard API and merchant shop-switch session contract

**Files:**
- Modify: `src/api/backofficeRealData.ts:386-405,517-533`
- Create: `src/api/backofficeDashboard.test.ts`
- Modify: `src/api/auth.ts:11-24,90-92,120-140,437-459`
- Modify: `src/api/auth.test.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.ts`
- Modify: `src/auth/rbac.ts`
- Modify: `src/features/merchant-admin/dashboardResource.ts`
- Modify: `src/features/merchant-admin/dashboardResource.test.ts`

**Interfaces:**

```ts
export interface DashboardQuery extends Record<string, string | undefined> {
  period: DashboardPeriod;
  from?: string;
  to?: string;
  city?: string;
}

dashboard(scope: BackofficeScope, query: DashboardQuery): Promise<BackofficeDashboardPayload>;
manageableMerchantShops(page?: number, pageSize?: number): Promise<{
  list: ManageableMerchantShopPayload[];
  total: number;
  page: number;
  page_size: number;
}>;
switchMerchantShop(shopPublicId: string): Promise<SwitchMerchantShopPayload>;
```

- [ ] **Step 1: Write failing API serialization tests**

Assert default and custom Dashboard query strings, absence of `shopId` on merchant requests, paginated safe manageable-shop payload types, and token persistence after shop switch.

- [ ] **Step 2: Replace the loose frontend DTO**

Copy the locked response names exactly, delete the `Metric` import used only by old Dashboard payloads, and make all dashboard calls supply a query. Do not add a compatibility parser for `metrics`, `orders`, `technicians`, or `shops`.

- [ ] **Step 3: Expose shop switching through AuthProvider**

Add `switchMerchantShop(shopPublicId): Promise<AuthActionResult & { shopPublicId?: string }>` to the context. On success, persist the rotated tokens and remembered merchant authorization; on failure, leave tokens/session/current shop unchanged. Store `merchantShopPublicId` in `AuthSession` only from the authenticated switch response, never from localStorage input.

- [ ] **Step 4: Make Dashboard resource keys query- and shop-aware**

`loadMerchantAdminDashboard(scopeKey, query)` uses a cache key containing user, identity, signed selected public ID, period, from, to, and city. Add request generations or `AbortController` so a Shop A response cannot replace Shop B after switching. Manual retry invalidates only the exact key.

- [ ] **Step 5: Run frontend contract tests and commit**

Run:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/api/backofficeRealData.ts src/api/backofficeDashboard.test.ts src/api/auth.ts src/api/auth.test.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.ts src/auth/rbac.ts src/features/merchant-admin/dashboardResource.ts src/features/merchant-admin/dashboardResource.test.ts
git commit -m "feat(dashboard): consume signed dashboard contracts"
```

### Task 8: Shared filters, comparison cards, and accessible native charts

**Files:**
- Create: `src/features/dashboard/DashboardFilterBar.tsx`
- Create: `src/features/dashboard/DashboardFilterBar.test.tsx`
- Create: `src/features/dashboard/DashboardMetricCard.tsx`
- Create: `src/features/dashboard/DashboardMetricCard.test.tsx`
- Create: `src/features/dashboard/DashboardCharts.tsx`
- Create: `src/features/dashboard/DashboardCharts.test.tsx`
- Create: `src/features/dashboard/dashboardFormat.ts`
- Create: `src/features/dashboard/dashboardFormat.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**

```ts
export type DashboardFilterValue = {
  period: DashboardPeriod;
  from?: string;
  to?: string;
  city?: string;
};

export function DashboardFilterBar(props: {
  value: DashboardFilterValue;
  cities?: string[];
  loading: boolean;
  onApply(value: DashboardFilterValue): void;
  onReset(): void;
}): JSX.Element;

export function DualAxisLineChart(props: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  left: DashboardChartSeries;
  right?: DashboardChartSeries;
}): JSX.Element;

export function GroupedBarChart(props: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  series: [DashboardChartSeries, DashboardChartSeries, DashboardChartSeries];
}): JSX.Element;
```

- [ ] **Step 1: Write failing filter tests**

Test `last7days` default, custom date controls, query/apply, reset, city omission on merchant use, disabled submit while loading, keyboard focus, and preservation of values after an API error.

- [ ] **Step 2: Write failing metric and chart tests**

Test positive/negative/zero/no-baseline comparisons, units, member unavailable display, NDP/Test labels, line path and distinct point shapes, dual-axis labels, three bar groups, empty bucket skeleton, screen-reader summary, no horizontal overflow class, and reduced-motion CSS.

- [ ] **Step 3: Implement deterministic chart math**

Use a fixed `viewBox`, server labels, finite-value guards, independent left/right scales, `vectorEffect="non-scaling-stroke"`, circles for the left series and diamonds for the right series. Render a visually hidden table/summary so exact bucket values are available without relying on color or hover.

- [ ] **Step 4: Add five-language text entries**

Add every new visible label, period name, unit, error/empty message, billing label, member-unavailable message, wallet-not-opened message, and switch-shop action to the existing translation registry. Numeric values use locale formatters and `data-no-i18n` where required.

- [ ] **Step 5: Run component tests and commit**

Run:

```bash
npm test -- src/features/dashboard/DashboardFilterBar.test.tsx src/features/dashboard/DashboardMetricCard.test.tsx src/features/dashboard/DashboardCharts.test.tsx src/features/dashboard/dashboardFormat.test.ts
npm run check:i18n
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/features/dashboard src/i18n/translations.ts
git commit -m "feat(dashboard): add shared accessible dashboard UI"
```

### Task 9: Replace operations overview and delete the old operations analytics page

**Files:**
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`
- Delete: `src/pages/admin/AnalyticsPage.tsx`
- Delete: `src/pages/admin/AnalyticsPage.test.ts`
- Modify: `src/components/admin/AdminLayout.tsx:45-56,158-161`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/App.tsx:13,1377-1380`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `/admin` is the only operations Dashboard route.
- The page sends `DashboardQuery`; it never reads legacy preview arrays.

- [ ] **Step 1: Update tests to define the final operations page**

Assert one “数据大盘” route/menu, no `/admin/analytics`, no “分析中心” or duplicate “数据大屏” link, seven periods plus custom controls, city selector, five headline metrics, three requested charts, three NDP summary cards, Test NDP labels, and city-independent wallet/withdrawal notices.

- [ ] **Step 2: Run operations page tests and confirm RED**

Run: `npm test -- src/pages/admin/DashboardPage.test.ts src/components/admin/AdminLayout.test.ts src/App.test.tsx`
Expected: FAIL against the old tables/snapshot UI and duplicate route.

- [ ] **Step 3: Implement the unified operations Dashboard**

Keep the existing permission-aware loading/error/retry behavior. Replace order/shop/technician tables and unsupported-module notice with:

1. filter bar;
2. five responsive comparison cards;
3. order/GMV dual line;
4. platform net NDP/frozen NDP dual line;
5. cumulative shops/technicians dual line;
6. user reward, wallet stock, and withdrawn NDP summary cards.

The page retains the last successful data during a retry, ignores stale responses, and displays true zero/empty values.

- [ ] **Step 4: Remove the old route and files**

Delete both operations analytics files, their import/route, the “分析中心” menu item, and the operations utility “数据大屏” link. Use `rg` to prove no production or test reference remains.

- [ ] **Step 5: Run operations tests and commit**

Run:

```bash
npm test -- src/pages/admin/DashboardPage.test.ts src/components/admin/AdminLayout.test.ts src/App.test.tsx
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/App.tsx src/App.test.tsx
git add -u src/pages/admin/AnalyticsPage.tsx src/pages/admin/AnalyticsPage.test.ts
git commit -m "feat(admin): unify operations data dashboard"
```

### Task 10: Replace merchant overview, add secure shop switching, and delete merchant analytics

**Files:**
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts`
- Delete: `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx`
- Delete: `src/pages/merchant-admin/MerchantAdminAnalyticsPage.test.ts`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx:49-74,193-290`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Modify: `src/features/merchant-admin/dashboardResource.ts`
- Modify: `src/App.tsx:59-60,1274-1276`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `/merchant-admin` is the only merchant Dashboard route.
- Shop switching calls AuthProvider, then reloads every merchant resource under the new signed token context.

- [ ] **Step 1: Update tests to define the final merchant page**

Assert one “数据大盘” menu/route; retained shop card; billing cadence/state; current wallet available/frozen values; switch button only when list length is greater than one; four headline cards; member `—` plus true completed-customer count; three requested charts; NDP cost split; frozen NDP; formal/Test labels where present; no legacy tables or unsupported placeholder panel.

- [ ] **Step 2: Add switch interaction tests**

Test paginated list loading/load-more, `total > 1` button visibility, Escape close, focus return, successful token rotation/reload, failed switch preserving old shop/data, and a deferred Shop A Dashboard response arriving after Shop B without overwriting Shop B. After token rotation succeeds, keep the previous Dashboard visibly frozen behind a blocking loading state and commit the new shop card plus new Dashboard data together only after the signed Shop B request succeeds.

- [ ] **Step 3: Run merchant tests and confirm RED**

Run: `npm test -- src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/features/merchant-admin/dashboardResource.test.ts src/App.test.tsx`
Expected: FAIL against the old overview/analytics split.

- [ ] **Step 4: Implement the merchant Dashboard**

Use the shared filter/cards/charts. The information card shows shop identity, SaaS billing state, current wallet snapshot, and accessible shop popover. Render:

1. available schedule slots;
2. active technicians;
3. registered technicians;
4. member number/unavailable state with completed-customer small text;
5. order/GMV dual line;
6. shop profit line from `shopEstimatedGrossProfitJpy`;
7. total/available/booked hours grouped bars;
8. total NDP cost with platform/reward split and frozen NDP.

Do not derive member count, profit, NDP cost, or wallet values in the browser.

- [ ] **Step 5: Simplify the shared merchant shell**

Update sidebar summary reads to `summary.pendingOrders`, `summary.serviceGmvJpy`, and `shop`. Keep operations read-only preview separate from merchant account switching. Remove the duplicate analytics menu and make the Dashboard resource query-aware without adding a second request owner.

- [ ] **Step 6: Delete merchant analytics and commit**

Remove the old import, route, page, test, and menu. Prove no `/merchant-admin/analytics` reference remains except historical documentation being updated in Task 11.

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/App.test.tsx
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/pages/merchant-admin/MerchantAdminDashboardPage.tsx src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts src/components/merchant-admin/MerchantAdminLayout.tsx src/components/merchant-admin/MerchantAdminLayout.test.ts src/features/merchant-admin/dashboardResource.ts src/App.tsx src/App.test.tsx
git add -u src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx src/pages/merchant-admin/MerchantAdminAnalyticsPage.test.ts
git commit -m "feat(merchant): unify scoped data dashboard"
```

### Task 11: Documentation, full verification, and browser acceptance

**Files:**
- Modify: `docs/backoffice-real-data.md`
- Modify: `README.md:316,473-475,490,1974-1991`
- Modify: `docs/superpowers/specs/2026-08-31-operations-merchant-data-dashboard-design.md:5`
- Modify: `docs/superpowers/plans/2026-08-31-unified-operations-merchant-data-dashboard.md` only to check boxes and record evidence.

**Interfaces:**
- Formal local frontend `5180`, backend `3000`, MySQL `3307`, Redis `6379`.

- [ ] **Step 1: Update formal documentation**

Document exact query parameters, named response fields, metric formulas, Tokyo boundaries, city exceptions, member `null` contract, shop-list/switch endpoints, token rotation, RBAC, audit actions, deleted routes, and the fact that no schema migration was added.

- [ ] **Step 2: Run the full static and automated gates**

Run from the root:

```bash
npm test
npm run lint
npm run check:i18n
npm run verify:production-build
```

Run from `backend/`:

```bash
npm test -- --runInBand
npm run lint
npm run build
npx prisma validate
```

Expected: all PASS. If the formal build safety gate refuses ordinary build, retain `verify:production-build` as the authoritative frontend build command.

- [ ] **Step 3: Prove the route and mock retirement boundary**

Run:

```bash
rg -n 'MerchantAdminAnalyticsPage|/merchant-admin/analytics|AnalyticsPage|/admin/analytics|dashboard\.metrics|dashboard\.orders|dashboard\.technicians|dashboard\.shops' src backend
rg -n 'formalRuntimeFallbacks|../../data/mock|entityStore|localStorage' src/pages/admin/DashboardPage.tsx src/pages/merchant-admin/MerchantAdminDashboardPage.tsx src/features/dashboard
```

Expected: no reachable old Dashboard route/payload/mock references. References in migration history or this plan are informational and do not count as production consumers.

- [ ] **Step 4: Start and identify the formal runtime**

Check port ownership before acceptance. Start `cd backend && npm run dev` and root frontend on `5180`; verify `3000`, `5180`, `3307`, `6379`, `/api/v1/health`, `/api/v1/ready`, frontend HTTP 200, and that port `5180` belongs to this checkout.

- [ ] **Step 5: Browser-accept the operations Dashboard**

With a formal operations test account, verify desktop and narrow widths, light/dark themes, all preset ranges, valid/invalid custom ranges, city apply/reset, all five cards, all three charts, formal/Test NDP labels, city-independent notices, zero/empty data, retry, console, failed network calls, focus visibility, and horizontal overflow.

- [ ] **Step 6: Browser-accept the merchant Dashboard**

With formal single-shop and merchant-account test identities, verify hidden/visible switch button, list contents, keyboard/Escape behavior, Shop A → Shop B token rotation, all merchant pages following Shop B, old Shop A response protection, billing labels, current wallet state, member unavailable state plus completed users, profit, schedule bars, NDP cost split, frozen NDP, empty/error states, console, network, and overflow.

- [ ] **Step 7: Verify repository state and commit docs**

Run `git diff --check`, inspect `git status --short`, and confirm no unrelated user file is staged. Record exact test/build/browser evidence in this plan without describing local work as pushed, deployed, or online-accepted.

Commit:

```bash
git add README.md docs/backoffice-real-data.md docs/superpowers/specs/2026-08-31-operations-merchant-data-dashboard-design.md docs/superpowers/plans/2026-08-31-unified-operations-merchant-data-dashboard.md
git commit -m "docs: record unified dashboard contract and acceptance"
```
