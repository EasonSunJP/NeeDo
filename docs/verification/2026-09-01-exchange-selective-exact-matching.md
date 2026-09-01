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
| `2792980a` | Rollback-only real MySQL flow checker and focused regression gate |
| `dae7d4e9` | Browser-discovered matched-owner reload readability fix |

No checkpoint was pushed or deployed. Local `main` integration is performed only after the acceptance gates in this document pass.

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

The browser run used an isolated current-worktree runtime rather than the already occupied standard ports:

- frontend `127.0.0.1:5181`, PID `38074`, cwd `/Users/eason/.codex/worktrees/3625/New project`;
- backend `127.0.0.1:3002`, PID `38075`, cwd `/Users/eason/.codex/worktrees/3625/New project/backend`;
- `/api/v1/health` and `/api/v1/ready` both returned `code: 0`; MySQL and Redis were ready;
- the generated Prisma client was refreshed before the run because the shared dependency runtime predated the matching schema.

Using formal local test identities against Request `62`:

1. Technician `s7325776482` submitted a real `JPY 15,000` claim for schedule slot `80724`; the claim request returned `201` and the UI displayed the persisted waiting state.
2. Owner `needo0000000002` selected exactly that one claim against target `1` and effective budget `JPY 30,000`; the matching command returned `200` and the UI changed to the terminal matched state with Booking/payment controls disabled.
3. A reload initially exposed a real regression: the matched owner received `404 error.exchange.post_not_found`. The focused service test reproduced it, `dae7d4e9` changed the read guard to admit the owner's persisted `canViewClaims` capability, and the same browser retry then returned `200` with the matched state, selected provider, and disabled terminal action intact.
4. On the technician route, selected participant `s7325776482` could see publisher `needo0000000002` and the filled private address line `Prince Tower 12F`, but could not see the withdrawn competitor claim or the owner's claim inbox.
5. On the same technician route, nonparticipant `s8168105245` could still read the public terminal Request, but publisher identity, `Prince Tower 12F`, selected provider `s7325776482`, and the owner's claim inbox were all absent.

The successful owner command and persisted refresh produced no browser warning/error console entries. At `440x956` and `320x956`, the terminal owner view retained the matched banner and selected provider, no element crossed the viewport, `overflow-x` remained clipped, and an attempted horizontal scroll stayed at `0`; the temporary viewport override was reset afterward.

The browser-created database aggregate ended at version `3` with events `OPENED -> CLAIM_ADDED -> SELECTIVE_MATCHED`, one participant, quote total `JPY 15,000`, matched claim `16`, and audit action `exchange.matching.select`. The publication financial remained `HELD` for `1,000 TEST_NDP`; its hold remained active with zero captured/released amounts; slot `80724` remained `AVAILABLE` with `bookedCount = 0`; and global counts stayed at 20,472 Bookings, 358 ledger transactions, and 107 reconciliations. Because the other pre-existing claim was already withdrawn, this browser fixture emitted one selected notification; the rollback-only real-flow checker above separately proves selected plus active-loser notifications and loser privacy.

## Explicitly deferred

- quick matching;
- budget increase and target reduction;
- manual matching close and half-fee settlement;
- bilateral cancellation after matching;
- Booking/order conversion, appointment creation, payment, wallet/ledger movement, and external payment-provider calls;
- push and deployment.
