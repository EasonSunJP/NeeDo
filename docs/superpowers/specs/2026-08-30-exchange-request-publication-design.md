# NeeDo Exchange Request Formal Publication Design

**Date:** 2026-08-30

**Status:** Product design approved

**Branch:** `codex/exchange-request-publication`

**Baseline:** `main` at `131d70b4` when the isolated worktree was created

## 1. Objective

Deliver the first formal Exchange microstep before claim, matching, booking, or payment work begins: publish a new Request through the existing production Exchange API and high-fidelity composer while atomically freezing the configured Request publication fee in the existing Wallet/Ledger system.

This microstep must remain independently runnable, testable, and reversible. It upgrades Request publication and its pre-match terminal states only. It does not create an offer, match, schedule reservation, booking, order, IM conversation, or payment.

## 2. Existing Capabilities to Reuse

The implementation extends the current formal paths instead of introducing parallel systems:

| Concern | Existing authority to reuse |
|---|---|
| Exchange aggregate | `ExchangePost` plus `ExchangeDemand`; existing Repository → Service → Controller → Route layering |
| Exchange API | `/api/v1/exchange/posts`, paginated list/detail, idempotent publish and owner withdrawal |
| Identity and privacy | Active `UserIdentity`, owner identity snapshots, current Exchange customer isolation and provider-market visibility |
| RBAC | Existing Exchange permission constants and role assignments |
| Fees | Versioned `PlatformFeeRuleSet` and `PlatformFeeRule` records |
| Wallets | Existing `Wallet` ownership types and `NDP` / `TEST_NDP` currency separation |
| Financial mutation | Existing `LedgerService`, `WalletHold`, immutable ledger entries, finance reconciliation, and audit logs |
| Test-account classification | Existing persisted `User.isTestAccount` and Test NDP provisioning foundation |
| Operations UI | Existing versioned platform-fee administration surfaces and finance metrics |
| Frontend | Current React/TSX/Vite Exchange feature, high-fidelity list/detail/composer, typed API client, and five-language i18n |

The existing Booking compatibility rule `c_request_dispatch_fee` is not the Request publication fee and must not be renamed or repriced. Booking, Schedule, Order, manual Payment, and external payment behavior remain unchanged in this microstep.

## 3. Approved Product Rules

### 3.1 Publisher eligibility and provider-count limits

An active customer identity may publish a Request up to the limit of its effective membership level:

| Membership level | Maximum target providers |
|---|---:|
| `standard` | 1 |
| `silver` | 2 |
| `gold` | 3 |
| `black` | 20 |

`standard` is the free membership level. An active shop merchant identity may choose any target from 1 through 20, independent of personal customer membership.

The service resolves the publisher's effective authority during the publication transaction and persists both the source and limit snapshot. A later membership downgrade, expiry, or policy edit cannot reprice or invalidate an already published Request. A request payload above the effective limit fails without creating a post or mutating a wallet.

Merchant publication uses the active identity's shop scope. The default `merchant_owner` role receives Request publication authority. `merchant_staff` does not receive this spending authority by default and may publish only when explicitly assigned `exchange:posts:create-demand`.

Technician identities do not gain Request publication in this microstep. They retain Intelligence publication and provider-market read access.

### 3.2 Match and budget intent captured at publication

Every Request persists the later matching contract even though claims are outside this microstep:

- `targetProviderCount`: required integer, 1–20, also constrained by the publisher snapshot.
- `matchMode`: required `quick` or `selective`.
- `budgetMode`: required `total` or `per_provider`.
- maximum budget: required non-negative JPY amount.
- minimum budget: nullable; when present, it is a hard lower bound and cannot exceed the maximum.

Quick mode will match when valid claims reach the target. A publisher may later close early with the current valid claimants. Selective mode will permit multiple claims and let the publisher choose successful participants up to the target. These later transitions are recorded here as contract intent only; delivery belongs to later approved microsteps.

### 3.3 Address and identity disclosure

Request address data is split as follows:

- Address 1 is required and visible to every authenticated identity that is authorized to read that Request.
- Address 2 and Address 3 are optional.
- Each optional address line has its own general-visibility switch.
- Before matching, authorized providers see Address 2 or Address 3 only when its switch is enabled.
- After matching exists in a later microstep, the publisher and every successful participant in that Request see all filled address lines regardless of the two switches.

The publisher separately controls one identity-group switch covering avatar, nickname, and NeeDo ID. When disabled, the API omits those values for pre-match providers; it does not send fabricated identity values. The owner always sees its own complete data. Future matched participants receive the complete permitted publisher data through server-side relationship checks.

Phone number and email are never returned through Exchange Request DTOs. Matched parties will use formal IM when that later microstep is approved.

Customer privacy remains unchanged: an ordinary customer can list or read only Requests owned by its active account and cannot read or interact with another customer's Request. Merchant and technician provider identities retain the paginated demand market, subject to the disclosure projection above.

## 4. First Microstep Scope

### 4.1 Included

1. Add the formal Request fields, membership/shop capacity snapshots, and disclosure settings.
2. Add a dedicated versioned Request-publication fee family with an initial fixed amount of 1,000 NDP per Request.
3. Resolve the payer wallet by active identity:
   - customer → publisher user wallet;
   - shop merchant → active shop wallet.
4. Resolve `TEST_NDP` for test actors and `NDP` for formal actors without cross-currency fallback.
5. Publish the Request and freeze the fee atomically with financial snapshots, hold, ledger, reconciliation, and audit evidence.
6. Capture the entire hold when the publisher withdraws.
7. Release the entire hold when an unmatched Request expires naturally.
8. Extend the existing operations fee administration and finance views for the new fee family and Test NDP presentation.
9. Extend the current high-fidelity Request composer and formal Exchange DTOs in all five interface languages.
10. Soft-delete the old seeded demands and rebuild 20 upgraded Requests through authenticated formal APIs and real test identities while leaving Intelligence records untouched.

### 4.2 Excluded

- Provider claims or claim withdrawal
- Technician/shop availability reservation
- Quick or selective matching transitions
- Losing-claim cancellation and notifications
- Mutual cancellation after matching
- Booking, Schedule, Order, or IM creation
- Manual or external Payment changes
- Real payment, deployment, push, or production data mutation

The excluded flows may consume the immutable publication snapshots later, but they may not be simulated in this microstep.

## 5. Persistence Design

### 5.1 Request fields

Add formal enum vocabulary for:

- `ExchangeMatchMode`: `QUICK`, `SELECTIVE`
- `ExchangeBudgetMode`: `TOTAL`, `PER_PROVIDER`
- `ExchangePublisherCapacitySource`: `CUSTOMER_MEMBERSHIP`, `SHOP_MERCHANT`

Extend `ExchangeDemand` with:

- `targetProviderCount`
- `targetProviderLimitSnapshot`
- `publisherCapacitySource`
- nullable `membershipLevelSnapshot`
- `matchMode`
- `budgetMode`
- nullable `budgetMinJpy`
- required `budgetMaxJpy`
- `addressLine1`
- nullable `addressLine2` and `addressLine3`
- `addressLine2Public` and `addressLine3Public`, default false
- `publisherIdentityPublic`, default false

Address 1 also supplies the existing public `ExchangePost.areaLabel` snapshot so the current indexed feed and card layout remain compatible. Intelligence continues to use its existing `areaLabel` contract unchanged.

The migration backfills existing demand rows conservatively so it remains additive and reversible: target 1, quick mode, total budget, capacity limit 1, customer-membership source, `standard` snapshot, existing area as Address 1, private optional lines, and private publisher identity. `budgetMinJpy` becomes nullable without changing existing non-null values.

Every new field is represented in Prisma schema, a new migration, Repository projections, Service input/output, Zod, OpenAPI, and frontend types. All new relations and list filters retain indexes and `deletedAt IS NULL` behavior.

### 5.2 Publication financial snapshot

Add one `ExchangeRequestFinancial` aggregate related one-to-one to the Request post. It records:

- Request/post identifier;
- business payer type and identifier;
- wallet owner type and identifier;
- immutable `NDP` or `TEST_NDP` currency;
- fee rule-set, version, and applied rule identifiers;
- calculated and held amount;
- WalletHold and fee-calculation-log references;
- state `held`, `captured`, or `released`;
- capture/release timestamps;
- standard timestamps and soft deletion.

This table is a Request-specific financial snapshot, not a second wallet or ledger.

Extend `WalletHold` so exactly one supported business reference is present: existing `bookingOrderId` or new `exchangePostId`. `bookingOrderId` becomes nullable, `exchangePostId` is nullable and indexed, and a database check prevents both-null or both-present rows. Existing Booking rows and behavior are preserved.

Extend `FeeCalculationLog` with an optional indexed Exchange post reference. Add dedicated ledger transaction types for Request fee freeze, capture, and release so finance reconciliation can classify the lifecycle without overloading Booking transaction types.

### 5.3 Fee policy

Create a managed fee family with stable identifiers:

- family: `exchange_request_publication`
- fee type: `exchange_request_publication_fee`
- order type: `exchange_request`
- calculation: fixed
- pricing lock: at publication
- initial effective amount: 1,000 NDP

Operations changes create a new effective-dated rule-set version. They never mutate historical versions. The publication transaction resolves one effective active version and stores its exact identifiers and amount. The amount is per Request, not multiplied by target-provider count.

## 6. Transaction and State Design

### 6.1 Publish

`POST /api/v1/exchange/posts` retains the current idempotency-key contract. For `type=demand`, one database transaction performs this ordered authority:

1. Revalidate the active identity, ownership, role permission, and non-deleted scope.
2. Resolve the membership or shop capacity and validate `targetProviderCount`.
3. Resolve the active publication-fee version and calculate the immutable fee.
4. Resolve and row-lock the correct wallet and currency.
5. Reject insufficient available balance before any durable business row is committed.
6. Create `ExchangePost`, `ExchangeDemand`, fee calculation, financial snapshot, and WalletHold.
7. Move the fee amount from available to frozen through one immutable ledger transaction.
8. Write finance reconciliation and audit evidence.
9. Commit and return the redacted Request DTO plus a non-sensitive publication-fee summary.

An identical idempotency retry returns the original result and never creates another Request or another hold. A reused key with different input fails as a conflict.

### 6.2 Publisher withdrawal before matching

The existing owner withdrawal endpoint is extended for Request financial authority. In one transaction it:

1. locks the Request, financial snapshot, hold, payer wallet, and same-currency platform wallet;
2. requires `published` plus `held` state;
3. changes the Request to `withdrawn`;
4. debits the full frozen amount and credits the platform wallet in the same currency;
5. marks the hold and financial snapshot captured;
6. writes ledger, reconciliation, and audit evidence.

The fee is not refunded. A later claim microstep will cancel every still-active claim and notify each claimant within the same withdrawal authority.

### 6.3 Natural expiry without a match

The existing expiry worker is extended transactionally. It locks an eligible published Request and its financial records, changes the post to `expired`, returns the complete frozen amount to the original available wallet, marks the hold and financial snapshot released, and records ledger, reconciliation, and audit evidence.

When claims exist later but no match has formed, expiry will cancel those claims and still release the full publication fee. A terminal Request cannot be captured or released twice.

### 6.4 Later terminal flows preserved by the design

- A provider may withdraw its claim without fee before matching.
- A matched cancellation requires both parties' agreement and captures the publication fee without refund.
- Fulfillment completion captures the publication fee to platform income.
- Losing claims are automatically cancelled when matching succeeds.

These transitions are not callable until their own approved microsteps add the required claim, match, booking, and notification aggregates.

### 6.5 Test NDP and finance reporting

The account classification determines the wallet currency. A test merchant's scoped shop wallet is `TEST_NDP`; a formal merchant's is `NDP`. Publication never silently creates spendable value or falls back to a different currency.

For local acceptance, required test-shop wallets are funded to 100,000 TEST_NDP through the formal Test NDP provisioning/ledger/reconciliation authority before publishing. The publication endpoint itself never tops up a wallet.

Captured Test NDP is credited only to the platform Test NDP wallet. Finance surfaces show formal and test consumption separately, for example `999 NDP` with `+ 999 Test NDP` as secondary text. Settlement/export totals exclude Test NDP while reconciliation includes its separate currency totals.

## 7. API, RBAC, and Audit

### 7.1 Existing endpoints to extend

- `GET /api/v1/exchange/posts` remains paginated and server-scoped.
- `GET /api/v1/exchange/posts/:id` applies the same privacy projection as the list.
- `POST /api/v1/exchange/posts` accepts the upgraded strict demand branch and leaves Intelligence unchanged.
- `POST /api/v1/exchange/posts/:id/withdraw` performs the Request capture transaction for an owned published Request.

### 7.2 Publication context

Add one authenticated read endpoint under the existing Exchange router for the Request composer. It returns only:

- current publisher capacity source;
- effective membership level when applicable;
- maximum target-provider count;
- active publication fee and currency;
- whether the current identity may publish.

It does not return internal user IDs, wallet IDs, exact wallet balance, rule internals, or another shop's information. The existing wallet API remains the balance authority.

### 7.3 Permissions

- Continue using `exchange:posts:create-demand` for Request publication and publication-context access.
- Keep `exchange:posts:withdraw-own` for owner withdrawal.
- Assign Request publication by default to customer and `merchant_owner` roles.
- Do not assign it to `merchant_staff` by default; explicit RBAC assignment is required.
- Do not assign it to technician, platform, or unrelated roles.
- Keep Intelligence publication limited to merchant and technician identities.

The Service still validates active identity type and scope after middleware permission checks. Permission possession alone cannot turn an unrelated identity into a publisher.

### 7.4 Audit actions

At minimum, emit searchable audit actions for:

- Request publication and capacity snapshot;
- publication-fee freeze;
- Request owner withdrawal and fee capture;
- natural expiry and fee release;
- Request publication-fee rule version creation/activation;
- Test shop-wallet provisioning used for acceptance;
- controlled old-demand soft deletion and new fixture rebuild.

Audit metadata contains identifiers, states, amount, currency, and rule versions, but no access tokens, contact details, or unredacted private address data.

## 8. Frontend Design

The current high-fidelity fullscreen Request composer is extended in place. The list, Intelligence composer, Request detail, theme tokens, navigation, and mobile structure are preserved.

Required Request controls:

- target-provider count selector, capped by the publication-context response;
- quick/selective mode;
- total/per-provider budget mode;
- optional minimum and required maximum budget;
- required Address 1;
- optional Address 2 and Address 3 with independent general-visibility switches;
- publisher identity-group visibility switch;
- service window, title, details, locale, and current Request fields;
- pre-submit fee/currency/frozen-funds disclosure.

Every required label displays `*`. Address 1 has no privacy switch because it is always visible to authorized Request viewers. Optional address switches are disabled or cleared when their address line is empty.

The merchant Exchange composer gains an explicit Request/Intelligence choice when its RBAC allows Request publication. The customer composer remains Request-only; the technician composer remains Intelligence-only.

The UI does not calculate authority, membership limits, currency, fee, or financial outcomes. It renders server values and server error keys. User-authored Request bodies and comments retain their original language and are never automatically pseudo-translated.

All new interface text is supplied in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean through the existing Exchange i18n module.

## 9. Controlled Test-Data Rebuild

The existing 20 seeded demands may be replaced because the user explicitly approved rebuilding them for the upgraded contract. The rebuild is local/test-only and must refuse remote or production-looking database configuration.

1. Select only the known Exchange demand fixture cohort; never select Intelligence or unrelated user content.
2. Soft-delete the old demand posts and their demand-side interactions in foreign-key-safe order, with an audit manifest that permits recovery.
3. Preserve all 20 Intelligence posts and their existing persisted interactions.
4. Authenticate real test accounts and publish 20 upgraded Requests through the formal API, exercising customer membership levels and shop merchants.
5. Create 3–10 comments, 10–66 distinct likes, and 2–15 shares per new Request through formal authenticated interaction APIs.
6. Verify every created row is persisted, owned by a real test identity, visible only within the approved privacy scope, and backed by the required fee hold and audit evidence.

No direct fabricated engagement totals, mock arrays, localStorage business state, or fake API success paths are allowed.

## 10. Verification Gates

### 10.1 Automated tests

- Prisma validation, generated-client check, and migration contract tests.
- Unit tests for all four customer limits, merchant limit 20, inactive membership, identity scope, budget validation, address disclosure, payer selection, fee snapshots, and terminal-state guards.
- Service/repository tests for insufficient funds rollback, currency separation, idempotent retry, stale fee version, withdrawal capture, expiry release, and duplicate terminal concurrency.
- API integration tests for Zod rejection, OpenAPI permission declarations, customer cross-account 404 behavior, merchant/technician market reads, staff denial, explicit staff grant, redacted DTOs, owner DTOs, and pagination.
- Ledger and reconciliation tests proving exact available/frozen/platform deltas for `NDP` and `TEST_NDP`.
- Frontend tests for required markers, dynamic limits, merchant mode choice, budget modes, address switches, fee disclosure, server errors, and all five languages.
- Existing Exchange, Booking, Schedule, Order, Wallet/Ledger, Payment, RBAC, and production-build regression suites.

### 10.2 Real database checks

Apply the additive migration to the approved local MySQL instance only. Compare repository migration history, Prisma schema, `_prisma_migrations`, and actual table/index/check definitions. Verify publication, withdrawal, expiry, financial balances, reconciliation rows, audit rows, and test-data counts with independent read queries.

### 10.3 Browser acceptance

Use the formal backend and the frontend owned by this worktree. With real test accounts, verify:

- standard, silver, gold, and black customer limits;
- merchant-owner 1–20 publication from the active shop and staff denial/default behavior;
- an explicitly granted staff permission when included in the test fixture;
- fee preview, exact wallet freeze, insufficient-balance failure, withdrawal capture, and expiry release;
- owner/private/provider-visible address and identity projections across separate sessions;
- customer inability to access another customer's Request;
- persisted state after refresh, logout/login, backend restart, and concurrent duplicate submission;
- 20 upgraded Requests and unchanged 20 Intelligence posts with required interaction ranges;
- desktop and mobile layouts, five languages, required markers, no overflow, and no application console errors.

No test/build result substitutes for this browser acceptance. The microstep stops after evidence is recorded and does not proceed to claims.

## 11. Rollback and Safety

- Work only in the isolated `codex/exchange-request-publication` worktree.
- Keep schema changes additive; do not edit applied migrations.
- Preserve preexisting Booking fee families, WalletHold rows, ledger entries, and payment state.
- Use soft deletion and a recorded fixture manifest so the old demand cohort can be restored if acceptance fails.
- Reject production or remote database targets in fixture/provisioning tools.
- Do not push, deploy, call an external payment provider, or perform a real charge without explicit authorization.
- Do not merge while any new contract, migration, unit, integration, regression, real-database, or browser gate is red.

## 12. Completion Boundary

This microstep is complete only when the migration, layered backend, fee administration, financial transaction paths, high-fidelity frontend, controlled fixture rebuild, automated tests, real-MySQL checks, and browser acceptance all pass and the evidence is reported to the user.

Completion authorizes a review of this publication foundation only. Claim implementation begins only after a separate approved design and plan.
