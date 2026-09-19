# Request automatic claim — local regression evidence

## Scope and behavior

Fix the existing Step 10/13 Request automation path. A published eligible Request creates one formal claim through `ExchangeClaimService`; the customer still selects providers. Automatic claims do not match the Request, create a BookingOrder, reserve booked capacity, or charge service payment. No API contract, schema, migration, permission, or frontend behavior was added.

The reported staging example was used as reproduction input only. This work does not establish a staging diagnosis or staging acceptance; all execution targets were local.

## Reproduced causes and changes

- The first slot was selected before rule evaluation. An obsolete pricing-mode slot, a full slot, or an unselected service could hide a later valid slot. Selection now checks current shop pricing, service ownership, remaining capacity, and actual rules first.
- Active affiliations with a future end date were incorrectly excluded. Active keys and validity dates now use the same current-affiliation boundary as formal claims.
- A fixed 200-row limit could hide eligible candidates. Cursor paging now reads every page with stable time/ID ordering.
- Booking, active claim, and active matched-participant conflicts now reuse the formal claim repository checks. A conflicting earlier window no longer hides a later free window.
- Failed Request actions can atomically reclaim the existing `ACTION_FAILED` decision with compare-and-set. Concurrent attempts still have one decision key and one formal claim. Booking decision behavior is unchanged.
- Customer history is loaded once per technician and occupancy once per technician/window. Independent review verified 201 same-window candidates use one history query and one query for each of three occupancy sources.

## Branch verification

All fixtures used loopback MySQL `127.0.0.1:3307` and a separate Redis on `127.0.0.1:6392`. The integration test requires an explicit local ENV_FILE, a database named `needo_request_auto_test_*`, and verifies `SELECT DATABASE()` before writes. It removes only its own records.

```bash
# Run from backend; ENV_FILE must point to the guarded scratch database.
RUN_REQUEST_AUTOMATION_INTEGRATION=true ENV_FILE=/absolute/local/scratch.env \
  npx jest --runInBand tests/technician-request-automation.integration.test.ts
npm run lint
npm run build
npx tsc --noEmit --rootDir ..
```

- 23 real MySQL tests passed. Red-to-green evidence covers stale pricing/service selection, future affiliation expiry, full earlier slots, the 200-row boundary, failed-action retry, and another Request occupying the earlier slot.
- The matrix also covers lead/window/service/price/customer/contact/service-mode mismatches, offline/no availability/inactive affiliation/disabled settings/inactive identity, duplicate concurrent triggers, unique decision/claim/event/notification, and unchanged manual matching/payment boundaries.
- 14 related suites / 150 tests passed: automation settings/processor/rules/wiring/affiliation/API, claim service/repository/routes, matching service/repository, and booking conversion service/repository.
- Frontend lint/typecheck and production build passed. Backend lint, production build, and full typecheck with `--rootDir ..` passed. Bare backend `tsc --noEmit` encounters existing cross-root imports in the system-settings backfill; widening the check root verifies them without changing configuration.
- Existing `check:technician-order-automation` passed against the isolated database: Booking auto-accept, Request auto-apply in both pricing modes, manual fallback, repeat-trigger idempotency, and zero-shop blocking. Its broader multishop-settlement preparation reached the existing `error.order.service_end_too_early` gate; that full settlement checker is not claimed as passed.
- Independent read-only review completed; both findings were fixed and re-reviewed.

## Formal HTTP and browser evidence

Development runtime: current development worktree, frontend 5192 → backend 3213, isolated migrated/seeded `needo_request_auto_test_20260920_2b42_flow` database. Test preparation bound the seeded technician verification and public administrative region; the scratch migration fee timestamps were made effective in UTC. Application validation was not bypassed.

- Real login/switch-identity, availability and slot creation, settings updates, then Request publication generated post 2 / claim 1 / slot 17 for technician 44 and shop 11, quoted at JPY 8,800.
- Customer claim list, technician `claims/mine`, and operations detail agreed. Replaying the publication key returned the same post and one claim; unauthenticated claims access returned 401; exactly one automatic-action notification persisted.
- Browser on 5192 displayed the claim as awaiting customer selection, with no automatic matching. The customer explicitly selected the provider and confirmed booking, producing order 3 (`ND202609192314574196`) in pending state.
- Customer, technician, merchant, and operations authenticated HTTP reads succeeded for that order. Database reconciliation found one consumed slot capacity, a cleared temporary matching reservation, and zero service financial records.

## Integration boundary

Local main and 5180 verification must follow the committed branch merge. The task final report records their actual result separately from the branch evidence above. No push, PR, deployment, SSH, staging, production, or remote database operations are part of this batch.

Existing limits: Request processing is publication-triggered and notifications remain best effort. This change adds no polling scheduler or notification-delivery retry. A failed business action may retry when the existing publication event is replayed; it does not schedule its own retry.
