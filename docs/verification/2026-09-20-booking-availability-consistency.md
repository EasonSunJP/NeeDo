# Availability / Booking consistency — local Step 10 correction

Branch: `codex/booking-availability-consistency`, based on `c8dc0cab`.

## Evidence and cause

The supplied staging incident (shop 11, technician 22, service 201, slot 49019 rejected with `409 error.booking.slot_unavailable`, next-day slot 49020 accepted) is a reproduction lead. No staging endpoint, database, configuration or other remote resource was accessed. The specific historical order/reservation that caused 49019 to fail remains unverified.

The local implementation exposed a deterministic mismatch: `listAvailableSlots` used stored slot status/capacity but `createBooking` additionally checked server time, customer overlap (including black-member pending orders), technician confirmed/in-service orders on other slots, active Exchange reservations, current affiliation and pricing mode. Those conditions were absent or incomplete in the public read. Ordinary-customer pending replacement also made a full slot bookable for its owner while the read hid it.

Before production changes, four real-MySQL conflict tests failed on the expected public result after the real Booking service rejected the same slot; a fifth owner-pending test failed because a replaceable slot was absent. Separate regression tests then reproduced expired affiliation, changed pricing mode, and a stale pending capacity counter. No write-side check was relaxed.

## Implementation

- The optional authenticated viewer is resolved by the existing middleware. Only identities accepted by direct customer Booking supply a customer ID to the repository; the query string cannot select another customer.
- Availability checks current orders and reservations with parameterized, correlated SQL before pagination. It shares the existing active/hard-lock status constants with Booking and preserves strict half-open overlap boundaries. Same-slot technician orders continue to use slot capacity; another slot's pending order is not a technician hard lock.
- Ordinary pending replacement excludes Exchange-linked orders exactly as Booking does. Returned `bookedCount` deducts releasable own pending capacity for this viewer only; stored counters and merchant/technician management inventory are unchanged. An inconsistent counter that cannot release all superseded pending orders fails closed for that customer.
- Service publication, technician visibility/public identity, shop public identity, shop pricing mode and current shop affiliation remain required. Old/unbookable service relations are not silently rebound or repaired.
- Occupancy, rows and total use one `RepeatableRead` transaction. The endpoint already sends `Cache-Control: no-store`; no persisted availability projection or cache is added. Subsequent reads observe cancellation, completion, reservation release and slot changes directly.
- `includeUnavailable=true` returns conflicts as `blocked` and full slots as unavailable. Checkout, shop/service detail and technician schedule already consume this same endpoint and disable/filter slots using status plus capacity. Their management calendar/control-window APIs keep their existing semantics.
- Booking's owner locks, customer lock, conditional capacity update, transaction retry, idempotency and write-side conflict checks are unchanged. A read does not reserve inventory; a later concurrent change can still validly cause a Booking conflict.

No new endpoint, schema, migration, frontend implementation, financial rule or data-repair command was added.

## Verification

Run the database suite from `backend/` with an explicit local environment:

```bash
RUN_BOOKING_AVAILABILITY_INTEGRATION=true ENV_FILE=/absolute/path/to/local/backend/.env.dev \
  npm test -- --runTestsByPath tests/booking-availability.integration.test.ts
```

The suite rejects staging/production environments and non-loopback MySQL hosts before connection. Sequential condition tests run inside a forced-rollback fixture. The snapshot test uses two actual MySQL connections with a ReadCommitted client default, preserves the production RepeatableRead override, changes only a uniquely created test slot, and removes its exact fixture rows in `finally`, then asserts absence. It proves stable page/total during a concurrent capacity change and fresh results on the next request. It is not a concurrent Booking load test.

Coverage includes technician-service, merchant-service and technician-only queries; customer isolation; next-day successful Booking; Exchange reservations; already-started slots; pending replacement and stale counters; black membership; capacity 2; cancelled/completed/pending/deleted orders; adjacency; affiliation expiry; pricing changes; pagination and dual-connection snapshot consistency.

Verified locally on 2026-09-20:

- Real MySQL suite: 18/18, including the two-connection snapshot case.
- Focused backend regression: 15 suites / 189 tests, covering repository/service/API, schedule maintenance/preload, Booking source/location contracts, pending replacement and technician automation.
- Frontend regression: 8 files / 121 tests, covering the booking API/window loader, availability grouping, checkout round trips, technician schedule and shop/service detail.
- Backend `npm run lint` and `npm run build`; frontend `npm run lint` (typecheck) and `npm run build`: passed. Vite reports dependency comment-annotation warnings from Zod; no build error.
- Independent read-only review of the final SQL, scope, snapshot test and cleanup: no outstanding findings.

Dependencies were installed offline in this worktree. Prisma Client was generated from this checkout's schema, without applying migrations. HTTP tests use Supertest's temporary local ports, not a running shared service.

## Boundaries

- No merge into local main, push, PR, deployment, remote change or 5180 operation.
- No staging incident attribution or staging acceptance claim; no browser/device acceptance or concurrent Booking load claim.
- Existing corrupted occupancy is hidden when it prevents replacement, not rewritten. Any historical data repair requires separate evidence and authorization.
- The commit and worktree are retained for review. Rollback is a revert of this local commit; there is no migration to reverse.
