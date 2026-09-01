# Shop Membership Card Top-Up Design

## Status and scope

This specification defines one independent membership microstep: a merchant records an already-confirmed offline payment and immediately adds the same integer JPY amount to an active stored-value membership card's principal balance.

It does not implement card redemption, refund, online payment, NDP reward settlement, bonus balance, count-card renewal, or benefit-card mutation.

## Decision

Three approaches were considered:

1. **Immediate offline top-up (selected).** The merchant confirms that payment was received outside NeeDo, then the server atomically credits card principal and records the evidence. This matches the existing offline-paid issuance workflow and keeps payment providers outside the current step.
2. **Customer-approved top-up.** This adds a second 72-hour approval flow. It is unnecessary for a positive credit after the customer has already paid and creates a risk that paid funds remain unavailable.
3. **Online payment top-up.** This requires provider authorization, callbacks, settlement, disputes, and payment reconciliation. It is a separate future capability and is expressly outside the current formal ledger step.

## Product behavior

- Only active, unexpired `stored_value` cards may be topped up.
- The credited principal equals the confirmed offline payment amount exactly. There is no discount, bonus balance, gift, free service, or automatic NDP.
- Supported payment evidence categories are `cash`, `card`, `paypay`, `bank_transfer`, and `other`.
- The amount is a safe integer from 1 through 10,000,000 JPY. The resulting principal balance must remain a safe non-negative database integer.
- A payment reference or note is required so the operation has reviewable evidence. Reference is limited to 160 characters and note to 500 characters.
- A top-up is effective immediately after the transaction commits. The customer receives a system notification showing the shop, card, credited amount, and resulting balance.
- A pending customer-confirmed adjustment blocks top-up with a structured `409`. The merchant must cancel the pending adjustment or wait for the customer decision. This prevents a stale final-value request from overwriting newly paid funds.
- Repeating the same idempotency key and identical normalized request returns the original record with `replayed: true`; changing the content returns `409` and does not mutate the card.

## Data model

Add `ShopMembershipCardTopUpPaymentMethod` and immutable `ShopMembershipCardTopUp`.

`ShopMembershipCardTopUp` stores:

- `id`, `publicId`, `createdAt`, `updatedAt`, `deletedAt`;
- `cardId`, `shopId`, and `createdById` with restrictive foreign keys;
- `amountJpy`, `paymentMethod`, `paymentReference`, and `note`;
- `principalBalanceBeforeJpy`, `principalBalanceAfterJpy`, and `cardLockVersionBefore`;
- globally unique `idempotencyKey` and SHA-256 `requestFingerprint`.

Indexes support card history, shop history, actor audit, and soft-delete filtering. Database checks enforce a positive amount, non-negative before/after balances, exact `after = before + amount`, and a 64-character fingerprint.

The existing card receives a `topUps` relation only. A successful mutation increments `ShopMembershipCard.lockVersion`; it does not change `bonusBalanceJpy`, wallets, `LedgerTransaction`, or `WalletLedger`.

## Backend architecture

The implementation follows Route -> Controller -> Service -> Repository -> Prisma.

### API contracts

- `POST /api/v1/merchant-admin/shop-membership-cards/{publicId}/top-ups`
  - permission: `shop.member.card.topup.create`;
  - body: `amountJpy`, `paymentMethod`, `paymentReference`, `note`, `idempotencyKey`;
  - response: `201` when created or `200` on exact replay.
- `GET /api/v1/merchant-admin/shop-membership-card-top-ups`
  - permission: `shop.member.view`;
  - filters: `cardPublicId`, `page`, `pageSize`;
  - returns only the current JWT shop's records.
- `GET /api/v1/customer-profile/me/shop-membership-card-top-ups`
  - permission: `customer-profile:read`;
  - filters: `cardPublicId`, `page`, `pageSize`;
  - returns only cards owned through the current customer's membership relations.

All routes use Zod validation and are documented in OpenAPI.

### Transaction and concurrency

The repository transaction:

1. resolves the card under the JWT-selected shop;
2. locks the card row and reads MySQL database time;
3. rejects wrong type, non-active/expired card, inactive membership, deleted records, or missing principal;
4. checks for a live `PENDING` adjustment and fails closed when one exists;
5. validates idempotent replay or conflict;
6. updates principal and `lockVersion` with a compare-and-set condition;
7. inserts the top-up, audit log, and customer notification;
8. commits all effects together.

No partial success is allowed. Concurrent top-ups with different keys serialize and each records the authoritative before/after balance. Concurrent duplicate keys create exactly one balance mutation, audit, and notification.

### RBAC, audit, and errors

- `admin` and `merchant_owner` receive `shop.member.card.topup.create`.
- `merchant_staff` remains read-only.
- Audit action: `merchant.shop_membership_card.topup.create`.
- Audit metadata includes card public ID, customer NeeDoID, amount, payment method, before/after principal, and idempotency key hash rather than the raw key.
- Structured errors distinguish not found/scope denial, invalid state, pending adjustment, invalid amount/evidence, concurrent change, and idempotency conflict.

## Frontend design

### Merchant

- Each eligible stored-value card shows `充值 TEST` next to the existing adjustment action.
- The dialog clearly says `线下收款已确认`, shows current principal, amount, payment method, evidence, and resulting principal preview.
- Count, benefit, inactive, expired, and pending-adjustment cards do not expose an enabled top-up action.
- After success, the card list refetches from the API and shows the authoritative new balance.
- A paginated `充值记录 TEST` view is added inside membership-card management, not as a browser-only list.

### Customer

- The membership detail page keeps the existing shop/card status design and adds `充值记录 TEST` for the selected membership's cards.
- Each record shows shop, card, amount, resulting principal, payment method, and timestamp. It is read-only.
- Empty, loading, error, and pagination states follow the existing mobile membership patterns.

All visible copy uses the existing membership i18n module in simplified Chinese, traditional Chinese, Japanese, English, and Korean.

## Verification

- Schema, migration, permissions, validators, repository, service, API, OpenAPI, and frontend tests are test-first.
- A guarded real-MySQL checker proves exact balance conservation, bonus/NDP/wallet invariance, cross-shop/customer isolation, pending-adjustment blocking, exact replay, conflicting replay, different-key concurrency, duplicate-key concurrency, injected audit failure rollback, and exact cleanup.
- Full frontend/backend test, lint, and build gates run after implementation.
- Browser acceptance uses the isolated formal runtime at 440x956 for merchant and customer routes, checks TEST badges, interaction states, horizontal overflow, console warnings/errors, and failed requests.

## Future compatibility

The next redemption microstep will consume card principal/count through its own immutable usage transaction. The later refund microstep may reference a top-up, but this step does not pre-create refund state or allow reversing top-ups.
