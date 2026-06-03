# NDP Ledger

Step 11 implements the first formal NDP wallet ledger. It uses integer NDP where `1 NDP = 1 JPY`; all wallet mutations must go through `LedgerService`, never direct balance updates.

## Tables

- `wallets`: polymorphic wallet owner (`user`, `shop`, `platform`), `available_balance`, `frozen_balance`, `currency = NDP`.
- `ledger_transactions`: idempotent transaction header with `idempotency_key`, reference, actor, amount, metadata, and status.
- `wallet_ledgers`: immutable wallet entry rows with available/frozen deltas and after-balances.
- `finance_reconciliations`: one reconciliation row per ledger transaction for finance review/export.
- `platform_fee_rule_sets`, `platform_fee_rules`, `platform_fee_tiers`, `platform_fee_time_windows`: versioned fee rule definitions for Booking/Request fee preview and Booking settlement.
- `fee_campaigns`: campaign discounts and fee waivers applied during fee calculation.
- `fee_calculation_logs`: calculation snapshots with applied rule IDs, adjustments, campaign discount, and explanation.
- `wallet_holds`: locked Booking fee holds created at acceptance and consumed/released by later settlement.
- `order_financials`: one minimal financial summary per Booking order for backoffice and merchant-admin finance views.
- `audit_logs`: ledger mutations write audit rows with target type `ledger_transaction`.

## Booking Settlement

- Confirm order: calculates the Booking platform fee at stage `hold`, creates a `wallet_holds` row, and freezes the calculated hold amount from the shop wallet.
  - Idempotency key: `booking:{orderId}:accept:freeze`
- Customer/platform normal cancellation after confirm: releases the remaining frozen amount from the active hold back to the shop wallet.
  - Idempotency key: `booking:{orderId}:cancel:unfreeze`
- Complete order: calculates the Booking platform fee at stage `capture`, deducts the actual fee from the shop's frozen hold, releases any hold surplus, and credits the customer reward if the user reward rule returns a positive amount.
  - Idempotency key: `booking:{orderId}:complete:settlement`
- Merchant-side forced cancellation after confirm: calculates the Booking penalty/compensation rule, deducts the actual penalty from the shop's frozen hold, releases any surplus, and credits the customer compensation if positive.
  - Idempotency key: `booking:{orderId}:merchant-cancel:compensation`

These mutations run inside the same Prisma transaction as the booking state transition. If ledger settlement fails, the order transition rolls back.

The default seed keeps the historical behavior through rules rather than business constants:

- Booking shop platform fee: `500 NDP`
- Booking customer completion reward: `100 NDP`
- Booking merchant cancellation penalty/compensation: `500 NDP`

Future changes should edit or version fee rules instead of adding ledger constants.

## APIs

- `GET /api/v1/wallets/me`
- `GET /api/v1/wallets/:id/ledger`
- `GET /api/v1/finance/ledger/transactions`
- `GET /api/v1/finance/reconciliation`
- `GET /api/v1/finance/reconciliation/export`
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
- `finance:ledger:list`
- `finance:reconciliation:list`
- `finance:reconciliation:export`
- `finance:fee-rule:list`
- `finance:fee-rule:write`
- `finance:fee-rule:activate`
- `finance:fee-rule:preview`
- `finance:calculation-log:list`

The `finance` role receives finance list/export access plus fee-rule read, preview, and calculation-log access. The `operator` role receives fee-rule read/preview/log access. Rule write/activation remains admin-only.

Customer and service-provider roles receive wallet read/ledger access for their own wallet surfaces.

## Boundaries

- No Stripe recharge.
- No membership subscription logic.
- No Request frontend or Request marketplace surface.
- No direct wallet balance writes outside ledger transaction code and seed ledger initialization.
