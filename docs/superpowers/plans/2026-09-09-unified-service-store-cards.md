# Unified Service And Shop Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one responsive simplified-card/name-card design for services, shops, technicians, and users with formal service favorites, contact/group sharing, and current-location distance.

**Architecture:** Extend the existing entity-engagement aggregate instead of creating a parallel favorite/share system. Server-authored share snapshots are committed through the realtime transaction, while the shared frontend cards consume discriminated formal projections and open one reusable destination selector.

**Tech Stack:** React 19, TypeScript strict mode, Vite/Vitest, Express, Zod, Prisma, MySQL, Jest/Supertest.

## Global Constraints

- Work only on `codex/unified-service-store-cards` until verified and committed.
- Do not operate port 5180 or any process bound to it.
- Do not push, deploy, access staging, or access production.
- Write a failing test before each behavior change and observe the expected failure.
- Do not introduce mock APIs, fake counts, fake distance, client-authored snapshots, crop tooling, or a second reachable simplified-card/name-card visual variant.
- All user-visible new copy supports `zh`, `zh-Hant`, `ja`, `en`, and `ko`.

---

### Task 1: Persist service engagement targets

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260909213000_service_entity_engagement/migration.sql`
- Modify: `backend/src/repositories/entity-engagement.repository.ts`
- Test: `backend/tests/entity-engagement.repository.test.ts`
- Test: `backend/tests/entity-engagement.service.test.ts`

**Interfaces:**
- Produces: `EntityTargetType = "shop" | "technician" | "service" | "technician_service"`.
- Produces: `ResolvedEntityTarget` with exactly one of `shopId`, `technicianProfileId`, `serviceId`, or `technicianServiceId`.

- [ ] Write repository/service tests for add, remove, status batch, paginated list, count, invalid target, and soft-delete restore for both service target kinds.
- [ ] Run `npm --prefix backend test -- entity-engagement.repository.test.ts entity-engagement.service.test.ts` and verify failures identify unsupported service target kinds.
- [ ] Add nullable service foreign keys, relations, indexes, and four-way exactly-one-target constraints in Prisma and additive SQL migration.
- [ ] Extend target resolution, active keys, count filters, visibility filters, and list mapping without changing shop/technician behavior.
- [ ] Generate Prisma client with `npm --prefix backend run prisma:generate` and rerun the focused tests to green.

### Task 2: Return authoritative card projections and location distance

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/types/domain.ts`
- Test: `backend/tests/core-read-api.test.ts`
- Test: `src/features/core-read/api.test.ts`
- Test: `src/shared/service-card/mappers.test.ts`

**Interfaces:**
- Produces service fields: `favoriteCount`, `shareCount`, `isBookable`, `distanceKm?`, and engagement public target.
- Produces shop fields: existing rating/counts plus `distanceKm?` when current latitude/longitude is supplied.
- Reuses `haversineDistanceKm(origin, destination)` from nearby ranking.

- [ ] Add failing API/mapping tests for service counts, technician-service counts/bookability, and shop/service distance with absent-coordinate honesty.
- [ ] Run focused frontend/backend tests and verify the new fields are absent.
- [ ] Extend query validators so service lists, search, and home recommendations accept paired latitude/longitude.
- [ ] Count persisted engagement relations in the existing Prisma includes and map exact counts.
- [ ] Compute distance only from a supplied origin and a persisted shop coordinate pair; omit it otherwise.
- [ ] Update DTOs, adapters, and OpenAPI; rerun focused tests to green.

### Task 3: Commit direct and group share snapshots formally

**Files:**
- Modify: `backend/src/validators/entity-engagement.validator.ts`
- Modify: `backend/src/controllers/entity-engagement.controller.ts`
- Modify: `backend/src/services/entity-engagement.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/entity-engagement/api.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/components.tsx`
- Test: `backend/tests/entity-engagement-api.test.ts`
- Test: `backend/tests/realtime.service.test.ts`
- Test: `src/features/entity-engagement/api.test.ts`
- Test: `src/features/im/pages.test.tsx`

**Interfaces:**
- Changes `shareThroughNeedo(target, { conversationId, idempotencyKey })`; recipient identity is server-resolved.
- A service target produces `needoMessageType: "service-card"` with authoritative `needoMessageExt.serviceCard`.
- A shop target produces a server-authored shop snapshot rendered as the simplified shop card.

- [ ] Add failing tests for direct peer resolution, group null-recipient persistence, membership/friendship rejection, idempotent replay, and service/shop snapshot rendering.
- [ ] Run focused tests and verify existing direct-only recipient assumptions fail.
- [ ] Update share validation and transaction logic; never accept display fields from the client.
- [ ] Update the migration's channel constraint for direct-or-group Needo messages.
- [ ] Parse and render the two server snapshot shapes in IM, preserving authored content and safe URLs.
- [ ] Update OpenAPI and rerun focused tests to green.

### Task 4: Build one reusable destination selector

**Files:**
- Create: `src/shared/entity-share/EntityShareDestinationSheet.tsx`
- Create: `src/shared/entity-share/useEntityShareDestinations.ts`
- Create: `src/shared/entity-share/i18n.ts`
- Create: `src/shared/entity-share/EntityShareDestinationSheet.test.tsx`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/entity-engagement/api.ts`

**Interfaces:**
- Consumes: formal contacts, conversations, `realtimeApi.createConversation`, and `entityEngagementApi.shareThroughNeedo`.
- Produces: `<EntityShareDestinationSheet target targetLabel onClose onShareCountChange />`.

- [ ] Add failing jsdom tests for loading, search, mixed contact/group multi-select, direct-conversation reuse/create, independent delivery, partial retry, close, and five-language copy.
- [ ] Run the component test and verify it fails because the sheet does not exist.
- [ ] Implement paginated loading and normalized destinations; do not expose hidden groups or blocked contacts.
- [ ] Implement stable per-destination idempotency keys and retain successful results during partial retry.
- [ ] Rerun the sheet/API tests to green.

### Task 5: Replace every simplified card and name-card visual

**Files:**
- Modify: `src/shared/service-card/model.ts`
- Modify: `src/shared/service-card/mappers.ts`
- Replace: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Create: `src/shared/service-card/ServiceCardEngagementActions.tsx`
- Create: `src/shared/shop-card/UnifiedShopInfoCard.tsx`
- Create: `src/shared/shop-card/model.ts`
- Create: `src/shared/shop-card/mappers.ts`
- Create: `src/shared/profile-card/UnifiedEntityInfoCard.tsx`
- Create: `src/shared/profile-card/UnifiedEntityInfoCard.test.tsx`
- Create: `src/shared/profile-card/SpecialReviewIconRow.tsx`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.tsx`
- Modify: `src/shared/profile-card/UnifiedSimpleProfileCard.tsx`
- Modify: `src/shared/profile-card/UnifiedProfileCard.tsx`
- Modify: `src/shared/info-card/ShopInfoCard.tsx`
- Modify: `src/shared/info-card/TechnicianInfoCard.tsx`
- Modify: `src/shared/info-card/UserInfoCard.tsx`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/components.tsx`
- Modify: `backend/src/domain/im-contact-card.ts`
- Modify: `backend/src/repositories/im-contact-card-send.transaction.ts`
- Modify: `src/shared/service-card/service-card-usage.test.ts`
- Test: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Create: `src/shared/shop-card/UnifiedShopInfoCard.test.tsx`

**Interfaces:**
- `UnifiedServiceInfoCard` no longer accepts `variant`.
- Every entity kind uses the same outer frame, visual split, typography, chip, action, and responsive primitives.
- Service and shop cards consume formal engagement state and invoke the shared destination sheet.
- Shop cards show rating/address and never render duration/price overlays.
- Technician cards show rating/completed orders/distance/favorite/share, languages, and fixed special-review icons with overlapping count badges.
- User cards omit the entire metrics rail and show only portrait, name, introduction, and languages.

- [ ] Replace current expectations with failing tests for the single metrics rail/split body, responsive classes, field order, service overlays, shop omissions/address, technician metrics/special-icon badges, user rail omission, action isolation, unavailable states, and no legacy variant.
- [ ] Run card/usage tests and verify they fail against the old two-body implementation.
- [ ] Implement the compact token system and one DOM composition per entity kind.
- [ ] Route every service usage and every shop/technician/user simplified-card and in-chat name-card branch through the new bodies; remove `variant="showcase"` and ignore the old layout variants at all reachable simple-card entry points.
- [ ] Extend the server-authored contact-card snapshot with the public technician/customer fields required by the unified renderer; keep private profile fields excluded.
- [ ] Render contact-card messages through `UnifiedEntityInfoCard` instead of the legacy inline IM card.
- [ ] Connect favorite/share controls without nesting buttons or links and rerun card/usage tests to green.

### Task 6: Integrate current location and “我的收藏”

**Files:**
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/UserFavoritesPage.tsx`
- Modify: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `src/features/entity-engagement/api.ts`
- Modify: `src/state/homeLocationStore.ts`

**Interfaces:**
- Home/search queries pass the already-approved current origin to formal core-read endpoints.
- “我的收藏” has entity and chat-record tabs; entity rows are returned fully projected by the engagement API.

- [ ] Add failing tests for origin propagation, service favorite visibility, shop/service card rendering, pagination, removal rollback, and retained chat-record favorites.
- [ ] Run page tests and verify entity favorites are not currently rendered.
- [ ] Pass current location without requesting location from individual cards.
- [ ] Add the entity-favorite tab using formal projections and the same unified cards.
- [ ] Rerun page tests to green.

### Task 7: Full local verification, commit, merge, and main re-verification

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`
- Review: all files changed in Tasks 1–6.

**Interfaces:**
- Produces one reviewable local commit series and a local-main merge commit/fast-forward.

- [ ] Run focused frontend and backend suites, then `npm run lint`, `npm test`, `npm run build`, and required backend test/build commands.
- [ ] Scan changed files for `TODO|FIXME|not implemented`, hard-coded ports/secrets, duplicate simplified-card/name-card bodies, and stale showcase/nearby/list/compact/share visual branches reachable from simple-card entries.
- [ ] If browser verification is needed, prove an alternate port is free, start only on that port, check wide/440/320 layouts and formal flows, then stop only that alternate-port process.
- [ ] Review the full diff and commit all batch changes on `codex/unified-service-store-cards`.
- [ ] Confirm the original main worktree has no conflicting uncommitted files, merge the branch into local `main`, and rerun the required verification from main without operating 5180.
- [ ] Delete only the merged feature worktree/branch after proving no uncommitted or unmerged content remains; leave every unrelated worktree untouched.
