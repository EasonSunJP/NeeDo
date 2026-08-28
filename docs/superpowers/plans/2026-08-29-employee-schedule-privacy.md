# Employee Schedule Privacy Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task in the isolated `codex/employee-schedule-privacy` worktree.

**Goal:** Add a real employee-schedule view to the merchant employee detail card, backed by formal APIs, while enforcing exclusive/partner affiliations and cross-store privacy at the server boundary.

**Architecture:** Extend the existing technician-shop affiliation module with a read-only, NeeDoID-scoped schedule projection. Reuse `ScheduleCycleCalendarBoard` through a formal-data override instead of building a new calendar. Add source/visibility metadata to availability records so only technician-published availability can be shared with affiliated shops. Add a transaction-serialized confirmation guard so overlapping bookings in different shops cannot both become confirmed.

**Tech Stack:** React 18, TypeScript, Vite, Express, Zod, Prisma/MySQL, Jest/Supertest, Vitest.

---

## Task 1: Specify the formal projection and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829150000_employee_schedule_privacy/migration.sql`
- Test: `backend/tests/employee-schedule-privacy-migration.test.ts`

1. Write a failing migration contract test requiring availability `source_type` and `visibility` columns plus composite overlap indexes.
2. Add Prisma enums and fields with backwards-safe defaults: existing rows remain `shop` + `shop_only`.
3. Add indexes for employee schedule range projection and confirmed-booking overlap checks.
4. Run the focused migration contract test and `prisma validate`.

## Task 2: Add the NeeDoID-scoped employee schedule API

**Files:**
- Modify: `backend/src/services/technician-shop-affiliation.service.ts`
- Modify: `backend/src/repositories/technician-shop-affiliation.repository.ts`
- Modify: `backend/src/controllers/technician-shop-affiliation.controller.ts`
- Modify: `backend/src/validators/technician-shop-affiliation.validator.ts`
- Modify: `backend/src/routes/technician-shop-affiliation.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/technician-shop-affiliation.service.test.ts`
- Test: `backend/tests/technician-shop-affiliation-api.test.ts`
- Test: `backend/tests/backoffice-profile-detail-openapi.test.ts`

1. Write failing service tests for shop scoping, canonical technician NeeDoID resolution, partner public availability, own-shop detail, and gray redacted other-shop confirmed/in-service blocks.
2. Define a strict discriminated event projection. Redacted events expose only start/end, generic title, status/visibility, and non-interactive flags.
3. Resolve the active affiliation for the authenticated shop before querying. Return the same safe 404 for an invalid/out-of-shop employee.
4. Query own-shop slots/orders, technician-published affiliated availability, and other-shop confirmed/in-service orders. Merge overlapping redacted ranges before serialization.
5. Add `GET /api/v1/merchant-admin/employees/{needoId}/schedule` with strict ISO range validation, a 93-day maximum, the existing employee read permission, audit logging, and OpenAPI documentation.
6. Run focused service/API/OpenAPI tests.

## Task 3: Enforce affiliation-aware planning and atomic confirmation locks

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Test: `backend/tests/schedule-service.test.ts`
- Test: `backend/tests/booking-service.test.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`

1. Write failing tests proving merchant schedule targets require an active affiliation and partner plans may overlap only across different shops.
2. Mark merchant-created availability `shop/shop_only` and technician-created availability `technician/affiliated_shops`.
3. Preserve customer overlap protection but stop treating another shop's pending booking as a technician hard lock.
4. Before creating or moving a shop plan, reject any overlap with a confirmed/in-service booking for that technician.
5. Add a guarded transition result. On pending-to-confirmed, lock the technician row, re-check global confirmed/in-service overlaps, and return a non-leaking conflict outcome before any settlement or status mutation.
6. Map the conflict to `409 error.schedule.conflict` in the service and run focused booking/schedule tests.

## Task 4: Add the formal frontend adapter and employee-card schedule section

**Files:**
- Modify: `src/features/merchant-admin/employeeApi.ts`
- Create: `src/components/merchant-admin/EmployeeSchedulePanel.tsx`
- Create: `src/components/merchant-admin/EmployeeSchedulePanel.test.tsx`
- Modify: `src/components/scheduling/ScheduleCycleCalendarBoard.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/i18n/translations.ts`

1. Write failing API and component tests for the employee schedule endpoint, exact cross-store generic copy, disabled redacted interaction, loading/error/retry, and day/week/month navigation.
2. Add typed API projection definitions keyed by canonical NeeDoID.
3. Add an optional formal-data override to `ScheduleCycleCalendarBoard`; keep all existing dispatch-center callers unchanged.
4. Build `EmployeeSchedulePanel` to load the visible date window, adapt formal events into the shared calendar/grid types, and keep `busy_redacted` gray and non-clickable.
5. Insert the section into the employee detail card using the current merchant blue/black token system and existing spacing/radius conventions. Do not add a second calendar implementation.
6. Add all user-visible copy to existing i18n and run focused Vitest suites.

## Task 5: Verify and accept the microstep

**Files:**
- Modify if required: `docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md`
- Modify if required: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

1. Run backend lint/typecheck, the focused backend suites, then the broader booking/affiliation suites.
2. Run frontend focused tests and production verification build.
3. Back up the local development database, apply the single additive migration, regenerate Prisma Client, and restart the formal backend after dependency readiness is confirmed.
4. Browser-accept the employee card on the merchant portal: current-shop detail renders; partner availability renders; another shop's confirmed range renders gray with only the generic title; pending/cancelled/completed records do not create a current hard lock; reload preserves the result.
5. Inspect the network response to confirm redacted events contain no shop, customer, service, order, price, address, notes, participant, or source event identifier.
6. Remove worktree-only dependency symlinks, review the diff for mock/TODO/hard-coded leakage, commit the microstep, and merge locally without pushing or deploying.
