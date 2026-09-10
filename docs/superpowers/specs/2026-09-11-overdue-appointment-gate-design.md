# Overdue Appointment Resolution Gate Design

**Date:** 2026-09-11

**Stage:** Step 10 fulfillment, Step 11 ledger/payroll, and Step 12 operations-settings microstep

## Goal and boundary

Add one operations setting labelled exactly `过期预约未处理门禁`. When enabled, a later service cannot start while the same customer or assigned technician has an earlier, expired, unresolved appointment. The check is server-side and transaction-time. It does not block booking creation. When disabled, existing start and booking flows remain unchanged while overdue appointments remain explicitly resolvable.

The existing `BookingOrder` aggregate is authoritative for both direct Booking orders and Request-converted orders. No parallel order, review, wallet, notification, or payroll system is introduced.

## Service-window and unresolved semantics

An appointment window has passed when:

- an `OrderServiceSession.expectedEndsAt` snapshot exists and is earlier than the transaction clock; or
- otherwise, the immutable `BookingOrder.endsAt` schedule snapshot is earlier than the transaction clock.

The candidate must also precede the later order (`candidate.startsAt < later.startsAt`) and be in one of the accepted, non-terminal fulfillment states: `CONFIRMED`, `IN_SERVICE`, `AWAITING_CHECKOUT`, or `AWAITING_PAYMENT_CONFIRMATION`. `PENDING` is not treated as a no-show because the provider has not accepted that booking; `COMPLETED` and `CANCELLED` are already terminal. A persisted overdue-resolution row makes the candidate resolved even if its remaining payment projection is still completing.

The scope predicate is `(same customerUserId) OR (same non-null technicianProfileId)`. It is intentionally cross-shop because the gate protects the person, but the error projection exposes only order ID/no., date/time, and snapshotted service name. Resolution authorization remains participant-based, so another shop cannot read or mutate the order.

## Setting authority

`PlatformSettingVersion.overdueAppointmentGateEnabled` is an immutable-version boolean mapped to `overdue_appointment_gate_enabled`, default `FALSE` for new and existing records. It extends the existing protected operations basic-settings read/write, optimistic version, platform/global identity check, RBAC and audit transaction. It is omitted from the public settings projection.

The operations basic tab renders the exact label and a five-language explanation. Saving publishes the next settings version and records `overdueAppointmentGateEnabled` in the changed-field audit metadata.

## Start-service transaction

After exact idempotency replay, participant/verification/state checks, and before any service-session or status write, `BookingRepository.startService` locks the active platform-setting row, evaluates the switch, and if enabled locks the earliest matching overdue order in deterministic order. The repository returns `overdue_appointment_blocked` with a narrow projection. `BookingService` maps it to a stable `409` envelope whose data is the projection.

Rejection creates no service session, status history, service event, work-status event, notification, ledger entry, or audit row. An exact replay of a previously successful start remains successful.

## Immutable resolution authority

`POST /api/v1/orders/:id/overdue-resolution` accepts a strict body with `resolution`, a 32–160 character idempotency key, and no client actor/shop/customer identifiers. Valid resolutions are `actually_completed`, `customer_no_show`, and `technician_no_show`. The route requires the new `order:overdue-resolution:create` permission. The service additionally requires the active customer participant or assigned technician participant.

`OrderOverdueResolution` is one immutable row per order with the resolution, resolving user and identity, request fingerprint, idempotency key, service/date snapshots, and timestamps. The transaction locks the order and any existing resolution. Exact replay returns the immutable result; reused keys with different semantics return the standard idempotency conflict; a competing first valid resolution returns the already-persisted result with `applied: false`.

- `actually_completed` reuses shared fulfillment transition helpers and required status history instead of directly assigning `COMPLETED`. A confirmed order records the normal start/end progression using the persisted appointment window, then enters normal checkout. If confirmed prepaid evidence already exists, the normal completion/settlement authority finalizes it.
- `customer_no_show` and `technician_no_show` transition the unresolved order to `CANCELLED` with a stable public reason and status-history row.
- The no-show transaction creates exactly one system-authored rating `0`: customer credit (`CUSTOMER`) for customer no-show, technician review (`TECHNICIAN`) for technician no-show. `OrderReview.reviewerUserId` is nullable only for `SYSTEM` authorship; a dedicated system source key and database uniqueness prevent duplicates. System reviews cannot be amended or deleted through ordinary/backoffice review paths. The audit record retains the resolving actor and links the system rating.
- The counterparty receives one transactional `SYSTEM` notification. Title/body identify the appointment date and snapshotted service and state that it was automatically cancelled because the customer or technician did not perform. The actor is the resolver; the review author remains the system.

## Prepaid finance and payroll

Prepaid means the booking has formal `paymentStatus = CONFIRMED`, a positive persisted `paymentAmountJpy`, and non-refunded payment evidence. No client claim can make a booking prepaid.

For prepaid no-show or prepaid actual completion, the transaction calls the existing ledger completion settlement with the persisted order type, holder/bearer snapshot and transaction client. The existing acceptance snapshot captures the configured booking platform fee (the current formal default is exactly `500 NDP`) once and preserves NDP/TEST_NDP currency separation. The resolution path does not award a new no-show customer reward.

The same transaction upserts order finance using the persisted service amount and `compensationBasisVersion` embedded at booking creation. Platform-collected payment is recorded only for a formal platform NDP payment; confirmed cash/bank/other remains offline-reported. The result becomes `ready_for_payroll`; payroll accepts a cancelled order only when it has an immutable prepaid no-show resolution. Historical technician/shop compensation rules are resolved by the saved basis version.

If there is no confirmed prepaid evidence, resolution creates no service-revenue amount, ledger settlement, or payroll source. Ratings, notification, history, resolution and audit still commit atomically.

## UI behavior

The customer and technician order-detail start actions recognize the stable blocked error payload and render a blocking prompt containing the overdue appointment date/time and service. The prompt provides the three resolution actions, preserves an idempotency key per semantic choice, displays an immutable result after either party wins, refreshes the order, and allows the later start to be retried. Generic network and validation failures keep existing behavior.

## Verification

RED-first coverage must prove setting default/version/RBAC/OpenAPI/audit/i18n; enabled/disabled start behavior; customer/technician and Booking/Request scope; expected-end fallback; all three resolutions; prepaid/non-prepaid behavior; exactly one 500 NDP capture from the snapshotted bearer; compensation-basis payroll projection; system rating type/zero/uniqueness/immutability; notification wording and recipient; idempotency/concurrency; cross-shop non-disclosure; and transaction rollback. A guarded local checker may write only to verified local non-production MySQL/Redis and must restore its baseline.

## Alternatives rejected

- A periodic worker would make the gate stale between scans and add a second source of truth.
- A service-layer preflight query would race with start/resolution transactions.
- A separate overdue-order table would duplicate BookingOrder state and break Request-conversion, finance, review and audit authority.
