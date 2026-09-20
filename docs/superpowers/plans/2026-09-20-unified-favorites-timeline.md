# Unified Favorites Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertically stacked favorites page with one formal, paginated, date-grouped timeline for shops, technicians, services, social posts, and chat records, while reusing the chat swipe, long-press action sheet, reactions, and multi-select interaction.

**Architecture:** Add a user-owned interaction metadata table for pin and private reaction state, then expose one authenticated favorites API that reads the existing source-of-truth favorite tables and performs a stable server-side merge. The React page consumes only that unified DTO and configures existing IM interaction components; source favorite removal and forwarding continue through their existing formal commands.

**Tech Stack:** React 18, TypeScript, Vite, Express, Zod, Prisma/MySQL, Vitest, Jest/Supertest, Tailwind CSS.

## Global Constraints

- The six header tabs are 全部、店铺、技师、服务、动态、聊天记录.
- Pinned rows sort first by `pinnedAt DESC`; remaining rows sort by `activityAt DESC`, then by stable item key.
- Date grouping uses Asia/Tokyo and renders 今天、昨天、or a localized full calendar date.
- Left swipe reuses `SwipeActionRow` and exposes pin/unpin plus delete at the same time.
- Long press reuses `ImMessageActionSheet`; no favorites-only gesture or action-menu system may be introduced.
- Quick emoji is private metadata on the saved item and never sends a message to its original author.
- All writes use authenticated formal APIs, Zod validation, permissions, audit records, and soft deletion.
- All new user-facing copy uses the existing five-language i18n system.

---

### Task 1: Persist favorites interaction metadata

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260920130000_add_user_favorite_interactions/migration.sql`
- Test: `backend/tests/user-favorites.service.test.ts`

**Interfaces:**
- Produces Prisma model `UserFavoriteInteraction` with unique key `(ownerUserId, itemType, itemKey)`.
- Produces nullable `pinnedAt`, nullable `reaction`, and standard timestamps including `deletedAt`.

- [ ] **Step 1: Write the failing service test**

```ts
it("persists pin and reaction only for an owned source favorite", async () => {
  repository.ownsFavorite.mockResolvedValue(true);
  repository.upsertInteraction.mockResolvedValue({
    itemType: "shop", itemKey: "shop0000000001", pinnedAt: now, reaction: "🥰"
  });
  await expect(service.setInteraction(auth, "shop", "shop0000000001", {
    pinned: true, reaction: "🥰"
  })).resolves.toMatchObject({ pinnedAt: now, reaction: "🥰" });
  expect(repository.upsertInteraction).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: auth.userId }));
});
```

- [ ] **Step 2: Run the focused test and verify that the missing module fails**

Run: `cd backend && npm test -- --runInBand tests/user-favorites.service.test.ts`
Expected: FAIL because `UserFavoritesService` and its repository port do not exist.

- [ ] **Step 3: Add the Prisma model and migration**

```prisma
model UserFavoriteInteraction {
  id          Int       @id @default(autoincrement())
  ownerUserId Int       @map("owner_user_id")
  itemType    String    @map("item_type") @db.VarChar(40)
  itemKey     String    @map("item_key") @db.VarChar(191)
  pinnedAt    DateTime? @map("pinned_at")
  reaction    String?   @db.VarChar(16)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  owner       User      @relation(fields: [ownerUserId], references: [id], onDelete: Restrict)

  @@unique([ownerUserId, itemType, itemKey], map: "user_favorite_interactions_owner_type_key")
  @@index([ownerUserId, pinnedAt, updatedAt], map: "user_favorite_interactions_owner_sort_idx")
  @@index([deletedAt], map: "user_favorite_interactions_deleted_idx")
  @@map("user_favorite_interactions")
}
```

- [ ] **Step 4: Generate Prisma Client and re-run the focused test**

Run: `cd backend && npm run prisma:generate && npm test -- --runInBand tests/user-favorites.service.test.ts`
Expected: schema generation succeeds; the test remains red only for the service implementation deferred to Task 2.

- [ ] **Step 5: Commit the schema unit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/tests/user-favorites.service.test.ts
git commit -m "feat: add favorite interaction metadata"
```

### Task 2: Build the unified favorites service and authenticated API

**Files:**
- Create: `backend/src/repositories/user-favorites.repository.ts`
- Create: `backend/src/services/user-favorites.service.ts`
- Create: `backend/src/validators/user-favorites.validator.ts`
- Create: `backend/src/controllers/user-favorites.controller.ts`
- Create: `backend/src/routes/user-favorites.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/user-favorites.service.test.ts`
- Test: `backend/tests/user-favorites.routes.test.ts`

**Interfaces:**
- Consumes existing entity favorites, `SocialPostBookmark`, and `ImChatRecordFavorite` rows.
- Produces `GET /api/v1/me/favorites?type=&query=&page=&pageSize=`.
- Produces `PUT|DELETE /api/v1/me/favorites/:type/:itemKey/pin` and `PUT|DELETE /api/v1/me/favorites/:type/:itemKey/reaction`.
- Produces DTO fields `key`, `type`, `sourceId`, `title`, `summary`, `imageUrl`, `detailPath`, `favoritedAt`, `activityAt`, `pinnedAt`, `reaction`, `canForward`, and `canDelete`.

- [ ] **Step 1: Add red tests for stable merge, Tokyo boundaries, ownership, and validation**

```ts
it("orders pinned rows before newest unpinned rows with a stable key tie-break", async () => {
  repository.listSourceFavorites.mockResolvedValue([unpinnedNewer, pinnedOlder, sameTimeB, sameTimeA]);
  const page = await service.list(auth, scope, { page: 1, pageSize: 20 });
  expect(page.list.map((row) => row.key)).toEqual([pinnedOlder.key, unpinnedNewer.key, sameTimeA.key, sameTimeB.key]);
});

it("rejects interaction writes when the current user does not own the source favorite", async () => {
  repository.ownsFavorite.mockResolvedValue(false);
  await expect(service.setPin(auth, scope, "shop", "shop0000000001", true)).rejects.toMatchObject({ statusCode: 404 });
});
```

- [ ] **Step 2: Run the focused backend tests**

Run: `cd backend && npm test -- --runInBand tests/user-favorites.service.test.ts tests/user-favorites.routes.test.ts`
Expected: FAIL for missing repository, service, route, and validator exports.

- [ ] **Step 3: Implement source adapters and stable server-side pagination**

```ts
export type FavoriteItemType = "shop" | "technician" | "service" | "social_post" | "chat_record";

export function compareFavoriteRows(a: UnifiedFavoriteRow, b: UnifiedFavoriteRow) {
  const pin = Date.parse(b.pinnedAt ?? "") - Date.parse(a.pinnedAt ?? "");
  if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
  if (pin) return pin;
  const activity = Date.parse(b.activityAt) - Date.parse(a.activityAt);
  return activity || a.key.localeCompare(b.key);
}
```

Read at most `page * pageSize` matching rows from each source, merge and sort them, then return only the requested page. Cap `pageSize` at 100 and return the summed source total; never load every favorite into memory.

- [ ] **Step 4: Implement interaction writes with ownership checks and audit**

```ts
public async setPin(auth, scope, type, itemKey, active) {
  if (!(await this.repository.ownsFavorite({ auth, scope, type, itemKey }))) throw this.notFound();
  return this.repository.setInteraction({
    actorUserId: auth.userId,
    ownerUserId: auth.userId,
    type,
    itemKey,
    pinnedAt: active ? this.now() : null
  });
}
```

- [ ] **Step 5: Register routes, permissions, and OpenAPI**

Use `entity-favorite:read`, `entity-favorite:write`, `message:list`, and `message:forward` without introducing broader permissions. Route validation must accept only the five exact item types, a bounded item key, the approved emoji catalog, positive pages, and page sizes from 1 to 100.

- [ ] **Step 6: Run focused backend tests and typecheck**

Run: `cd backend && npm test -- --runInBand tests/user-favorites.service.test.ts tests/user-favorites.routes.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit the unified API**

```bash
git add backend/src backend/tests
git commit -m "feat: add unified favorites api"
```

### Task 3: Add the frontend favorites contract and timeline model

**Files:**
- Create: `src/features/favorites/api.ts`
- Create: `src/features/favorites/model.ts`
- Create: `src/features/favorites/model.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces `favoritesApi.list`, `setPinned`, `setReaction`, `removeSourceFavorite`, and `forward`.
- Produces `groupFavoritesByTokyoDate(rows, now, language)` and the six tab definitions.

- [ ] **Step 1: Write failing model tests**

```ts
expect(groupFavoritesByTokyoDate(rows, new Date("2026-09-20T15:30:00Z"), "zh").map((group) => group.label))
  .toEqual(["今天", "昨天", "2026年09月18日"]);
expect(sortFavorites([unpinnedNew, pinnedOld])[0].key).toBe(pinnedOld.key);
```

- [ ] **Step 2: Run the model tests and confirm failure**

Run: `npm test -- --run src/features/favorites/model.test.ts`
Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the typed API and pure grouping helpers**

```ts
export type FavoriteTab = "all" | "shop" | "technician" | "service" | "social_post" | "chat_record";
export const favoriteTabs: FavoriteTab[] = ["all", "shop", "technician", "service", "social_post", "chat_record"];
```

Use `Intl.DateTimeFormat` with `timeZone: "Asia/Tokyo"`; compare calendar keys rather than elapsed 24-hour periods so DST-independent midnight grouping stays correct.

- [ ] **Step 4: Add five-language labels and run the model tests**

Run: `npm test -- --run src/features/favorites/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the client contract**

```bash
git add src/features/favorites src/i18n/translations.ts
git commit -m "feat: add favorites timeline model"
```

### Task 4: Reuse the chat gestures and action surfaces on favorite rows

**Files:**
- Create: `src/features/im/useImLongPressAction.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/components.tsx`
- Create: `src/features/favorites/FavoriteTimelineRow.tsx`
- Test: `src/features/favorites/FavoriteTimelineRow.test.tsx`
- Test: `src/features/im/useImLongPressAction.test.tsx`

**Interfaces:**
- Extracts `useImLongPressAction` from the current chat message implementation and consumes it in both chat and favorites.
- Configures `SwipeActionRow` with pin/unpin and delete.
- Configures `ImMessageActionSheet` with forward, pin/unpin, delete, multi-select, and existing reaction catalog.

- [ ] **Step 1: Add red interaction tests**

```tsx
expect(screen.getByRole("button", { name: "置顶" })).toBeVisible();
expect(screen.getByRole("button", { name: "删除" })).toBeVisible();
fireEvent.pointerDown(row, { pointerId: 1, clientX: 20, clientY: 20 });
vi.advanceTimersByTime(IM_LONG_PRESS_DELAY_MS);
expect(screen.getByText("信息置顶")).toBeVisible();
expect(screen.getByText("多选")).toBeVisible();
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/features/favorites/FavoriteTimelineRow.test.tsx src/features/im/useImLongPressAction.test.tsx`
Expected: FAIL because the shared hook and row do not exist.

- [ ] **Step 3: Extract the exact chat long-press state machine**

Move the existing delay, move-cancel threshold, pointer capture cleanup, selection protection, and click suppression into `useImLongPressAction`. Keep chat call-site behavior byte-for-byte equivalent at the public interaction boundary.

- [ ] **Step 4: Build the favorite row entirely from shared interaction components**

```tsx
<SwipeActionRow actions={[pinAction, deleteAction]} variant="flat-list">
  <article ref={longPress.ref} {...longPress.handlers}>{content}</article>
</SwipeActionRow>
<ImMessageActionSheet actions={primaryActions} listActions={secondaryActions} onReact={onReact} />
```

- [ ] **Step 5: Run favorites and chat regression tests**

Run: `npm test -- --run src/features/favorites/FavoriteTimelineRow.test.tsx src/features/im/useImLongPressAction.test.tsx src/features/im/pages.test.tsx`
Expected: PASS and existing chat gestures remain unchanged.

- [ ] **Step 6: Commit shared interactions**

```bash
git add src/features/im src/features/favorites
git commit -m "feat: reuse chat interactions for favorites"
```

### Task 5: Replace the favorites page with the six-tab timeline

**Files:**
- Modify: `src/pages/user/UserFavoritesPage.tsx`
- Modify: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `src/components/mobile/MobileFullscreenHeader.tsx` only if its existing footer cannot render the tab strip without layout changes.

**Interfaces:**
- Consumes the unified favorites API and the timeline row from Tasks 3 and 4.
- Produces per-tab paging, search, date groups, optimistic rollback, forwarding, and multi-select actions.

- [ ] **Step 1: Replace old expectations with red acceptance tests**

```tsx
expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
  "全部", "店铺", "技师", "服务", "动态", "聊天记录"
]);
expect(screen.getByText("今天")).toBeVisible();
expect(api.list).toHaveBeenCalledWith({ type: undefined, query: "", page: 1, pageSize: 20 });
```

Cover newest-first ordering, pin refresh persistence, tab paging isolation, stale-response guards, multi-select, forwarding capability checks, and delete rollback.

- [ ] **Step 2: Run the page test and verify the old page fails the new contract**

Run: `npm test -- --run src/pages/user/UserFavoritesPage.test.tsx`
Expected: FAIL on the six-tab and unified-list assertions.

- [ ] **Step 3: Implement the page controller and compact timeline**

Keep a request generation counter per tab, use server-returned rows as authoritative state, and reload the current page after successful pin/reaction changes. Remove the old per-source fetch-all effects and vertically stacked entity sections.

- [ ] **Step 4: Implement forwarding and multi-select**

Open the existing IM target picker for supported rows. Disable multi-forward when any selected row has `canForward: false`; multi-delete retains failed rows and reports the failure count.

- [ ] **Step 5: Run page and related source-favorite tests**

Run: `npm test -- --run src/pages/user/UserFavoritesPage.test.tsx src/features/entity-engagement/api.test.ts src/features/im/formal-api.test.ts src/features/social/formal-provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit the page replacement**

```bash
git add src/pages/user/UserFavoritesPage.tsx src/pages/user/UserFavoritesPage.test.tsx src/components/mobile/MobileFullscreenHeader.tsx
git commit -m "feat: build unified favorites timeline"
```

### Task 6: Verify the integrated feature locally

**Files:**
- Modify only files required to correct failures caused by Tasks 1 through 5.

**Interfaces:**
- Produces a buildable, deployable feature branch and browser evidence from port 5180.

- [ ] **Step 1: Run backend gates**

Run: `cd backend && npm run lint && npm run typecheck && npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 2: Run frontend gates**

Run: `npm run lint && npm run typecheck && npm test -- --run && npm run build && npm run verify:production-build`
Expected: PASS.

- [ ] **Step 3: Start the current branch on port 5180 and verify process ownership**

Run the repository's documented local launcher, then confirm the listener PID, cwd, branch, frontend proxy, `/health`, and `/ready` before testing UI behavior.

- [ ] **Step 4: Perform browser acceptance**

Verify all six tabs, all five item types, Tokyo date labels, search, paging, left-swipe pin/delete, long-press action sheet, reaction persistence, multi-select, forwarding, refresh persistence, and narrow-screen overflow.

- [ ] **Step 5: Commit any integrated corrections**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260920130000_add_user_favorite_interactions backend/src backend/tests src/features/favorites src/features/im src/pages/user/UserFavoritesPage.tsx src/pages/user/UserFavoritesPage.test.tsx src/components/mobile/MobileFullscreenHeader.tsx src/i18n/translations.ts
git commit -m "fix: complete favorites timeline verification"
```
