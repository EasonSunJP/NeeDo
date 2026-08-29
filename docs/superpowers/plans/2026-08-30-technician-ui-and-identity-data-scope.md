# Technician UI and Identity Data Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved technician UI on formal APIs and isolate profile, contacts, social, IM, schedules, and Exchange ownership by active identity, with customer and affiliate sharing one canonical personal data scope.

**Architecture:** `UserIdentity` remains the identity authority. A backend `PersonalIdentityScopeResolver` maps customer and scout identities to the account's canonical customer identity and maps every other identity to itself; persisted IM/Social/Contact/Exchange ownership fields use this resolved identity. The restored technician presentation consumes only formal Schedule, Booking, core-read, and self-profile APIs.

**Tech Stack:** React, TypeScript, Vite, Express, Zod, Prisma, MySQL, Redis, Vitest, Jest, Supertest.

## Global Constraints

- Preserve `/api/v1`, JWT, RBAC, Zod, OpenAPI, audit, pagination, Prisma, and MySQL.
- Do not add or retain mock, demo, placeholder, localStorage business state, static fallback records, or fake-success mutations.
- Customer and affiliate share personal data; every other identity is isolated.
- Preserve all existing records and migration history; use only additive migrations and fail-closed backfill checks.
- Do not push, deploy, publish, or mutate production data.

---

### Task 1: Canonical personal identity scope

**Files:**
- Create: `backend/src/services/personal-identity-scope.service.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Test: `backend/tests/personal-identity-scope.service.test.ts`

**Interfaces:**
- Consumes: authenticated `{ userId, currentIdentityId, currentIdentityType }`.
- Produces: `resolve(actor): Promise<{ identityId: number; userId: number; identityType: string }>`.

- [ ] Write failing tests proving customer resolves to itself, scout resolves to the same account's customer identity, technician resolves to itself, merchant resolves to itself, inactive/deleted/cross-account identities fail.
- [ ] Run `npm test -- --runInBand tests/personal-identity-scope.service.test.ts` from `backend/` and confirm the failure is caused by the missing resolver.
- [ ] Implement repository lookup with `userId`, `isActive: true`, `deletedAt: null`; prefer the default customer identity when resolving scout.
- [ ] Run the focused test until green, then run `npm test -- --runInBand tests/auth.repository.test.ts tests/auth.test.ts`.
- [ ] Commit as `feat(identity): resolve canonical personal data scope`.

### Task 2: Persist identity ownership for Contacts and IM

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260830110000_personal_identity_scope/migration.sql`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/services/realtime-event.gateway.ts`
- Modify: `backend/src/services/redis-realtime-event.bus.ts`
- Test: `backend/tests/realtime-identity-scope.test.ts`
- Test: `backend/tests/realtime-api.test.ts`

**Interfaces:**
- Contact commands use `{ ownerIdentityId, contactIdentityId }` derived by the server.
- Conversation membership uses `{ conversationId, identityId }`; message sender includes `senderIdentityId`.

- [ ] Add failing tests: customer/scout see the same contacts and conversations; technician on the same account sees neither; a participant lookup with the wrong identity returns not found/forbidden; sender identity is server-derived.
- [ ] Run the focused tests and confirm RED against the current `auth.userId` implementation.
- [ ] Add nullable identity columns, backfill existing rows to each account's canonical customer/default identity, then enforce foreign keys, indexes, and identity-based unique constraints.
- [ ] Replace owner/list/member/sender checks in Repository and Service with resolved identity IDs while retaining user IDs only for account/public-profile joins.
- [ ] Key realtime subscription delivery by identity ID so switching identities cannot receive another identity's unread events.
- [ ] Run Prisma format/generate, focused tests, `tests/realtime-service.test.ts`, recall/reaction tests, and API tests.
- [ ] Commit as `feat(realtime): isolate contacts and conversations by identity`.

### Task 3: Persist identity ownership for Social and Notifications

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/migrations/20260830110000_personal_identity_scope/migration.sql`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Test: `backend/tests/social-identity-scope.test.ts`
- Test: `backend/tests/social-media-api.test.ts`

**Interfaces:**
- Posts use `authorIdentityId`; follows use `followerIdentityId/followingIdentityId`; notifications use `recipientIdentityId/actorIdentityId`.

- [ ] Add failing tests for customer/scout shared mine feed, technician isolation, identity-scoped follows, and identity-scoped unread notifications.
- [ ] Run focused tests and confirm they fail because repository predicates use user IDs.
- [ ] Extend the additive migration and update repository selects, unique constraints, visibility checks, notification writes, and unread counts to identity IDs.
- [ ] Preserve public author account/profile joins without exposing internal identity IDs in API payloads.
- [ ] Run focused Social, mention, update, follow, notification, and realtime API tests.
- [ ] Commit as `feat(social): isolate activity and notifications by identity`.

### Task 4: Share customer/affiliate profile, schedule, and needs

**Files:**
- Modify: `backend/src/services/customer-profile.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/migrations/20260830110000_personal_identity_scope/migration.sql`
- Test: `backend/tests/customer-affiliate-personal-data.test.ts`
- Test: `backend/tests/exchange.service.test.ts`
- Test: `backend/tests/booking-service.test.ts`

**Interfaces:**
- `CustomerProfileService` resolves scout to the same account's `CustomerProfile`.
- `ExchangePost.ownerIdentityId` is canonical ownership; `authorIdentityId` remains the actual publishing identity.

- [ ] Add failing tests proving scout can GET/PATCH the account's customer profile, customer/scout share customer orders/calendar, and customer/scout share private/mine Exchange demand ownership.
- [ ] Add failing tests proving technician and merchant identities on the same account cannot access customer personal profile, customer orders, or private demand ownership.
- [ ] Implement canonical profile resolution and Exchange owner identity predicates; keep Booking's existing customer-by-user plus technician/shop scope rules, adding explicit type guards where needed.
- [ ] Run focused customer-profile, Exchange, Booking, RBAC, and OpenAPI tests.
- [ ] Commit as `feat(identity): share customer affiliate personal data`.

### Task 5: Formal technician self-profile API

**Files:**
- Create: `backend/src/validators/technician-profile.validator.ts`
- Create: `backend/src/repositories/technician-profile.repository.ts`
- Create: `backend/src/services/technician-profile.service.ts`
- Create: `backend/src/controllers/technician-profile.controller.ts`
- Create: `backend/src/routes/technician-profile.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/technician-profile-api.test.ts`
- Create: `src/features/core-read/technicianProfileApi.ts`
- Create: `src/features/core-read/technicianProfileApi.test.ts`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`

**Interfaces:**
- `GET /api/v1/technician-profile/me` returns current technician profile only.
- `PATCH /api/v1/technician-profile/me` accepts validated public self-edit fields and writes audit action `technician_profile.self_update`.

- [ ] Write failing service/API tests for correct scope, cross-identity rejection, Zod errors, audit, safe response, and reload persistence.
- [ ] Implement Route → Controller → Service → Repository and OpenAPI; add the existing RBAC permission rather than a frontend role bypass.
- [ ] Write failing frontend tests proving save calls PATCH and no longer imports or invokes `updateTechnicianEntity`.
- [ ] Bind both technician profile editors to the formal client; keep failed drafts visible and display formal errors.
- [ ] Run focused backend and frontend tests.
- [ ] Commit as `feat(technician): persist self profile edits`.

### Task 6: Restore the approved technician schedule and order UI

**Files:**
- Create: `src/features/technician-schedule/formal-schedule-presentation.ts`
- Create: `src/features/technician-schedule/formal-schedule-presentation.test.ts`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`

**Interfaces:**
- `buildFormalTechnicianCalendar(slots, orders, selectedDate)` returns approved UI day/week/month items without browser state.
- Mutations call only `schedulingApi` and `bookingApi` and refresh the formal resource after success.

- [ ] Add failing source and render tests for day/week/month controls, summary cards, timeline/calendar surfaces, order status history, mobile header, and absence of `FormalRoutePage` simplified shell.
- [ ] Add failing tests that production imports contain none of `formalRuntimeFallbacks`, `entityStore`, `scheduleStore`, `shiftPlanningStore`, or `technicianScheduleStore`.
- [ ] Port the approved presentation from `stash@{0}` while replacing all Store-derived data with pure formal DTO mappings.
- [ ] Preserve formal loading/error/empty states, conflict errors, update/delete confirmation, route return targets, and theme tokens.
- [ ] Keep transfer as a truthful unavailable state until a persisted backend state machine exists; do not restore its mock success flow.
- [ ] Run the focused presentation, route, portal, schedule API, and order API tests.
- [ ] Commit as `fix(technician): restore approved formal portal UI`.

### Task 7: Delete simplified and mock production UI

**Files:**
- Modify: `src/data/mockRetirement.test.ts`
- Modify: `src/features/im/formal-pages.test.ts`
- Modify: `src/features/social/formal-pages.test.ts`
- Modify: `src/features/exchange/ExchangeFeedPage.test.tsx`
- Delete: only production files proven unreferenced by `rg` and the module graph.

**Interfaces:**
- One route maps to one full UI implementation; legacy compatibility may redirect but may not render alternate data/UI.

- [ ] Add failing static scans covering Technician, IM, Social, Exchange, profile, contacts, calendar, and needs production imports.
- [ ] Remove simplified components, mock environment switches, static fallback arrays, fake IDs, localStorage business persistence, and fake-success mutations from the reachable production graph.
- [ ] Use `rg` to prove deleted files have zero imports before deletion; preserve unrelated legacy modules still used outside the formal routes.
- [ ] Run all frontend tests and production bundle audit.
- [ ] Commit as `refactor(formal): remove simplified and mock identity UI`.

### Task 8: Full verification and browser acceptance

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-technician-ui-and-identity-data-scope.md` only to check completed boxes and record evidence.

**Interfaces:**
- Formal local frontend `5180`, backend `3000`, MySQL `3307`, Redis `6379`.

- [ ] Run `npm test`, `npm run lint`, `npm run verify:production-build`, and `npm run audit:production-bundle` at the root.
- [ ] Run `npm test -- --runInBand`, `npm run lint`, and `npm run build` in `backend/`.
- [ ] Run migration status plus a local-only dry-run/backfill checker; do not apply to production.
- [ ] Start `npm run dev` and verify `/api/v1/health`, `/api/v1/ready`, and frontend HTTP 200.
- [ ] With formal test accounts, verify customer ↔ affiliate shared data and customer ↔ technician/merchant isolation for all six personal domains.
- [ ] Verify desktop, 390px, and 440px technician routes; click day/week/month, detail, edit/save/reload, order state actions allowed by test data, contacts, chat, social, schedule, and Exchange.
- [ ] Record console errors, failed network calls, horizontal overflow, hidden panel state, and exact evidence. Fix failures through new red-green cycles.
- [ ] Run `git diff --check` and `git status --short`; report local branch/commit status separately from push/deployment.

