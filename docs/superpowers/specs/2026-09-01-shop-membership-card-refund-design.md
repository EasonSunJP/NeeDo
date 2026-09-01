# Shop Membership Card Refund Design

## Status and scope

This specification defines one independent membership microstep: after the underlying formal Booking payment has been refunded, an authorized merchant restores exactly one applied membership-card redemption, cancels or reverses its NDP reward, persists immutable refund evidence, and notifies the customer.

It does not refund the Booking payment itself, refund membership-card purchase/top-up principal to cash, edit a card to an arbitrary value, reopen an order, create discounts, or ask the customer to approve a financial reversal that follows an already-completed order refund.

## Decision

Three approaches were considered:

1. **Order-refund-gated atomic restoration and reward reversal (selected).** The membership refund is allowed only after the same Booking order has formal `paymentStatus=REFUNDED` evidence. Card restoration, reward reversal, refund evidence, audit, and notification commit together.
2. **Free-form membership refund.** Allowing a merchant to refund a redemption while the order remains paid would make service revenue, card value, and NDP settlement disagree.
3. **Fail when the customer has spent the reward.** This lets customer spending block a legitimate shop refund. Instead, the exact reward is reversed even when the customer wallet becomes negative; later NDP credits naturally offset the debt through the existing single wallet and immutable ledger.

## Product behavior

- Only an `applied`, non-deleted redemption from the JWT-selected shop is refundable.
- The linked Booking order must already have `paymentStatus=REFUNDED`, `paymentRefundedAt`, and the same shop/customer/order identity captured by the redemption.
- A live card adjustment request blocks refund so a customer is not deciding against a stale balance snapshot.
- The card row is locked and restored additively from immutable redemption evidence:
  - stored-value cards add back `consumedPrincipalJpy` to current principal; bonus remains unchanged;
  - count cards add back `consumedUses` to current remaining uses; total uses remains unchanged;
  - benefit cards change no amount or count.
- Refund does not reactivate an expired, suspended, or ended card. It restores value to the existing card status and expiry so audit value is preserved without silently extending benefits.
- A `pending_funds` reward is cancelled with zero wallet movement and zero ledger entry.
- A `none` reward stays `none` with zero wallet movement.
- A `paid` reward creates one separate balanced reversal transaction:
  - customer available balance: `-customerRewardNdp`;
  - platform available balance: `-platformFeeNdp` when the fee is positive;
  - shop available balance: `+customerRewardNdp + platformFeeNdp`.
- No portion is frozen and no partial reversal is allowed. Customer and platform balances may become negative; the immutable wallet ledger shows the debt and later credits offset it normally.
- The original settlement transaction and redemption evidence never change. The redemption lifecycle changes to `refunded`, while the separate refund aggregate references the reversal transaction.
- Exact idempotent replay returns the original refund. A changed payload under the same key, or a second refund under a new key, returns a structured conflict without additional card, wallet, ledger, audit, or notification mutations.

## Data model

Add:

- `ShopMembershipCardRefundStatus`: `applied`.
- `ShopMembershipRewardReversalMode`: `none`, `cancelled_pending`, `ledger_reversed`.
- `ShopMembershipCardRedemptionRefund`.
- `SHOP_MEMBERSHIP_REWARD_REVERSAL` in the existing ledger transaction type.

`ShopMembershipCardRedemptionRefund` stores:

- scope and identity: `redemptionId`, `cardId`, `shopId`, `bookingOrderId`, `customerUserId`, `refundedById`;
- immutable refund proof: reason, order payment refund time/reference, redemption status before, reward status before;
- card restoration: restored principal/uses, current before/after principal and remaining uses, card lock version before;
- reward reversal: mode, customer reward, platform fee, total shop credit, wallet IDs, reversal ledger transaction ID, and customer balance before/after;
- lifecycle and idempotency: status, refunded time, globally unique idempotency key, SHA-256 request fingerprint;
- required `id`, `createdAt`, `updatedAt`, and `deletedAt`.

Checks enforce exact card arithmetic, non-negative restored amounts, `totalShopCreditNdp = customerRewardReversedNdp + platformFeeReversedNdp`, and consistent mode/ledger/balance states. The redemption relation is unique, all associations are indexed, and every query filters soft-deleted rows.

## Backend architecture

The implementation follows Route -> Controller -> Service -> Repository -> Prisma. The service validates and fingerprints the command. The repository owns scoped locks, formal order-refund proof, card restoration, refund persistence, audit, and notification. `LedgerService` owns the balanced NDP reversal so wallet mutation, entries, reconciliation, and finance audit remain centralized.

### API contract

- `POST /api/v1/merchant-admin/shop-membership-card-redemptions/{publicId}/refunds`
  - permission: `shop.member.card.refund`;
  - body: required `reason` and `idempotencyKey`;
  - response: updated redemption including its immutable refund summary;
  - `201` when created and `200` on exact replay.
- Existing merchant and customer paginated redemption history endpoints include order payment status and the read-only refund summary.

The request never accepts customer, shop, order, card values, reward, fee, wallet, or ledger fields. All routes use Zod, the unified response envelope, structured error codes, and OpenAPI.

### Transaction and locking

The refund transaction:

1. resolves exact idempotent replay under the selected shop;
2. locks the redemption, card, and Booking order and reads MySQL database time;
3. validates shop/customer/order identity, applied state, formal payment refund proof, immutable consumption, and no live adjustment;
4. inserts the refund aggregate and restores the card with a lock-version compare-and-set;
5. cancels pending reward or invokes the ledger reversal for a paid reward;
6. updates the refund with reversal evidence and marks the redemption refunded;
7. writes merchant audit and customer notification;
8. commits every effect together.

The paid-reward reversal locks shop, customer, then platform wallets in the same order used by reward settlement. It validates wallet owners/currency and original amounts, writes one reconciled transaction, and permits negative debit balances only for this exact immutable reversal.

Pending-reward allocation and refund both lock the redemption first. Whichever commits first determines whether the refund cancels a pending reward or reverses an already-paid reward; neither race can double-pay or skip the reversal.

## RBAC, audit, and notifications

- `admin` and `merchant_owner` receive `shop.member.card.refund`.
- `merchant_staff` may redeem but cannot refund because refund changes card value and reverses financial settlement.
- Existing `shop.member.view` and `customer-profile:read` continue to gate histories.
- Merchant audit action: `merchant.shop_membership_card.redemption.refund`.
- Finance audit action: `ledger.shop_membership_reward.reversal`.
- Customer notifications distinguish no-reward restoration, pending-reward cancellation, paid-reward reversal, and a negative post-reversal NDP balance.
- Idempotency keys, internal wallet IDs, and request fingerprints are never exposed to the customer.

## Frontend design

### Merchant

- Applied redemption history shows `退款 TEST` only to authorized users.
- Before the formal order payment is refunded, the row explains that order refund must finish first and does not expose a misleading active button.
- The confirmation sheet shows the order refund proof, exact card value restored, customer reward reversal, platform-fee reversal, total returned to the shop wallet, and the negative-customer-balance policy.
- The merchant enters only an auditable reason; all monetary and card fields are server-authoritative.

### Customer

- `我的会员` shows the restored card amount/use, refunded time, cancelled or reversed reward, and customer NDP balance after a paid reversal.
- If the balance becomes negative, the page explains that later NDP credits offset the amount. It never claims that cash, bonus balance, card expiry, or status was changed.

All new controls carry the `TEST` badge and all visible copy uses the existing five-locale membership i18n module.

## Verification

- Tests are written first for schema/migration/RBAC, validator/service fingerprinting, order-refund proof, additive card restoration, pending/none/paid reward paths, negative wallet reversal, concurrency/idempotency, audit/notification, API/OpenAPI, and both UIs.
- A guarded real-MySQL rollback checker proves stored-value/count/benefit restoration, pending cancellation, 1000/100/1100 paid reversal, negative customer balance, shop/platform/customer ledger conservation, allocator/refund race safety, isolation, replay, injected-failure rollback, and exact cleanup.
- Prisma validation/generation, affected and full relevant frontend/backend tests, lint, production build, and authenticated narrow-browser acceptance run before local merge.
