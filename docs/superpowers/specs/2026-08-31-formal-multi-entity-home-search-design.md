# NeeDo Formal Multi-Entity Home Search Design

**Date:** 2026-08-31  
**Scope:** Step 08 core-read API and Step 09 customer frontend mock retirement  
**Status:** Approved for implementation planning

## 1. Problem statement

The customer home header promises search across shops, technicians, and services, but the current `GET /api/v1/search` contract returns only paginated service cards. The frontend derives shops and technicians from those service cards. A published shop or technician with no directly linked published `Service` therefore has a valid detail page but cannot appear in search.

The category page also accumulates selected labels and custom terms, joins them into one space-separated keyword, and then applies an all-terms client filter. Unrelated labels such as home massage, business reception, dining, and cleaning consequently produce an empty result even when individual labels have matches. Multi-word entity names are split into separate chips.

The repair must query formal persisted entities directly. It must not add mock data, browser fallback records, a second search store, or a database migration.

## 2. Goals

- Search published shops directly, including shops with no published services.
- Search published technician profiles directly, including technicians with no directly linked published services.
- Keep the existing formal service search.
- Make the object selector (`all`, `shop`, `technician`, `service`) authoritative at the API boundary.
- Treat multiple selected tags and search terms as OR: matching any term is sufficient.
- Keep a multi-word name as one fuzzy name query.
- Preserve existing detail routes, public identifiers, pagination envelope, loading/error/empty states, and i18n behavior.
- Keep the change isolated to the Step 08/09 browsing slice.

## 3. Non-goals

- No Booking, Schedule, Order, wallet, IM, Social, Exchange, payment, or portal changes.
- No schema or migration changes.
- No autocomplete index, Elasticsearch/OpenSearch, typo correction, transliteration, romaji/kana conversion, synonym dictionary, or historical-name alias system.
- No exposure of unpublished or soft-deleted records.
- No promise that a shop or technician without a bookable service can be booked; search visibility and booking capability remain separate.

## 4. Chosen architecture

Keep one public endpoint and add an explicit entity discriminator:

```text
GET /api/v1/search?entityType=shop
GET /api/v1/search?entityType=technician
GET /api/v1/search?entityType=service
```

`entityType` defaults to `service` so existing callers that omit it retain the current paginated service response. Each explicit entity type returns the existing success envelope and a paginated list of the corresponding stable card payload:

```text
shop       -> PaginatedResponse<ShopCardPayload>
technician -> PaginatedResponse<TechnicianCardPayload>
service    -> PaginatedResponse<ServiceCardPayload>
```

The frontend adapter exposes typed methods (`searchShops`, `searchTechnicians`, and `searchServices`) instead of asking page code to interpret a mixed union. In `all` mode, the page makes three independent requests and renders three result sections. Entity-specific modes make only the matching request.

This avoids a breaking mixed-result pagination contract and avoids three nearly identical public routes.

## 5. Query contract

The formal query accepts:

- `entityType`: `shop | technician | service`, default `service`.
- `keywords`: one or more repeated query values, each trimmed, non-empty, and at most 100 characters.
- `categoryIds`: zero or more repeated positive integer category IDs.
- Existing pagination, city, price, service mode, and sort fields where they apply.
- Legacy singular `keyword` remains accepted and is folded into the keyword list for backward compatibility.

Example:

```text
/api/v1/search?entityType=shop&keywords=LifeDance&keywords=家政&categoryIds=3&categoryIds=9&page=1&pageSize=20
```

The shared frontend query serializer gains additive support for repeated scalar values. Existing scalar serialization remains unchanged.

Limits:

- At most 20 unique keywords after trimming and de-duplication.
- At most 20 unique category IDs.
- Invalid entity types, empty explicit keyword values, excessive counts, and invalid IDs return the normal validated API error rather than being ignored.

## 6. Matching semantics

### 6.1 Common rules

- Keywords within the same request use OR.
- Category IDs within the same request use OR.
- When both keyword and category groups are present, the groups use OR as confirmed for the customer search experience: a record matching any keyword or any selected category may appear.
- Published status and `deletedAt IS NULL` remain mandatory outer constraints.
- Results are de-duplicated by entity ID before pagination output.

### 6.2 Fuzzy name matching

Shop and technician names use substring containment after trimming the query. English case behavior follows the configured MySQL collation. A full multi-word input remains one phrase, so both `LifeDance` and `Wellness 渋谷` can match `LifeDance Wellness 渋谷`, while the UI does not split that name into separate chips.

- Shop public ID uses exact matching.
- Technician public NeeDoID uses exact matching.
- Name fuzzy matching does not search historical names or perform spelling correction.

### 6.3 Entity fields

Shop search may match:

- shop name (fuzzy), city, address, description;
- exact active shop public ID;
- published service name/category attached to the shop when keyword or category filters request it.

Technician search may match:

- display name (fuzzy), city, bio, service area;
- exact active technician public NeeDoID;
- active technician-service name/category and published source-shop service category;
- category membership available through an active, non-deleted shop affiliation and that shop's published services.

Service search may match the existing service/category/shop/technician fields, but it evaluates multiple keywords as separate OR branches instead of one joined phrase.

## 7. Backend responsibilities

- Extend the Zod query validator with entity type and bounded repeated keyword/category inputs.
- Keep Controller responsibility limited to validated request/response handling.
- Add repository/service methods for direct shop and technician searches; service search continues through the existing service query path.
- Apply pagination in the database query, not after loading all rows.
- Filter unpublished/soft-deleted entities and inactive/deleted public identifiers at the repository boundary.
- Avoid N+1 queries by using bounded Prisma relation filters and card includes.
- Document the conditional response types and query examples in OpenAPI and `docs/api.md`.

## 8. Frontend behavior

- A submitted free-text value becomes one custom keyword chip after trimming. Spaces inside the value are preserved.
- Known popular tags remain tag chips and resolve to formal category IDs when available.
- Multiple custom keyword chips and tag chips use OR.
- Do not build a space-joined API keyword and do not run a second all-terms client filter.
- `shop`, `technician`, and `service` modes call only the corresponding typed adapter.
- `all` mode calls all three adapters concurrently and renders independent Shop, Technician, and Service sections.
- Direct shop/technician results are rendered even when no service is linked. Missing recommended service data uses the existing profile-card capability-safe presentation and does not fabricate a price, slot, skill, or service.
- Existing shop and technician detail links remain unchanged.

## 9. Loading, error, and empty states

- Each entity request owns its loading, error, data, and pagination state.
- In `all` mode, one failed entity request does not erase successful sections. The failed section shows a scoped retry action.
- A global empty state appears only when every requested entity type completed successfully with no items.
- Stale responses must not replace results for a newer entity type or term set. Existing query-hook cancellation/stale-result protection is reused or extended rather than creating a browser cache.
- Validation and backend errors use existing translated error handling; no fallback results are shown.

## 10. Test-driven implementation and acceptance

Implementation begins with failing tests that prove the current defect:

### Backend tests

- A published shop with no services is returned by a partial shop-name query.
- A published technician with no services is returned by a partial technician-name query.
- Shop, technician, and service entity types return only their declared payload type.
- Multiple keywords and multiple category IDs use OR.
- A multi-word name is retained as one fuzzy phrase.
- Exact public-ID lookup works for shop and technician search.
- Unpublished and soft-deleted rows, inactive/deleted public identifiers, and invalid query values are excluded or rejected.
- Pagination and OpenAPI schemas remain stable.

### Frontend tests

- The query serializer emits repeated values without changing scalar behavior.
- The core-read adapter sends the correct entity type and returns typed pages.
- Free text with spaces remains one custom keyword.
- Multiple tags/keywords do not produce a joined all-terms keyword.
- Object selection controls which adapters run.
- `all` mode renders partial success and scoped retry/empty states.
- Direct shop and technician results are not dependent on service search results.

### Verification commands

- Focused backend validator/repository/service/API/OpenAPI tests.
- Focused frontend http-client/core-read/category-page tests.
- Backend lint and build.
- Frontend lint and `npm run verify:production-build`.

### Formal-data browser acceptance

Against the running formal backend and current local MySQL data:

- `LifeDance` and `Wellness 渋谷` find `LifeDance Wellness 渋谷` in Shop mode.
- `ひかり` finds `橘 ひかり` in Technician mode even though that profile has no directly linked service.
- A published shop with an empty service list is visible in Shop mode.
- Several unrelated selected tags return the union of their matching results rather than an empty all-terms intersection.
- Refresh preserves the URL-driven entity/tag selection and reloads the same formal results.
- Console, request errors, mobile overflow, empty sections, and detail navigation are checked separately.

## 11. Rollback and compatibility

- No migration rollback is required.
- The default service response for callers without `entityType` is preserved.
- Reverting the backend/frontend commits restores the old behavior without data changes.
- Search-related edits must not include or overwrite the existing unrelated technician-schedule and contact-timeline working-tree changes.

