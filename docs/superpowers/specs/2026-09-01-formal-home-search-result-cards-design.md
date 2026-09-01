# Formal Home Search Result Cards

## Approval basis

This design records the already-approved behavior and screenshots supplied in the task: technician search results use the large portrait service card; shop results use the horizontal shop card. The user also explicitly required uninterrupted execution without further clarification pauses.

## Objective

Replace the compact generic shop/technician rows on the home category search page with entity-specific cards while preserving the existing formal multi-entity search, OR matching across selected labels, fuzzy name matching, and nearby technician ranking.

## Data contract

The public shop card adds only persisted aggregate values: active favorite count and non-deleted share-event count. Existing localized business keywords remain the only keyword chips shown on the card; service category names remain searchable but are not rendered as keyword chips.

The public technician card adds age, persisted active favorite count, non-deleted share-event count, calculated acceptance rate, completed-order count, and the first active/bookable/approved technician service ordered by configured sort order then ID. The first configured service is the primary business. The service payload contains its real name, price, currency, and duration. Missing optional values remain null and are hidden; no mock or inferred value is substituted.

Nearby rank remains authoritative from the existing distance-first algorithm: start at 3 km, expand by 1 km until three eligible technicians exist or all eligible technicians have been found, then order by rating, completed orders, review count, and registration time. Only ranks 1–3 receive gold/silver/bronze badges.

## Components and layout

- `FormalTechnicianSearchCard`: two-column portrait grid on narrow screens, with rating at top left, favorite/share metrics at top right, nearby medal over the portrait, name plus age/city, acceptance rate, and a lower service panel with tax-inclusive price and duration.
- `FormalShopSearchCard`: full-width horizontal card with rating at top left, favorite/share metrics at top right, cover image, shop name and badge, address, and up to five persisted business-keyword chips.
- Shared compact-count formatting renders values below 1,000 exactly and floors each thousand range to `1k`, `2k`, and so on.

The visual language follows the supplied NeeDo dark card references: near-black media surface, deep blue-gray information panel, lime metric outlines, bold white names, and quiet gray metadata. The nearby medal is the signature visual element; surrounding decoration stays restrained.

## Interaction and accessibility

Each complete card remains one keyboard-focusable link to the existing formal shop or technician detail route. Images have entity-name alt text, metric icons have translated accessible labels, and card content does not introduce nested buttons inside links. Layout must remain overflow-free at 390 px and 440 px widths.

## Failure and empty states

Existing scoped loading, error, retry, empty, and missing-location guidance remain unchanged. A missing photo uses the existing generated fallback; missing optional metrics or primary service data are hidden or shown as a neutral availability message, never fabricated.

## Verification

Repository tests prove persisted counts, performance summary, age, and primary-service ordering/filtering. API/OpenAPI tests prove the additive public contract. Component/render tests prove entity-specific cards, exact count formatting, nullable-field behavior, formal routes, business-keyword-only chips, and no legacy mapper/mock dependency. Lint, backend build, formal production build with bundle audit, and real narrow-browser screenshots complete acceptance.
