# Technician Automation Prepayment Threshold Design

## Goal

Add a real prepayment threshold to both technician automation settings:

- **接单设置** accepts a Booking automatically only when the customer has confirmed enough service prepayment.
- **抢单设置** applies to a Request automatically only when the Request has confirmed enough service prepayment.
- The control sits at the bottom of the existing **订单属性** card, after project types.
- Turning the switch off means a minimum of `0%`; turning it on requires an integer from `10` through `100`.

For a JPY 10,000 order and a `30%` rule, automatic action requires at least JPY 3,000 of confirmed service prepayment. The server calculates the required amount as:

```text
requiredPrepaymentJpy = ceil(baseAmountJpy * minimumPrepaymentPercent / 100)
```

All money values are integer JPY. Decimal percentages, `1–9`, negative values, and values above `100` are invalid.

## Confirmed product decisions

### One authoritative setting value

The rules JSON gains `minimumPrepaymentPercent`. It is either `0` or an integer from `10` through `100`. There is no separately persisted Boolean because it could disagree with the percentage.

The UI derives the switch from `minimumPrepaymentPercent > 0`:

- off saves `0`;
- switching on from `0` initializes the field to `10`;
- while on, the field accepts ASCII digits only and uses `inputMode="numeric"` and `step="1"`;
- save remains disabled while the value is empty, fractional, below `10`, or above `100`.

The API repeats the validation at the trust boundary using a strict Zod union of literal `0` and integer `10–100`. Existing settings are migrated to `0`, so both Booking and Request remain backward compatible and do not begin requiring payment unexpectedly.

### What counts as prepayment

Only an authoritative service-payment record with a confirmed, unreversed amount counts. The following never count:

- the Request publication or dispatch fee;
- a technician performance deposit;
- a client-supplied `paid` flag or amount;
- pending, released, refunded, or refund-pending funds;
- coupons, promotional credit, or an unconfirmed offline-payment claim.

NDP prepayment uses the formal wallet hold and ledger authorities. Card, bank-transfer, or other payment methods qualify only after their existing server-side confirmation authority has produced confirmed payment evidence. This change does not invent a successful external-card response.

## User flows

### Technician settings

Both settings pages render the same control at the bottom of **订单属性**:

1. `需要预付` switch.
2. When enabled, an inline integer field labelled `最低预付比例` followed by `%以上`.
3. Supporting copy explains that the percentage is calculated against the order amount and controls only automatic accept/apply.

The Booking and Request settings remain independent. A technician can require `30%` for automatic Booking acceptance and `50%` for automatic Request application.

### Booking creation and automatic acceptance

A Booking is for a known technician. The booking preview reads that technician's active Booking automation rule version and returns the service-prepayment requirement. If the threshold is `0`, the existing creation flow is unchanged. If it is positive, the customer is shown the exact minimum JPY amount and must complete formal prepayment before the automatic-accept processor can accept the Booking.

The Booking base amount is the immutable order price snapshot at creation, `BookingOrder.priceAmount`. Later add-ons do not retroactively change the original automatic-accept decision. A confirmed amount greater than the minimum also qualifies.

Booking creation and NDP prepayment use one idempotent transaction: create the pending Booking and its price snapshots, create the service-prepayment record, and create the wallet hold and ledger evidence. Insufficient NDP rolls back that transaction. An external payment method may leave the Booking and prepayment in a pending state until its existing server callback confirms the funds; it must not auto-accept before confirmation. Every successful confirmation invokes the existing automation processor, whose decision key prevents duplicate acceptance.

The server re-reads the active technician rule during creation and automation. If a preview is stale because the technician changed the percentage, creation returns the current requirement instead of trusting the preview.

### Request publication and automatic application

A Request has no selected technician, so the publisher chooses whether to add service prepayment and, when enabled, an integer percentage from `10` through `100`. The publication preview shows the exact JPY amount. The server calculates and freezes it when the Request is published.

The prepayment base is the Request's maximum service budget:

- `total` budget mode: `budgetMaxJpy`;
- `per_provider` budget mode: `budgetMaxJpy * targetProviderCount`.

The Request publication fee remains a separate financial record and wallet hold. The automation evaluator compares the confirmed service-prepayment percentage against each technician's Request threshold. Automatic application still creates an application only; it does not select providers or finalize a deal.

When matching produces Booking orders, the allocatable amount is the smaller of the held service prepayment and the selected quote total. It is allocated across selected orders in proportion to their accepted quote amounts. The largest-remainder method preserves that exact allocatable total and gives deterministic integer-JPY allocations. Unallocated funds remain attached to the Request until matching closes, then release. Withdrawal, expiry, cancellation, or failed publication releases the corresponding service-prepayment hold through the ledger authority. The threshold controls the automatic-application decision at publication time; it does not turn provider selection into an automatic deal or add a new matching top-up gate. Client arithmetic is never trusted.

## Data model and financial authority

Add a `ServicePrepayment` record that represents service money independently from platform fees. It contains:

- one subject: `bookingOrderId` or `exchangePostId`, enforced by a database check;
- the snapshotted base amount, selected percentage, and calculated JPY amount;
- payment method and status;
- optional wallet-hold or external-confirmation reference;
- confirmed, captured, released, refund-pending, and refunded timestamps as applicable;
- idempotency key, request fingerprint, creator identity, audit timestamps, and soft-delete timestamp.

There is at most one active service-prepayment aggregate per Booking or Request. Its immutable financial events remain in the existing wallet/ledger history.

`WalletHold.exchangePostId` changes from a single-column unique constraint to an index because a Request can have both a publication-fee hold and a service-prepayment hold. Uniqueness is enforced by the financial owner records and idempotency keys. Existing publication-finance repository reads add the publication fee type to their lookup so they cannot select the service hold.

Request-to-Booking conversion writes the allocated amount to each Booking's service-prepayment record and links the allocation to the original Request prepayment. It does not mark the Booking's final service payment as fully paid unless the allocation covers the full price. Checkout and refund authorities consume the service-prepayment aggregate instead of treating it as a second balance.

Every create, confirm, allocate, capture, release, and refund transition writes an audit event with actor, identity, subject, amount, prior state, next state, and idempotency key.

## Automation evaluation

`TechnicianAutomationEvaluationContext` gains:

- `prepaidServiceAmountJpy`;
- `prepaymentConfirmed`;
- `prepaymentBaseAmountJpy`.

The evaluator adds one condition:

```text
minimumPrepaymentPercent == 0
OR
(
  prepaymentConfirmed
  AND prepaidServiceAmountJpy >= ceil(prepaymentBaseAmountJpy * minimumPrepaymentPercent / 100)
)
```

A match records `payment:prepayment_minimum`. Failures use stable reasons:

- `payment:prepayment_unconfirmed` when evidence is absent or non-final;
- `payment:prepayment_too_low` when confirmed funds are below the minimum.

The Booking candidate obtains the base and amount from the order and its service-prepayment aggregate. The Request candidate obtains them from the demand snapshot and Request service-prepayment aggregate. Missing or inconsistent evidence fails safe to manual handling; it never rejects or cancels the underlying Booking or Request.

The processor revalidates the payment evidence immediately before the existing Booking-confirm or Request-apply authority runs. This closes the race where funds are released or refunded after the candidate projection but before the automatic action.

## API changes

The existing technician settings endpoints add `rules.minimumPrepaymentPercent` to GET and PUT schemas, OpenAPI, examples, and audit snapshots.

Booking preview/create responses add a `servicePrepayment` projection containing the server-calculated base, required percentage, required amount, confirmed amount, method, and status. Booking create accepts only the payment method, idempotency key, and provider-specific payment token/reference needed by an existing formal payment authority; the server owns all amount calculations.

Request preview/create accepts `servicePrepaymentPercent` as `0` or integer `10–100` and returns the calculated JPY amount plus any NDP conversion snapshot. Publication commits the post, publication fee, and service prepayment atomically; insufficient balance or payment failure rolls back the publication.

Read APIs expose the service-prepayment status needed by order and Request detail screens without exposing provider secrets or raw payment tokens. All mutation routes require existing authentication plus the appropriate Booking, Exchange, wallet, and audit permissions.

## Error handling and concurrency

- Reused idempotency keys with a different percentage, amount basis, payment method, or subject return the standard idempotency conflict.
- Concurrent payment confirmations lock the prepayment aggregate and wallet balance; only one transition wins.
- A version conflict while saving automation settings keeps the unsaved form and asks the user to reload current settings.
- A failed payment or released/refunded prepayment produces manual automation handling and an auditable decision reason.
- Request withdrawal/expiry and Booking cancellation call the same service-prepayment release/refund authority, so no route can silently strand a hold.
- Server calculations use integer arithmetic and reject non-JPY base amounts until a formal currency-conversion rule exists.

## Testing and acceptance

Implementation follows RED-first tests and verifies:

- validator/default/migration behavior for `0`, `10`, `30`, `100`, and rejection of blanks, decimals, `1–9`, negatives, and values above `100`;
- both settings panels place the switch at the bottom of **订单属性**, show/hide the input, persist independently, and render translated copy;
- JPY rounding, including values that produce a fractional yen;
- Booking and Request pass at exactly the threshold and above it, and remain manual one yen below it;
- unconfirmed/refunded/released money and Request publication fees never satisfy the rule;
- NDP hold creation, rollback, idempotency, concurrency, audit, cancellation release, refund, and Request-to-Booking allocation;
- a later valid payment can trigger one automatic action, while retries cannot duplicate acceptance or application;
- OpenAPI, RBAC, Prisma validation, backend tests, frontend tests, lint, and production builds.

After implementation, verify the final integrated `main` state on port `5180` with authenticated UI flows for both settings and representative Booking/Request threshold cases. Push the verified main revision, deploy that exact revision to staging, confirm deployment metadata and readiness, repeat authenticated staging checks, and only then clean merged branches and unused worktrees.

## Scope boundaries

This change adds the service-prepayment funding and lifecycle needed for the automation rule. It does not add a new card processor, change technician performance-deposit rules, auto-select Request providers, or change the final service settlement percentage. Existing Booking/Request state machines, matching authority, wallet ledger, refund authority, and audit infrastructure remain authoritative.

## Acceptance criteria

1. Both technician settings contain the control at the requested location and save `0` or an integer `10–100`.
2. A JPY 10,000 Booking with a `30%` rule auto-accepts with at least JPY 3,000 confirmed service prepayment and remains pending/manual below that amount.
3. A Request auto-applies only for technicians whose configured threshold is met by its confirmed service prepayment; the publication fee never counts.
4. Turning the setting off allows `0%` and preserves all other automation conditions.
5. All payment evidence, release/refund behavior, RBAC, audit, idempotency, and API validation are server-authoritative.
6. Recurring-calendar behavior and all previously passing Booking, Request, wallet, and scheduling behavior remain green after integration.
