# Technician Schedule Formal Cutover Design

Date: 2026-08-28  
Status: Approved approach, written-spec review pending  
Repository: `/Users/eason/Documents/New project`

## 1. Purpose

Retire browser-owned schedule truth from the authenticated technician schedule routes. A technician must create, read, update, block, restore, and delete only the `ScheduleSlot` rows owned by the active technician identity through `/api/v1/`. Refreshing the browser, signing in again, or restarting the frontend/backend must show the same MySQL records.

This is the second isolated frontend slice in the approved future-six-month operations design. The authenticated customer schedule and public technician availability slice is already complete. Merchant schedule and dispatch remain a third, separate slice.

## 2. Current State

The authenticated technician portal already renders `FormalScheduleInventoryPanel`, which uses the protected technician schedule list/create/update/delete APIs. However, the dedicated routes below still read and mutate `technicianScheduleStore`, `entityStore`, generated events, and browser-local transfer records:

- `/technician/schedule/new`
- `/technician/schedule/events/:eventId`
- `/technician/schedule/events/:eventId/edit`
- `/technician/schedule/shifts/:shiftId/transfer`
- `/technician/orders/:orderId`

The existing backend exposes identity-scoped list/create/update/delete endpoints, but it lacks an identity-scoped single-slot read endpoint. The browser therefore cannot safely open a numeric schedule detail route without either loading an arbitrary window or consulting local state.

## 3. Selected Approach

Implement the smallest complete formal route chain:

1. Add `GET /api/v1/technician/schedule/slots/:id`.
2. Resolve the slot exclusively from the authenticated `technician_profile` identity.
3. Replace the dedicated technician route module with API-backed new/detail/edit pages using numeric `ScheduleSlot.id` values.
4. Link formal inventory rows to numeric detail and edit routes.
5. Replace the technician order-detail route with `bookingApi.getOrder()` and the existing formal order transition APIs.
6. Replace the browser-only transfer workflow with an explicit unavailable capability page until a formal transfer state machine exists.
7. Add permanent tests that prevent the accepted formal route module from importing browser business stores or localStorage.

Rejected alternatives:

- Redirect every detail and edit route back to the inventory list. This avoids fake data but removes expected schedule-management capability.
- Build schedule feedback, multi-shop transfer, invitations, approval, notification, and reassignment in this slice. Those require new domain tables and state machines and would violate the one-micro-step rule.

## 4. Scope

### 4.1 Included

- Identity-scoped single-slot backend read.
- Formal technician slot creation from an active, bookable `TechnicianService`.
- Numeric slot detail and edit routes.
- Numeric technician order detail with persisted status history and existing formal state transitions.
- Formal block/restore/delete actions using existing backend mutations.
- Visible loading, empty/not-found, permission, conflict, booked/in-use, and retry states.
- Browser acceptance with an existing technician test account and the reconciled future-six-month database.
- Removal of the browser schedule store from the accepted technician route module.

### 4.2 Excluded

- Merchant scheduling and dispatch-center cutover.
- Technician-to-technician shift transfer.
- Store scheduling policies, templates, feedback collection, auto-confirm, waitlists, or smart scheduling.
- Personal notes, IM invitations, travel, break, leave-request approval, and arbitrary calendar events.
- New schedule tables or migrations.
- New test accounts, shops, services, technicians, or public identifiers.

## 5. Backend Contract

### 5.1 Endpoint

`GET /api/v1/technician/schedule/slots/:id`

- Authentication: required.
- Permission: `schedule:slots:list`.
- Params: existing positive-integer ID schema.
- Scope: derived only from `currentIdentity.scopeType=technician_profile` and `currentIdentity.scopeId`.
- Success: the existing `ScheduleSlotPayload` envelope.
- Not found: `404 error.schedule.slot_not_found` for a missing, deleted, or other-technician slot.
- Forbidden: the existing identity-forbidden response when the active identity is not a technician profile.

The endpoint must not accept `technicianProfileId`, `shopId`, or `userId` from the client.

### 5.2 Repository and Service

Add a repository read shaped as:

```ts
type ScheduleSlotReadInput = ScheduleScope & { id: number };

findScheduleSlotById(input: ScheduleSlotReadInput): Promise<ScheduleSlotPayload | null>;
```

For technician scope, the Prisma predicate must include:

```ts
{
  id: input.id,
  technicianProfileId: input.technicianProfileId,
  deletedAt: null
}
```

The service derives the schedule scope, calls the repository, and maps `null` to the safe not-found response. Controller and route layers only parse input and return the standard response envelope. OpenAPI must document the endpoint and its authenticated ownership boundary.

No audit write is required for this read. Existing create/update/delete audit actions remain mandatory and unchanged.

## 6. Frontend Architecture

### 6.1 Formal Resource Layer

Extend `schedulingApi` with the technician-only detail method:

```ts
getTechnicianSlot(id: number): Promise<BookingScheduleSlot>;
```

Create a focused technician schedule resource hook that:

- validates a numeric route ID;
- loads the active technician profile and shop from formal Auth/Core Read data;
- loads the slot through `schedulingApi.getTechnicianSlot(id)`;
- exposes loading, data, not-found/error, and retry state;
- never falls back to `technicianScheduleStore`, `entityStore`, or array index zero.

### 6.2 Route Pages

Rewrite `src/features/technician-schedule/route-pages.tsx` as the formal route module. It must not import the old technician schedule store.

`TechnicianScheduleEditorRoutePage`:

- New mode loads active, bookable technician services from the authenticated technician's formal shop relationship.
- Edit mode loads the numeric slot first and pre-fills its service, date, start/end time, capacity, and status.
- Save calls `createSlot` or `updateSlot` and navigates to `/technician/schedule/events/:slotId` using the persisted numeric ID.
- Invalid time, past time, capacity, permission, overlap, and in-use errors remain visible and do not create local success state.
- The time-range UI reuses the established schedule draft range interaction and 15-minute snapping; it does not render one fake button per empty hour.

`TechnicianScheduleDetailRoutePage`:

- Shows only the fetched formal slot: service, shop, technician, local date/time, duration, capacity, booked count, and status.
- Allows edit, block/restore, and two-step delete only when the backend permits them.
- A successful mutation reloads or navigates using the persisted numeric slot.
- Missing or other-technician IDs show the same not-found state.

`TechnicianScheduleTransferRoutePage`:

- Shows a formal capability-unavailable state explaining that shift transfer is not yet connected to a server-side approval workflow.
- Performs no mutation and creates no browser record.
- Provides navigation back to the technician schedule.

`TechnicianOrderDetailRoutePage`:

- Parses a positive numeric `orderId` and reads only `bookingApi.getOrder(orderId)`.
- Renders the persisted order number, service, shop, technician, customer reference, appointment time, payment state, price, note, and complete status history.
- Reuses the existing formal confirm/start/complete/cancel endpoints and their server-authoritative transition rules.
- Uses two-step confirmation for cancellation and reloads the returned persisted order after every successful action.
- Invalid, missing, or other-technician order IDs show the same safe not-found state and never consult `orders`, `entityStore`, or the technician schedule store.

### 6.3 Inventory Integration

`FormalScheduleInventoryPanel` remains the main authenticated schedule inventory. Technician rows gain a detail action that uses the numeric slot ID. Its create, block/restore, and delete operations continue using the same formal API and reload from the server after success.

The panel must exhaust all pages in its bounded window instead of silently rendering only the first 100 rows. It may reuse the existing bounded window-loader pattern; the backend remains paginated.

## 7. Data and Error Flow

```text
active technician identity
  -> Core Read technician/shop
  -> protected technician schedule API
  -> BookingService derives technicianProfileId
  -> BookingRepository filters ScheduleSlot by identity + deletedAt
  -> MySQL ScheduleSlot / Availability
  -> standard API envelope
  -> explicit loading / data / empty / error UI
```

Rules:

- API failure never falls back to static schedules or browser state.
- A missing service relationship blocks creation with a real empty state.
- `40911` remains the overlap/conflict message.
- `40912` remains the booked/in-use message.
- `401` requests re-authentication; `403` reports insufficient identity permission; `404` reports unavailable schedule data.
- Delete remains a two-step confirmation and uses the existing soft-delete transaction.

## 8. Security and Consistency

- Only the active technician identity determines ownership.
- A route ID never grants access by itself.
- The frontend must not send a technician profile ID on technician-scoped writes.
- Existing service/shop/technician relationship checks remain server authoritative.
- Existing overlap, duration, capacity, suspension, booked-count, and audit rules remain unchanged.
- No new localStorage key, mock dataset, placeholder account, or generated schedule event is allowed.

## 9. Testing

### 9.1 Backend

- Repository test: own slot returns; another technician's slot returns `null`; soft-deleted slot returns `null`.
- Service test: active technician identity is derived; wrong identity is forbidden; `null` maps to safe not-found.
- API test: authenticated numeric detail succeeds; cross-technician read returns 404; malformed ID returns 400; missing permission returns 403.
- OpenAPI test: route, bearer security, path parameter, success schema, and error responses are documented.

### 9.2 Frontend

- API serialization test for `getSlot`.
- Resource-hook tests for loading, success, retry, and failure without fallback.
- Editor tests for formal service loading, persisted create/update, conflict, in-use, and invalid input.
- Detail tests for formal rendering, retry, block/restore, two-step delete, and cross-scope not-found.
- Technician order-detail tests for formal fetch, complete status history, state transitions, retry, two-step cancellation, and safe not-found.
- Inventory pagination and numeric navigation tests.
- Transfer capability-gate test proving no store mutation.
- Mock-retirement guard rejecting `technicianScheduleStore`, `entityStore`, `shiftPlanningStore`, dispatch store, and localStorage in the formal route module.

All behavior changes use red-green-refactor TDD.

## 10. Acceptance

Use an existing seeded technician account whose `s##########` identity has future slots in `needo_dev`.

Acceptance requires:

1. Future six-month and historical database checkers return `status: "ok"`.
2. The schedule list, numeric detail, and edit page show the same persisted slot ID and time.
3. A numeric technician order route renders the same persisted order and status history shown by the formal order API.
4. Creating a slot writes MySQL and is visible after refresh and re-login.
5. Editing/blocking/restoring writes MySQL and survives frontend/backend restart.
6. Booked slots reject modification/deletion without local UI drift.
7. Another technician's numeric slot or order ID returns the safe not-found state.
8. With the backend unavailable, pages show retryable errors and no fake schedules or orders.
9. The transfer route creates no browser or database record.
10. Focused and full Jest/Vitest tests, lint, backend build, formal production build, and bundle audit pass.

## 11. Rollback

The change is additive at the API layer and does not add a migration. Rolling back the code removes the single-slot read endpoint and restores the previous route bundle. Persisted slots created during acceptance must use uniquely identified test times and be removed only through the formal delete API after evidence is captured. No bulk database deletion is part of rollback.
