# NDP Ledger

Step 11 implements the first formal NDP wallet ledger. It uses integer NDP where `1 NDP = 1 JPY`; all wallet mutations must go through `LedgerService`, never direct balance updates.

## Formal NDP and Test NDP

Migration `20260830210000_exchange_test_ndp_foundation` extends the same Wallet/Ledger authority with two explicit currencies:

- `NDP` is formal and settleable.
- `TEST_NDP` is non-settleable test value. It cannot enter top-up, withdrawal, payout, external payment, formal settlement, or formal reconciliation/settlement exports.
- `User.isTestAccount` is the server-side classification. A test user's active wallet currency is `TEST_NDP`; a formal user's active wallet currency is `NDP`.
- Wallets, transaction headers, immutable entries, reconciliation rows, holds, and order-financial snapshots persist currency. Service/repository checks reject cross-currency relations instead of silently converting them.
- Test-account provisioning uses idempotent audited ledger credits/debits. It never edits a balance directly. The local foundation calibration target is exactly `100,000 TEST_NDP` available per current account while preserving frozen balances.

Wallet reads and finance reporting expose both currencies without adding them together as formal NDP:

- `GET /api/v1/wallets/me` returns the active wallet, including `currency`.
- `GET /api/v1/wallets/me/summary` returns `activeCurrency`, `ndp`, and `testNdp` available/frozen pairs.
- `GET /api/v1/backoffice/finance/ndp-summary` returns each metric as `{ ndp, testNdp }` and returns formal-only `settleableNdp`.
- Formal reconciliation and settlement export repositories always add `currency = NDP`/`ndpCurrency = NDP`; a client cannot request Test NDP through those endpoints.

Operations account classification is paginated and RBAC-protected. A classification change and any required wallet provisioning are transactional and audited. The current local/test backfill is guarded and rerunnable:

```bash
npm run check:test-ndp-foundation -- --phase=preflight
npm run backfill:test-ndp
npm run prisma:migrate:deploy
npm run backfill:test-ndp -- --apply
npm run check:test-ndp-foundation -- --phase=postflight
```

The Exchange Request publication fee and its future operations-configured 1,000 NDP default are not activated in this foundation. Existing Booking/Request compatibility rules below remain unchanged until that later microstep.

## Tables

- `wallets`: polymorphic wallet owner (`user`, `shop`, `platform`), `available_balance`, `frozen_balance`, and explicit `NDP | TEST_NDP` currency.
- `ledger_transactions`: idempotent transaction header with `idempotency_key`, reference, actor, amount, currency, metadata, and status.
- `wallet_ledgers`: immutable wallet entry rows with currency, available/frozen deltas, and after-balances.
- `finance_reconciliations`: one currency-bearing reconciliation row per ledger transaction for finance review/export.
- `platform_fee_rule_sets`, `platform_fee_rules`, `platform_fee_tiers`, `platform_fee_time_windows`: versioned fee rule definitions for Booking/Request fee preview and Booking settlement.
- `fee_campaigns`: campaign discounts and fee waivers applied during fee calculation.
- `fee_calculation_logs`: calculation snapshots with applied rule IDs, adjustments, campaign discount, and explanation.
- `wallet_holds`: currency-bearing locked Booking/Request fee holds created at acceptance and consumed/released by later settlement.
- `wallet_adjustment_requests`: identity-scoped manual top-up/withdrawal requests with idempotency key, review state, reviewer evidence, and an optional approved ledger-transaction link.
- `order_financials`: one minimal financial summary per Booking/Request order with an NDP currency snapshot for backoffice and merchant-admin finance views.

Manual service payments remain JPY records, not NDP wallet mutations. Confirming an `onsite` or `bank_transfer` payment updates the Booking payment snapshot and synchronizes the `order_financials` offline-income fields/timeline transactionally. NDP platform-fee holds and settlement remain exclusively inside `LedgerService`.

- `audit_logs`: ledger mutations write audit rows with target type `ledger_transaction`.

## Manual Top-up and Withdrawal

- A customer or technician submits against its user wallet; a merchant submits against the shop wallet derived from the active identity. Platform identities cannot submit owner requests.
- New requests stay `pending`. Operations or finance users with a platform identity can approve or reject them.
- Approval, wallet delta, immutable ledger entry, reconciliation row, audit log, and request status change share one Prisma transaction.
- Approved top-ups credit available NDP. Approved withdrawals debit available NDP and fail atomically when the wallet balance is insufficient.
- Identical create and approval retries are idempotent. Rejected requests never change wallet balances.
- No external payment API is called in this flow; bank transfer evidence remains a manually verified reference and note.

## Booking Settlement

- Confirm order: calculates the Booking platform fee at stage `hold`, creates a `wallet_holds` row, and freezes the calculated hold amount from the shop wallet.
  - Idempotency key: `booking:{orderId}:accept:freeze`
- Customer/platform normal cancellation after confirm: releases the remaining frozen amount from the active hold back to the shop wallet.
  - Idempotency key: `booking:{orderId}:cancel:unfreeze`
- Complete order: calculates the Booking platform fee at stage `capture`, deducts the actual fee from the shop's frozen hold, releases any hold surplus, and credits the customer reward if the user reward rule returns a positive amount.
  - Idempotency key: `booking:{orderId}:complete:settlement`
- Merchant-side forced cancellation after confirm: calculates the Booking penalty/compensation rule, deducts the actual penalty from the shop's frozen hold, releases any surplus, and credits the customer compensation if positive.
  - Idempotency key: `booking:{orderId}:merchant-cancel:compensation`

## Request Dispatch Fee

- Request order creation is accepted by the same `/api/v1/bookings` endpoint with `orderType = request`, but no Request marketplace or frontend entry is opened in this slice.
- Confirm Request order: calculates `c_request_dispatch_fee` at stage `hold`, creates a `wallet_holds` row owned by the customer wallet, writes `order_financials.c_request_fee_hold_ndp`, and freezes the calculated amount from the customer wallet.
  - Idempotency key: `booking:{orderId}:accept:freeze`
- Cancel confirmed Request order: releases the remaining customer dispatch-fee hold back to the customer wallet.
  - Idempotency key: `booking:{orderId}:cancel:unfreeze`
- Complete Request order: calculates `c_request_dispatch_fee` at stage `capture`, deducts the actual dispatch fee from the customer frozen hold, releases any hold surplus, and writes `order_financials.c_request_fee_actual_ndp`.
  - Idempotency key: `booking:{orderId}:complete:settlement`

These mutations run inside the same Prisma transaction as the booking state transition. If ledger settlement fails, the order transition rolls back.

## Exchange Selective Exact Matching Boundary

Exchange Request publication and Booking Request dispatch are separate financial lifecycles. Selective exact matching only decides which active Exchange claims become participants; it never calls the Booking settlement path above.

- A successful exact match leaves the existing Exchange publication-fee `WalletHold` active and its `ExchangeRequestFinancial` projection in `HELD`.
- Available and frozen wallet balances, ledger transaction/entry counts, reconciliation rows, hold captured/released counters, and publication-fee currency are unchanged by matching.
- Matching creates no `Booking`, `OrderFinancial`, `ExchangeRequestFinancial`, `LedgerTransaction`, or `FinanceReconciliation` row.
- `ScheduleSlot.bookedCount` is unchanged. The matched technician-time lock is the active `ExchangeMatchParticipant.activeReservationKey`, which existing claim-option, claim-create, and Booking conflict checks must honor.
- Capture or release of the publication fee remains owned by a later, explicit Exchange terminal lifecycle. Exact matching itself cannot charge, refund, settle, export, or cross currencies.

The guarded local checker for this boundary is:

```bash
cd backend
ENV_FILE=.env.dev npm run check:exchange-selective-matching-flow
```

It executes the real matching service inside a rollback-only marker fixture and compares wallet, hold, Booking, ledger, reconciliation, Request-financial, and schedule-capacity snapshots before and after the selection command.

The default seed keeps the historical behavior through rules rather than business constants:

- Booking shop platform fee: `500 NDP`
- Booking customer completion reward: `100 NDP`
- Booking merchant cancellation penalty/compensation: `500 NDP`
- Request customer dispatch fee: `500 NDP`
- Demo customer wallets are seeded with `1000 NDP` through ledger seed credit so
  Request accept/complete smoke flows can freeze and capture the default dispatch fee.

Future changes should edit or version fee rules instead of adding ledger constants.

## APIs

- `GET /api/v1/wallets/me`
- `GET /api/v1/wallets/me/summary`
- `GET /api/v1/wallets/:id/ledger`
- `POST /api/v1/wallet-adjustments`
- `GET /api/v1/wallet-adjustments/me`
- `GET /api/v1/backoffice/wallet-adjustments`
- `POST /api/v1/backoffice/wallet-adjustments/:id/review`
- `GET /api/v1/finance/ledger/transactions`
- `GET /api/v1/finance/reconciliation`
- `GET /api/v1/finance/reconciliation/export`
- `GET /api/v1/backoffice/finance/ndp-summary`
- `GET /api/v1/finance/fee-rule-sets`
- `POST /api/v1/finance/fee-rule-sets`
- `PUT /api/v1/finance/fee-rule-sets/:id`
- `POST /api/v1/finance/fee-rule-sets/:id/activate`
- `POST /api/v1/finance/fee-rule-sets/:id/pause`
- `POST /api/v1/finance/fee-rules/preview`
- `GET /api/v1/finance/fee-calculation-logs`

Finance export returns JSON containing `filename`, `contentType`, and CSV text so it stays inside the platform's JSON response envelope.

## Permissions

- `wallet:read`
- `wallet:ledger:list`
- `wallet:adjustment:create`
- `wallet:adjustment:list`
- `backoffice:wallet-adjustment:list`
- `backoffice:wallet-adjustment:review`
- `finance:ledger:list`
- `finance:reconciliation:list`
- `finance:reconciliation:export`
- `finance:fee-rule:list`
- `finance:fee-rule:write`
- `finance:fee-rule:activate`
- `finance:fee-rule:preview`
- `finance:calculation-log:list`

The `finance` role receives finance list/export access plus fee-rule read, preview, and calculation-log access. The `operator` role receives fee-rule read/preview/log access. Rule write/activation remains admin-only.

Customer and service-provider roles receive wallet read/ledger and adjustment-request access for their identity-scoped wallet surfaces. Operator and finance roles receive adjustment review access.

## Boundaries

- No Stripe recharge.
- No membership subscription logic.
- No Request frontend or Request marketplace surface.
- No direct wallet balance writes outside ledger transaction code and seed ledger initialization.
- No automatic bank, card, or payout provider integration; manual approvals are the formal interim operating workflow.

## Affiliate Task Budget Freeze and Review

`WalletOwnerType` includes `merchant_account`. Affiliate task submission uses the existing wallet, immutable ledger, reconciliation, and audit authorities rather than a second balance system:

- An unfunded draft changes no wallet balance and has no budget reservation.
- Shop-published tasks use the current Shop wallet. Merchant-account tasks use the MerchantAccount wallet and may target only active member shops.
- Submit resolves and snapshots the effective Affiliate platform-fee rule, then freezes `totalBudgetNdp + ceil(totalBudgetNdp * platformFeeBps / 10000)` from available to frozen NDP with `affiliate_task_budget_freeze`. Scope snapshots, fee snapshot, reservation, ledger link, task state, reconciliation, and audit records share one Prisma transaction.
- `reservedBudgetNdp` and `totalFrozenNdp` record the historical gross freeze. `commissionFrozenNdp` remains the only allocation-capacity authority; fee reserve cannot inflate claim capacity.
- Reject is allowed only while the submitted reservation has no allocation/capture. It returns both unused commission and uncaptured fee to available NDP with `affiliate_task_budget_release`, records the two release counters independently, and changes the task to `rejected` in one transaction.
- Submit and reject idempotency keys are derived from task ID, version, and action. Retries do not create duplicate ledger entries or wallet deltas.
- Conditional wallet updates reject concurrent overspend or insufficient frozen balances without partial writes.

Publishing and review APIs:

- `GET|POST /api/v1/merchant-admin/affiliate/tasks`
- `GET|PATCH /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/submit`
- `GET /api/v1/backoffice/affiliate/tasks`
- `GET /api/v1/backoffice/affiliate/tasks/:taskId`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/approve`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/reject`

Permissions are `page:merchant-affiliate-task`, `button:merchant-affiliate-task-create`, `button:merchant-affiliate-task-submit`, `page:backoffice-affiliate`, and `button:backoffice-affiliate-review`.

Affiliate fee-rule operations use `page:backoffice-affiliate-fee-rule` for paginated history and `button:backoffice-affiliate-fee-rule-create` for a new immutable global/shop version:

- `GET /api/v1/backoffice/affiliate/fee-rules`
- `POST /api/v1/backoffice/affiliate/fee-rules`

Admin and finance may create a version; operator and viewer remain read-only. Multi-shop submission must resolve the same effective rate across every selected shop or fail before wallet mutation.

Local MySQL verification:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-publishing-flow
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-platform-fee-flow
```

The script refuses production flags and remote database hosts, creates uniquely identified formal rows, validates draft/no-freeze, shop and multi-shop merchant submission, insufficient-funds rollback, membership isolation, approve/reject, full release, idempotency, reconciliation, and audit evidence, then removes only those rows.

## Affiliate Task Expiry Budget Release

The backend starts the expiry worker with one immediate scan and repeats it at the configured interval. When `now >= taskEndsAt`, it may end an eligible `scheduled`, `active`, `paused`, or `budget_exhausted` task. The expiry transaction locks the task and its budget reservation, revalidates their aggregate snapshot, records `ended`, and releases only the current unallocated amount:

```text
commissionRelease = commissionFrozenNdp - allocatedNdp - capturedNdp - releasedNdp
platformFeeRelease = platformFeeFrozenNdp - platformFeeCapturedNdp - platformFeeReleasedNdp - feeReservedForAllocatedRewards
grossRelease = commissionRelease + platformFeeRelease
```

For a positive release, the publisher wallet moves that amount from frozen to available NDP through `LedgerService`. The task and reservation each accumulate the released amount but retain their historical total/reserved values. The associated immutable ledger transaction, wallet ledger, finance reconciliation, affiliate budget transaction, and system audit share the task transaction. A zero release still ends an eligible task but creates no empty ledger transaction.

The release idempotency key records the cumulative released total, so repeated scans of the same state are no-ops while a later valid release uses a new key:

```text
affiliate-task:<taskId>:expiry-release:to:<releasedAfterNdp>
```

Pre-expiry valid Attribution remains allocated after task end and can still be captured by the existing service-completion settlement. If a later cancellation or completion-limit invalidation removes such an allocation, the task remains ended but the worker rescans it once it has unallocated NDP, releasing only that later increment. Forward scanning and a separately bounded revisit cursor prevent lower-ID tasks from starving without letting a persistent low-ID failure block higher IDs. Expiry and formal Booking transitions retry `P2034`, MySQL `1213`, or SQLSTATE `40001` transaction conflicts at most three times; other failures are propagated without retry. A reservation becomes `released` only when no allocated or unallocated frozen budget remains; otherwise it retains its active/exhausted state while the task remains ended and accepts no new allocation.

Expiry worker configuration:

- `AFFILIATE_TASK_EXPIRY_INTERVAL_MS`: default `300000` (5 minutes), minimum `60000`.
- `AFFILIATE_TASK_EXPIRY_BATCH_SIZE`: default `100`, integer range `1..500`.

Local MySQL verification:

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-expiry-flow
```

The guarded check refuses production/staging targets, remote MySQL hosts, and production-looking database names; it creates uniquely marked rows and precisely removes only those fixtures. It verifies full and partial release, preserved allocations, later incremental release from an ended task, zero-release expiry, concurrent idempotency, wallet conservation, ledger/reconciliation/audit evidence, and cleanup.

Completed-order refund reversal/recovery, new affiliate APIs, aggregate/export operations, and merchant/shop/marketplace/Afirieito UI remain unstarted and capability-gated. The expiry release introduces no schema, API, permission, or UI change.
