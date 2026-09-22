# Exchange Shop Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Intelligence shop cards open the shop homepage directly, with Intelligence visibility matching the shop's current privacy audience.

**Architecture:** Reuse `ShopVisibilityRepository.buildVisibilityWhere` in Exchange repository reads, so the database filters list rows and totals before pagination and rejects direct reads of hidden posts. Keep the linked shop's current visibility authoritative and remove the source-post exception from core shop reads. Reuse the formal store-detail page for portal-specific links.

**Tech Stack:** React 19, TypeScript, Vitest; Express, Prisma/MySQL, Jest.

## Global Constraints

- Preserve existing `public`, `privateAll`, `limited`, and `network` rules and identity-scoped relationships.
- Keep Demand, customer-request address privacy, API not-found behavior, and store booking authorization unchanged.
- No mock data, new permission system, schema change, or migration.
- Do not merge while unrelated dirty worktrees or an unverified final integrated state exist.

---

### Task 1: Source-scoped shop detail cannot bypass privacy

**Files:** `backend/tests/core-read-shop-visibility.test.ts`, `backend/src/repositories/core-read.repository.ts`, `docs/api.md`, `backend/src/api/openapi.ts`.

**Interfaces:** Retain API query compatibility for `sourcePostId`, but do not pass it through to the shop-detail repository or let it change the visibility predicate.

- [ ] Replace the old grant test with a test calling `findShopDetail("shop6333731099", undefined, viewer, 61)` and asserting that its `shop.findFirst.where` contains only `buildVisibilityWhere(viewer)`, not a limited-source OR.
- [ ] Run `npm --prefix backend test -- --runTestsByPath tests/core-read-shop-visibility.test.ts`; confirm the new assertion fails.
- [ ] Remove the source-based exception from the repository without changing the general shop detail mapping.
- [ ] Run that focused test again and update API documentation to state that source IDs do not expand visibility.

### Task 2: Filter Intelligence rows and direct reads at the database boundary

**Files:** `backend/tests/exchange.repository.test.ts`, `backend/tests/exchange.service.test.ts`, `backend/src/repositories/exchange.repository.ts`, `backend/src/services/exchange.service.ts`, `backend/src/types/exchange.types.ts`.

**Interfaces:** Exchange service passes the authenticated selected identity as `ShopVisibilityViewer`; repository uses the existing policy to build a linked-shop predicate in list `findMany`/`count` and direct `findFirst`. Demand read paths remain unchanged.

- [ ] Add a repository test for an Intelligence list with `page=2`, asserting the same nested shop predicate is in `findMany.where` and `count.where`, before `skip`/`take`.
- [ ] Add a direct-read test asserting a hidden Intelligence post is excluded by the nested shop predicate and results in the existing not-found response at the service boundary.
- [ ] Add a service test that the selected identity, not another account identity, reaches the visibility predicate; cover post read and mutation read checks.
- [ ] Run the new tests and confirm expected failures.
- [ ] Extend the existing Exchange repository read queries minimally, using `ShopVisibilityRepository.buildVisibilityWhere` and the linked shop relations for both shop-service and technician-service Intelligence.
- [ ] Run focused Exchange repository, service, and route tests; verify Demand and published-author behavior remains intact.

### Task 3: Open the store homepage without an intermediate page

**Files:** `src/features/exchange/ExchangeFeedPage.test.tsx`, `src/features/exchange/ExchangePostDetailPage.test.tsx`, `src/features/exchange/ExchangeIntelligenceShopCard.tsx`, `src/App.tsx`, `src/pages/user/StoreDetailPage.tsx`.

**Interfaces:** The card's `detailTo` resolves to the protected store homepage route for user, merchant, or technician scope; it never contains `/profiles/shop/` or `sourcePostId`.

- [ ] Change existing card-link assertions to expect `/stores/:id`, `/merchant/stores/:id`, and `/technician/stores/:id`; add route coverage for the technician store page.
- [ ] Run the focused frontend tests and confirm they fail on the current intermediate path.
- [ ] Add only the missing technician-protected store route and extend the existing formal store-detail component's scope type; point the card at the scoped homepage path.
- [ ] Run focused route/card tests and inspect the rendered links.

### Task 4: Integrated verification and release

**Files:** Only directly related fallout and release evidence.

- [ ] Run `npm run lint`, `npm test`, and `npm run verify:production-build`; run the required backend 12-shard suite, lint, and build.
- [ ] If an unrelated baseline test still fails, confirm it fails at the current main SHA; do not rewrite it as part of this task and do not claim a clean suite.
- [ ] Rebase or merge onto the latest clean main without overwriting another worktree's changes, then rerun the impacted and required integrated checks.
- [ ] After the final state passes, merge to main and delete only provably obsolete branches and agent-owned worktrees. Report push, deployment, and browser acceptance separately; they are not part of the current local-merge request.
