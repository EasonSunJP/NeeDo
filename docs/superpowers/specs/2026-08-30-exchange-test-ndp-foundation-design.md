# Exchange Request Test NDP Foundation Design

## Status

- Date: 2026-08-30
- Branch: `codex/exchange-demand-claim-step1`
- Base: current local `main` at `7d732d4d`, including Exchange merge `58ed413e`
- Design approval: approved in conversation on 2026-08-30
- Implementation status: not started

## Purpose

NeeDo Exchange Request publication will freeze a configurable Request fee before any provider can claim a demand. The current workspace contains only test accounts, and all NDP balances and NDP activity currently present in the database are test data. Before Request publication can safely freeze funds, the formal wallet and ledger must distinguish settleable NDP from non-settleable Test NDP.

This microstep creates that distinction inside the existing Wallet/Ledger system, migrates all current accounts and NDP history to Test NDP, calibrates every current account to 100,000 available Test NDP, and exposes the distinction in the operations and finance backoffice. It does not implement Request publication, claim submission, matching, booking, or payment.

## Approved Scope

This is one independently runnable, testable, and revertible vertical slice:

1. Add a server-authoritative test-account classification.
2. Add `TEST_NDP` to the existing wallet and ledger currency domain.
3. Reclassify all current NDP data as Test NDP without deleting history.
4. Calibrate each current user wallet to exactly 100,000 available Test NDP through immutable ledger transactions.
5. Make existing ledger producers resolve and persist the correct currency instead of hard-coding NDP.
6. Prevent Test NDP from entering top-up, withdrawal, payout, formal settlement, reconciliation export, or external payment paths.
7. Show formal NDP and Test NDP separately in account management and finance backoffice screens.

## Explicitly Out of Scope

- New Exchange Request form fields or privacy controls.
- Request fee configuration and Request fee freeze/capture/release.
- Claim, matching, provisional schedule holds, booking conversion, order creation, or cancellation agreement flows.
- Real payment, external provider calls, deployment, push, or production data mutation.
- Rebuilding the 20 seeded Exchange demands. That occurs only after the new Request publication contract is implemented.
- Any new mock, demo, placeholder, localStorage state, fake API, or parallel wallet implementation.

## Existing Capabilities to Reuse

The implementation must extend, not replace:

- `User`, `Wallet`, `LedgerTransaction`, `WalletLedger`, `FinanceReconciliation`, `WalletHold`, and `OrderFinancial` Prisma models.
- The existing wallet uniqueness boundary of owner type, owner ID, and currency.
- `LedgerRepository`, `LedgerService`, `LedgerController`, ledger validators, routes, RBAC permissions, OpenAPI paths, and audit logging.
- Existing paginated user, wallet-ledger, ledger-transaction, and reconciliation APIs.
- Existing high-fidelity `UserManagementWorkspace`, `FinancePage`, and wallet UI.

The backend continues to follow:

```text
Route -> Controller -> Service -> Repository -> Prisma
```

Controllers perform request/response handling only. Currency resolution, classification transitions, calibration, settlement exclusion, and transaction consistency belong in services. Prisma access remains in repositories.

## Domain Model

### Account classification

`User` gains:

```text
isTestAccount Boolean NOT NULL DEFAULT false
```

Rules:

- The migration marks every user row that exists at migration time as a test account, including inactive rows, because the user confirmed that every current account is a test account.
- New registrations and new backoffice-created users default to formal accounts.
- The client cannot set `isTestAccount` during registration or ordinary user update.
- Only an operations actor with the dedicated permission may change the classification.
- `/api/v1/auth/me` exposes the classification to the authenticated first-party client so the UI can label test funds correctly, but it is never accepted as client authority for choosing a wallet.

### Ledger currencies

The existing currency field is extended from the TypeScript-only `"NDP"` domain to:

```text
NDP | TEST_NDP
```

Meaning:

- `NDP` is formal, settleable platform NDP.
- `TEST_NDP` is non-settleable test value.

The implementation must not add a second wallet table or second ledger. A user, shop, platform, merchant account, or alliance may have separate rows in the existing `Wallet` table for `NDP` and `TEST_NDP`.

### Currency snapshots

Every financial transaction stores its currency when it is created. Records that currently carry NDP amounts but do not identify the currency, including wallet holds and order financial snapshots, gain a currency snapshot so a later account-classification change cannot reinterpret historical activity.

All entries belonging to one ledger transaction must reference wallets with the same currency as the transaction. The repository rejects a mismatch before applying deltas.

The platform has separate `NDP` and `TEST_NDP` wallets. Test captures may credit only the platform Test NDP wallet.

## Currency Resolution

The service layer owns one currency-resolution policy used by every existing wallet mutation:

- User-originated activity resolves from the server-side `User.isTestAccount` value.
- Order activity snapshots the customer's resolved currency at the first financial event and reuses that snapshot through freeze, release, capture, compensation, and reporting.
- Every counterparty wallet in that transaction uses the same currency snapshot, including shop, technician-related owner, alliance, and platform wallets.
- A mixed formal/test transaction is rejected with `409` rather than converting value or silently opening the wrong wallet.
- Background jobs use the stored transaction/order currency snapshot, not the actor's current classification.

Repository methods such as wallet lookup, transaction creation, reconciliation creation, list filters, and record mapping must receive or preserve currency explicitly. No mutation path may continue to inject `"NDP"` unconditionally.

## Migration and Backfill

Migration and backfill run in a guarded sequence.

### Preflight

Before mutating local data, the implementation records counts and totals for:

- users by active/deleted state;
- wallets by owner type and currency;
- ledger transactions by currency and type;
- available and frozen balances;
- reconciliation, wallet-hold, and order-financial rows that carry NDP amounts.

The process aborts if an owner already has both an NDP and Test NDP wallet that would collide after reclassification, or if transaction/wallet relationships are inconsistent. It does not guess how to merge conflicting financial history.

### Schema and reclassification

The Prisma migration:

1. Adds `User.isTestAccount` with a formal-account default.
2. Adds the required currency snapshot fields and indexes.
3. Expands the ledger transaction type for Test NDP balance calibration.
4. Marks all current users as test accounts.
5. Reclassifies all current NDP wallets, ledger transactions, finance reconciliations, wallet holds, and order-financial NDP snapshots as `TEST_NDP` while preserving IDs, references, entries, timestamps, and audit provenance.
6. Marks migrated reconciliation records as test-only so they remain visible but cannot be exported as formal reconciliation.

Wallet ledger entries do not duplicate currency; their wallet and transaction relationships determine it and must agree.

### Account balance calibration

A versioned, idempotent backfill command runs after the schema migration. For every current user:

- It obtains or creates the user's Test NDP wallet.
- It calculates `100000 - availableBalance`.
- A positive difference creates an available credit.
- A negative difference creates an available debit.
- A zero difference creates no monetary entry but records completion idempotently.
- Frozen Test NDP remains unchanged.
- The final available Test NDP balance is exactly 100,000.

The adjustment uses a dedicated immutable ledger transaction type and a stable per-user idempotency key. Rerunning the backfill cannot grant or remove value twice and cannot replenish Test NDP after later spending.

The backfill records an audit event containing the old balance, adjustment, resulting balance, currency, backfill version, and actor/system provenance. It never performs a direct balance overwrite without a ledger record.

### Reversibility

- Code and schema changes remain isolated in the feature worktree and one feature commit series.
- Preflight evidence and post-migration reconciliation evidence are retained with the implementation verification record.
- If the guarded migration fails, the application must not start in a partially classified state.
- A forward compensating migration/backfill may restore classification only before new Test NDP business transactions exist. Historical rows are never deleted to simulate rollback.
- No destructive reset, production deployment, push, or external financial action is part of this step.

## Account Classification API and RBAC

The existing paginated `/api/v1/users` list and user detail payload add:

- `isTestAccount`;
- formal NDP available and frozen balances;
- Test NDP available and frozen balances.

The list accepts an optional `isTestAccount` filter and obtains balances with a grouped repository query, not an N+1 query.

A dedicated mutation is added:

```http
PATCH /api/v1/users/{id}/test-account
```

Body:

```json
{
  "isTestAccount": true,
  "expectedUpdatedAt": "2026-08-30T00:00:00.000Z"
}
```

The route requires a new `user:test-account:update` permission, Zod validation, OpenAPI documentation, and an audit record. A stale `expectedUpdatedAt` produces `409`.

Classification transitions follow these rules:

- Formal to test: reject if formal currency has an active hold or in-flight financial transaction; otherwise create or resume the Test NDP wallet. The one-time 100,000 calibration is applied only if the account has never received it.
- Test to formal: reject if Test NDP has a frozen balance, active hold, or in-flight financial transaction. The Test NDP wallet and history remain read-only and are not converted or deleted. The formal NDP wallet starts at zero unless an existing formal wallet already exists.
- Repeated identical requests are idempotent and do not recalibrate balances.

## Wallet API

`GET /api/v1/wallets/me` remains backward-compatible in route shape but returns the server-selected active wallet:

- Test account: Test NDP wallet.
- Formal account: NDP wallet.

The wallet payload currency type becomes `NDP | TEST_NDP`. A new authenticated `GET /api/v1/wallets/me/summary` response exposes both balances as fixed named object fields together with the server-selected active currency. It is an object response, not an unpaginated arbitrary wallet list.

Test NDP adjustment restrictions:

- Manual top-up and withdrawal are rejected.
- Bank references, payment providers, payout records, pay runs, and external settlement code cannot target a Test NDP wallet.
- Internal test business debits, freezes, releases, captures, and credits remain possible only through allow-listed formal domain services.

## Finance Backoffice

Finance aggregation returns paired values for each NDP metric:

```json
{
  "todayNdpConsumption": {
    "ndp": 999,
    "testNdp": 999
  }
}
```

The primary value remains formal NDP. The associated Test NDP amount appears as smaller secondary text in the same high-fidelity card:

```text
Today's NDP consumption
999 NDP
+ 999 Test NDP
```

The two values are not relabelled as `1,998 NDP`.

The final settlement area shows formal settleable NDP and a separate non-settleable Test NDP line. “Subtract Test NDP” is a reporting exclusion, not another wallet debit:

```text
Formal settleable: 999 NDP
Test NDP: 999 (excluded from settlement)
```

Formal reconciliation queries and CSV exports always enforce `currency=NDP` on the server. A client query cannot override that restriction. If a Test NDP report is later exported, it requires a separate explicitly test-labelled endpoint and file; that export is not part of this microstep.

All new visible labels use the existing five-language i18n mechanism.

## Error Handling

Expected failures use stable application error keys and do not expose native exceptions:

- wallet-currency mismatch;
- mixed formal/test transaction;
- Test NDP settlement or adjustment forbidden;
- active financial hold prevents classification change;
- stale account-classification update;
- migration collision or inconsistent financial graph.

A repeated completed backfill returns its existing completion result without applying another adjustment; it is not treated as an error.

Mutations are transactional. Unique wallet keys and transaction idempotency keys provide the final concurrency boundary. A partial wallet delta without its ledger entry, transaction, and audit record is not allowed.

## Verification Plan

### Automated tests

- Prisma schema and migration checks against a real MySQL test database.
- Migration preflight collision and relationship-consistency tests.
- Currency resolver tests for test and formal users.
- Repository tests proving transaction, wallet, hold, order snapshot, and ledger-entry currency agreement.
- Calibration tests for missing, lower, equal, and higher balances; repeat and concurrent execution must remain idempotent.
- User API tests for pagination, filtering, balance projection, Zod, RBAC, stale update, and audit logging.
- Wallet API tests showing that test accounts receive Test NDP and formal accounts receive NDP.
- Finance aggregation tests for paired values.
- Reconciliation list/export tests proving Test NDP exclusion even when a client attempts to request it.
- Regression tests for existing Booking, Order, Affiliate, Wallet/Ledger, finance, RBAC, and Exchange modules.
- Frontend unit/component tests for account badges, dual balances, paired finance metrics, errors, and five-language strings.
- Lint, backend tests, frontend tests, and the repository's formal production-build verification command.

### Data invariants

After migration and backfill:

- every current user has `isTestAccount=true`;
- every current user has exactly one active Test NDP user wallet;
- every current user's available Test NDP balance is 100,000;
- existing frozen balances remain present as Test NDP;
- current historical NDP transactions and counterpart wallets are consistently Test NDP;
- no Test NDP transaction is eligible for formal reconciliation export;
- wallet stored balances reconcile with their immutable ledger history and calibration entries.

### Real browser acceptance

Using real test identities and the formal API/database:

1. Log in as an operations account and open account management.
2. Confirm pagination, test-account badges, and separate NDP/Test NDP balances.
3. Open the finance backoffice and confirm each affected metric shows formal NDP as the primary value and Test NDP as smaller secondary text.
4. Confirm the final settleable value excludes Test NDP.
5. Log in as a test user and confirm the active wallet shows `100,000 Test NDP`.
6. Refresh and log out/in to prove persistence.
7. Verify actual API responses, network status, console errors, overflow, and desktop/mobile layout where the surfaces are available.
8. Verify that the formal reconciliation CSV contains no Test NDP rows.

Browser control presence alone is not acceptance; the test must exercise the real interactions and inspect the resulting server-authoritative state.

## Stop Gate

After all tests and browser acceptance pass, report this microstep and stop. Do not begin Request publication, claim, matching, booking, or payment until the user approves the next microstep.

## Recorded Future Exchange Decisions

The following approved product decisions are preserved for later specs but are not implemented here:

- A Request has a target provider count and either quick-match or selective-match mode.
- Quick match succeeds when valid claims reach the target; the publisher may end early with the current valid claimants.
- Selective match permits multiple claims and lets the publisher choose the successful providers up to the target.
- Store claims bind an available service technician. Technician claims bind a technician-selected affiliated store.
- A claim requires an in-budget quote, formal service item, and estimated start time; its message is optional.
- The publisher chooses total-budget or per-person budget mode. Maximum is required; minimum is optional but becomes a hard bound when present. Required UI labels include `*`.
- Each active claim reserves the selected technician's requested time. Each technician may have at most one active claim per Request.
- A provider may withdraw free of charge before matching. Losing claims automatically cancel after matching.
- A matched relationship can be cancelled only after both sides agree.
- The publisher's Request fee is frozen at publication, captured on publisher withdrawal or post-match cancellation, released on natural expiry without a match, and captured into platform revenue on fulfillment completion.
- The Request fee is initially 1,000 NDP per Request, independent of target count, globally configurable by operations, versioned, and snapshotted at publication.
- Test accounts use Test NDP for the Request fee. Captured Test NDP enters only the platform Test NDP wallet and never formal settlement.
- All eligible providers may see only publisher-selected public fields before matching. Matched providers see the full permitted Request contact/address data.
- Address is split into address 1, address 2, and address 3, each with its own public switch.
- The old 20 seeded demands may be removed and rebuilt through formal APIs and real test identities after the new Request publication contract exists. Existing intelligence and unrelated/manual Exchange content remain untouched.
