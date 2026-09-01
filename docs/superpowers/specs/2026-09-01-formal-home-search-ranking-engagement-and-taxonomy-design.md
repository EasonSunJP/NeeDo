# NeeDo Formal Home Search Ranking, Engagement, Technician Profile, and Shop Taxonomy Design

**Date:** 2026-09-01

**Scope:** Step 08 core-read contracts, Step 09 customer frontend mock retirement, Step 10 order outcome accounting, and the minimum merchant/backoffice writes required by this feature

**Status:** Draft for written-spec review; all four interactive design sections were approved

## 1. Problem statement

The formal homepage search can now query shops and technicians directly, but its result cards are still compact identity rows. They do not match the approved technician photo-card and shop horizontal-card presentations, and the formal card payloads do not contain the data needed to render those presentations safely.

The requested card fields also expose several missing product contracts:

- technician gold, silver, and bronze badges must be computed from nearby, eligible technicians rather than a local array position;
- acceptance rate must be derived from actual order outcomes, while allowing operations to apply and later revoke a reasoned special-cancellation exclusion;
- special-cancellation changes must be visible in the existing per-order timeline without overwriting history;
- favorite and share counts must be backed by user-scoped persisted interactions;
- technician age and primary service must come from the technician profile and technician service records;
- a technician contact card needs additional private fields only for an actual contact relationship;
- shops need a controlled, localized service-category and business-keyword taxonomy with server-enforced quotas;
- the search response must provide the exact formal data consumed by the new cards instead of asking the frontend to infer or invent it.

This work therefore cannot be implemented as a card-only restyle. It must be delivered as small formal backend, database, authorization, and frontend slices.

## 2. Goals

- Render technician search results as approved two-column photo cards and shop results as approved single-column horizontal cards.
- Preserve fuzzy name search and OR semantics: matching any selected category, business keyword, tag, or custom keyword is sufficient.
- Rank nearby technicians from a 3 km starting radius, expanding exactly 1 km at a time until three candidates are available or all eligible candidates are exhausted.
- Re-rank every candidate inside the final radius by rating, completed orders, review count, and registration time.
- Calculate acceptance rate from formal order outcomes; never provide a direct percentage editor.
- Allow authorized operations staff to apply and revoke a special-cancellation exclusion with required reasons, immutable history, and order-timeline visibility.
- Persist entity favorites by NeeDo user account and entity shares by successful share event.
- Treat the first eligible technician service as the primary service and display its tax-inclusive price and duration.
- Show expanded technician data only to an actual contact.
- Let a shop select up to five service categories and five total business keywords by default, with future server-side paid quota overrides.
- Seed a useful initial platform-controlled taxonomy without putting category labels into the shop business-keyword chip collection.
- Keep each implementation microstep independently testable, committable, and reversible.

## 3. Non-goals

- No direct acceptance-rate percentage input.
- No destructive rewrite of the booking/order state machine.
- No inference of responsibility from free-form historical cancellation text.
- No fabricated availability, service, price, favorite, share, distance, or ranking data.
- No new browser-local favorite or keyword store.
- No reuse of Social post bookmarks as shop/technician favorites.
- No Elasticsearch/OpenSearch, typo correction, historical-name aliases, or romaji/kana transliteration in this slice.
- No paid checkout flow for quota increases. This design only provides the server-side quota seam and current default.
- No public exposure of a technician's exact personal service-base coordinates.
- No push, deployment, or production-data mutation implied by completing the local implementation plan.

## 4. Existing formal baseline

The design extends these existing formal structures:

- `Category` already has stable codes, a parent relation, activation state, and service relations.
- `Shop` already has latitude and longitude.
- `TechnicianProfile` already has age, budget range, payment methods, profile tags, visibility, status, and creation time, but no precise service-base coordinate.
- `TechnicianService` already stores name, description, category, integer JPY price, duration, activation, review state, and `sortOrder`.
- `ReviewSummary` already stores technician and shop average rating and review count.
- `BookingOrder` already has primary order status and `OrderStatusHistory`; order detail pages already render that history as a timeline.
- `Contact` is identity-scoped and can prove whether the viewer has added the target identity.
- `AuditLog` is the formal cross-module audit record.
- `GET /api/v1/search` already supports direct `shop`, `technician`, and `service` searches, repeated keywords and category IDs, and OR semantics.

The current `CoreShopCard` and `CoreTechnicianCard` are intentionally small. The existing `TechnicianShowcaseCard` and `SocialProfileMiniCard` derive or generate fields and therefore must not be adapted as the formal search source.

## 5. Chosen architecture

The feature is split into five formal microsteps:

1. order performance assessment, special-cancellation history, timeline events, and acceptance-rate projection;
2. entity favorites, share events, technician service-base location, and nearby ranking;
3. technician service ordering, primary-service rules, and expanded contact card;
4. shop service categories, localized business-keyword catalog, quotas, and edit mode;
5. enriched formal search DTOs and final technician/shop cards.

The source of truth remains normalized business records. Small read projections are used only where search ordering would otherwise require repeated per-card aggregation. Every projection must be rebuildable from its source records.

## 6. Order performance and special cancellation

### 6.1 Primary status remains intact

`BookingOrder.status` continues to represent the existing operational states `pending`,
`confirmed`, `in_service`, `completed`, and `cancelled`. Existing transition rules remain
authoritative; this feature does not add special cancellation to that enum.

Special cancellation is not a replacement booking status. It is a treatment applied to an adverse technician performance outcome. Keeping the dimensions separate prevents an operations review from silently changing refunds, settlement, affiliate attribution, slot availability, or order-state rules.

### 6.2 Performance assessment

Add a current one-to-one assessment projection for adverse outcomes:

```text
OrderPerformanceAssessment
- id
- bookingOrderId (unique)
- technicianProfileId
- outcome: TECHNICIAN_CANCELLED | TECHNICIAN_UNCOMPLETED
- treatment: COUNTED | SPECIAL_EXCLUDED
- version
- currentRevisionId
- createdAt / updatedAt / deletedAt
```

Add an immutable revision table:

```text
OrderPerformanceAssessmentRevision
- id
- assessmentId
- bookingOrderId
- technicianProfileId
- action:
  - CLASSIFY_TECHNICIAN_CANCELLED
  - CLASSIFY_TECHNICIAN_UNCOMPLETED
  - APPLY_SPECIAL_EXCLUSION
  - REVOKE_SPECIAL_EXCLUSION
- previousTreatment
- nextTreatment
- publicReason
- internalNote
- actorUserId
- idempotencyKey
- assessmentVersion
- createdAt / updatedAt / deletedAt
```

Revision rows are append-only. Application code never updates or soft-deletes a revision. The standard timestamp and soft-delete columns are retained to comply with the repository's business-table convention, but deletion is not exposed by any route.

Only `TECHNICIAN_CANCELLED` and `TECHNICIAN_UNCOMPLETED` assessments may receive the `SPECIAL_EXCLUDED` treatment. A completed order, a customer cancellation, or a platform/shop cancellation cannot be relabeled as special cancellation through this command.

### 6.3 Responsibility and uncompleted outcomes

- A cancellation initiated by the assigned technician identity is classified by the server as `TECHNICIAN_CANCELLED`.
- Customer, shop, platform, and automated supersession cancellations are not included in the technician denominator.
- A past order is not penalized merely because `endsAt` has passed.
- `TECHNICIAN_UNCOMPLETED` is created only when the formal outcome-resolution flow records that the assigned technician failed to complete the service.
- The outcome-resolution command records its own reason and timeline event; it does not silently infer non-completion from a timer.

Historical backfill may classify a cancelled order only when the cancellation history actor can be unambiguously matched to that order's assigned technician user. Unknown historical cases remain non-penalizing until formally reviewed. Free-form reason text is never parsed to guess responsibility.

### 6.4 Acceptance-rate formula

The server maintains a rebuildable `TechnicianPerformanceSummary`:

```text
TechnicianPerformanceSummary
- id
- technicianProfileId (unique)
- completedOrderCount
- accountableCancellationCount
- accountableUncompletedCount
- specialExcludedCount
- acceptanceRateBps
- sourceCalculatedAt
- createdAt / updatedAt / deletedAt
```

The formula is:

```text
completedOrderCount
--------------------------------------------------------------
completedOrderCount + accountableCancellationCount + accountableUncompletedCount
```

- `SPECIAL_EXCLUDED` outcomes are absent from the denominator.
- Orders without a final result are absent from both numerator and denominator.
- When the denominator is zero, `acceptanceRateBps` is `10000` and the API displays `100%`.
- The stored rate uses basis points to avoid floating-point drift.
- There is no API that accepts an acceptance-rate number.

Projection updates occur in the same transaction as outcome classification or special-exclusion changes. A maintenance command can rebuild summaries from completed orders and current assessments and compare the result before replacing a projection.

### 6.5 Timeline and audit

`GET /api/v1/orders/:id` gains a typed `timelineEvents` collection while retaining `statusHistory` for compatibility. The server merges and sorts:

- existing `OrderStatusHistory` rows;
- performance assessment revisions;
- existing system events and permitted timeline comments.

Timeline event types include:

```text
ORDER_STATUS_CHANGED
TECHNICIAN_CANCEL_CLASSIFIED
TECHNICIAN_UNCOMPLETED_CLASSIFIED
SPECIAL_CANCELLATION_APPLIED
SPECIAL_CANCELLATION_REVOKED
ORDER_COMMENT
```

Every special-cancellation apply or revoke transaction writes:

1. an immutable assessment revision;
2. the updated current assessment and performance summary;
3. a formal `AuditLog` record.

`publicReason` is visible to order participants and must be suitable for customer display. `internalNote` is optional and visible only to authorized merchant/backoffice readers. Both apply and revoke events remain in the timeline permanently.

### 6.6 Commands and permissions

```text
POST /api/v1/backoffice/orders/:id/special-cancellation
POST /api/v1/backoffice/orders/:id/special-cancellation/revoke
```

Both bodies require:

- `publicReason`;
- optional `internalNote`;
- `idempotencyKey`;
- `expectedRevision`.

Only `backoffice:order-performance:write` may call these commands. A stale revision or conflicting state returns `409`. Replaying the same idempotency key returns the original successful result without appending another revision.

## 7. Entity favorites and shares

### 7.1 Favorites

Use one formal entity-favorite model with nullable target foreign keys and an exactly-one-target database constraint:

```text
EntityFavorite
- id
- userId
- shopId?
- technicianProfileId?
- activeKey? (unique for the active user/target tuple)
- createdAt / updatedAt / deletedAt
```

The account user, not the active identity, owns the favorite. Changing identity therefore cannot add a second active favorite. Shop and technician targets remain separate because exactly one target column is populated.

Mutation contract:

```text
PUT    /api/v1/me/entity-favorites/:targetType/:publicId
DELETE /api/v1/me/entity-favorites/:targetType/:publicId
GET    /api/v1/me/entity-favorites?page=1&pageSize=20&targetType=technician
POST   /api/v1/me/entity-favorites/statuses
```

`PUT` and `DELETE` are idempotent. Re-favoriting restores the same user/target tuple. The returned payload includes authoritative `isFavorited` and `favoriteCount`.

Public search returns aggregate counts. Authenticated pages use one batched statuses request for all visible targets; per-card favorite queries are forbidden.

### 7.2 Shares

Use an append-only event table with exactly one target:

```text
EntityShareEvent
- id
- actorUserId
- actorIdentityId
- shopId?
- technicianProfileId?
- channel: NEEDO_MESSAGE | SYSTEM_SHARE
- recipientUserId?
- recipientIdentityId?
- conversationId?
- messageId? (unique when present)
- idempotencyKey
- createdAt / updatedAt / deletedAt
```

The same user may share the same target repeatedly with different idempotency keys. A retry with the same key is counted once.

```text
POST /api/v1/entities/:targetType/:publicId/shares/needo
POST /api/v1/entities/:targetType/:publicId/shares/system
```

For `NEEDO_MESSAGE`, the formal message and share event must commit as one application operation; a message failure does not increment the count. The event references the successful message. For `SYSTEM_SHARE`, the client reports success only after the platform share capability reports a successful invocation according to that platform's semantics. A platform that cannot reliably distinguish opening from later cancellation follows the approved successful-invocation rule.

### 7.3 Count presentation

Counts use this exact shared formatter:

- `0` through `999`: the exact integer;
- `1000` through `1999`: `1k`;
- `2000` through `2999`: `2k`;
- later values: `floor(count / 1000) + "k"`.

No decimal `k` notation and no separate social-like or review count is substituted.

## 8. Technician service location and nearby ranking

### 8.1 Location sources

The user's origin is resolved in this order:

1. coordinates attached to the homepage-selected service location;
2. authorized current device location;
3. no ranking location.

If neither coordinate source exists, technician search still works but returns no distance badges or medals and the UI prompts the user to choose a service location without repeatedly requesting permission.

Add private `baseLatitude` and `baseLongitude` fields to `TechnicianProfile`. Both must be present or both absent. They are editable only by the technician through the profile write flow and are never returned in a public or contact DTO.

An eligible technician location is either:

- the technician's active personal service base; or
- the coordinates of a published shop connected through an active technician-shop affiliation.

When several locations are valid, the minimum exact distance to the user is the technician's ranking distance. Missing coordinates are never synthesized.

### 8.2 Candidate filtering

Before distance evaluation, a technician must satisfy all of the following:

- non-deleted, published technician profile;
- public visibility;
- active S identity and active public identifier;
- matches at least one requested name, category, business keyword, service keyword, or tag branch;
- has at least one valid service location for nearby ranking.

Keyword and category branches preserve the approved OR semantics. Multi-word free text remains one fuzzy substring phrase after normalization.

### 8.3 Radius expansion

1. Query exact candidates within 3 km.
2. If fewer than three candidates exist, increase to 4 km.
3. Continue in exact 1 km increments.
4. Stop when at least three candidates exist or no additional eligible location can exist because the eligible candidate set is exhausted.
5. Rebuild the candidate set from every technician inside the final radius; candidates from the initial 3 km receive no reserved priority.

The repository first applies indexed latitude/longitude bounding boxes and then computes Haversine distance for the bounded candidate set. Parameterized repository logic is required; distance calculation must not become an unbounded controller query or a frontend calculation.

### 8.4 Ranking order

The final-radius candidate set is sorted by:

1. `ReviewSummary.ratingAverage` descending;
2. `TechnicianPerformanceSummary.completedOrderCount` descending;
3. `ReviewSummary.reviewCount` descending;
4. `TechnicianProfile.createdAt` ascending;
5. technician ID ascending as a deterministic technical tie-breaker only.

Ranks 1, 2, and 3 receive gold, silver, and bronze badges. If fewer than three eligible technicians exist globally, only the available ranks are shown. The search page is paginated after the final set is ranked so badges cannot change between pages.

## 9. Technician services and information-card visibility

### 9.1 Service rules

Reuse `TechnicianService` as the only service source.

- A technician may maintain at most five non-deleted services across the technician profile,
  even when the technician has more than one shop affiliation. Existing `shopId` ownership and
  pricing context remain on each service, but duplicate services in different shop contexts still
  count toward the same five-item portfolio limit.
- The limit is enforced in the service transaction, not only in the UI.
- Public eligibility requires `isActive = true` and `reviewStatus = APPROVED`.
- The first public-eligible service ordered by `sortOrder`, then ID, is the primary service.
- Reordering services changes the primary service; there is no independent primary-service boolean that can drift.
- Prices are integer JPY tax-inclusive amounts. Public DTOs label them as tax included.
- The public search card shows only the primary service.
- The authorized technician contact card shows all public-eligible services, up to five.

Add a profile-level bulk order command to the technician-services surface. It accepts every
non-deleted service ID owned by that technician exactly once and applies contiguous order values
transactionally, regardless of shop affiliation.

### 9.2 Public and contact visibility

Public technician search/detail data may contain:

- display name, avatar, age, city/service area;
- rating and review count;
- completed-order count and calculated acceptance rate;
- primary service name, tax-inclusive price, currency, and duration;
- favorite/share counts and nearby ranking fields.

An expanded technician information card may additionally contain:

- bid budget range;
- supported payment methods;
- active special tags;
- profile tags;
- the full eligible service list.

The expanded fields are returned only when an active, non-deleted `Contact` owned by the viewer identity targets the technician identity and is not blocked. The rule applies to contacts created by accepted friendships or supported business-contact flows. Removing or blocking the contact removes access immediately. A public profile, pending friend request, or one-way directory lookup is insufficient.

The existing directory profile contract becomes a discriminated response. `entityType = technician` can include `technicianContactDetails` only after the repository proves the contact relation.

## 10. Shop service categories and business-keyword catalog

### 10.1 Reuse and localization

Reuse `Category` and preserve existing IDs and codes. Add localized translation rows rather than replacing references:

```text
CategoryTranslation
- id
- categoryId
- locale: zh-CN | zh-TW | ja | en | ko
- name
- createdAt / updatedAt / deletedAt
```

Existing `name`, `nameJa`, and `nameEn` remain compatibility fields during migration. The localized catalog is authoritative for new taxonomy UI and search.

Add:

```text
BusinessKeyword
- id
- code (unique)
- categoryId
- qualificationPolicy
- sortOrder
- isActive
- createdAt / updatedAt / deletedAt

BusinessKeywordTranslation
- id
- businessKeywordId
- locale
- label
- createdAt / updatedAt / deletedAt

ShopServiceCategory
- id
- shopId
- categoryId
- selectedByUserId
- activeKey
- createdAt / updatedAt / deletedAt

ShopBusinessKeyword
- id
- shopId
- businessKeywordId
- selectedByUserId
- activeKey
- createdAt / updatedAt / deletedAt
```

Every join is indexed, soft-deleted, and unique while active. A business keyword always belongs to exactly one category.

### 10.2 Quotas

- Default selected service-category limit: 5 per shop.
- Default selected business-keyword limit: 5 total per shop, not five per category.
- The API returns `categoryLimit` and `keywordLimit` with current usage.
- The service resolves limits through a server-side quota policy. The initial fallback is five; a future paid Option can supply a larger persisted entitlement.
- The frontend never decides whether a paid shop is allowed to exceed five.

Removing a selected category soft-deletes its shop relation and every active shop-keyword relation belonging to that category in the same transaction. The response lists the removed keyword IDs, and the audit log stores before/after selections.

### 10.3 Search semantics

Shop search may match:

- fuzzy shop name;
- shop address, city, and description;
- a selected service category's localized name;
- a selected active business keyword's localized label;
- existing published shop services.

Selected service categories participate in search but are returned separately as `serviceCategories`. Only selected business keywords appear in `businessKeywords` and in the shop card's keyword chips.

### 10.4 APIs and authorization

```text
GET /api/v1/service-categories
GET /api/v1/service-categories/:id/keywords

GET /api/v1/merchant-admin/shop/service-taxonomy
PUT /api/v1/merchant-admin/shop/service-taxonomy
```

The public catalog is paginated and localized. The merchant update requires merchant shop scope, a complete category/keyword selection, `expectedRevision`, and an idempotency key. The service validates quotas, active state, category membership, and any platform qualification policy before one transactional replacement.

## 11. Enriched search contract

Keep the existing endpoint and entity discriminator:

```text
GET /api/v1/search?entityType=technician
GET /api/v1/search?entityType=shop
```

Technician search accepts an optional latitude/longitude pair. Supplying only one coordinate is invalid. The response includes ranking metadata only when a valid origin was supplied.

### 11.1 Technician card payload

```text
id / publicId
displayName / avatarUrl
age / city / serviceArea
reviewSummary
completedOrderCount
acceptanceRateBps
favoriteCount
shareCount
distanceKm?
nearbyRank?: 1 | 2 | 3
resolvedRadiusKm?
primaryService?: {
  id, name, priceAmount, currency, durationMinutes, taxIncluded: true
}
```

### 11.2 Shop card payload

```text
id / publicId
name / city / address / coverUrl
reviewSummary
favoriteCount
shareCount
serviceCategories[]
businessKeywords[]
```

The core-read repository batch-loads or joins the summaries, primary services, and engagement counts. Page code must not issue one request per card. The old compact card types remain compatible for other callers until their contracts are explicitly migrated.

## 12. UI design

### 12.1 Technician search card

Technician results use a two-column photo-dominant grid in the mobile shell:

- rating pill at top left;
- favorite and share controls with counts at top right;
- medal, display name, age/area, acceptance rate, and review count over the photo;
- a bottom service panel with primary-service label, name, tax-inclusive price, and duration.

The card never claims availability unless a future formal availability field is added. When no primary service exists it shows a translated empty-service label and no price. The whole card links to the technician detail; nested favorite/share controls stop link navigation.

### 12.2 Shop search card

Shop results use a single-column horizontal card:

- rating at top left;
- favorite/share controls at top right;
- real cover image on the left;
- name and shop badge on the right;
- address and up to five selected business-keyword chips below.

A missing cover uses a themed initial placeholder, never a generated business photo.

### 12.3 Search page states

- `all` mode renders independent shop, technician, and service sections.
- Entity-specific mode requests and renders only that entity type.
- Each section owns loading, error, retry, pagination, and empty state.
- No-location ranking and no matching result use different messages.
- Loading skeletons match final card dimensions.
- The layout is verified at 390x844 and 440x956 with no horizontal overflow or bottom-navigation obstruction.
- Long names, addresses, and service names have explicit line clamps.
- Medal meaning is exposed as text for assistive technology; icon buttons have accessible names.

### 12.4 Technician information card

The top metrics retain completed orders on the left. The right metric area is divided into service rating and acceptance rate, matching the approved red-box location.

The card order is:

1. identity and top metrics;
2. basic information, age, language, and area;
3. budget and payment methods when authorized;
4. introduction;
5. special tags;
6. normal tags;
7. service information.

The technician's own edit experience embeds the existing service editor under the tags. The previous standalone service entry becomes a route/anchor redirect after every caller has migrated; two active editors are not retained.

### 12.5 Shop edit mode

The shop service-display page's pencil control enables an edit mode similar to the customer profile editor:

1. select service categories and show usage versus quota;
2. show keyword groups only for selected categories;
3. select up to the total keyword quota;
4. preview keywords that will be removed when a category is deselected;
5. confirm and save the entire selection transactionally.

Browse mode shows business-keyword chips only. Category labels remain searchable but are not visually merged into the keyword box.

## 13. Initial service-category catalog

The existing eight category codes are preserved where noted. Ten new stable codes are added.

| Code | Simplified Chinese | Traditional Chinese | Japanese | English | Korean | Initial policy |
|---|---|---|---|---|---|---|
| `massage` | 按摩服务 | 按摩服務 | マッサージ | Massage | 마사지 | Platform review |
| `wellness` | 放松疗愈 | 放鬆療癒 | リラクゼーション | Relaxation & Wellness | 릴랙세이션 | Open |
| `business` | 商务接待 | 商務接待 | ビジネス接遇 | Business Hospitality | 비즈니스 응대 | Open |
| `pet` | 宠物相关 | 寵物相關 | ペットサービス | Pet Services | 반려동물 | Open |
| `cleaning` | 家政服务 | 家政服務 | 家事代行 | Home Services | 가사 서비스 | Open |
| `dining` | 餐饮服务 | 餐飲服務 | 飲食サービス | Dining Services | 외식 서비스 | Conditional |
| `repair` | 上门维修 | 到府維修 | 訪問修理 | On-site Repair | 방문 수리 | Conditional |
| `medical_beauty` | 医疗美容 | 醫療美容 | 美容医療 | Medical Aesthetics | 의료 미용 | Qualification review |
| `photography` | 约拍摄影 | 約拍攝影 | 出張撮影 | Photography | 출장 촬영 | Open |
| `secondhand_recycling` | 二手回收 | 二手回收 | リユース買取 | Second-hand & Recycling | 중고 매입 | Conditional |
| `luxury_goods` | 奢侈品服务 | 奢侈品服務 | ラグジュアリーサービス | Luxury Goods Services | 명품 서비스 | Conditional |
| `moving_delivery` | 搬家配送 | 搬家配送 | 引越し・配送 | Moving & Delivery | 이사·배송 | Conditional |
| `beauty` | 美容美甲 | 美容美甲 | 美容・ネイル | Beauty & Nails | 뷰티·네일 | Conditional |
| `maternity_childcare` | 母婴与月嫂 | 母嬰與月嫂 | 産後・育児ケア | Maternity & Childcare | 산후·육아 | Qualification review |
| `care` | 健康与护理 | 健康與護理 | 健康・介護 | Health & Care | 건강·돌봄 | Qualification review |
| `education_coaching` | 教育与陪练 | 教育與陪練 | 教育・レッスン | Education & Coaching | 교육·레슨 | Conditional |
| `legal_professional` | 法律与专业咨询 | 法律與專業諮詢 | 法務・専門相談 | Legal & Professional Services | 법률·전문 상담 | Qualification review |
| `events_conferences` | 活动与会务 | 活動與會務 | イベント・会務 | Events & Conferences | 행사·컨벤션 | Conditional |

`Initial policy` is a product-control seed, not a legal conclusion. Compliance review may tighten a category or individual keyword before production activation.

## 14. Initial business-keyword library

Every code below is a platform keyword definition and receives all five translation rows in the formal Seed. The Chinese label is shown here as the review label. Category labels themselves are not duplicated as keywords.

### 14.1 `massage` — 按摩服务

- `massage_home_visit` — 上门按摩
- `massage_shiatsu` — 指压按摩
- `massage_aroma_oil` — 精油按摩
- `massage_neck_shoulders` — 肩颈调理
- `massage_foot` — 足部按摩
- `massage_sports_recovery` — 运动恢复按摩
- `massage_thai` — 泰式按摩
- `massage_tuina` — 中式推拿
- `massage_lymphatic` — 淋巴按摩
- `massage_postpartum` — 产后按摩

### 14.2 `wellness` — 放松疗愈

- `wellness_spa` — SPA护理
- `wellness_aromatherapy` — 芳香疗愈
- `wellness_head_relaxation` — 头部放松
- `wellness_sleep_relaxation` — 睡眠放松
- `wellness_meditation` — 冥想引导
- `wellness_heat_therapy` — 温热护理
- `wellness_fascia_relaxation` — 筋膜放松
- `wellness_stress_relief` — 身心减压
- `wellness_foot_bath` — 足浴护理
- `wellness_recovery_program` — 恢复调理方案

### 14.3 `business` — 商务接待

- `business_companion` — 商务陪同
- `business_meeting_reception` — 会议接待
- `business_exhibition_reception` — 展会接待
- `business_guest_guidance` — 来宾引导
- `business_interpretation` — 商务翻译
- `business_itinerary_support` — 行程协助
- `business_etiquette` — 礼仪接待
- `business_conference_assistant` — 会务助理
- `business_local_guide` — 陪同导游
- `business_property_viewing` — 看房陪同

### 14.4 `pet` — 宠物相关

- `pet_home_feeding` — 上门喂养
- `pet_dog_walking` — 遛狗
- `pet_boarding` — 宠物寄养
- `pet_grooming` — 宠物洗护美容
- `pet_transport` — 宠物接送
- `pet_medical_companion` — 宠物陪诊
- `pet_training` — 宠物训练
- `pet_photography` — 宠物摄影
- `pet_home_cleaning` — 宠物居家清洁
- `pet_temporary_care` — 宠物临时看护

### 14.5 `cleaning` — 家政服务

- `home_daily_cleaning` — 日常保洁
- `home_deep_cleaning` — 深度保洁
- `home_kitchen_cleaning` — 厨卫清洁
- `home_move_out_cleaning` — 退房清扫
- `home_appliance_cleaning` — 家电清洗
- `home_organization` — 收纳整理
- `home_laundry_ironing` — 洗衣熨烫
- `home_cooking` — 上门做饭
- `home_window_cleaning` — 玻璃清洁
- `home_maintenance` — 家居养护

### 14.6 `dining` — 餐饮服务

- `dining_restaurant_reservation` — 餐厅订位
- `dining_private_room` — 包间预订
- `dining_private_chef` — 上门厨师
- `dining_catering` — 餐饮外烩
- `dining_banquet` — 宴会预订
- `dining_coffee_break` — 茶歇服务
- `dining_bento` — 便当配送
- `dining_bar_reservation` — 酒吧预订
- `dining_food_guide` — 美食向导
- `dining_reservation_concierge` — 餐饮预约管家

### 14.7 `repair` — 上门维修

- `repair_aircon_cleaning` — 空调清洗
- `repair_aircon` — 空调维修
- `repair_plumbing_electrical` — 水电维修
- `repair_pipe_unblocking` — 管道疏通
- `repair_appliance` — 家电维修
- `repair_furniture_assembly` — 家具安装
- `repair_locksmith` — 锁具维修
- `repair_phone_computer` — 手机电脑维修
- `repair_doors_windows` — 门窗维修
- `repair_renovation` — 装修翻新

### 14.8 `medical_beauty` — 医疗美容

- `medbeauty_skin_consultation` — 医疗皮肤咨询
- `medbeauty_device_consultation` — 光电项目咨询
- `medbeauty_laser_hair_removal` — 激光脱毛
- `medbeauty_pigmentation` — 医疗祛斑
- `medbeauty_acne` — 医疗祛痘
- `medbeauty_injection_consultation` — 注射美容咨询
- `medbeauty_postprocedure_care` — 医美术后护理
- `medbeauty_skin_analysis` — 医疗皮肤检测
- `medbeauty_booking` — 医疗美容预约
- `medbeauty_doctor_consultation` — 医生面诊预约

### 14.9 `photography` — 约拍摄影

- `photo_portrait` — 人像写真
- `photo_business_headshot` — 商务形象照
- `photo_couple` — 情侣约拍
- `photo_family` — 家庭摄影
- `photo_wedding` — 婚礼跟拍
- `photo_event` — 活动摄影
- `photo_product` — 商品摄影
- `photo_food` — 餐饮摄影
- `photo_property` — 房产摄影
- `photo_short_video` — 短视频拍摄

### 14.10 `secondhand_recycling` — 二手回收

- `recycle_appliance` — 家电回收
- `recycle_furniture` — 家具回收
- `recycle_digital` — 手机数码回收
- `recycle_clothing` — 衣物鞋包回收
- `recycle_books` — 书籍回收
- `recycle_instruments` — 乐器回收
- `recycle_precious_metals` — 贵金属回收
- `recycle_office_equipment` — 办公设备回收
- `recycle_home_valuation` — 上门估价
- `recycle_removal` — 回收搬运

### 14.11 `luxury_goods` — 奢侈品服务

- `luxury_authentication` — 奢侈品鉴定
- `luxury_bag_care` — 名包养护
- `luxury_watch_care` — 名表养护
- `luxury_jewelry_care` — 珠宝养护
- `luxury_cleaning` — 奢侈品清洗
- `luxury_repair` — 奢侈品维修
- `luxury_restoration` — 奢侈品修复
- `luxury_buyback` — 奢侈品回收
- `luxury_consignment` — 奢侈品寄卖
- `luxury_valuation` — 奢侈品估价

### 14.12 `moving_delivery` — 搬家配送

- `moving_local` — 同城搬家
- `moving_small` — 小型搬家
- `moving_residential` — 家庭搬家
- `moving_office` — 办公室搬迁
- `moving_packing` — 打包整理
- `moving_furniture_disassembly` — 家具拆装
- `moving_same_day_delivery` — 同城配送
- `moving_storage` — 临时仓储
- `moving_disposal` — 搬家清运
- `moving_large_item` — 大件搬运

### 14.13 `beauty` — 美容美甲

- `beauty_home_service` — 上门美业
- `beauty_manicure` — 美甲
- `beauty_eyelash` — 美睫
- `beauty_makeup` — 化妆造型
- `beauty_hair_styling` — 发型造型
- `beauty_haircut_color` — 剪发染发
- `beauty_facial` — 面部护理
- `beauty_eyebrow` — 眉形设计
- `beauty_bridal_makeup` — 新娘跟妆
- `beauty_image_consulting` — 形象咨询

### 14.14 `maternity_childcare` — 母婴与月嫂

- `childcare_maternity_nurse` — 月嫂服务
- `childcare_newborn` — 新生儿护理
- `childcare_postpartum` — 产妇护理
- `childcare_babysitting` — 临时育儿
- `childcare_lactation` — 母乳喂养指导
- `childcare_postpartum_recovery` — 产后恢复
- `childcare_baby_bath` — 婴儿洗护
- `childcare_baby_food` — 辅食制作
- `childcare_overnight` — 夜间照护
- `childcare_family_support` — 育儿家庭支持

### 14.15 `care` — 健康与护理

- `care_wellness` — 康养护理
- `care_elderly` — 老年照护
- `care_rehabilitation` — 康复陪练
- `care_medical_companion` — 陪诊服务
- `care_nutrition` — 营养指导
- `care_health_management` — 健康管理
- `care_foot` — 足部护理
- `care_sleep_management` — 睡眠管理
- `care_medication_reminder` — 用药提醒
- `care_home_support` — 居家照护

### 14.16 `education_coaching` — 教育与陪练

- `education_home_tutor` — 家庭教师
- `education_english` — 英语辅导
- `education_japanese` — 日语辅导
- `education_chinese` — 中文辅导
- `education_homework` — 作业辅导
- `education_exam` — 考试辅导
- `education_music` — 音乐陪练
- `education_art` — 美术指导
- `education_programming` — 编程辅导
- `education_fitness_coaching` — 健身陪练

### 14.17 `legal_professional` — 法律与专业咨询

- `professional_legal_consultation` — 法务咨询
- `professional_contract_review` — 合同审查
- `professional_visa` — 签证咨询
- `professional_company_registration` — 公司注册咨询
- `professional_labor` — 劳务咨询
- `professional_tax` — 税务咨询
- `professional_accounting` — 会计咨询
- `professional_notarized_translation` — 公证翻译
- `professional_administrative_procedure` — 行政手续代办
- `professional_intellectual_property` — 知识产权咨询

### 14.18 `events_conferences` — 活动与会务

- `event_planning` — 活动策划
- `event_venue` — 场地预订
- `event_host` — 主持服务
- `event_staff` — 活动执行人员
- `event_audio_lighting` — 灯光音响
- `event_stage` — 舞台搭建
- `event_booth` — 展位搭建
- `event_reception` — 活动礼仪
- `event_livestream` — 活动直播
- `event_equipment_rental` — 活动设备租赁

## 15. Permissions and data exposure

| Capability | Permission / rule |
|---|---|
| Public search and taxonomy read | Public published-data read |
| Favorite mutation/list | Authenticated user; own user ID only |
| Entity share | Authenticated user; formal message eligibility for NeeDo shares |
| Technician service/profile write | Technician identity and own technician scope |
| Expanded technician contact details | Active owner-to-target contact and not blocked |
| Shop taxonomy read/write | Current merchant shop scope; write permission required |
| Special cancellation apply/revoke | `backoffice:order-performance:write` |
| Internal timeline reason | Authorized merchant/backoffice readers only |

Every new request body and query is validated by Zod and documented in OpenAPI. All protected routes use RBAC declarations. Controllers remain request/response adapters; transactions and business rules live in services and repositories.

## 16. Error handling and concurrency

- Invalid target type, incomplete coordinates, inactive entity, malformed idempotency key, quota overflow, stale revision, or unauthorized taxonomy selection returns the standard API error envelope.
- Versioned special-cancellation and taxonomy writes return `409` on concurrent modification.
- Idempotency replay returns the prior successful result; the same key with a conflicting payload returns `409`.
- Favorite mutations are idempotent by user/target active key.
- Partial failure in `all` search mode does not erase successful entity sections.
- Frontend optimistic favorite state rolls back to the authoritative server response on error.
- No error path substitutes local mock results.

## 17. Microstep implementation and acceptance

### 17.1 Microstep 1 — special cancellation and acceptance rate

Deliver:

- additive schema and migration;
- responsibility classification and immutable revisions;
- rebuildable performance summary;
- apply/revoke APIs, permission Seed, OpenAPI, audit;
- unified order timeline and backoffice controls.

Acceptance:

- technician cancellation lowers the calculated rate;
- apply special cancellation raises it by excluding that assessment;
- apply event shows actor, time, and reason in the order timeline;
- revoke after a later complaint restores the counted outcome and lowers the rate;
- both events remain visible;
- no direct percentage write exists.

### 17.2 Microstep 2 — favorites, shares, and nearby ranking

Deliver:

- entity favorite and share event migrations/APIs;
- technician private base location;
- nearby candidate resolver and ranking;
- shared compact-count formatter.

Acceptance:

- identity switching cannot duplicate a favorite;
- unfavorite and re-favorite counts are correct;
- share retries do not double count;
- two candidates inside 3 km cause expansion to 4 km when a third exists there;
- every candidate inside 4 km is then re-ranked;
- three candidates inside 3 km prevent expansion;
- all four business tie-breakers and the deterministic final ID tie-breaker pass;
- no origin produces results without medals and a location prompt.

### 17.3 Microstep 3 — technician services and contact card

Deliver:

- max-five enforcement and transactional reorder;
- primary-service resolver;
- service editor relocation;
- expanded, relationship-gated contact DTO;
- acceptance-rate metric in the approved card location.

Acceptance:

- a sixth non-deleted service is rejected by the backend;
- reorder changes the primary service everywhere;
- tax-inclusive price/duration are consistent;
- a non-contact cannot read private technician details;
- a valid contact can read them;
- deleting or blocking the contact immediately removes access.

### 17.4 Microstep 4 — shop taxonomy

Deliver:

- category translations, keyword catalog, shop joins, quota policy;
- idempotent upsert Seed for all 18 categories and 180 keywords in five locales;
- merchant read/write APIs, audit, qualification checks;
- service-display edit mode.

Acceptance:

- categories and total business keywords each default to a five-item limit;
- a keyword from an unselected category is rejected;
- category removal transactionally removes dependent shop keywords;
- category names match search but never appear in `businessKeywords`;
- a larger server-side quota permits additional choices without a frontend code change;
- restricted policy selections require the configured platform qualification.

### 17.5 Microstep 5 — final search cards

Deliver:

- enriched formal DTOs and batched repository reads;
- new formal technician and shop result-card components;
- loading, error, empty, no-location, and retry states;
- five-language UI copy.

Acceptance:

- technician cards visually follow the approved figure-1 structure;
- shop cards visually follow the approved figure-3 structure;
- fuzzy names and any-label matching work with formal data;
- counts, primary service, age, acceptance rate, distance, and medals come from the API;
- console, overflow, bottom-navigation, long-text, and action-click isolation checks pass at 390x844 and 440x956.

## 18. Test strategy

Each microstep begins with failing tests for its business contract.

### Backend

- validator tests for coordinates, commands, quotas, IDs, and pagination;
- service tests for responsibility, rate math, visibility, quota, and ranking;
- repository integration tests for soft deletion, active-key uniqueness, transactional revisions, aggregation, and OR search branches;
- API tests for success envelopes, permissions, idempotency, version conflicts, and participant-specific timeline visibility;
- OpenAPI and permission-coverage tests;
- migration/schema tests and physical MySQL constraint/index verification.

### Frontend

- API adapter contract tests;
- card rendering with complete, missing-image, missing-service, zero-count, and long-text data;
- nested favorite/share action isolation;
- optimistic favorite rollback;
- location denial and no-location rendering;
- technician information-card privacy variants;
- shop taxonomy quota and dependent-keyword removal flows;
- i18n coverage for all added text.

### Verification gates

- regenerate Prisma Client after every schema merge;
- focused backend and frontend tests;
- backend lint and build;
- frontend lint and production build with the existing bundle budget;
- authenticated browser acceptance against the formal backend and current MySQL data;
- listener PID, working directory, branch, frontend proxy, and backend origin verified before browser conclusions.

## 19. Migration and rollback

- Migrations are additive and never edit an already-applied migration.
- Existing category IDs/codes and service relations are preserved.
- Existing `statusHistory`, compact card DTOs, and routes remain during compatibility migration.
- Backend contracts deploy before frontend consumers.
- A frontend rollback can restore the prior compact formal cards while leaving additive records intact.
- A service rollback stops new writes without deleting favorite/share/timeline history.
- Projection data is rebuildable; source order and assessment records are never replaced by the projection.
- Each microstep is committed separately and must not include unrelated dirty-worktree changes.

## 20. Completion boundary

This document authorizes implementation planning only. Completion of a local microstep means its migration, backend, frontend, tests, OpenAPI, i18n, and browser acceptance passed locally. It does not mean the work was pushed, deployed, or accepted in production.
