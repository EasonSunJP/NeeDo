# Shop Membership Card Redemption Design

## Status and scope

This specification defines one independent membership microstep: a merchant redeems one active shop membership card against one already-completed formal Booking order, persists the exact card consumption, evaluates the issued card's immutable reward-plan version, and settles any earned NDP reward plus platform fee directly from the shop wallet.

It does not implement refunds, online membership-card payment, arbitrary manual consumption, service discounts, gifts, free services, bonus balance spending, or order completion itself. Refund is the next independent microstep and must reference the immutable redemption record created here.

## Decision

Three approaches were considered:

1. **Completed-order redemption with direct reward settlement (selected).** The merchant chooses a completed, same-shop, same-customer order that has not been redeemed. This gives the consumption and reward calculation an authoritative service, category, amount, customer, and time.
2. **Free-form merchant redemption.** Allowing a merchant to type an amount or service would weaken the configured service scope, permit duplicated or invented use, and make future refund and financial reconciliation unreliable.
3. **Automatic redemption during order completion.** This would silently consume a card without an explicit card choice and would widen the existing order state-machine microstep. It can be considered later only after the merchant has explicitly selected a card before completion.

## Product behavior

- A redemption candidate must be a `COMPLETED` Booking order from the JWT-selected shop, owned by the card customer, and not already referenced by another active redemption.
- The card and membership must be active and not soft-deleted. The card must be unexpired at MySQL database time and must not have a live customer-confirmed adjustment.
- The card must retain a formal issued `planVersionId`. Historical cards without a published rule snapshot remain readable but cannot be redeemed through this formal flow.
- Stored-value cards consume the order's integer final payable JPY from principal only. Bonus balance is not consumed. Insufficient principal rejects the whole transaction.
- Count cards consume exactly one remaining use. `totalUses` remains unchanged. Insufficient remaining uses rejects the whole transaction.
- Benefit cards record use without changing principal, bonus, remaining uses, or total uses.
- Redemption never changes the order price and never creates a discount, gift, free service, or extra card use.
- The eligible reward amount is the order's final payable JPY. The service/category/time facts come from the order snapshot and formal service relations, not the request body.
- The reward engine reuses the issued plan version's persisted rules, caps, and fee snapshot. It calculates fixed, percentage, spend-block, first-use, service/category scope, completion/spend milestone, birthday-month, schedule-window, and consecutive-month rules from persisted history. Where the formal customer data has no authoritative birth date, birthday-month facts are `null` and the rule does not match.
- No NDP is frozen when a plan is saved, issued, topped up, or redeemed. At the reward node, the service directly debits `customerRewardNdp + platformFeeNdp` from the shop's NDP available balance, credits the customer reward, and credits the platform fee in one reconciled ledger transaction.
- If the shop wallet cannot cover the complete total, the card consumption still commits because the completed service was used. The redemption records `pending_funds`, does not partially credit customer or platform, and does not partially debit the shop. A later approved shop-wallet NDP top-up settles pending redemptions FIFO when the complete amount is available.
- Exact idempotent replay returns the original redemption. A changed request under the same key returns `409` without card, wallet, ledger, audit, or notification changes.

## Data model

Add:

- `ShopMembershipCardRedemptionStatus`: `applied`, `refunded`.
- `ShopMembershipCardRewardStatus`: `none`, `pending_funds`, `paid`, `reversed`.
- `ShopMembershipCardRedemption`.
- `SHOP_MEMBERSHIP_REWARD_SETTLEMENT` in the existing ledger transaction type.

`ShopMembershipCardRedemption` stores:

- identity and scope: `cardId`, `shopId`, `bookingOrderId`, `planVersionId`, `redeemedById`;
- immutable service facts: order number, service name, service public ID when available, category code, service start, completion time, eligible amount;
- card mutation: consumed principal/uses, before/after principal and remaining uses, card lock version before;
- immutable rule evidence: facts JSON, rule hits JSON, raw reward, capped customer reward, platform fee rate/amount, total shop debit, and capped flag;
- settlement evidence: reward status, outstanding NDP, shop/customer/platform wallet IDs, ledger transaction ID, reward-settled time;
- lifecycle: redemption status, redeemed time, future refunded time;
- globally unique booking-order reference and idempotency key plus SHA-256 request fingerprint;
- required `id`, `createdAt`, `updatedAt`, `deletedAt`.

Checks enforce exact stored-value/count before/after arithmetic, non-negative amounts, `totalShopDebitNdp = customerRewardNdp + platformFeeNdp`, and consistent reward/outstanding/ledger states. Foreign keys are restrictive except nullable wallet/ledger evidence. Indexes support card history, shop history, customer history, pending-wallet FIFO settlement, and soft-delete filtering.

## Backend architecture

The implementation follows Route -> Controller -> Service -> Repository -> Prisma. Rule evaluation stays in the domain/service layer. The repository owns only scoped reads, locks, persistence, and transaction orchestration. A membership reward settlement service uses the existing ledger repository contract so all wallet deltas, ledger entries, reconciliation, and finance audit remain centralized.

### API contracts

- `GET /api/v1/merchant-admin/shop-membership-cards/{publicId}/redemption-candidates`
  - permission: `shop.member.card.redeem`;
  - paginated completed orders scoped by current JWT shop and the card customer.
- `POST /api/v1/merchant-admin/shop-membership-cards/{publicId}/redemptions`
  - permission: `shop.member.card.redeem`;
  - body: `bookingOrderId`, optional note, and `idempotencyKey`;
  - response: `201` when created or `200` on exact replay.
- `GET /api/v1/merchant-admin/shop-membership-card-redemptions`
  - permission: `shop.member.view`;
  - paginated, current-shop-only history.
- `GET /api/v1/customer-profile/me/shop-membership-card-redemptions`
  - permission: `customer-profile:read`;
  - paginated current-customer-only history.

All routes use Zod, the unified response envelope, structured errors, and OpenAPI.

### Transaction and locking

The redemption transaction:

1. resolves exact idempotent replay under the selected shop;
2. locks the card and order rows and reads database time;
3. revalidates card, membership, plan version, order ownership/status, and pending adjustment state;
4. rejects an existing redemption for the order;
5. reads immutable plan rules and authoritative historical facts;
6. invokes the pure reward evaluator and validates the fee snapshot;
7. updates card values by compare-and-set and inserts the redemption;
8. attempts complete direct NDP settlement or records `pending_funds` without a partial ledger mutation;
9. inserts merchant audit and customer notification;
10. commits every effect together.

Wallet settlement locks the shop wallet before customer and platform wallets. It creates one balanced ledger transaction with an available debit for the shop and available credits for customer and platform, followed by finance reconciliation and ledger audit. Pending allocation uses redemption row lock plus the same wallet order and idempotency key, so approved top-up, concurrent allocation, and replay cannot double-pay.

## RBAC, audit, and notifications

- `admin`, `merchant_owner`, and `merchant_staff` receive `shop.member.card.redeem`; daily service staff may redeem but cannot issue, top up, or change card balances outside this operation.
- Read history continues to use `shop.member.view`.
- Merchant audit action: `merchant.shop_membership_card.redemption.create`.
- Finance audit action: `ledger.shop_membership_reward.settlement`.
- Notifications distinguish immediate paid reward, pending-funds reward, no-reward use, and later pending reward settlement.
- Raw idempotency keys and internal notes are never returned to customers or written to audit metadata.

## Frontend design

### Merchant

- Eligible cards show `核销 TEST`; histories add `核销记录 TEST`.
- The mobile sheet loads formal completed-order candidates and shows order number, service, completion time, payable amount, exact card consumption, evaluated customer NDP, platform fee, total shop debit, and wallet-insufficiency behavior before confirmation.
- The merchant cannot type service, category, card consumption, reward, fee, or customer identity.
- Success shows whether NDP was paid immediately, pending shop-wallet funds, or zero because no rule matched.

### Customer

- `我的会员` adds read-only redemption history with shop, card, order/service, card consumption, resulting card value, reward status, customer NDP, platform fee disclosure, and time.
- Pending rewards clearly say they will be credited after the shop wallet is funded; no page invents an NDP balance change before the ledger transaction exists.

All new controls carry the `TEST` badge and all visible copy uses the existing five-locale membership i18n module.

## Verification

- Tests are written first for schema/migration/RBAC, validator/service/domain facts, transaction locking, wallet settlement, pending-FIFO allocation, API/OpenAPI, and both UIs.
- A guarded real-MySQL rollback checker proves stored-value/count/benefit consumption, all ten rule kinds, 1000/100/1100 direct settlement, insufficient-wallet pending state, later top-up allocation, wallet/ledger/reconciliation conservation, cross-shop/customer isolation, replay/concurrency, injected-failure rollback, and exact cleanup.
- Full frontend/backend tests, lint, build, Prisma validation/generation, and real narrow-browser acceptance run before local merge.

## Refund compatibility

The next independent refund microstep will reference exactly one applied redemption, restore the card using its before/after snapshot and card lock, cancel an unpaid pending reward or reverse a paid customer/platform reward through a separate balanced ledger transaction, write a separate refund aggregate, audit, and notify both parties. This redemption step exposes no refund action.
