# Exchange Selective Exact Matching Verification

**Date:** 2026-09-01  
**Worktree baseline:** `ef2a31e9`  
**Scope:** selective mode only; exact target count; selected total within the current effective budget.

## Delivered checkpoints

| Commit | Evidence boundary |
| --- | --- |
| `0596c14a` | Matching product and architecture design |
| `091bc3de` | Executable microstep plan |
| `6da9ad1a` | Matching schema, migration, permissions, grants, and backfill |
| `62f7d63a` | Layered matching API, exact selection transaction, idempotency, RBAC, Zod, OpenAPI, privacy, and audit |
| `cda11e32` | Participant time locks and existing lifecycle integration |
| `cffb3e7d` | Five-language exact-selection interface |
| `1a2b2e86` | Transactional selected/non-selected notifications |

No checkpoint was pushed, merged, or deployed.

## Local database migration evidence

The local `needo_dev` database was inspected before mutation. The three matching tables were absent; the old post/claim enum values were exact; all 21 non-deleted Demand records were valid for backfill; and the required owner roles existed. The migration SQL for `20260901232000_exchange_selective_exact_matching` was executed on its own because the checkout and database already had unrelated migration divergence.

Post-apply independent reconciliation found:

- 21 non-deleted Demand records, 21 matching aggregates, and 21 initial OPENED events;
- two matching permissions and six default role grants;
- 14 Restrict foreign keys, 11 CHECK constraints, and every required index;
- zero invalid matching/backfill rows;
- the migration recorded as applied only after the physical checks passed.

The migration is additive. No existing row was deleted and no unrelated pending migration was deployed. The database still has six unrelated checkout migrations pending and one database migration absent from this checkout; this verification does not reinterpret or repair that divergence.

## Automated contract and behavior evidence

The focused backend suites cover schema/migration SQL, validators, repository/service behavior, routes, OpenAPI, claim lifecycle integration, Request lifecycle integration, Booking conflict integration, privacy projection, notifications, and the real-flow checker contract. The focused frontend suites cover API normalization, selection rules, retry/idempotency behavior, stale refresh, matching inbox rendering, terminal Request rendering, matched-participant rendering, and route-level Exchange behavior.

Additional gates exercised during implementation:

- backend TypeScript production build;
- root TypeScript lint;
- root production build and bundle-budget verification;
- five-locale Exchange i18n completeness and leakage audit.

The repository-wide `i18n:audit` command retains an unrelated baseline import failure for missing `exports/features/order-performance/i18n`; the focused Exchange locale audit has zero missing keys and zero English/Korean/traditional-Chinese leakage.

## Real database flow evidence

`ENV_FILE=.env.dev npm run check:exchange-selective-matching-flow` invokes the real repository/service transaction against local MySQL with a marker-owned fixture inside a rollback-only outer transaction. Its accepted report is:

```text
databaseName needo_dev
matchingStatus MATCHED
selectedCount 1
selectedQuoteTotalJpy 11000
selectedAndLoserNotifications 2
matchedParticipantPrivacy true
losingProviderPrivacy true
idempotentReplay true
idempotencyConflictRejected true
walletAndHoldUnchanged true
bookingAndFinancialCountsUnchanged true
cleanupVerified true
```

The flow also verifies the active publication hold, wallet balances, ledger counts, reconciliation counts, Request-financial counts, Booking counts, and schedule `bookedCount` before and after matching. It does not charge, capture, release, refund, or create a Booking.

## Browser acceptance

Pending final local browser verification. This section must record the exact frontend/backend listener ownership, route, identity, network result, console result, terminal matched state, privacy projection, and narrow-viewport overflow check before completion is claimed.

## Explicitly deferred

- quick matching;
- budget increase and target reduction;
- manual matching close and half-fee settlement;
- bilateral cancellation after matching;
- Booking/order conversion, appointment creation, payment, wallet/ledger movement, and external payment-provider calls;
- push and deployment.
