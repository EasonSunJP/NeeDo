# Technician Group Booking Implementation Plan

> **For agentic workers:** Use the test-driven-development skill for each task. Work inline in this worktree; the user limited concurrent tasks. Steps use checkbox syntax for tracking.

**Goal:** Make technician-backed group reservations real, atomic, membership-gated, and independently cancellable per guest assignment.

**Architecture:** Extend the existing booking route, service, repository, order and slot model. A group record joins ordinary booking orders. Keep order finance, cancellation and status history per order. The current calendar and checkout select and submit the server-authoritative assignments.

**Tech Stack:** React 19, TypeScript, Zod, Express, Prisma/MySQL, Jest, Vitest.

## Global constraints

- Start from `f31fdcab` on `codex/technician-group-booking`; do not touch staging data.
- Support both active shop and technician pricing modes where a technician is selected.
- Never display an enabled multi-guest submit path before the group endpoint and cancellation projection work.
- No push, deployment, remote migration, or integration into main.

---

### Task 1: Validate group input

**Files:** `backend/src/validators/booking.validator.ts`, `backend/tests/booking-validator.test.ts`.

- [ ] Add failing cases for one to ten guests, at least one assignment per guest, at most ten distinct technicians, duplicate technician, duplicate slot, missing service, mixed catalog selectors, and invalid guest labels.
- [ ] Run `npm --prefix backend test -- --runTestsByPath tests/booking-validator.test.ts`; confirm each new case fails for the intended reason.
- [ ] Add a strict `bookingGroupCreateBodySchema`: `shopId` positive; `startsAt` ISO with offset; `guests` length 1–10; each `assignments` length 1–10; each assignment has `technicianProfileId`, one of `serviceIds` or `technicianServiceIds`, ordered `scheduleSlotIds` of equal length, and nonnegative integer `expectedPriceAmountJpy`; `paymentMethod` existing enum; `note` max 500. Cross-check distinct technicians and slots across the whole group.
- [ ] Re-run the focused test and commit the tested change.

### Task 2: Persist group links

**Files:** `backend/prisma/schema.prisma`, new `backend/prisma/migrations/<timestamp>_booking_groups/migration.sql`, `backend/tests/booking-group-schema.test.ts`.

- [ ] Write a failing schema/migration contract test for `BookingGroup`, `BookingGroupGuest`, nullable `BookingOrder.bookingGroupGuestId`, indexes, and foreign keys.
- [ ] Add only those relations and the additive SQL migration. Extend `BookingOrderServiceItem` with nullable `serviceId` for shop-priced service items while retaining existing technician service rows and exactly-one-source enforcement.
- [ ] Generate Prisma Client, validate schema, run the contract test and backend build; commit.

### Task 3: Atomic group transaction

**Files:** `backend/src/repositories/booking.repository.ts`, `backend/tests/booking-group.repository.integration.test.ts`.

- [ ] Add local-db regression tests for active platform tier/adjustment, service and shop ownership, same start, full occupied range including buffers, cross-order conflicts, conditional capacity, stale price, second-guest failure rollback, concurrent request serialization, replay and changed-payload conflict.
- [ ] Reuse the existing slot materialization, owner locks, service-location, nomination, compensation, order service-item and status-history functions inside one transaction. Lock owner ids in sorted order. Keep one order per guest/technician assignment and reserve each service slot once.
- [ ] Check the active entitlement or tier adjustment under the transaction; ordinary tiers allow one guest. Re-read all mutable availability and price facts after locks. Return the whole group projection only after commit.
- [ ] Run the focused local-db test and existing booking integration tests; commit.

### Task 4: Route, service, projections, and order lifecycle

**Files:** `backend/src/services/booking.service.ts`, `backend/src/controllers/booking.controller.ts`, `backend/src/routes/booking.routes.ts`, `backend/src/api/openapi.ts`, `backend/tests/booking-group-api.test.ts`.

- [ ] Write failing route tests for identity/RBAC, required idempotency key, unauthorized group reads, replay, and per-order cancellation leaving siblings active.
- [ ] Add `POST /bookings/groups` and `GET /bookings/groups/:id`. Return guest and assignment order ids, status, snapshots, amounts and aggregate total; derive current status from ordinary orders. Drive automation and notifications for each created order after commit.
- [ ] Reuse order cancel/refund behavior; expose group references on order projection. Run API, cancellation and finance regressions; commit.

### Task 5: Real calendar and checkout interaction

**Files:** `src/components/mobile/AvailabilityCalendar.tsx`, `src/pages/user/StoreDetailPage.tsx`, `src/pages/user/FormalCheckoutPage.tsx`, `src/features/booking/api.ts`, `src/pages/user/formal-checkout/i18n.ts`, focused `.test.tsx` files.

- [ ] Write failing tests that bound technician-backed people choices to active tier and distinct available technicians at one start, keep nontechnician stores unchanged, and submit every guest/assignment to the group API.
- [ ] Use the existing public pricing/availability APIs to select technician and primary/additional services per guest. Keep a single source of selection state; show one price per assignment and the total. Revalidate on submit and show stale-tier/slot/price errors.
- [ ] Add all five locale strings. Verify 320–375, 390–430, 768–1024, and desktop in a local browser; commit.

### Task 6: Final integrated verification

- [ ] Run focused backend tests, frontend tests, lint and builds, and the production build audit.
- [ ] Exercise a local black-diamond multi-guest booking, one guest cancellation, sibling preservation, and free-tier rejection against isolated local data.
- [ ] Review diff and status, report code commit(s), test results, browser/device gaps and rollback to the parent task.

### Task 7: Post-creation content revision (new requirement, not covered by assignment cancellation)

- [ ] Specify a versioned, idempotent replacement command for one group assignment that can change ordered services or technician while other guest orders remain intact. Define allowed order and payment states, user/provider authority, price-difference approval and rollback.
- [ ] Add failing isolated-database tests for stale version, concurrent edits, new technician/slot conflict, unchanged sibling orders, lower-price refund, higher-price payment, partial failure rollback and replay.
- [ ] Extend the existing booking transaction and ledger/audit paths to move old and new reservations atomically, refresh service and compensation snapshots, and record the financial difference. Do not use the merchant price/note edit endpoint as a substitute for changing booked services.
- [ ] Add an edit action on the group/order pages with a clear old/new preview, financial difference and confirmation. Verify desktop/mobile, five locales, protected provider views and final integrated state before claiming editable orders.
