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
npm test -- src/api/httpClient.test.ts src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx
3 files passed; 56 tests passed
```

Production frontend build:

```text
npm run build
TypeScript and Vite build passed
```

Backend type/lint and checker contract:

```text
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test -- --runInBand tests/exchange-matching-flow-script.test.ts
All passed
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

## Financial interpretation

`effectiveBudgetMaxJpy` is a matching ceiling, not wallet value. Increasing it does not top up, freeze, capture, release, reconcile, or settle NDP/TEST_NDP. The existing publication hold and wallet balances remain unchanged. Target reduction likewise changes only the matching aggregate. No `BookingOrder`, payment, ledger, reconciliation, or `ScheduleSlot.bookedCount` mutation belongs to this slice.
