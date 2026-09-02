# Exchange budget and target adjustment verification

Date: 2026-09-02 JST

## Delivered boundary

Selective Exchange matching now keeps the existing exact-selection path and adds a two-command confirmation flow when the publisher selects fewer providers than the effective target, exceeds the effective total JPY budget, or does both.

- The first command returns HTTP 409 with server-calculated exact values and writes nothing.
- The second command must echo the exact target and/or budget confirmation with the same selected claims and expected version.
- The final transaction writes adjustment events in `BUDGET_INCREASED`, `TARGET_REDUCED`, `SELECTIVE_MATCHED` order when both apply.
- Quick matching, manual close, cancellation, Booking conversion, payment, publication-fee settlement, and external money movement remain outside this slice.

## Automated evidence

Focused frontend and shared HTTP client:

```text
npm test -- <Exchange, HTTP client, and mobile-route suites>
13 files passed; 114 tests passed
```

Production frontend build:

```text
npm run lint
npm run verify:production-build
Lint passed; TypeScript/Vite production build and bundle audit passed for 8 HTML entries and 35 assets
```

Backend type/lint and checker contract:

```text
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test -- --runInBand <matching, claim, schema, OpenAPI, and flow suites>
12 suites passed; 144 tests passed
```

## Real MySQL rollback evidence

Command:

```text
ENV_FILE=<local backend env> npm --prefix backend run check:exchange-selective-matching-flow
```

The checker accepted only local MySQL and reported the database name `needo_dev`. Its marker-owned fixture ran inside one outer rollback transaction. The verified result was:

```json
{
  "matchingStatus": "MATCHED",
  "selectedCount": 2,
  "selectedQuoteTotalJpy": 23000,
  "selectedAndLoserNotifications": 3,
  "adjustmentPreviewWriteFree": true,
  "budgetIncreasedEvent": true,
  "targetReducedEvent": true,
  "adjustmentChainVersionLinked": true,
  "matchedParticipantPrivacy": true,
  "losingProviderPrivacy": true,
  "idempotentReplay": true,
  "idempotencyConflictRejected": true,
  "walletAndHoldUnchanged": true,
  "bookingAndFinancialCountsUnchanged": true,
  "cleanupVerified": true
}
```

Target-only, budget-only, and combined confirmation branches are independently covered by service/repository/UI tests; the physical transaction checker exercises the combined branch so both adjustment writes and their ordering are proven together.

## Authenticated browser acceptance

The current feature worktree was served by its own frontend and formal backend processes. Listener PID, working directory, branch, frontend proxy target, `/health`, and `/ready` were checked before acceptance. A uniquely marked local `needo_dev` demand with three formal claims was opened through an authenticated customer session.

- At both `440×956` and `320×956`, selecting two providers showed `2/3` and a selected quote total of `¥23,000` without horizontal overflow.
- The first submit displayed the server-supplied confirmation card with target `3 → 2`, effective budget `¥20,000 → ¥23,000`, and increase `¥3,000`.
- A direct database snapshot after that preview remained at `OPEN`, version `4`, with zero participants, audits, notifications, bookings, wallet holds, and request financial rows; all three schedule slots remained available with `bookedCount=0`.
- The explicit confirmation completed the match. A full reload preserved target `2`, effective budget `¥23,000`, two matched providers, and one unselected provider. No Booking or payment action was exposed.
- The committed rows formed the event chain `BUDGET_INCREASED` (`4→5`), `TARGET_REDUCED` (`5→6`), and `SELECTIVE_MATCHED` (`6→7`), with three provider notifications and one audit. Booking, schedule occupancy, wallet hold, and request-financial counts remained unchanged.
- A second pass in the extension-free in-app browser reproduced the persisted result with zero console errors. Temporary fixture rows were then removed by exact captured IDs and marker, and residue verification returned zero.

## Financial interpretation

`effectiveBudgetMaxJpy` is a matching ceiling, not wallet value. Increasing it does not top up, freeze, capture, release, reconcile, or settle NDP/TEST_NDP. The existing publication hold and wallet balances remain unchanged. Target reduction likewise changes only the matching aggregate. No `BookingOrder`, payment, ledger, reconciliation, or `ScheduleSlot.bookedCount` mutation belongs to this slice.
