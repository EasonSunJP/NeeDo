# Formal Schedule Login Preload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preload authorized merchant and technician schedules after login, show valid cached data immediately with a non-blocking 50% loading indicator, and reduce formal schedule query latency.

**Architecture:** A new authenticated account-scoped preload service resolves server-owned identity scopes and returns two bounded paginated resources without switching identity. A shared frontend schedule-window cache stores encrypted account data with a 24-hour display limit; login bootstrap and schedule pages share it. Existing schedule components, API permissions, and business-state distinctions remain unchanged.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Express, Zod, Jest/Supertest, Prisma/MySQL, IndexedDB Web Crypto cache.

## Global Constraints

- Work only on `codex/schedule-login-preload`; do not use or mutate port 5180 before local-main merge.
- Do not add mocks, fake API data, schema changes, migrations, or remote operations.
- Keep availability, bookings, calendar events, and schedule slots as separate formal business concepts.
- Reuse `ScheduleCycleCalendarBoard`, the current auth identity model, and `persistentResourceCache`.
- Cached data may display for at most 24 hours and must always revalidate in the background.
- The cached-data refresh indicator is centered, 50% opaque, and must not intercept pointer input.

---

### Task 1: Account-scoped schedule preload API

**Files:**
- Create: `backend/src/services/schedule-preload.service.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/schedule-preload.service.test.ts`
- Test: `backend/tests/schedule-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: `AuthRepositoryPort.findUserById`, `MerchantShopContextRepositoryPort`, `BookingRepositoryPort.listScheduleSlots`, `resolveMerchantShopScope`.
- Produces: `SchedulePreloadService.preload(actor, query)` and `GET /api/v1/schedule/preload` with optional `merchant` and `technician` paginated resources.

- [x] Write service tests proving account ownership, portal-permission gating, default merchant-shop resolution, parallel merchant/technician reads, and null resources for unavailable identities.
- [x] Run the focused Jest test and confirm it fails because the service and route do not exist.
- [x] Implement the service, strict Zod query, controller, route, dependency wiring, and OpenAPI contract.
- [x] Run service, API, and OpenAPI tests until they pass.

### Task 2: Shared cache lifecycle and schedule-window loader

**Files:**
- Create: `src/features/scheduling/formalScheduleWindowCache.ts`
- Create: `src/features/scheduling/formalScheduleWindowCache.test.ts`
- Modify: `src/features/scheduling/api.ts`
- Modify: `src/features/scheduling/window-loader.ts`
- Modify: `src/features/scheduling/window-loader.test.ts`
- Modify: `src/lib/persistentResourceCache.ts`
- Modify: `src/lib/persistentResourceCache.test.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.ts`

**Interfaces:**
- Produces: `readFormalScheduleWindow`, `refreshFormalScheduleWindow`, `writeFormalScheduleWindow`, `getFormalScheduleWindowCacheKey`, and `persistentResourceCache.clearScopePrefix`.
- Cache envelope: `{ fetchedAt: string; slots: BookingScheduleSlot[] }`.

- [x] Write failing tests for the 24-hour display limit, bounded parallel pagination, prefix deletion, and explicit-logout persistent deletion.
- [x] Run focused Vitest tests and verify the intended failures.
- [x] Implement the minimal cache and pagination changes.
- [x] Run focused tests until green.

### Task 3: Login bootstrap and non-blocking cached refresh UI

**Files:**
- Create: `src/features/scheduling/FormalSchedulePreloadBootstrap.tsx`
- Create: `src/features/scheduling/FormalSchedulePreloadBootstrap.test.tsx`
- Create: `src/components/scheduling/ScheduleCacheRefreshIndicator.tsx`
- Create: `src/components/scheduling/ScheduleCacheRefreshIndicator.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/dispatch-center/components/OverviewWorkspace.tsx`
- Modify: `src/features/dispatch-center/components/OverviewWorkspaceHeader.test.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Bootstrap consumes `AuthSession.allowedPortals` and `schedulingApi.preload` and writes current-cycle merchant/technician slot caches.
- Indicator is rendered conditionally by each schedule surface; it renders a centered 12-dot ring with `pointer-events-none`, `opacity: .5`, `role=status`, and reduced-motion behavior.

- [x] Write failing tests for identity-gated preload, deduplication, cached-first rendering, and non-blocking 50% indicator semantics.
- [x] Run focused tests and verify they fail for missing behavior.
- [x] Implement bootstrap, shared indicator, and cached-first schedule page integration without changing shared calendar business rules.
- [x] Run focused tests until green.

### Task 4: Query projection and integrated verification

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`
- Modify: `docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md`

**Interfaces:**
- `BookingRepository.listScheduleSlots` returns the unchanged `ScheduleSlotPayload` contract from a minimal Prisma projection.

- [x] Write a failing repository contract test that rejects the heavy shop service-location/admin-region include for list reads.
- [x] Implement the list-only projection and keep mutation/detail projections unchanged.
- [x] Run relevant frontend and backend tests, lint, typecheck, and formal build.
- [x] Start a non-5180 local frontend, prove its listener cwd, verify API/readiness, and verify the served indicator semantics; the existing browser session has only user-portal access, so merchant authentication is reserved for the post-merge 5180 check if available without entering credentials.
- [ ] Commit the complete batch, merge it into local `main`, verify the merged state, then prove the 5180 listener cwd/branch before final 5180 checks.
- [ ] Remove only the merged clean worktree and branch; do not touch unrelated worktrees or changes.
