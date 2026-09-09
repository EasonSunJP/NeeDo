# Formal Card Completed-Order Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shop, service, and technician simple-card metric two show the correct formally scoped completed-order count with the approved seal-check icon, compact `k` formatting, restored compact height, and local-main/5180 acceptance.

**Architecture:** Keep aggregation server-authoritative. Shop cards add a filtered Prisma relation count; service cards consume the already filtered service-level order count; technician cards retain the formal technician performance summary. Shared card components own only presentation, the shared compact formatter, and the SVG icon; adapters must never substitute review counts or another entity's count.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Prisma, MySQL, Jest, Supertest, OpenAPI.

## Global Constraints

- Shop metric two is the count of `BookingOrder` rows with the card shop's `shopId`, `status = COMPLETED`, and `deletedAt IS NULL`.
- Shop-service metric two is the count for that exact `serviceId`; technician-service metric two is the count for that exact `technicianServiceId`; neither may use shop or technician totals.
- Technician metric two is `TechnicianPerformanceSummary.completedOrderCount`; it may not use shop or service totals.
- Missing formal counts render `-`; never fall back to `reviewCount`, a static value, or a client-side estimate.
- Compact boundaries are exact: `999 → 999`, `1000 → 1k`, `1001 → 1k`, `1999 → 1.9k`, `2000 → 2k`; decimals are truncated to one place and trailing `.0` is removed.
- The completed icon is a filled neon-green multi-tooth seal with a centered white check in a `0 0 24 24` SVG.
- Preserve the content-sized card fix; do not restore `min-h-[320px]` or `aspect-[16/9]`.
- No new mock, fake API, placeholder, schema migration, remote push, or deployment.

---

### Task 1: Shared compact formatter and completed seal icon

**Files:**
- Modify: `src/shared/engagement/formatCompactCount.test.ts`
- Modify: `src/shared/engagement/formatCompactCount.ts`
- Modify: `src/components/client-ui/AppScaffold.test.tsx`
- Modify: `src/components/client-ui/AppScaffold.tsx`

**Interfaces:**
- Consumes: existing `formatCompactCount(value: number): string` and `AppIcon({ name: "completed" })`.
- Produces: truncated one-decimal `k` formatting and SVG children marked `data-icon-part="completed-seal"` and `data-icon-part="completed-check"`.

- [ ] **Step 1: Write the failing compact-number boundary tests**

Replace the formatter cases with explicit accepted boundaries:

```ts
it.each([
  [0, "0"],
  [999, "999"],
  [1000, "1k"],
  [1001, "1k"],
  [1999, "1.9k"],
  [2000, "2k"],
])("formats %i as %s", (value, expected) => {
  expect(formatCompactCount(value)).toBe(expected);
});
```

- [ ] **Step 2: Run the formatter test and verify RED**

Run: `npm test -- --run src/shared/engagement/formatCompactCount.test.ts`

Expected: FAIL at `1999`, because the current implementation returns `1k`.

- [ ] **Step 3: Implement truncation to one decimal place**

Use normalized integer input and integer arithmetic:

```ts
export function formatCompactCount(value: number): string {
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
  if (normalized < 1000) return String(normalized);
  const truncatedTenths = Math.floor(normalized / 100);
  const compact = truncatedTenths / 10;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
}
```

- [ ] **Step 4: Write the failing icon structure test**

Render `<AppIcon name="completed" />` to static markup and assert:

```ts
expect(markup).toContain('data-icon-part="completed-seal"');
expect(markup).toContain('fill="currentColor"');
expect(markup).toContain('data-icon-part="completed-check"');
expect(markup).toContain('stroke="#f7f9f7"');
expect(markup).not.toContain("M4.4 15.3A8.2 8.2");
```

- [ ] **Step 5: Run the icon test and verify RED**

Run: `npm test -- --run src/components/client-ui/AppScaffold.test.tsx`

Expected: FAIL because the current completed icon is an outlined circular arrow without the two approved icon parts.

- [ ] **Step 6: Draw the approved vector icon**

Replace only `case "completed"` with a filled 16-tooth seal and centered white check:

```tsx
case "completed":
  return (
    <>
      <path
        d="M12 2 13.63 3.81 15.83 2.76 16.64 5.06 19.07 4.93 18.94 7.36 21.24 8.17 20.19 10.37 22 12 20.19 13.63 21.24 15.83 18.94 16.64 19.07 19.07 16.64 18.94 15.83 21.24 13.63 20.19 12 22 10.37 20.19 8.17 21.24 7.36 18.94 4.93 19.07 5.06 16.64 2.76 15.83 3.81 13.63 2 12 3.81 10.37 2.76 8.17 5.06 7.36 4.93 4.93 7.36 5.06 8.17 2.76 10.37 3.81Z"
        data-icon-part="completed-seal"
        fill="currentColor"
      />
      <path
        d="m7.1 12.1 3.3 3.3 6.8-6.9"
        data-icon-part="completed-check"
        fill="none"
        stroke="#f7f9f7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </>
  );
```

- [ ] **Step 7: Run Task 1 tests and verify GREEN**

Run: `npm test -- --run src/shared/engagement/formatCompactCount.test.ts src/components/client-ui/AppScaffold.test.tsx`

Expected: both suites PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/shared/engagement/formatCompactCount.ts src/shared/engagement/formatCompactCount.test.ts src/components/client-ui/AppScaffold.tsx src/components/client-ui/AppScaffold.test.tsx
git commit -m "fix(cards): refine completed metric presentation"
```

### Task 2: Shared shop, service, and technician card semantics

**Files:**
- Modify: `src/shared/profile-card/UnifiedEntityInfoCard.test.tsx`
- Modify: `src/shared/profile-card/UnifiedEntityInfoCard.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Modify: `src/shared/service-card/model.ts`
- Modify: `src/shared/service-card/mappers.ts`
- Modify: `src/shared/service-card/mappers.test.ts`
- Modify: `src/shared/info-card-system/copy.ts`

**Interfaces:**
- Consumes: `formatCompactCount(number)`, `AppIcon` name `completed`, formal adapter counts.
- Produces: `UnifiedEntityInfoCardData.completedOrderCount?: number | null` for shop/technician and `UnifiedServiceInfoCardData.completedOrderCount: number | null` for service cards.

- [ ] **Step 1: Write failing entity-card separation tests**

Use deliberately different values so an incorrect field is visible:

```ts
const shopMarkup = render({
  kind: "shop", id: "shop-1", name: "港区店", imageUrl: null,
  description: null, address: "東京都港区", languages: [], tags: [],
  rating: 4.8, reviewCount: 321, completedOrderCount: 1999,
  distanceKm: 1.2, favoriteCount: 5, shareCount: 2,
});
expect(shopMarkup).toContain('data-app-icon="completed"');
expect(shopMarkup).not.toContain('data-app-icon="moments"');
const shopText = shopMarkup.replace(/<[^>]+>/gu, "");
expect(shopText).toContain("1.9k");
expect(shopText).not.toContain("321");
```

Keep the technician test with a different `completedOrderCount` and assert it uses that value.

- [ ] **Step 2: Write the failing service-card semantic test**

Rename the fixture field to `completedOrderCount: 1999` and assert the second metric contains the completed icon and `1.9k`, not the old moments icon or “利用次数” copy.

- [ ] **Step 3: Run card tests and verify RED**

Run: `npm test -- --run src/shared/profile-card/UnifiedEntityInfoCard.test.tsx src/shared/service-card/UnifiedServiceInfoCard.test.tsx`

Expected: FAIL because shop/service metric two still reads `reviewCount`/`usageCount` and uses `moments`.

- [ ] **Step 4: Implement the shared presentation change**

Import `formatCompactCount` into both card components. Keep `-` for null/non-finite values:

```ts
const metricValue = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : formatCompactCount(value);
```

Set shop and service metric two to:

```ts
{
  icon: "completed",
  label: text.completedOrders,
  value: metricValue(data.completedOrderCount),
}
```

Rename `UnifiedServiceInfoCardData.usageCount` to `completedOrderCount`, update every mapper assignment, and map existing formal `service.usageCount` into the newly named display field. Change simplified Chinese copy from `完单次数` to `完单数`; keep the existing correct localized equivalents for other languages.

- [ ] **Step 5: Update mapper tests with distinct service counts**

For core and technician service fixtures, assert:

```ts
expect(result.completedOrderCount).toBe(source.usageCount);
expect(result).not.toHaveProperty("usageCount");
```

For sources without a formal count, assert `completedOrderCount` is `null`.

- [ ] **Step 6: Run Task 2 tests and verify GREEN**

Run: `npm test -- --run src/shared/profile-card/UnifiedEntityInfoCard.test.tsx src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/service-card/mappers.test.ts`

Expected: all suites PASS and the existing compact-height assertions remain green.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/shared/profile-card/UnifiedEntityInfoCard.tsx src/shared/profile-card/UnifiedEntityInfoCard.test.tsx src/shared/service-card src/shared/info-card-system/copy.ts
git commit -m "fix(cards): separate completed order metric scopes"
```

### Task 3: Formal core-read shop total and frontend propagation

**Files:**
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/shared/shop-card/mappers.ts`
- Modify: `src/shared/profile-card/unifiedEntityMappers.ts`

**Interfaces:**
- Consumes: Prisma `Shop.bookingOrders`, existing service filtered relation count, `BookingOrderStatus.COMPLETED`.
- Produces: required `ShopCardPayload.completedOrderCount: number`, required `CoreShopCard.completedOrderCount: number`, optional legacy `Store.completedOrderCount?: number`.

- [ ] **Step 1: Write the failing repository contract test**

Extend the shop fixture `_count` with `bookingOrders: 1999`. Assert the mapped card and Prisma include:

```ts
expect(result.list[0]?.completedOrderCount).toBe(1999);
expect(shopFindMany).toHaveBeenCalledWith(expect.objectContaining({
  include: expect.objectContaining({
    _count: { select: expect.objectContaining({
      bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
    }) },
  }),
}));
```

Retain the existing service assertion proving service `_count.bookingOrders` is scoped by the selected service relation and filtered to completed/non-deleted orders.

- [ ] **Step 2: Run repository test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts`

Expected: FAIL because `shopCardInclude()` and `mapShopCard()` do not provide the new count.

- [ ] **Step 3: Add the formal shop count in one query**

Update the payload/record interfaces, then extend the existing relation count:

```ts
_count: {
  select: {
    bookingOrders: { where: { status: "COMPLETED" as const, deletedAt: null } },
    entityFavorites: { where: { deletedAt: null } },
    entityShareEvents: { where: { deletedAt: null } },
  },
},
```

Map it directly:

```ts
completedOrderCount: shop._count.bookingOrders,
```

Do not issue a second `bookingOrder.count()` call and do not add a schema migration.

- [ ] **Step 4: Write and run failing API/OpenAPI tests**

Add `completedOrderCount` to `ShopCard` fixtures and assert:

```ts
expect(response.body.components.schemas.ShopCard.required).toContain("completedOrderCount");
expect(response.body.components.schemas.ShopCard.properties.completedOrderCount).toEqual({
  type: "integer", minimum: 0,
});
```

Run: `npm --prefix backend test -- --runInBand tests/core-read-api.test.ts tests/openapi.test.ts`

Expected: FAIL until the schema is updated.

- [ ] **Step 5: Update formal and frontend contracts**

Add `completedOrderCount: number` to `ShopCardPayload`, `CoreShopCard`, and the OpenAPI ShopCard required/properties lists. Add `completedOrderCount?: number` to `Store`. Map `CoreShopCard.completedOrderCount` into both `Store.completedOrderCount` and `UnifiedShopInfoCardData.completedOrderCount`; map legacy stores only when the optional field exists.

- [ ] **Step 6: Run Task 3 tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/openapi.test.ts`

Run: `npm test -- --run src/features/core-read/api.test.ts src/shared/service-card/mappers.test.ts src/shared/profile-card/UnifiedEntityInfoCard.test.tsx`

Expected: all suites PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/src/repositories/core-read.repository.ts backend/src/api/openapi.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts backend/tests/openapi.test.ts src/features/core-read/api.ts src/features/core-read/api.test.ts src/types/domain.ts src/shared/shop-card/mappers.ts src/shared/profile-card/unifiedEntityMappers.ts
git commit -m "feat(cards): expose formal shop completed totals"
```

### Task 4: Favorites and IM share-card formal count propagation

**Files:**
- Modify: `backend/tests/entity-engagement.repository.test.ts`
- Modify: `backend/tests/entity-engagement-api.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/src/repositories/entity-engagement.repository.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/entity-engagement/api.ts`
- Modify: `src/pages/user/UserFavoritesPage.tsx`
- Modify: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/components.tsx`

**Interfaces:**
- Consumes: the same filtered Prisma relation counts used by core read.
- Produces: `completedOrderCount` on favorite shop-card and IM shop-card snapshots; service snapshots continue receiving their exact service relation count and map it into `UnifiedServiceInfoCardData.completedOrderCount`.

- [ ] **Step 1: Write failing favorite repository/UI tests**

Give a favorite shop different values (`reviewCount: 32`, `_count.bookingOrders: 1999`). Assert repository output and UI card data use `completedOrderCount: 1999` and never map `reviewCount` into the completed metric.

- [ ] **Step 2: Run favorite tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement-api.test.ts`

Run: `npm test -- --run src/pages/user/UserFavoritesPage.test.tsx`

Expected: FAIL because favorite shop cards currently expose only `reviewCount`.

- [ ] **Step 3: Implement favorite shop count propagation**

Add `completedOrderCount: number` to both backend/frontend `EntityFavoriteCard` shop variants. In the existing shop selection add:

```ts
bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
```

Map `row.shop._count.bookingOrders`, add the OpenAPI required/property entry, and pass the value to `UnifiedEntityInfoCard` in `UserFavoritesPage`.

- [ ] **Step 4: Write failing IM shop share-card test**

Extend the `NeeDo entity-share atomicity` shop fixture with `_count.bookingOrders: 1999`, then assert the message creation call contains:

```ts
expect(transaction.message.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({
    metadata: expect.objectContaining({
      needoMessageExt: expect.objectContaining({
        shopCard: expect.objectContaining({ completedOrderCount: 1999 }),
      }),
    }),
  }),
}));
```

- [ ] **Step 5: Run the IM test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/realtime-service.test.ts`

Expected: FAIL because shop share metadata currently emits review/favorite/share counts only.

- [ ] **Step 6: Implement IM shop and service propagation**

Add the filtered shop `bookingOrders` relation count in `buildEntityShareMetadata()`, emit `shopCard.completedOrderCount`, extend `ImMessageExt.shopCard`, and pass it through the shop renderer. Rename the service renderer assignment from `usageCount` to:

```ts
completedOrderCount: card.usageCount ?? null,
```

The backend service snapshot field remains `usageCount` for compatibility, but its source remains the exact service or technician-service filtered relation count.

- [ ] **Step 7: Run Task 4 tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/entity-engagement.repository.test.ts tests/entity-engagement-api.test.ts tests/realtime-service.test.ts tests/openapi.test.ts`

Run: `npm test -- --run src/pages/user/UserFavoritesPage.test.tsx src/shared/service-card/service-card-usage.test.ts`

Expected: all suites PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add backend/src/repositories/entity-engagement.repository.ts backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/tests/entity-engagement.repository.test.ts backend/tests/entity-engagement-api.test.ts backend/tests/realtime-service.test.ts src/features/entity-engagement/api.ts src/pages/user/UserFavoritesPage.tsx src/pages/user/UserFavoritesPage.test.tsx src/features/im/model.ts src/features/im/components.tsx
git commit -m "fix(cards): preserve completed scopes in shared cards"
```

### Task 5: Regression verification, local-main integration, and 5180 acceptance

**Files:**
- Verify: `src/shared/info-card-system/UnifiedInfoCardFrame.tsx`
- Verify: `src/shared/profile-card/UnifiedEntityInfoCard.tsx`
- Verify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Verify: `docs/superpowers/specs/2026-09-10-completed-order-seal-icon-design.md`

**Interfaces:**
- Consumes: all completed branch commits plus the earlier compact-height commit `34bd3ebb`.
- Produces: clean feature branch, merge commit on local `main`, and PID/cwd/branch/HTTP/browser evidence for port 5180.

- [ ] **Step 1: Run focused frontend verification**

Run:

```bash
npm test -- --run \
  src/shared/engagement/formatCompactCount.test.ts \
  src/components/client-ui/AppScaffold.test.tsx \
  src/shared/profile-card/UnifiedEntityInfoCard.test.tsx \
  src/shared/service-card/UnifiedServiceInfoCard.test.tsx \
  src/shared/service-card/mappers.test.ts \
  src/pages/user/UserFavoritesPage.test.tsx \
  src/shared/service-card/service-card-usage.test.ts
```

Expected: all selected frontend suites PASS.

- [ ] **Step 2: Run focused backend verification**

Run:

```bash
npm --prefix backend test -- --runInBand \
  tests/core-read.repository.test.ts \
  tests/core-read-api.test.ts \
  tests/entity-engagement.repository.test.ts \
  tests/entity-engagement-api.test.ts \
  tests/realtime-service.test.ts \
  tests/openapi.test.ts
```

Expected: all selected backend suites PASS.

- [ ] **Step 3: Run build and source guards**

Run: `npm run build`

Run: `rg -n 'min-h-\[320px\]|aspect-\[16/9\]' src/shared/info-card-system src/shared/profile-card src/shared/service-card`

Run: `rg -n 'icon: "moments"|label: text\.reviews|value: metricValue\(data\.reviewCount\)' src/shared/profile-card/UnifiedEntityInfoCard.tsx src/shared/service-card/UnifiedServiceInfoCard.tsx`

Expected: build succeeds; both `rg` commands return no matches.

- [ ] **Step 4: Confirm branch state before integration**

Run: `git status --short --branch`

Run: `git log --oneline --decorate -8`

Expected: feature worktree is clean and includes the height, spec, and completed-metric commits.

- [ ] **Step 5: Inspect the local-main serving worktree**

In `/Users/eason/Documents/New project/.worktrees/main-runtime-5180`, run:

```bash
git status --short --branch
git rev-list --left-right --count main...codex/fix-compact-card-height
lsof -nP -iTCP:5180 -sTCP:LISTEN
```

For the returned listener PID, run `lsof -a -p <verified-pid> -d cwd -Fn` and `ps -p <verified-pid> -o pid=,ppid=,command=`. Expected: the runtime worktree is clean, branch is `main`, and the listener cwd is the verified main runtime worktree. If any condition differs, stop integration and report the exact evidence instead of merging or killing a process.

- [ ] **Step 6: Merge into local main without pushing**

From the verified clean main runtime worktree run:

```bash
git merge --no-ff codex/fix-compact-card-height -m "merge: compact formal information card metrics"
```

Expected: merge succeeds without unrelated conflict. Do not run `git push`.

- [ ] **Step 7: Verify listener revision and HTTP after merge**

Run:

```bash
git merge-base --is-ancestor 34bd3ebb main
git merge-base --is-ancestor 7fd1dc1b main
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5180/user.html
curl -sS http://127.0.0.1:3000/api/v1/health
curl -sS http://127.0.0.1:3000/api/v1/ready
```

Expected: both ancestry checks exit 0, user HTML returns 200, and backend health/readiness are successful. If Vite or backend did not reload the merged revision, restart only through the documented `npm run dev:formal` flow after recording the old PID/cwd evidence.

- [ ] **Step 8: Perform browser acceptance at 440px**

Open the authenticated target route on `http://127.0.0.1:5180/user.html`, set a 440px mobile viewport, and inspect one shop, one service, and one technician simple card. Verify:

- cards are content-sized with no tall blank lower area;
- metric two uses the filled green tooth seal and centered white check;
- shop, service, and technician display deliberately different formal counts from their own scopes;
- `999`, `1k`, and `1.9k` display according to the accepted boundary rule when those fixture/data values are available;
- no card substitutes review count for completed count.

- [ ] **Step 9: Record final evidence**

Report feature commits, local-main merge commit, test counts, build result, listener PID/cwd/branch, health/readiness responses, and browser acceptance separately. State explicitly that remote push and deployment were not performed.
