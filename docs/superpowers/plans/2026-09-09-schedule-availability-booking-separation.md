# Schedule Availability And Booking Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate technician availability, real booking occupancy, personal calendar events, and shop schedule control while restoring formal schedule creation and synchronized technician automation switches.

**Architecture:** Keep `Availability` as the willingness/control window and `BookingOrder` as occupancy. Add an identity-owned `CalendarEvent` aggregate for non-booking events, expose focused formal APIs, and adapt the existing `UnifiedUserCalendar` instead of introducing another calendar UI. All overlap and impact decisions remain server-authoritative and transactional.

**Tech Stack:** React 18, TypeScript, Vite, Express, Zod, Prisma/MySQL, Vitest, Jest/Supertest.

## Global Constraints

- Preserve all existing schedules and test data; do not run destructive cleanup or backfills.
- Work only on `codex/schedule-availability-booking-separation` until local verification succeeds.
- Do not operate port 5180; any browser runtime uses a verified-free 5181 or 5182.
- Do not push, deploy, or mutate staging/production.
- Availability and booking occupancy remain independent; a booking never trims an Availability.
- Only overlapping active Booking orders produce the red conflict treatment.
- Reuse formal Booking, affiliation, automation, notification, audit, and calendar components.

---

### Task 1: Add synchronized automation switches to the on-duty status card

**Files:**
- Create: `src/features/technician-schedule/TechnicianAutomationQuickSwitches.tsx`
- Create: `src/features/technician-schedule/TechnicianAutomationQuickSwitches.test.tsx`
- Modify: `src/features/technician-work-status/WorkStatusControls.tsx`
- Modify: `src/features/technician-work-status/WorkStatusControls.test.tsx`
- Modify: `src/features/technician-work-status/i18n.ts`

**Interfaces:**
- Consumes: `automationApi.getSetting(kind)` and `automationApi.updateSetting(kind, { enabled, expectedVersion, rules })`.
- Produces: `TechnicianAutomationQuickSwitches` with independent Booking and Request switch states backed by the existing server settings.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(container.querySelector('[role="switch"][aria-label="自动接单"]')).not.toBeNull();
expect(automationApi.updateSetting).toHaveBeenCalledWith("booking", {
  enabled: true,
  expectedVersion: 4,
  rules: bookingSetting.rules
});
```

Cover loading/error/entitlement behavior and assert `WorkStatusControls` renders the switches only after the formal status is `on_duty`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --run src/features/technician-schedule/TechnicianAutomationQuickSwitches.test.tsx src/features/technician-work-status/WorkStatusControls.test.tsx`

Expected: FAIL because the quick-switch component and on-duty controls do not exist.

- [ ] **Step 3: Implement the shared quick switches**

```tsx
const saved = await automationApi.updateSetting(kind, {
  enabled: nextEnabled,
  expectedVersion: current.version,
  rules: current.rules
});
setSettings((value) => ({ ...value, [kind]: saved }));
```

Render real `role="switch"` buttons, preserve the existing rules payload, replace state only with the returned server version, and expose a retry action without optimistic fake success.

- [ ] **Step 4: Integrate under the synchronized on-duty state**

```tsx
{snapshot?.status === "on_duty" ? <TechnicianAutomationQuickSwitches /> : null}
```

Keep the two switches side-by-side in the existing elevated status summary area.

- [ ] **Step 5: Run focused tests and commit**

Run the Step 2 command; expected PASS.

Commit: `feat: sync technician automation switches with work status`

### Task 2: Add formal identity-owned non-booking calendar events

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260909090000_formal_calendar_events/migration.sql`
- Create: `backend/src/validators/calendar-event.validator.ts`
- Create: `backend/src/repositories/calendar-event.repository.ts`
- Create: `backend/src/services/calendar-event.service.ts`
- Create: `backend/src/controllers/calendar-event.controller.ts`
- Create: `backend/src/routes/calendar-event.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/calendar-event.service.test.ts`
- Create: `backend/tests/calendar-event.routes.test.ts`

**Interfaces:**
- Produces: paginated `GET /api/v1/calendar-events`, idempotent `POST`, versioned `PATCH`, and soft-delete `DELETE /api/v1/calendar-events/:id` scoped to the active identity.
- Calendar event type is `PERSONAL`; fields include owner identity, title, time range, all-day flag, reminder, repeat rule, location, URL, note, visibility, timestamps, and soft delete.

- [ ] **Step 1: Write failing service and route tests**

```ts
await expect(service.update(otherIdentity, eventId, input)).rejects.toMatchObject({ statusCode: 404 });
expect(await repository.list({ ownerIdentityId, from, to })).toMatchObject({ total: 1 });
```

Cover identity isolation, pagination, range overlap reads, idempotent create, optimistic version conflicts, validation, audit, and soft deletion.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/calendar-event.service.test.ts tests/calendar-event.routes.test.ts --runInBand`

Expected: FAIL because the CalendarEvent domain and routes are absent.

- [ ] **Step 3: Add schema and migration**

```prisma
model CalendarEvent {
  id              Int       @id @default(autoincrement())
  ownerIdentityId Int       @map("owner_identity_id")
  title           String    @db.VarChar(200)
  startsAt        DateTime  @map("starts_at")
  endsAt          DateTime  @map("ends_at")
  version         Int       @default(1)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")
}
```

Add the remaining specified fields, identity foreign key, indexes for owner/range/deleted state, and an idempotency record or unique owner key following existing repository patterns.

- [ ] **Step 4: Implement route/controller/service/repository layers**

Use Zod for every input, `AuthenticatedAccessContext.identityId` for ownership, audit every mutation, return the standard API envelope, and never accept an owner identity from the client.

- [ ] **Step 5: Generate Prisma client, run tests, and commit**

Run: `npm --prefix backend run prisma:generate`

Run the Step 2 command; expected PASS.

Commit: `feat: add formal personal calendar events`

### Task 3: Make Availability the independent schedule-control window

**Files:**
- Create: `backend/src/validators/availability-window.validator.ts`
- Create: `backend/src/services/availability-window.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/booking.service.test.ts`
- Modify: `backend/tests/booking.repository.integration.test.ts`

**Interfaces:**
- Produces formal Availability window list/create/update/delete and impact-preview behavior for technician and merchant actors.
- `TECHNICIAN` windows are free schedule; `SHOP` windows are shop-controlled schedule.

- [ ] **Step 1: Write failing domain and repository tests**

```ts
expect(await createFreeAvailability(overlappingConfirmedBooking)).toMatchObject({ outcome: "ok" });
expect(await createShopAvailability(overlappingOtherShopWindow)).toBe("shop_control_conflict");
```

Also assert a Booking never changes Availability timestamps/active state and a free window overlapping a shop-control window is rejected with the controlling shop projection.

- [ ] **Step 2: Verify RED**

Run the focused Booking service tests and guarded local repository integration test. Expected: the current confirmed-booking and same-source overlap checks fail the new assertions.

- [ ] **Step 3: Implement transactional control-window rules**

Lock the technician profile before overlap checks. Permit Availability/Booking overlap. Enforce cross-shop `SHOP` window uniqueness and prohibit overlapping free-window creation when a shop controls the time.

- [ ] **Step 4: Add impact preview and confirmed execution**

Return affected future `CONFIRMED`/`IN_SERVICE` bookings before update/delete. Require an exact impact token and explicit confirmation before applying the window change and reuse the existing Booking cancellation transition for bookings that lose their scheduling basis.

- [ ] **Step 5: Verify and commit**

Expected: service and repository integration tests PASS without deleting existing fixtures.

Commit: `feat: separate availability windows from booking occupancy`

### Task 4: Correct automation eligibility to use availability plus occupancy

**Files:**
- Modify: `backend/src/repositories/technician-automation.repository.ts`
- Modify: `backend/src/domain/technician-automation-rules.ts`
- Modify: `backend/tests/technician-automation.repository.integration.test.ts`
- Modify: `backend/tests/technician-automation-rules.test.ts`

**Interfaces:**
- Consumes independent Availability containment, technician work status, and active Booking overlap.
- Produces explicit decision evidence for `schedule:available`, `attendance:on_duty`, and `schedule:no_buffered_booking_conflict`.

- [ ] **Step 1: Write failing eligibility tests**

```ts
expect(context.actualScheduleAvailable).toBe(true);
expect(context.hasBufferedConflict).toBe(true);
expect(result.failedReasons).toContain("schedule:booking_conflict");
```

Cover Booking and Request: Availability remains present while an overlapping booking blocks only the new automatic action.

- [ ] **Step 2: Verify RED**

Run the two focused automation suites; expected FAIL because Request candidates currently derive availability from ScheduleSlot and Booking lacks on-duty evidence.

- [ ] **Step 3: Implement corrected candidate loading and rule evidence**

Query active Availability that fully contains the requested service range, read formal work status, and query active Booking overlap separately. Do not subtract or mutate windows.

- [ ] **Step 4: Verify and commit**

Run focused unit/integration suites; expected PASS.

Commit: `fix: evaluate automation against availability and occupancy separately`

### Task 5: Project schedule sources and booking-only conflicts into the shared calendar

**Files:**
- Modify: `backend/src/repositories/technician-shop-affiliation.repository.ts`
- Modify: `backend/src/services/technician-shop-affiliation.service.ts`
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/features/technician-schedule/formal-schedule-presentation.ts`
- Modify: `src/components/scheduling/UnifiedUserCalendar.formal.test.tsx`
- Modify: `src/features/technician-schedule/formal-schedule-presentation.test.ts`
- Modify: `backend/tests/technician-shop-affiliation.repository.integration.test.ts`

**Interfaces:**
- Produces distinct calendar events for shop schedule, free schedule, bookings, and personal events.
- Produces `bookingConflict=true` only for active Booking events that overlap another active Booking.

- [ ] **Step 1: Write failing projection tests**

Assert an 18:00–24:00 Availability remains intact beside a 20:00–21:30 Booking, no red conflict appears for that pair, and two overlapping active Booking events both receive conflict treatment.

- [ ] **Step 2: Verify RED**

Run the three focused suites; expected FAIL because shared availability is currently subtracted by busy ranges.

- [ ] **Step 3: Remove range subtraction and add typed conflict calculation**

Return full Availability ranges, source labels, and privacy-safe locked store windows. Calculate interval overlaps only within the active Booking collection.

- [ ] **Step 4: Verify and commit**

Expected focused suites PASS.

Commit: `fix: preserve schedule windows and mark booking conflicts`

### Task 6: Restore formal user and technician schedule creation

**Files:**
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.formal.test.tsx`
- Modify: `src/pages/user/UserSchedulePage.tsx`
- Modify: `src/pages/user/UserSchedulePage.test.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Create: `src/features/calendar/api.ts`

**Interfaces:**
- User: FAB and timeline drag/click create formal CalendarEvent.
- Technician: the same editor plus mutually exclusive “可排班｜手动预约”; both off creates CalendarEvent.
- Technician schedule uses the same single-owner calendar layout as user schedule.

- [ ] **Step 1: Write failing UI tests**

Assert user formal mode exposes `新增行程`, drag-to-create opens the editor, technician controls are absent for users, technician controls are mutually exclusive, and the technician workspace no longer passes `displayMode="parallel"`.

- [ ] **Step 2: Verify RED**

Run the focused calendar/page/workspace tests; expected FAIL because `formalOnly` disables creation.

- [ ] **Step 3: Add formal mutation adapters and editor modes**

Replace formal-mode browser storage writes with the CalendarEvent/Availability/Booking APIs. A manual booking requires a real customer participant and valid technician service; incomplete input is blocked with an exact message.

- [ ] **Step 4: Remove status timeline and align the FAB**

Delete only the `ContactEventTimelinePanel` rendering/data fetch from the schedule workspace. Render the shared `FloatingActionButton position="standard"` used by the home appointment affordance.

- [ ] **Step 5: Verify and commit**

Expected focused UI suites PASS.

Commit: `feat: restore formal schedule creation across user and technician calendars`

### Task 7: Complete manual booking and store-schedule impact workflows

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `backend/tests/booking.service.test.ts`
- Modify: `backend/tests/booking.routes.test.ts`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`

**Interfaces:**
- Produces technician-authorized manual Booking creation by reusing the existing Booking aggregate and status machine.
- Produces preview/confirm tokens for store schedule edits and cancellations.

- [ ] **Step 1: Write failing route/service tests**

Cover exact customer/service ownership, no active Booking overlap, idempotency replay, Booking status/history/notification/audit creation, and impact-token mismatch rejection.

- [ ] **Step 2: Verify RED**

Run focused Booking tests; expected FAIL because technician manual creation and impact confirmation do not exist.

- [ ] **Step 3: Implement the minimal formal commands**

Create the one-off slot and Booking atomically through the existing Booking repository boundary, then use existing transition helpers for any confirmed cancellation caused by a confirmed store-schedule change.

- [ ] **Step 4: Implement the two red warning dialogs**

Render store-impact warning when there are no confirmed bookings; render the stronger rating/cancellation warning with affected order links when bookings are affected.

- [ ] **Step 5: Verify and commit**

Expected focused backend/frontend suites PASS.

Commit: `feat: connect manual appointments and schedule impact confirmation`

### Task 8: Full local verification, integration, and safe cleanup

**Files:**
- Modify: `docs/order-state-machine.md`
- Modify: `docs/api.md`
- Modify: `docs/qa/2026-09-09-schedule-availability-booking-separation.md`

**Interfaces:**
- Produces final local evidence and documentation.

- [ ] **Step 1: Apply migration only to an explicitly local database**

Verify `DATABASE_URL` host/database and environment guard before any write. Run Prisma migration and guarded integration tests without deleting user/test schedules.

- [ ] **Step 2: Run static and automated verification**

Run frontend focused/full tests, backend focused/full tests, frontend typecheck, backend lint/build, and formal frontend build. Record any unrelated baseline failure separately.

Run the business matrix in at least three independent rounds:

1. Domain round: boundary times, adjacent ranges, full/partial containment, shop/free sources, personal events, every active/inactive Booking status, two and three-way Booking overlap, buffer values, attendance states, entitlement states, and every Booking/Request automation rule enabled alone and in representative AND combinations.
2. Transaction round: duplicate requests, stale versions, concurrent shop-control attempts, concurrent Booking acceptance, automatic Booking/manual Booking races, automatic Request application retries, cancellation impact confirmation, audit/notification idempotency, and rollback on injected failure.
3. Lifecycle round: create schedule → create appointment → accept/auto-accept → start service → complete service → checkout/payment → user, technician, merchant, and operations reads all agree on status, amounts, schedule occupancy, history, audit, notification, and payment evidence.
4. Pricing and settlement round: repeat representative store-priced and technician-priced orders across the supported revenue-share ratios; verify catalog/checkout price snapshots, technician income, shop income, platform income, settlement ledger entries, cancellations/refunds, and user/technician/merchant/operations projections all reconcile exactly.

- [ ] **Step 3: Run browser acceptance on a safe port**

Check 5181, then start only the necessary local service with a temporary CLI/env override. Verify user creation, technician creation modes, source labels, conflict styling, store warnings, FAB position, and on-duty automation synchronization. Stop only the process started for this task.

Repeat the highest-risk browser paths after a clean reload and after switching away and back to the relevant identity/page so server persistence, not component memory, is proven.

- [ ] **Step 4: Commit documentation and merge locally**

Commit final evidence, verify clean feature branch, merge into local `main`, rerun the agreed main verification, and delete only this fully merged branch/worktree. Never push.

After the local-main merge, rerun the lifecycle smoke, automation-rule matrix smoke, pricing/settlement reconciliation smoke, focused calendar UI suites, typecheck, and build before reporting completion.
