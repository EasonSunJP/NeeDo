# NeeDo API Contract

> Current formal backend prefix: `/api/v1`.

All formal APIs return the shared envelope:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

Paginated list APIs return:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

## Formal Registration, Password Login, And Google Authentication

These endpoints are database-backed formal APIs. OTP and Google nonce values
are never returned by an API response or written to application logs. Unless a
row below says public, send `Authorization: Bearer <access-token>` and satisfy
the listed RBAC permission. All request bodies are strict JSON objects.

### Public registration and login

| Method | Path | Request | Success `data` | Auth |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | `{ "email": "user@example.com", "password": "<strong-password>" }` | `{ challengeId, maskedEmail, expiresIn, cooldownSeconds }` | Public, rate limited |
| `POST` | `/api/v1/auth/register/verify` | `{ "challengeId": "<uuid>", "otp": "123456" }` | `{ accessToken, refreshToken, expiresIn, needoId }` | Public, rate limited |
| `POST` | `/api/v1/auth/login` | `{ "loginIdentifier": "<verified-email-or-NeeDoID>", "password": "<password>" }` | `{ accessToken, refreshToken, expiresIn }` | Public, rate limited |

`POST /api/v1/auth/register` only stores a time-limited verification challenge.
It does not create a `User`. The verify call atomically creates one active
baseline customer with a verified email, the default customer identity and
role, a bcrypt cost-12 password hash, profile records, and an immutable
NeeDoID. A NeeDoID is lowercase `n` plus ten decimal digits. The initial
nickname/profile display name equals the NeeDoID; later display-name edits do
not change the NeeDoID. Subsequent password login does not send another OTP.

`loginIdentifier` accepts the normalized verified email address or immutable
NeeDoID. It does not accept an editable nickname. Invalid email/NeeDoID/password
combinations use the same generic invalid-credentials response.

### Google sign-in and first use

| Method | Path | Request | Success `data` | Auth |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/google/init` | `{}` | `{ clientId, nonce, nonceChallengeId, expiresIn }` | Public, rate limited |
| `POST` | `/api/v1/auth/google` | `{ credential, nonceChallengeId }` | Linked: `{ status: "authenticated", accessToken, refreshToken, expiresIn }`; first use: `{ status: "verification_required", challengeId, maskedEmail, expiresIn, cooldownSeconds }` | Public, rate limited |
| `POST` | `/api/v1/auth/google/verify` | `{ challengeId, otp }` | `{ accessToken, refreshToken, expiresIn }`, plus `needoId` only when this verification creates a new account | Public, rate limited |

The browser must pass the nonce from `/auth/google/init` to Google Identity
Services and return Google's ID-token `credential` with its
`nonceChallengeId`. The backend verifies signature, issuer, audience, nonce,
expiry, email, and Google's `email_verified` claim. A nonce is one-time use.

When the Google subject is already linked, the submit call signs in directly.
On first use, NeeDo sends a six-digit OTP to the verified Google email. OTP
verification links an existing NeeDo account with the same verified email, or
creates a distinct Google-only baseline customer when none exists. It never
silently merges a Google subject already owned by another user. NeeDo issues
its own JWT/session pair; Google access tokens and refresh tokens are not
stored.

### Authenticated account security

| Method | Path | Request | Success `data` | Permission |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/google/link` | none | `{ linked, maskedEmail, hasPassword, canUnlink }` | `auth:google:read` |
| `POST` | `/api/v1/auth/google/link/init` | `{}` | `{ clientId, nonce, nonceChallengeId, expiresIn }` | `auth:google:link` |
| `POST` | `/api/v1/auth/google/link` | `{ credential, nonceChallengeId }` | `{ challengeId, maskedEmail, expiresIn, cooldownSeconds }` | `auth:google:link` |
| `POST` | `/api/v1/auth/google/link/verify` | `{ challengeId, otp }` | `{ linked: true }` | `auth:google:link` |
| `POST` | `/api/v1/auth/password/setup` | `{ password: "<strong-password>" }` | `{ challengeId, maskedEmail, expiresIn, cooldownSeconds }` | `auth:password:setup` |
| `POST` | `/api/v1/auth/password/setup/verify` | `{ challengeId, otp }` | `{ hasPassword: true }` | `auth:password:setup` |
| `POST` | `/api/v1/auth/google/unlink` | `{}` | `{ challengeId, maskedEmail, expiresIn, cooldownSeconds }` | `auth:google:unlink` |
| `POST` | `/api/v1/auth/google/unlink/verify` | `{ challengeId, otp }` | `{ signedOut: true }` | `auth:google:unlink` |

Linking Google always uses an authenticated, user-bound nonce and then an OTP
sent to the NeeDo account email. A Google-only account must complete password
setup before unlink is permitted, so an account cannot lose its final login
credential. Successful unlink deletes the Google binding, increments the
authoritative session generation, revokes every refresh session, blacklists
the current access token for its remaining lifetime, and returns
`signedOut: true`. The client must clear its local session immediately. The
unlink verification endpoint is retry-safe through a short-lived completion
receipt even after the access token has been invalidated.

### Stable authentication errors

| Message key | HTTP | Meaning |
|---|---:|---|
| `error.auth.google_credential_invalid` | `401` | Invalid/replayed credential, consumed or unknown nonce, or rejected Google claims |
| `error.auth.google_nonce_invalid` | `401` | Google ID token nonce does not match the expected one-time nonce |
| `error.auth.google_conflict` | `409` | Google subject/credential ownership conflict, password already exists, or unlink would remove the last credential |
| `error.auth.verification_challenge_expired` | `401` | Challenge is absent, expired, cancelled, reserved, mismatched, or already finalized |
| `error.auth.verification_code_invalid` | `401` | OTP is incorrect but attempts remain |
| `error.auth.verification_attempts_exhausted` | `429` | Final allowed OTP attempt failed; the challenge is destroyed |
| `error.auth.otp_cooldown` | `429` | A new challenge for the protected email/purpose is temporarily blocked |
| `error.dependency.google_auth_unavailable` | `503` | Required Google-capable repository wiring is unavailable or outdated |
| `error.auth.otp_delivery_not_configured` | `503` | No configured email delivery webhook is available |
| `error.auth.otp_delivery_failed` | `502` | Configured email webhook timed out, failed, or returned a non-2xx response |

Google ID-token verification exceptions, timeouts, and rejected claims collapse
to `error.auth.google_credential_invalid` with `401`; the API does not disclose
whether a credential, key fetch, or provider call failed. Provider errors never
include a credential, subject, nonce, OTP, provider token, or raw exception in
the response. The machine-readable OpenAPI document remains authoritative for
schemas and the shared `{ code, message, data }` envelope.

## Step 08 Core Read APIs

These APIs are read-only and database-backed. They do not create bookings, schedules, wallets, IM, Social records, or frontend mock replacements.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/v1/categories` | Paginated public category list | Public |
| `GET` | `/api/v1/services` | Paginated public service cards | Public |
| `GET` | `/api/v1/services/:id` | Public service detail | Public |
| `GET` | `/api/v1/home/recommendations` | Home recommendation rows | Public |
| `GET` | `/api/v1/search` | Typed shop, technician, or service search | Public |
| `GET` | `/api/v1/shops/:id` | Public shop detail | Public |
| `GET` | `/api/v1/technicians/:id` | Public technician detail | Public |
| `GET` | `/api/v1/profiles/customers/:id` | Public customer profile without account credentials | Public |

### Common Query Parameters

`GET /categories`

| Name | Type | Notes |
|---|---|---|
| `page` | integer | Defaults to `1`. |
| `pageSize` | integer | Defaults to `20`, max `100`. |
| `parentId` | integer | Optional category parent filter. |

`GET /services`

| Name | Type | Notes |
|---|---|---|
| `keyword` | string | Matches service, category, shop, or technician text. |
| `categoryId` | integer | Filters by category. |
| `shopId` | integer | Filters by shop. |
| `technicianId` | integer | Filters by technician profile. |
| `city` | string | Filters by city. |
| `serviceMode` | string | Example: `store`, `onsite`. |
| `minPrice` / `maxPrice` | number | Validated so min cannot exceed max. |
| `sort` | enum | `recommended`, `rating_desc`, `price_asc`, `price_desc`, `newest`. |
| `page` / `pageSize` | integer | Same pagination contract as above. |

`GET /search`

| Name | Type | Notes |
|---|---|---|
| `entityType` | enum | `shop`, `technician`, or `service`; defaults to `service` for legacy callers. |
| `keywords` | repeated string | Up to 20 unique, trimmed values. Matching any keyword is sufficient. |
| `categoryIds` | repeated integer | Up to 20 unique positive category IDs. Matching any category is sufficient. |
| `keyword` | string | Legacy singular keyword; retained for backward-compatible service search. |
| `city` | string | Optional direct city filter where supported by the selected entity type. |
| `categoryId` / `shopId` / `technicianId` | integer | Existing strict service filters retained for legacy service callers. |
| `serviceMode` | string | Existing service-mode filter. |
| `minPrice` / `maxPrice` | number | Existing service-price filters; min cannot exceed max. |
| `sort` | enum | `recommended`, `rating_desc`, `price_asc`, `price_desc`, `newest`. |
| `page` / `pageSize` | integer | Defaults to page `1`, page size `20`; maximum page size is `100`. |

Repeat array values as query keys instead of comma-joining them:

```text
GET /api/v1/search?entityType=shop&keywords=LifeDance&keywords=家政&categoryIds=3&categoryIds=9&page=1&pageSize=20
```

Keywords, category IDs, and their two groups use OR semantics: a published record matching any supplied keyword or any selected category may appear. Shop and technician names use trimmed substring containment, so `LifeDance` and `Wellness 渋谷` can each match `LifeDance Wellness 渋谷`; a multi-word value stays one phrase. Shop `shop##########` and technician `s##########` public IDs use exact matching.

The response keeps the shared success envelope and returns exactly one typed paginated page selected by `entityType`: `ShopCard`, `TechnicianCard`, or `ServiceCard`. Published status, active formal public identifiers, and `deletedAt IS NULL` remain mandatory. A shop or technician may be searchable without a published service; search visibility does not imply that the entity is currently bookable, and the client must not fabricate price, service, or availability data.

`GET /home/recommendations`

| Name | Type | Notes |
|---|---|---|
| `city` | string | Optional city filter for service/shop/technician rows. |
| `limit` | integer | Defaults to `6`, max `20`. |

### Stable DTOs

`Category`

- `id`, `code`, `name`, `nameJa`, `nameEn`, `parentId`, `iconUrl`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`

`ServiceCard`

- `id`, `name`, `description`, `category`, `shop`, `technician`, `city`, `priceAmount`, `currency`, `durationMinutes`, `coverUrl`, `reviewSummary`

`ShopDetail`

- Includes `ShopCard` fields plus `description`, `phone`, `latitude`, `longitude`, `mediaAssets`, `services`, `technicians`, `createdAt`, `updatedAt`

`TechnicianDetail`

- Includes `TechnicianCard` fields plus `bio`, `serviceArea`, `yearsExperience`, `mediaAssets`, `services`, `createdAt`, `updatedAt`

`CustomerProfile`

- `id`, `displayName`, `city`, `bio`, `avatarUrl`, `membershipLevel`, `reviewSummary`, `createdAt`, `updatedAt`
- Account credentials and private fields such as `email`, `phone`, `passwordHash`, tokens, and OTP values are never returned.

## Order Performance And Special Cancellation

Technician acceptance rate is derived from formal order outcomes and cannot be edited as a percentage:

```text
acceptanceRate = completedOrderCount
  / (completedOrderCount + accountableCancellationCount + accountableUncompletedCount)
```

The stored rate uses basis points (`10000` = 100%). When the denominator is zero the result is 100%. Outcomes whose current treatment is `special_excluded` are recorded but omitted from the denominator. Applying or revoking an exclusion rebuilds the technician summary from source orders and assessment records.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `POST` | `/api/v1/backoffice/orders/:id/technician-uncompleted` | Classify an eligible cancelled, assigned order as technician-caused uncompleted | `backoffice:order-performance:write` |
| `POST` | `/api/v1/backoffice/orders/:id/special-cancellation` | Exclude a counted technician cancellation or uncompleted outcome | `backoffice:order-performance:write` |
| `POST` | `/api/v1/backoffice/orders/:id/special-cancellation/revoke` | Revoke the exclusion after a later review or complaint | `backoffice:order-performance:write` |

All three commands use a strict body with required `publicReason`, `idempotencyKey`, and `expectedRevision`; nullable `internalNote` is optional. Clients never submit an acceptance-rate value. Stale revisions and conflicting idempotency re-use return `409`, missing assessments return `404`, and ineligible state changes return `422`. Every successful mutation appends an immutable assessment revision and an audit record in the same transaction.

Booking order responses retain the existing `statusHistory` field unchanged. They also return `performanceAssessment` and a `timelineEvents` discriminated union sorted by `createdAt` and then stable prefixed ID. Event IDs use `status:<id>` or `performance:<id>`, and event types are `ORDER_STATUS_CHANGED`, `TECHNICIAN_CANCEL_CLASSIFIED`, `TECHNICIAN_UNCOMPLETED_CLASSIFIED`, `SPECIAL_CANCELLATION_APPLIED`, and `SPECIAL_CANCELLATION_REVOKED`. Customer and technician order responses expose only `publicReason`; `internalNote` is operations-only and is available solely from an authorized backoffice order-detail projection.

## Current Customer Self-Profile API

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/v1/customer-profile/me` | Read the profile resolved from the authenticated customer identity | `customer-profile:read` |
| `PATCH` | `/api/v1/customer-profile/me` | Update only editable fields on that resolved profile | `customer-profile:write` |
| `GET` | `/media/customer-avatars/:contentHash.ext` | Read one immutable customer avatar image | Public, hash filename only |

The self-profile response includes `id`, `displayName`, `avatarUrl`, `gender`, `age`, `heightCm`, `languages`, `bio`, `visibility`, and `membershipLevel`, plus its scoped metadata. Updates accept only non-empty partial payloads of the editable display, demographic, language, bio, visibility, and validated image-data fields. The API derives the customer-profile ID from the access token; clients cannot select another profile. Each successful update writes an audit event.

Avatar bytes are served only when the requested filename is a SHA-256 content hash with a supported `.jpg`, `.png`, or `.webp` extension. Successful avatar responses are immutable-cacheable for one year; directory requests and arbitrary filenames return `404`.

## Shop Membership Card Plans And NDP Reward Fee

All endpoints below are database-backed, use strict Zod validation, and are described in OpenAPI. Merchant routes derive the shop exclusively from the authenticated `shop` identity; they never accept a client-supplied shop ID.

### Merchant card plans

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/merchant-admin/shop-membership-card-plans` | Paginated plans for the current shop | `shop.member.card_plan.view` |
| `POST` | `/api/v1/merchant-admin/shop-membership-card-plans` | Create a plan and version-1 draft | `shop.member.card_plan.manage` |
| `GET` | `/api/v1/merchant-admin/shop-membership-card-plans/:publicId` | Read one current-shop plan | `shop.member.card_plan.view` |
| `PATCH` | `/api/v1/merchant-admin/shop-membership-card-plans/:publicId/draft` | Save the editable draft using `expectedLockVersion` | `shop.member.card_plan.manage` |
| `POST` | `/api/v1/merchant-admin/shop-membership-card-plans/:publicId/preview` | Evaluate the draft with a server-side scenario | `shop.member.card_plan.view` |
| `POST` | `/api/v1/merchant-admin/shop-membership-card-plans/:publicId/publish` | Publish the draft with a fee snapshot | `shop.member.card_plan.publish` |
| `POST` | `/api/v1/merchant-admin/shop-membership-card-plans/:publicId/retire` | Retire an active plan | `shop.member.card_plan.manage` |

Drafts accept `cardType` values `stored_value`, `count`, or `benefit`; validity may be `never`, `fixed_days`, or `fixed_date`. Initial issuance limits contain nullable minimum/maximum principal JPY and use counts. Reward caps contain nullable per-order, per-day, per-month, and lifetime NDP ceilings.

Supported rule kinds are `fixed_per_completion`, `percent_of_eligible_amount`, `spend_block`, `first_card_use_bonus`, `service_scope_bonus`, `completion_milestone_bonus`, `spend_milestone_bonus`, `birthday_month_bonus`, `schedule_window_bonus`, and `consecutive_month_bonus`. Rules may scope or exclude current-shop services and categories and may carry an active interval. Discounts, non-NDP gifts, free services, and bonus service counts are not valid rule types.

Preview returns matched rule details plus `customerRewardNdp`, `platformFeeNdp`, and `totalShopDebitNdp`. The platform fee is rounded up from the customer reward. Publishing stores the effective fee policy public ID and basis-point rate on the immutable version; later fee versions do not alter that snapshot. Saving or publishing does not reserve wallet funds and does not write ledger entries.

### Merchant card issuance

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `POST` | `/api/v1/merchant-admin/shop-memberships/:membershipPublicId/cards` | Issue one card from the current active published plan version to a current-shop active member | `shop.member.card.issue` |

The strict request contains `planPublicId`, nullable `initialPrincipalJpy`, nullable `initialUses`, `issuanceSource`, nullable `issuanceReference`, nullable `issuanceNote`, and `idempotencyKey`. `issuanceSource` is `offline_paid`, `historical_replacement`, or `manual_grant`. Offline payment requires a reference or note; the other sources require a note.

Stored-value plans require principal within the published issuance range and create zero bonus balance. Count plans require uses within the published range. Benefit plans reject both values. The server derives issue time and expiry from the current published version and snapshots the exact plan version and platform fee rate. Card, audit, and customer notification commit atomically. An identical idempotent replay returns the original card with `replayed: true`; the same key with changed normalized content returns `409`.

Issuance does not debit a store wallet, credit customer NDP, or create ledger entries. Platform fees are charged only at a later actual reward settlement node. Internal issuance references and notes are returned to the authorized merchant issuance response but are excluded from shared customer card reads.

### Membership card adjustment approval

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `POST` | `/api/v1/merchant-admin/shop-membership-cards/:publicId/adjustment-requests` | Request one final principal or remaining-use target for a current-shop card | `shop.member.card.adjust.request` |
| `GET` | `/api/v1/merchant-admin/shop-membership-card-adjustment-requests` | Paginated current-shop request history | `shop.member.card.adjust.request` |
| `POST` | `/api/v1/merchant-admin/shop-membership-card-adjustment-requests/:publicId/cancel` | Cancel a still-pending current-shop request | `shop.member.card.adjust.request` |
| `GET` | `/api/v1/customer-profile/me/shop-membership-card-adjustment-requests` | Paginated requests owned by the current customer | `customer-profile:read` |
| `POST` | `/api/v1/customer-profile/me/shop-membership-card-adjustment-requests/:publicId/decision` | Explicitly approve or reject an owned pending request | `customer-profile:read` |

Create accepts exactly one of `targetPrincipalBalanceJpy` or `targetRemainingUses`, plus a 1–500 character `reason` and `idempotencyKey`. The backend derives shop, customer, card type, current value and `lockVersion`; callers cannot submit a before-value or choose another identity. Stored-value changes affect principal only and preserve bonus. Count changes move `totalUses` by the same delta as `remainingUses`, preserving already-consumed uses. Benefit cards are not adjustable in this microstep.

Requests are `pending`, `approved`, `rejected`, `cancelled`, `expired`, or `invalidated`. A customer may approve only while the database clock is strictly before `expiresAt`; at the exact deadline the request expires and the card remains unchanged. Approval uses a row lock plus card snapshot compare-and-swap. If the card changed after submission, the request becomes `invalidated` instead of overwriting newer data. Request, decision, audit and notification writes are transactional, and request/decision retries are idempotent.

The adjustment path does not debit a store wallet, credit customer NDP, change bonus balance, or create a finance ledger row. Top-up, redemption, refund and actual rule-driven NDP settlement remain separate state-machine microsteps.

### Operations membership reward fee

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/backoffice/membership-reward-fee-policy` | Current, next scheduled, latest version, and paginated history | `page:backoffice-membership-reward-fee` |
| `POST` | `/api/v1/backoffice/membership-reward-fee-policy/versions` | Create the next immutable version | `button:backoffice-membership-reward-fee-create` |

The create body requires `feeRateBps` from 0 through 10,000, `expectedVersion`, ISO-8601 `effectiveFrom`, and a non-empty reason. The initial version is 1000 bps (10%). Creating a version writes an audit record; stale versions or overlapping policy boundaries return a conflict response.

Top-up, redemption, refund, and reward ledger settlement remain outside these configuration, issuance, and adjustment endpoints and must be implemented as separate state-machine microsteps.

Full machine-readable OpenAPI is served at `/api/v1/openapi.json` when `OPENAPI_ENABLED=true`.
