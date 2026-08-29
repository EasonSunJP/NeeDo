# Affiliate Marketplace Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Affiliate home capability gate with a real, paginated recommended-task flow that opens a formal task detail page and idempotently creates the current user's persisted Claim.

**Architecture:** Extend the existing `/api/v1/affiliate/tasks` public read model with non-sensitive budget progress and public shop media, then add one typed frontend adapter and focused mobile marketplace components. The frontend remains a consumer of the existing Affiliate transaction core; it does not calculate authoritative eligibility, mutate wallets, or add browser business state.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind utilities, Vitest, Express, Prisma/MySQL, Jest/Supertest, Zod, OpenAPI.

## Global Constraints

- Execute only this Affiliate marketplace mobile UI microstep; do not add settlement reversal, projections, rankings, withdrawal, merchant publishing UI, or operations monitoring.
- Use the formal `/api/v1/affiliate/tasks` and Claim endpoints with JWT/RBAC; never add mock, demo, placeholder, localStorage, or client-generated task data.
- Keep task eligibility and Claim idempotency server-authoritative.
- Expose only public shop identifiers and public media URLs; do not return publisher wallet IDs, reservation IDs, user IDs, token hashes, or exact wallet balances.
- Use existing `--client-*` theme tokens and five-language UI i18n (`zh`, `zh-Hant`, `en`, `ja`, `ko`).
- Preserve the existing Affiliate header, identity switch, profile route, independent notice carousel, and alliance page.
- Treat the legacy task `name` and `description` fields as the current authored content snapshot in this microstep; five-language AffiliateTask authoring/versioning remains its own schema and merchant-editor microstep already defined by the localized-content design.
- Every production-code change follows RED -> GREEN -> REFACTOR and ends with a focused commit.

---

### Task 1: Public Marketplace Presentation Contract

**Files:**
- Modify: `backend/src/services/affiliate-marketplace.service.ts`
- Modify: `backend/src/repositories/affiliate-marketplace.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/affiliate-marketplace.service.test.ts`
- Modify: `backend/tests/affiliate-marketplace.repository.test.ts`
- Modify: `backend/tests/affiliate-marketplace-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: persisted `AffiliateTask`, active `AffiliateBudgetReservation`, task cover `MediaAsset`, `AffiliateTaskShop.shop.publicIdentifier`, and active public shop media.
- Produces: `AffiliateMarketplaceTaskPublicView` with `totalBudgetNdp`, `remainingBudgetNdp`, `remainingBudgetBps`, `coverImageUrl`, and enriched public shop snapshots containing `publicId`, `city`, `address`, and `mediaAssets`.

- [x] **Step 1: Write failing service tests for budget progress and media-safe mapping**

```ts
expect(task).toMatchObject({
  totalBudgetNdp: 10_000,
  remainingBudgetNdp: 7_000,
  remainingBudgetBps: 7_000,
  coverImageUrl: "https://cdn.needo.test/task-cover.jpg"
});
expect(task.shops[0]).toMatchObject({
  publicId: "p0000000011",
  city: "Tokyo",
  address: "Shibuya 1-1",
  mediaAssets: [{ url: "https://cdn.needo.test/shop-cover.jpg", altText: "Shibuya Relax" }]
});
```

- [x] **Step 2: Run the focused service test and verify RED**

Run: `npm --prefix backend test -- affiliate-marketplace.service.test.ts --runInBand`

Expected: FAIL because the public view does not yet expose budget progress or public media.

- [x] **Step 3: Extend repository records without leaking finance internals**

```ts
export interface AffiliateMarketplaceShopPublicSnapshot
  extends AffiliateTaskShopSnapshot {
  publicId: string;
  city: string;
  address: string;
  mediaAssets: Array<{ url: string; altText: string | null; sortOrder: number }>;
}

export interface AffiliateMarketplaceTaskRecord
  extends Omit<AffiliateTaskRecord, "shops"> {
  coverImageUrl: string | null;
  shops: AffiliateMarketplaceShopPublicSnapshot[];
}
```

Update the Prisma include to fetch only active, non-deleted cover/shop media and the active shop public identifier in one query. Preserve task order after the paginated ID query.

- [x] **Step 4: Map the public budget fields in the service**

```ts
const remainingBudgetNdp = Math.max(
  0,
  reservation.totalFrozenNdp -
    reservation.allocatedNdp -
    reservation.capturedNdp -
    reservation.releasedNdp
);
const remainingBudgetBps = Math.min(
  10_000,
  Math.floor((remainingBudgetNdp * 10_000) / task.totalBudgetNdp)
);
```

Use the task cover URL first and the first ordered shop media URL as the cover fallback. Return no reservation object or wallet identifier.

- [x] **Step 5: Add repository/API/OpenAPI assertions**

Assert that list/detail/Claim task summaries serialize the new fields, preserve pagination, and still omit `publisherShopId`, `budgetReservation`, `walletId`, `tokenHash`, and `activeKey`.

- [x] **Step 6: Run focused backend tests and verify GREEN**

Run: `npm --prefix backend test -- affiliate-marketplace.service.test.ts affiliate-marketplace.repository.test.ts affiliate-marketplace-api.test.ts openapi.test.ts --runInBand`

Expected: all focused suites PASS with no warnings.

- [x] **Step 7: Commit the backend presentation contract**

```bash
git add backend/src/services/affiliate-marketplace.service.ts backend/src/repositories/affiliate-marketplace.repository.ts backend/src/api/openapi.ts backend/tests/affiliate-marketplace.service.test.ts backend/tests/affiliate-marketplace.repository.test.ts backend/tests/affiliate-marketplace-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose affiliate marketplace presentation data"
```

### Task 2: Typed Frontend Marketplace Adapter

**Files:**
- Create: `src/api/affiliateMarketplace.ts`
- Create: `src/api/affiliateMarketplace.test.ts`
- Create: `src/features/affiliate-marketplace/model.ts`
- Create: `src/features/affiliate-marketplace/model.test.ts`

**Interfaces:**
- Consumes: the public marketplace and Claim envelopes from Task 1 through `httpClient`.
- Produces: `affiliateMarketplaceApi.listTasks`, `getTask`, `claimTask`, `listMyClaims`, and pure display helpers for remaining percentage, maximum available reward, date windows, discount labels, and task tags.

- [x] **Step 1: Write failing adapter tests**

```ts
await affiliateMarketplaceApi.listTasks({ keyword: "massage", page: 2, pageSize: 12 });
expect(httpClient.request).toHaveBeenCalledWith("/affiliate/tasks", {
  query: { keyword: "massage", page: 2, pageSize: 12 }
});

await affiliateMarketplaceApi.claimTask(22);
expect(httpClient.request).toHaveBeenCalledWith("/affiliate/tasks/22/claims", {
  method: "POST",
  body: {}
});
```

- [x] **Step 2: Run adapter tests and verify RED**

Run: `npx vitest run src/api/affiliateMarketplace.test.ts src/features/affiliate-marketplace/model.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the API types and adapter**

```ts
export const affiliateMarketplaceApi = {
  listTasks(query: AffiliateTaskListQuery = {}) {
    return httpClient.request<AffiliateTaskPage>("/affiliate/tasks", { query });
  },
  getTask(taskId: number) {
    return httpClient.request<AffiliateMarketplaceTask>(`/affiliate/tasks/${taskId}`);
  },
  claimTask(taskId: number) {
    return httpClient.request<AffiliateClaim>(`/affiliate/tasks/${taskId}/claims`, {
      method: "POST",
      body: {}
    });
  }
};
```

- [x] **Step 4: Implement pure, verified display calculations**

```ts
export function getMaximumRewardNdp(task: AffiliateMarketplaceTask) {
  const byClaim = task.maxCompletedOrdersPerClaim === null
    ? task.remainingBudgetNdp
    : task.rewardNdpPerCompletedOrder * task.maxCompletedOrdersPerClaim;
  return Math.min(task.remainingBudgetNdp, byClaim);
}
```

Task tags must derive only from formal task/service fields: customer scope, minimum-order rule, service names, discount, and high reward. Never infer external followers or unverified performance.

- [x] **Step 5: Run focused frontend tests and verify GREEN**

Run: `npx vitest run src/api/affiliateMarketplace.test.ts src/features/affiliate-marketplace/model.test.ts`

Expected: both files PASS.

- [x] **Step 6: Commit the adapter and model**

```bash
git add src/api/affiliateMarketplace.ts src/api/affiliateMarketplace.test.ts src/features/affiliate-marketplace/model.ts src/features/affiliate-marketplace/model.test.ts
git commit -m "feat: add affiliate marketplace client"
```

### Task 3: Recommended Task Cards and Searchable Marketplace

**Files:**
- Create: `src/features/affiliate-marketplace/AffiliateTaskCard.tsx`
- Create: `src/features/affiliate-marketplace/AffiliateTaskCard.test.tsx`
- Create: `src/features/affiliate-marketplace/AffiliateMarketplaceSection.tsx`
- Create: `src/pages/mobile/AffiliateMarketplacePage.tsx`
- Create: `src/pages/mobile/AffiliateMarketplacePage.test.tsx`
- Modify: `src/pages/mobile/BusinessCpsPage.tsx`
- Modify: `src/pages/mobile/BusinessCpsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 adapter/model and existing Affiliate header/carousel.
- Produces: a real recommended-task section on Affiliate home plus a paginated `/afirieito/plan` marketplace page.

- [x] **Step 1: Write failing card and page tests**

Assert that a card renders task name, task intro, verified task tags, `剩余：70%`, formatted maximum reward, image/alt text, and links to `/afirieito/tasks/22`. Assert loading, empty, retryable error, search, and next-page states.

- [x] **Step 2: Run focused UI tests and verify RED**

Run: `npx vitest run src/features/affiliate-marketplace/AffiliateTaskCard.test.tsx src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/BusinessCpsPage.test.tsx`

Expected: FAIL because the marketplace components and route page do not exist.

- [x] **Step 3: Implement the continuous task card**

Use one large rounded card with a real image, top-left remaining budget pill, top-right maximum reward, task name, two-line task intro, and data-derived tag chips. Use `Link` for the complete card and preserve keyboard focus visibility.

- [x] **Step 4: Implement list ownership and pagination**

The section owns one abortable request keyed by query/page; a stale response cannot overwrite a newer search. Home requests the first six tasks and shows “推荐任务”; the full page uses a URL-backed search keyword and server pagination.

- [x] **Step 5: Replace only the home capability gate**

Keep the header and `PublishedCarousel scene="affiliate-home-notice"` unchanged. Render the task overview/recommended section after the carousel; do not remove Affiliate profile or alliance routes.

- [x] **Step 6: Run focused UI tests and verify GREEN**

Run: `npx vitest run src/features/affiliate-marketplace/AffiliateTaskCard.test.tsx src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/BusinessCpsPage.test.tsx`

Expected: all focused UI tests PASS.

- [x] **Step 7: Commit the marketplace list UI**

```bash
git add src/features/affiliate-marketplace/AffiliateTaskCard.tsx src/features/affiliate-marketplace/AffiliateTaskCard.test.tsx src/features/affiliate-marketplace/AffiliateMarketplaceSection.tsx src/pages/mobile/AffiliateMarketplacePage.tsx src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/BusinessCpsPage.tsx src/pages/mobile/BusinessCpsPage.test.tsx
git commit -m "feat: show real recommended affiliate tasks"
```

### Task 4: Task Detail and Idempotent Participation

**Files:**
- Create: `src/pages/mobile/AffiliateTaskDetailPage.tsx`
- Create: `src/pages/mobile/AffiliateTaskDetailPage.test.tsx`
- Modify: `src/features/im/pages.tsx`
- Create: `src/features/im/pages.test.tsx`

**Interfaces:**
- Consumes: `affiliateMarketplaceApi.getTask` and `claimTask`, public shop IDs/media, and the existing formal IM new-conversation directory search.
- Produces: `/afirieito/tasks/:taskId` with gallery, shop navigation, task terms, real Claim result, promotion code/URL copy actions, and a working shop consultation entry.

- [x] **Step 1: Write failing detail behavior tests**

Assert the page renders task name, “任务详细/跳转到店铺”, image thumbnails, total budget, remaining percentage, start/end, description/notice, unit reward, “聊天咨询”, and “立即参加”. Assert duplicate participation shows the same returned Claim and disables repeat submits while one request is pending.

- [x] **Step 2: Run focused detail tests and verify RED**

Run: `npx vitest run src/pages/mobile/AffiliateTaskDetailPage.test.tsx src/features/im/pages.test.tsx`

Expected: FAIL because the task detail page and prefilled IM query do not exist.

- [x] **Step 3: Implement detail loading and gallery**

Reject non-positive/non-integer route IDs before calling the API. Use task cover first, then de-duplicated shop media. A thumbnail changes only the selected public media URL; no browser business state is persisted.

- [x] **Step 4: Implement shop and consultation navigation**

“跳转到店铺” links to `/stores/:publicId`. “聊天咨询” links to `/messages/new?mode=friend&q=<encoded shop name or public id>`. Extend `ImNewConversationPage` to initialize its formal directory query from `q` while retaining manual editing.

- [x] **Step 5: Implement idempotent participation UI**

Call the existing POST endpoint once per click, keep the button disabled while pending, and show the server-returned Claim code and URL. Copy actions use the returned values only; errors preserve the detail page and expose retry.

- [x] **Step 6: Run focused detail tests and verify GREEN**

Run: `npx vitest run src/pages/mobile/AffiliateTaskDetailPage.test.tsx src/features/im/pages.test.tsx`

Expected: both files PASS.

- [x] **Step 7: Commit task detail and participation**

```bash
git add src/pages/mobile/AffiliateTaskDetailPage.tsx src/pages/mobile/AffiliateTaskDetailPage.test.tsx src/features/im/pages.tsx src/features/im/pages.test.tsx
git commit -m "feat: add affiliate task participation flow"
```

### Task 5: Routes, Five-Language Chrome, Documentation, and Acceptance

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `README.md`
- Create: `docs/affiliate-marketplace-mobile-ui.md`

**Interfaces:**
- Consumes: pages from Tasks 3-4.
- Produces: protected Affiliate marketplace and detail routes plus documented formal acceptance evidence.

- [x] **Step 1: Write failing route and i18n tests**

Assert `/afirieito/plan` mounts `AffiliateMarketplacePage`, `/afirieito/tasks/:taskId` mounts `AffiliateTaskDetailPage`, the old plan route no longer mounts `BusinessCpsPage`, and every new UI source key has `zh-Hant`, `ja`, `en`, and `ko` translations.

- [x] **Step 2: Run route/i18n tests and verify RED**

Run: `npx vitest run src/App.test.tsx src/i18n/translations.test.ts`

Expected: FAIL on missing routes/translations.

- [x] **Step 3: Wire routes and translations**

Keep both routes behind `protect("business", ...)`. Add only UI chrome/status translations; do not machine-translate merchant-authored task content in the browser.

- [x] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run src/api/affiliateMarketplace.test.ts src/features/affiliate-marketplace/model.test.ts src/features/affiliate-marketplace/AffiliateTaskCard.test.tsx src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/AffiliateTaskDetailPage.test.tsx src/pages/mobile/BusinessCpsPage.test.tsx src/App.test.tsx src/i18n/translations.test.ts
npm run lint
npm test
npm run verify:production-build
npm --prefix backend run lint
npm --prefix backend test -- affiliate-marketplace.service.test.ts affiliate-marketplace.repository.test.ts affiliate-marketplace-api.test.ts openapi.test.ts --runInBand
npm --prefix backend run build
git diff --check
```

Expected: all commands PASS; production build may retain only documented pre-existing non-blocking warnings.

- [ ] **Step 5: Run formal browser acceptance**

Using real local MySQL/Redis/backend/frontend and a formal switchable account:

1. Open Affiliate home and verify header identity switching still works.
2. Verify independent announcement carousel remains above the task overview.
3. Verify real task cards load from `/api/v1/affiliate/tasks` with no console errors.
4. Search and paginate the marketplace.
5. Open a task, change gallery thumbnail, and open its real store page.
6. Use “聊天咨询” and verify the formal IM directory is prefilled.
7. Use “立即参加”, record the returned Claim, reload, repeat, and verify the same persisted code/URL returns.
8. Switch all five UI languages and verify marketplace chrome changes without browser-generated task translations.

- [x] **Step 6: Document the exact boundary and evidence**

`docs/affiliate-marketplace-mobile-ui.md` must list changed routes/APIs, privacy boundary, verification commands, browser results, and explicit remaining microsteps: AffiliateTask five-language authoring, merchant publishing UI, completed-order reversal, metrics/rankings, operations monitoring, and withdrawal/payment-provider completion.

- [ ] **Step 7: Commit the completed microstep**

```bash
git add src/App.tsx src/App.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts README.md docs/affiliate-marketplace-mobile-ui.md docs/superpowers/plans/2026-08-29-affiliate-marketplace-mobile-ui.md
git commit -m "feat: activate affiliate marketplace mobile flow"
```
