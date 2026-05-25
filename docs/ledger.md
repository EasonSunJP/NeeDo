# NDP Ledger

Step 11 implements the first formal NDP wallet ledger. It uses integer NDP where `1 NDP = 1 JPY`; all wallet mutations must go through `LedgerService`, never direct balance updates.

## Tables

- `wallets`: polymorphic wallet owner (`user`, `shop`, `platform`), `available_balance`, `frozen_balance`, `currency = NDP`.
- `ledger_transactions`: idempotent transaction header with `idempotency_key`, reference, actor, amount, metadata, and status.
- `wallet_ledgers`: immutable wallet entry rows with available/frozen deltas and after-balances.
- `finance_reconciliations`: one reconciliation row per ledger transaction for finance review/export.
- `audit_logs`: ledger mutations write audit rows with target type `ledger_transaction`.

## Booking Settlement

- Confirm order: freezes `500 NDP` from the shop wallet.
  - Idempotency key: `booking:{orderId}:accept:freeze`
- Customer/platform normal cancellation after confirm: unfreezes `500 NDP` back to the shop wallet.
  - Idempotency key: `booking:{orderId}:cancel:unfreeze`
- Complete order: deducts the shop's frozen `500 NDP` and credits the customer `100 NDP`.
  - Idempotency key: `booking:{orderId}:complete:settlement`
- Merchant-side forced cancellation after confirm: deducts the shop's frozen `500 NDP` and credits the customer `500 NDP`.
  - Idempotency key: `booking:{orderId}:merchant-cancel:compensation`

These mutations run inside the same Prisma transaction as the booking state transition. If ledger settlement fails, the order transition rolls back.

## APIs

- `GET /api/v1/wallets/me`
- `GET /api/v1/wallets/:id/ledger`
- `GET /api/v1/finance/ledger/transactions`
- `GET /api/v1/finance/reconciliation`
- `GET /api/v1/finance/reconciliation/export`

Finance export returns JSON containing `filename`, `contentType`, and CSV text so it stays inside the platform's JSON response envelope.

## Permissions

- `wallet:read`
- `wallet:ledger:list`
- `finance:ledger:list`
- `finance:reconciliation:list`
- `finance:reconciliation:export`

The `finance` role receives finance list/export access. Customer and service-provider roles receive wallet read/ledger access for their own wallet surfaces.

## Boundaries

- No Stripe recharge.
- No membership subscription logic.
- No Request frontend or Request marketplace surface.
- No direct wallet balance writes outside ledger transaction code and seed ledger initialization.
