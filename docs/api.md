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
| `GET` | `/api/v1/services` | Paginated visibility-filtered service cards | Optional bearer |
| `GET` | `/api/v1/services/:id` | Visibility-filtered service detail | Optional bearer |
| `GET` | `/api/v1/services/:id/reviews` | Paginated reviews for a visible completed-order service | Optional bearer |
| `GET` | `/api/v1/home/recommendations` | Visibility-filtered home recommendation rows | Optional bearer |
| `GET` | `/api/v1/search` | Typed visibility-filtered shop, technician, or service search | Optional bearer |
| `GET` | `/api/v1/shops/:id` | Visibility-filtered shop detail | Optional bearer |
| `GET` | `/api/v1/technicians/:id` | Public technician detail with hidden shop relations omitted | Optional bearer |
| `GET` | `/api/v1/profiles/customers/:id` | Customer profile filtered by its saved visibility policy | Optional bearer |

For public technician navigation, `:id` is canonically the lowercase NeeDoID
`s##########`. A positive numeric `TechnicianProfile.id` remains accepted only
as a transition and internal-caller compatibility lookup. The response retains
both `id` (internal relation key) and `publicId` (public identity); new public UI
links must use `publicId` and must not display the numeric key as the account ID.

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

`GET /services/:id/reviews`

| Name | Type | Notes |
|---|---|---|
| `page` | integer | Defaults to `1`. |
| `pageSize` | integer | Defaults to `20`, max `100`. |

Only reviews linked to completed, non-deleted booking orders for the requested
published service are returned. Each row exposes the effective rating and
comment (including the latest review amendment), the reviewer display identity,
the first effective review tag as the optional title, and active image media
attached to that review. Account credentials and non-image attachments are not
exposed.

### Operations review management

| Method | Path | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/backoffice/reviews` | Server-paginated formal completed-order reviews | `backoffice:users:read` |
| `GET` | `/api/v1/backoffice/reviews/:reviewId` | One formal review with related order, user, shop, technician and immutable amendments | `backoffice:users:read` |
| `POST` | `/api/v1/backoffice/reviews/:reviewId/amendments` | Append an audited immutable amendment for a user-authored customer or technician review | `backoffice:customers:write` |

The global list has a fixed `page_size=20` and accepts `keyword`, effective
`rating`, persisted-fact `status` (`original`, `amended`, or `system`),
`targetType`, and inclusive Tokyo calendar dates `from` / `to`. Effective rating
and comment come from the latest non-deleted amendment when one exists. The
response includes only reviews attached to non-deleted completed orders; it does
not invent reply, moderation, or risk states that are absent from persistence.
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
| `latitude` / `longitude` | number pair | Optional search origin for technicians. Both values must be sent together. |
| `page` / `pageSize` | integer | Defaults to page `1`, page size `20`; maximum page size is `100`. |

Repeat array values as query keys instead of comma-joining them:

```text
GET /api/v1/search?entityType=shop&keywords=LifeDance&keywords=家政&categoryIds=3&categoryIds=9&page=1&pageSize=20
```

Keywords, category IDs, and their two groups use OR semantics: a published record matching any supplied keyword or any selected category may appear. Shop and technician names use trimmed substring containment, so `LifeDance` and `Wellness 渋谷` can each match `LifeDance Wellness 渋谷`; a multi-word value stays one phrase. Shop `shop##########` and technician `s##########` public IDs use exact matching.

The response keeps the shared success envelope and returns exactly one typed paginated page selected by `entityType`: `ShopCard`, `TechnicianCard`, or `ServiceCard`. Published status, active formal public identifiers, and `deletedAt IS NULL` remain mandatory. A shop or technician may be searchable without a published service; search visibility does not imply that the entity is currently bookable, and the client must not fabricate price, service, or availability data.

Shop discovery uses the persisted `Shop.visibility` source of truth before pagination and totals. Anonymous reads receive only `public`; the owner can always read its shop; `limited` additionally permits reciprocal active friends; `network` additionally permits active formal customer, booking, technician-affiliation, merchant-membership, business-contact, or introducer relationships for the selected identity. `privateAll` is owner-only. A denied direct read returns the existing not-found envelope, and related service, favorite/share, booking-navigation, availability, and booking-create boundaries apply the same policy. Public customer and technician profile authorities remain independent, but hidden shop data and shop-owned services are omitted from technician projections.

The merchant visibility command is scoped to the signed active shop identity and writes the shop row plus its audit record in one database transaction:

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/merchant-admin/shops/:shopId/visibility` | Read persisted shop visibility | `merchant-admin:shop:read` |
| `PUT` | `/api/v1/merchant-admin/shops/:shopId/visibility` | Set `public`, `privateAll`, `limited`, or `network` | `merchant-admin:shop:write` |

Authorization-bearing visibility-aware GET responses are `private, no-store`. Anonymous visibility-aware responses use `public, no-cache` with `Vary: Authorization`, so stored responses must be revalidated before reuse and public-to-private revocation takes effect immediately.

When `entityType=technician` and a complete origin pair is present, candidate distance uses the nearest valid location among the technician's private personal service base and active, published, viewer-visible affiliated shops. The backend starts at 3 km and expands exactly 1 km at a time until at least three eligible technicians are available or every eligible located technician is included. It then sorts the complete final-radius set by comprehensive rating, completed-order count, review count, account registration time, and stable profile ID before applying pagination. `distanceKm`, `nearbyRank`, and `resolvedRadiusKm` are optional `TechnicianCard` fields and are absent when no origin was supplied. A technician's comprehensive rating includes one platform-provided five-star prior: zero formal reviews therefore returns `5.00`, while one formal four-star review returns `4.50`; `reviewCount` continues to report only real formal reviews. The same effective rating is projected by public discovery/detail/booking cards, favorites and shared contact cards, and both operations and merchant backoffice technician list/detail APIs; the persisted review average remains the real-review aggregate.

Personal service-base coordinates are self-only profile data. Public search and public technician-card/detail responses never return `baseLatitude`, `baseLongitude`, `serviceBase`, or affiliated-shop coordinates through the technician object.

### Entity Favorites And Successful Shares

These endpoints are authenticated and database-backed. Favorite ownership is always the NeeDo user account, so switching the active customer/technician/merchant identity neither duplicates nor hides a favorite. Review totals are separate from favorite and share totals.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `PUT` | `/api/v1/me/entity-favorites/:targetType/:publicId` | Idempotently favorite one published shop or technician | `entity-favorite:write` |
| `DELETE` | `/api/v1/me/entity-favorites/:targetType/:publicId` | Idempotently remove the favorite | `entity-favorite:write` |
| `GET` | `/api/v1/me/entity-favorites` | Paginated current-account favorites | `entity-favorite:read` |
| `POST` | `/api/v1/me/entity-favorites/statuses` | Batch `1..100` target states and authoritative counts | `entity-favorite:read` |
| `POST` | `/api/v1/entities/:targetType/:publicId/shares/needo` | Atomically commit a NeeDo message and successful share event | `entity-share:write` |
| `POST` | `/api/v1/entities/:targetType/:publicId/shares/system` | Record a platform share only after client capability success | `entity-share:write` |

`targetType` is `shop` with `shop##########`, or `technician` with `s##########`. Page/card clients must batch favorite status reads rather than issue one request per card.

Both share commands require a UUID `idempotencyKey`. Replaying the same key and same command returns the original receipt without incrementing `shareCount`; reusing it for a different payload returns `409 error.idempotency_key_reused`. A NeeDo share increments only if both the eligible message and append-only share event commit. The system-share endpoint is a success-report endpoint: the server does not invoke a browser capability and the client must not call it after capability cancellation or failure.

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
- `public` profiles are readable anonymously. `privateAll` profiles are readable only by the profile owner. `limited` additionally permits an active reciprocal friend contact. `network` additionally permits an active non-friend business contact, a qualifying affiliate relationship, the current merchant shop, or the current technician when a non-deleted booking establishes that relationship.
- A supplied bearer token is validated and contributes only its selected identity and shop scope; an invalid supplied token returns `401`. Missing profiles and profiles hidden from the current viewer both return the same `404 error.customer_profile.not_found` response to avoid disclosing that a private profile exists.
- Customer profile responses use `Cache-Control: no-store`. Clients must not place these relationship-scoped responses in a shared or public persistent cache.

## Order Performance And Special Cancellation

Technician acceptance rate is derived from formal order outcomes and cannot be edited as a percentage:

```text
acceptanceRate = completedOrderCount
  / (completedOrderCount + accountableCancellationCount + accountableUncompletedCount)
```

The stored rate uses basis points (`10000` = 100%). When the denominator is zero the result is 100%. Outcomes whose current treatment is `special_excluded` are recorded but omitted from the denominator. Applying or revoking an exclusion rebuilds the technician summary from source orders and assessment records.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/backoffice/orders/:id` | Read fresh order detail, current assessment, and the complete operations timeline | `backoffice:orders:list` |
| `POST` | `/api/v1/backoffice/orders/:id/technician-uncompleted` | Classify an eligible cancelled, assigned order as technician-caused uncompleted | `backoffice:order-performance:write` |
| `POST` | `/api/v1/backoffice/orders/:id/special-cancellation` | Exclude a counted technician cancellation or uncompleted outcome | `backoffice:order-performance:write` |
| `POST` | `/api/v1/backoffice/orders/:id/special-cancellation/revoke` | Revoke the exclusion after a later review or complaint | `backoffice:order-performance:write` |

All three commands use a strict body with required `publicReason`, `idempotencyKey`, and `expectedRevision`; nullable `internalNote` is optional. Clients never submit an acceptance-rate value. Stale revisions and conflicting idempotency re-use return `409`, missing assessments return `404`, and ineligible state changes return `422`. Every successful mutation appends an immutable assessment revision and an audit record in the same transaction.

Booking order responses retain the existing `statusHistory` field unchanged. They also return `performanceAssessment` and a `timelineEvents` discriminated union sorted by `createdAt` and then stable prefixed ID. Event IDs use `status:<id>` or `performance:<id>`, and event types are `ORDER_STATUS_CHANGED`, `TECHNICIAN_CANCEL_CLASSIFIED`, `TECHNICIAN_UNCOMPLETED_CLASSIFIED`, `SPECIAL_CANCELLATION_APPLIED`, and `SPECIAL_CANCELLATION_REVOKED`. Customer and technician order responses expose only `publicReason`; `internalNote` is operations-only and is returned only by the authorized `GET /api/v1/backoffice/orders/:id` projection. The operations UI refreshes this detail before any action and after optimistic-concurrency conflicts.

## Technician Service Portfolio And Contact-Only Details

The authenticated technician portfolio is profile-wide rather than shop-wide:

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/technicians/:technicianId/services` | Public profile portfolio backed by active approved technician-service ownership and an exact current shop affiliation | Public |
| `GET` | `/api/v1/technicians/me/services` | Paginated service portfolio across all active shop contexts | `technician:services:list` |
| `PUT` | `/api/v1/technicians/me/services/order` | Replace the complete service order with contiguous positions | `technician:services:write` |
| `POST` | `/api/v1/technicians/me/shops/:shopId/services` | Create a service in one authorized shop context | `technician:services:write` |
| `PUT` | `/api/v1/technicians/me/shops/:shopId/services/:serviceId` | Update a service in its owning shop context | `technician:services:write` |
| `DELETE` | `/api/v1/technicians/me/shops/:shopId/services/:serviceId` | Soft-delete a service in its owning shop context | `technician:services:write` |

A technician may have at most five non-deleted services across all shops. The limit is enforced under the technician-profile lock, so concurrent sixth creates cannot both succeed. Every service price is integer JPY and the response declares `taxIncluded: true`; duration is integer minutes. The first eligible service after ordering by `sortOrder`, then ID, is the primary service.

The public profile portfolio does not use schedule slots or completed assignments as a service qualification. It returns only the formal `TechnicianService` relation when the service is active, bookable, approved, belongs to an active category, the technician and account remain public and active, the shop remains published and unsuspended with an active public identifier, and the technician has a current active affiliation to that exact shop. Shop pricing mode only controls booking navigation; it does not erase an otherwise valid technician portfolio.

### Technician service cover

- `PUT /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover`
  accepts one authenticated, single-frame raw JPEG/PNG/WebP body up to 8 MiB and
  at most 25,000,000 decoded pixels, then returns the updated `TechnicianService`.
- `DELETE /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover`
  removes the current public cover association and returns the updated service.

Both routes require `technician:services:write` and derive actor scope from the
session. Effective mutations persist the `MediaAsset` lifecycle change and audit
evidence. An exact-image `PUT` retry or a `DELETE` when no cover is active returns
the current service without creating duplicate media rows or audit entries.
Before persistence, bounded header walks reject PNG `acTL`/`fcTL`/`fdAT` animation
chunks and JPEG APP2 `MPF` multi-picture containers without calculating CRCs or
decoding pixels. Sharp metadata then rejects any other image reporting more than one
page, and libvips asynchronously fully decodes the accepted single frame. Header-only,
truncated, corrupt, declared-MIME/decoded-format mismatch, and decoded pixel-limit
violations all fail with the existing cover-invalid HTTP 400 contract.

This decoded single-frame profile is cover-specific. The shared storage default used
by `/api/v1/social/media` and `/api/v1/backoffice/content/media` retains their existing
contract: at most 8 MiB, one of the three declared MIME types, and the corresponding
magic signature. Those generic endpoints do not inherit the cover-only frame/page or
decoded-pixel restrictions.

The reorder body is strict JSON containing the complete current `orderedServiceIds` set (zero to five unique IDs) and a 16–160 character `idempotencyKey`. Omitting an existing service, including another technician's service, or reusing a key with different content returns a conflict or validation error. A successful command assigns contiguous zero-based positions and records one audit event.

`GET /api/v1/im/directory/:userId` may include `technicianContactDetails` only when the caller owns an active, non-deleted, unblocked contact pointing to that technician identity. Reverse-only contacts, pending requests, deleted contacts, blocked contacts, self lookups without that relationship, and public lookups omit the entire key. The optional object contains integer bid-budget bounds, payment methods, active non-expired operations tags, technician profile tags, up to five active approved services, completed-order count, and acceptance rate in basis points (`10000` = 100%). It never contains `baseLatitude`, `baseLongitude`, `serviceBase`, or other precise coordinates.

The technician self-profile response also contains read-only `specialTags`, filtered to active and non-expired operations-assigned tags. Clients cannot edit those tags through the technician profile update endpoint.

## Current Customer Self-Profile API

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/v1/customer-profile/me` | Read the profile resolved from the authenticated customer identity | `customer-profile:read` |
| `PATCH` | `/api/v1/customer-profile/me` | Update only editable fields on that resolved profile | `customer-profile:write` |
| `GET` | `/api/v1/customer-profile/me/addresses` | List the current customer's saved Japanese addresses | `customer-profile:read` |
| `POST` | `/api/v1/customer-profile/me/addresses` | Create a saved address; the first address becomes the default | `customer-profile:write` |
| `PATCH` | `/api/v1/customer-profile/me/addresses/:publicId` | Edit an owned address or make it the default | `customer-profile:write` |
| `DELETE` | `/api/v1/customer-profile/me/addresses/:publicId` | Soft-delete an owned address and promote a replacement default | `customer-profile:write` |
| `GET` | `/media/customer-avatars/:contentHash.ext` | Read one immutable customer avatar image | Public, hash filename only |

The self-profile response includes `id`, `displayName`, `avatarUrl`, `gender`, `age`, `heightCm`, `languages`, `bio`, `visibility`, and `membershipLevel`, plus its scoped metadata. Updates accept only non-empty partial payloads of the editable display, demographic, language, bio, visibility, and validated image-data fields. The API derives the customer-profile ID from the access token; clients cannot select another profile. Each successful update writes an audit event.

Saved-address bodies are strict, Zod-validated Japanese structured addresses with `countryCode=JP`, normalized seven-digit postal code, official `admin1Code`/`admin2Code`, canonical Japanese prefecture/city names, street address, and optional address-line/building fields. The server verifies the code hierarchy and rejects a name mismatch before persistence. The profile scope always comes from the active authenticated customer identity. Cross-account IDs therefore resolve as `404`, and create/update/delete operations write audit events. At most one active address is default; the first address is promoted automatically and deleting the default promotes the most recently updated remaining address.

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

## Exchange Matched-Order Bilateral Cancellation

Cancellation is scoped to one persisted Exchange-linked Request order. Cancelling one selected
provider's order does not cancel or modify any other participant order.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/exchange/orders/:id/cancellation` | Read the current party's cancellation state and allowed actions | `exchange:cancellation:read-own` |
| `POST` | `/api/v1/exchange/orders/:id/cancellation/requests` | Request cancellation with a reason | `exchange:cancellation:write-own` |
| `POST` | `/api/v1/exchange/orders/:id/cancellation/accept` | Accept the opposite party's pending request | `exchange:cancellation:write-own` |
| `POST` | `/api/v1/exchange/orders/:id/cancellation/reject` | Reject the opposite party's pending request | `exchange:cancellation:write-own` |
| `POST` | `/api/v1/exchange/orders/:id/cancellation/withdraw` | Withdraw the exact initiating identity's pending request | `exchange:cancellation:write-own` |

Every command requires `Idempotency-Key` and `expectedVersion`; request creation additionally
requires a 1–500 character reason. The server resolves the actor, identity, customer/provider
party, technician profile, and selected shop scope. Client-supplied actor, party, status, order,
or financial fields fail strict validation.

Only linked `REQUEST` orders in `PENDING` or `CONFIRMED` state are eligible, and only before service
start or confirmed/refunded payment. Request, rejection, and withdrawal do not mutate orders,
slots, wallets, or ledgers. Acceptance atomically updates the request, cancels that order, releases
one unit of slot capacity, appends order status history and cancellation event history, writes
audit and notification evidence, captures the Demand publication fee through its existing
idempotent ledger authority, and releases the existing Request booking hold only when the order
was confirmed. Any failure rolls back the transaction.

The API does not implement payment refunds, service-in-progress termination, responsibility
penalties, Affiliate reward/refund changes, or batch cancellation. The shared five-language client
panel is wired into the owner/provider Exchange cards and the customer, technician, and merchant
formal order details. It hides on an exact 404 for ordinary orders and suppresses their generic
cancel action only after the server identifies an Exchange-linked order. Local authenticated
browser acceptance passed with a customer request and reload at 320 px followed by provider
acceptance and reload at 440 px; applying both additive migrations and repeating smoke checks in an
authorized app environment remain deployment gates.

The guarded real-MySQL suite is `backend/tests/exchange-cancellation.repository.integration.test.ts`.
It runs only when `RUN_EXCHANGE_CANCELLATION_INTEGRATION=true` and
`FORMAL_BACKEND_ENV_FILE` names an explicit loopback, non-production MySQL environment. The guarded
checker applied all 130 migrations to a generated scratch database and passed eight scenarios:
confirmed Request booking-hold release, races against formal confirmation/service-start/payment
transitions, concurrent acceptance across two matched orders, publication-fee conservation,
reject/withdraw financial neutrality, and transaction rollback. Cleanup removed the scratch
database and principal with `existingDatabaseModified=false`. The suite must not target staging,
production, or an unapproved shared development database; this isolated proof does not replace
authorized-environment migration, deployment, or post-deploy smoke checks.

Full machine-readable OpenAPI is served at `/api/v1/openapi.json` when `OPENAPI_ENABLED=true`.

## Shop Service Taxonomy

The shop taxonomy is a platform-owned, localized catalog. It initially contains 18 service categories and 180 business keywords, each translated into `zh-CN`, `zh-TW`, `ja`, `en`, and `ko`. Category names and keyword labels participate in shop search. Only selected business-keyword labels are rendered in the public shop keyword row; category labels remain a separate searchable classification.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/service-categories` | Paginated active category catalog in the requested locale | Public |
| `GET` | `/api/v1/service-categories/:id/keywords` | Paginated active keywords belonging to one active category | Public |
| `GET` | `/api/v1/merchant-admin/shop/service-taxonomy` | Current shop selection, revision, and server-owned limits | `merchant-admin:shop:service-taxonomy:read` |
| `PUT` | `/api/v1/merchant-admin/shop/service-taxonomy` | Replace the complete current-shop selection | `merchant-admin:shop:service-taxonomy:write` |

Catalog reads accept `locale` (default `ja`) and standard page parameters. The merchant response separates `selectedCategories` from `selectedKeywords` and returns `categoryLimit`, `keywordLimit`, `revision`, and `removedKeywordIds`.

The replacement body is strict JSON with complete `categoryIds` and `keywordIds` arrays, `expectedRevision`, and a 16–160 character `idempotencyKey`. The default server policy permits five categories and five total keywords across all categories. A future paid Option may increase these values through the server quota policy without changing the frontend contract. Duplicate, inactive, foreign-category, over-quota, or unqualified selections return `400`; stale revisions or conflicting key reuse return `409`. Removing a category soft-deletes its dependent keyword selections atomically, and every successful change writes command replay and audit evidence.

Merchant identity applications require one to five category IDs and zero to five keyword IDs. Draft selections are stored in application joins and do not create shop selections. Operations review exposes the selected localized records. Approval copies them into the new shop, creates taxonomy revision 1, and records exact qualifications for every approved non-open category or keyword in the same transaction; rejection creates none.

## Technician Booking and Request Automation

These Test-stage endpoints are scoped to the authenticated technician identity. Settings are disabled by default, validated as strict JSON, versioned with `expectedVersion`, and audited on every successful write. Availability is returned by the backend `entitled` field derived from write permission; the client does not invent eligibility.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/technician/automation-settings/:kind` | Read `booking` or `request` rules and version | `technician:automation-settings:read` |
| `PUT` | `/api/v1/technician/automation-settings/:kind` | Replace enabled state and complete rule set | `technician:automation-settings:write` |
| `GET` | `/api/v1/technician/automation-settings/contacts` | Paginated current-identity IM contact options | `technician:automation-settings:read` |

All enabled rules use AND semantics. Schedule conflicts and platform restrictions are evaluated first, and missing evidence fails safe. A Booking mismatch remains pending for manual handling and is never auto-rejected. A Request match calls the existing claim transaction with Quick auto-matching suppressed, so it creates a real candidate application but the requester still selects the provider. Unique decision keys and rule-version snapshots make trigger retries idempotent and auditable.

The additive migration is `20260909090000_technician_order_automation`. Local verification does not require an HTTP listener:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/technician-automation-schema.test.ts tests/technician-automation-validator.test.ts tests/technician-automation.service.test.ts tests/technician-automation-api.test.ts tests/technician-automation-openapi.test.ts tests/technician-automation-rules.test.ts tests/technician-automation-processor.test.ts tests/technician-automation-trigger-wiring.test.ts tests/exchange-claim.service.test.ts tests/booking-service.test.ts
npm run lint
npm test -- --run src/features/technician-schedule
npm run build
```
