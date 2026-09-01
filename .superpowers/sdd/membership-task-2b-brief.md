# Membership Task 2B — Formal member trend and paginated added-member APIs

## Objective

Expose formal backoffice and merchant member lifecycle trends and added-member lists using Task2A acquisition/lifecycle authority. The chart returns fixed `added`, `removed`, `net` series suitable for legend toggling. Lists are strictly paginated and searchable by the user-requested city, time, NeeDo ID and nickname filters without leaking full card numbers.

## Authorized files

- Create `backend/src/domain/membership-analytics.ts`
- Create `backend/src/repositories/membership-analytics.repository.ts`
- Create `backend/src/services/membership-analytics.service.ts`
- Create `backend/src/controllers/membership-analytics.controller.ts`
- Create `backend/src/validators/membership-analytics.validator.ts`
- Create `backend/src/routes/membership-analytics.routes.ts`
- Modify `backend/src/validators/backoffice.validator.ts`
- Modify `backend/src/app.ts`
- Modify `backend/src/api/openapi.ts`
- Modify `backend/src/constants/error-codes.ts`
- Create `backend/src/utils/membership-card-mask.ts`
- Modify `backend/src/repositories/shop-membership.repository.ts`
- Modify `backend/src/services/shop-membership-card-issuance.service.ts`
- Create `backend/tests/membership-analytics.repository.test.ts`
- Create `backend/tests/membership-analytics.service.test.ts`
- Create `backend/tests/membership-analytics-api.test.ts`
- Create `backend/tests/membership-card-mask.test.ts`
- Modify `backend/tests/shop-membership.repository.test.ts`
- Modify `backend/tests/shop-membership-card-issuance.service.test.ts`
- Modify `backend/tests/openapi.test.ts`

No schema/migration/source issuance/frontend/shared database/seed changes. Task2A migration remains unapplied locally.

## Routes and authorization

- `GET /api/v1/backoffice/analytics/members/trend`
- `GET /api/v1/backoffice/analytics/members`
- `GET /api/v1/merchant-admin/analytics/members/trend`
- `GET /api/v1/merchant-admin/analytics/members`

Backoffice requires `backoffice.member.analytics.view`. Merchant requires existing `shop.member.analytics.view`, resolves the selected shop only through `requireMerchantShopId(actor)`, and accepts no client `shopId` or `city`. Merchant-account selected-shop scope must work; merchant staff/customer/technician/cross-shop access must fail through real `createApp` tests. Backoffice admin/operator pass; missing auth is 401 and wrong permission is 403. Each read records a scoped audit entry without leaking search values beyond bounded normalized metadata.

## Shared time/filter contract

Export and reuse the existing dashboard period base/refinement from `backoffice.validator.ts`; do not duplicate Tokyo/custom-range semantics. Both routes accept `period` (`today`, `last7days`, `last30days`, `week`, `month`, `year`, `custom`) and custom `from/to` exactly like the dashboard. Backoffice additionally accepts optional normalized `city` (always `shop.city`). Merchant rejects `city` as an unknown key.

List additionally accepts `needoId`, `nickname`, `page` default 1 and `pageSize` default 20/max 100. NeeDo ID is exact canonical formal ID after trim; nickname is a bounded case-insensitive substring under the database collation, escaped safely. Empty strings, invalid dates, oversized values, unknown keys and malformed pagination are 400.

Capture `evaluatedAt` once per service call and use it both for dashboard-window resolution and current-state evaluation.

The exact trend wire contract is:

```ts
export interface MembershipAnalyticsFilter {
  period: DashboardPeriod;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  city: string | null;
  evaluatedAt: string;
}

export interface MembershipTrendPoint { key: string; label: string; value: number }

export interface MembershipTrendPayload {
  dataStatus: "ready";
  filter: MembershipAnalyticsFilter;
  series: [
    { seriesKey: "added"; label: "Added members"; unit: "people"; points: MembershipTrendPoint[] },
    { seriesKey: "removed"; label: "Removed members"; unit: "people"; points: MembershipTrendPoint[] },
    { seriesKey: "net"; label: "Net members"; unit: "people"; points: MembershipTrendPoint[] }
  ];
}
```

Series order is always `added`, `removed`, `net`; each contains the same fixed dashboard buckets in the same order. Filter and `evaluatedAt` are server-authored and echoed exactly by OpenAPI examples/tests.

## Analytics grain and state model

The lifecycle grain is one distinct `(shop_id, user_id)` membership state, not card rows. A member is eligible when at least one card for that shop/user is active at the instant, with the same membership/card/user non-deleted, active, non-test rules as Membership Task1.

Construct a deterministic event stream per `(shop,user)` from the authority that exists today:

- Task2A initial issuance lifecycle events at `occurredAt`;
- deterministic expiry at `expiresAt`, unless the exact supported historical frozen event removes that card earlier;
- the exact Task2A historical frozen backfill only, immediately after that card's `MIGRATION_BACKFILL` initial event: `ACTIVE -> FROZEN`, source `STATUS_TRANSITION`, `occurredAt = card.frozenAt`, card-specific `membership-card:{publicId}:backfill-frozen` key, reason `historical_card_frozen`, null actor and null metadata;
- overlapping cards combined as an eligible-card count.

Emit `added` only on `0 -> 1` and `removed` only on `1 -> 0`; renewals/overlapping cards do not double-add or falsely remove. At one `(shop,user,timestamp)`, group every card delta first, compare eligible-card count immediately before/after the whole group, and emit at most one transition. Card/event ID only selects a representative list card after the transition is known; it never decides churn. Tokyo half-open buckets come directly from the resolved dashboard window. `net = added - removed` for every bucket. Return all fixed buckets including zeros.

The currently accepted lifecycle graph is exactly `null -> ACTIVE` from `ISSUANCE` or `MIGRATION_BACKFILL`, followed only by the exact historical `ACTIVE -> FROZEN` backfill described above; expiration is derived from `expiresAt`, never a persisted `EXPIRED` event. No live freeze, void, or reactivation writer/provenance contract exists yet. A future `ACTIVE -> VOID`, `FROZEN -> ACTIVE`, `FROZEN -> VOID`, or live-freeze writer must first define and test its exact event key, reason, actor, metadata and timestamp authority before analytics may accept it. Until then every unrecognized `STATUS_TRANSITION`, other source/transition, missing initial authority, ambiguous chain, or legacy frozen/void row without the exact supported authority aborts the entire request with HTTP 409, code `MEMBERSHIP_ANALYTICS_INCOMPLETE_HISTORY`, message `error.membership_analytics.incomplete_history`; never return partial series or invent a timestamp.

## Added-member list

The list contains one row per distinct `(shop,user)` with at least one authoritative `0 -> 1` inside the selected half-open window. Multiple cards and repeated rejoin transitions never duplicate the member. Use the earliest addition in the window as `addedAt`; if multiple cards participate at that timestamp, smallest card ID is the representative. `total` is distinct added members and may be lower than summed trend `added` when one member leaves/rejoins in the same window; document this explicitly.

```ts
export interface MemberAnalyticsListItem {
  userNeedoId: string;
  nickname: string;
  city: string;
  shopPublicId: string;
  shopName: string;
  membershipPublicId: string;
  planName: string | null;
  cardPublicId: string;
  cardNoMasked: string;
  acquisitionSource: "offline_paid" | "online_paid" | "gift" | "trial" | "renewal" | "historical_replacement" | "manual_grant";
  addedAt: string;
  firstPaidAt: string | null;
  memberStatus: "active" | "inactive";
  cardStatus: "active" | "expired" | "frozen" | "void";
  expiresAt: string | null;
}
```

Never return internal numeric IDs, full `cardNo`, deletion metadata, audit rows or free-form issuance notes/reference. Extract one canonical `maskMembershipCardNumber` formatter and make Task2B, the existing merchant membership repository and card-issuance response all use it. The exact format is `•••• •••• •••• ${lastFour}` for values of at least four characters and `••••` otherwise; no prefix characters are ever exposed. Add direct formatter tests plus regression tests for both existing consumers. `firstPaidAt` is the platform-global earliest offline/online paid `(issuedAt,id)` for the user, null for never-paid users.

Current representative `cardStatus` precedence is: latest authoritative frozen/void event before `evaluatedAt`; otherwise expiration at/before `evaluatedAt`; otherwise active. `memberStatus` is active when any eligible card remains at `evaluatedAt`, otherwise inactive. Status does not alter historical inclusion.

Stable order: `addedAt DESC`, then shop public ID ascending under binary/canonical comparison, user NeeDo ID ascending, card ID ascending. `total` is the exact number of distinct rows after filters; pagination is database-backed and returns `{list,total,page,page_size}`.

## Repository/service fail-closed rules

- Use bounded SQL with no N+1 and no unbounded in-memory full-table reconstruction.
- Normalize numeric counts only from canonical nonnegative safe integers; duplicate/malformed aggregate rows reject rather than substitute zero.
- Duplicate event keys, impossible chains, events before issuance, ambiguous simultaneous events, missing initial authority and invalid source/status fail the entire request with the stable 409 incomplete-history error.
- Empty eligible results return fixed zero series and an empty paginated list.
- Repository input carries explicit platform/shop scope; service owns actor/scope/audit and controller only maps req/res.

## Tests

Repository tests inspect generated SQL/bindings and cover: one card, overlapping cards, renewal without double-add, expiry with another active card, exact 0→1/1→0, same-time replacement, explicit frozen/void before expiry, legacy missing history, Tokyo window boundaries, city/shop scope, user/test/deleted exclusions, exact NeeDo ID, escaped nickname, distinct pagination total, masked card, stable tie-breaks, firstPaidAt across shops/profiles, malformed lifecycle and canonical numeric failures.

Service/API tests use real routes/createApp for strict validation, 401/403/owner/operator/staff/customer/cross-shop/selected-shop behavior, no client shop/city override, incomplete-history 409, empty pages and response secrecy. Audit metadata is exactly `period`, `from`, `to`, `city`, `shopId`, `page`, `pageSize`, `hasNeedoId`, `hasNickname`, `resultCount`; raw NeeDo ID/nickname values are forbidden. OpenAPI documents all four paths, exact queries/permissions, fixed series, pagination, distinct-list-versus-transition note and errors.

## Gates

```bash
cd backend
npm test -- membership-analytics.repository.test.ts membership-analytics.service.test.ts membership-analytics-api.test.ts membership-card-mask.test.ts shop-membership.repository.test.ts shop-membership-card-issuance.service.test.ts openapi.test.ts shop-membership-permissions.test.ts dashboard-service.test.ts
npm run lint
npm run build
git diff --check
```

Commit only authorized files with `feat: expose formal member analytics`. Do not start Membership Task3 or apply shared migrations.
