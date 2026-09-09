# Unified Service And Shop Cards Design

## Goal

Replace every service-information-card, simplified profile card, and in-chat card presentation with one responsive visual system based on the supplied reference. Service favorites, share counts, in-app sharing, and location distance must come from formal persisted data and APIs.

## Scope

- One `UnifiedServiceInfoCard` composition. The former `default` and `showcase` variants are removed.
- One simplified profile-card composition for shops, technicians, and users, used wherever the app currently delegates through `SocialProfileMiniCard`, `UnifiedSimpleProfileCard`, or the entity-specific wrappers.
- Service-level favorites and shares for both shop services and technician services.
- A searchable, multi-select in-app share sheet containing confirmed contacts and joined group conversations.
- Direct-contact selections resolve or create the formal direct conversation. Group selections use the existing joined group conversation.
- Each selected destination receives one server-authored snapshot card and one persisted share event.
- Service favorites appear in the user's existing “我的收藏” area together with shop favorites; chat-record favorites remain available as a separate tab.
- Distance is a straight-line geodesic distance, matching the existing nearby-technician Haversine semantics, calculated from the current approved location origin to the persisted shop coordinates.
- The composer “名片” entry continues to use the formal server-authored contact-card send path, but sent and received technician/user cards render with the same shared card composition as the rest of the app.

## Formal Data Contract

Entity engagement accepts four exact target kinds: `shop`, `technician`, `service`, and `technician_service`. `EntityFavorite` and `EntityShareEvent` each store exactly one target foreign key. Active favorites retain the existing soft-delete and unique-active-key behavior. Needo-message share rows point to the committed conversation/message; direct rows store the resolved peer, while group rows intentionally leave recipient user/identity null.

Service cards receive `publicId`, `targetType`, `isBookable`, `favoriteCount`, `shareCount`, shop region/address, and optional `distanceKm` in addition to their current content. Missing formal values render an honest unavailable state and never become invented zeroes or placeholder locations.

The favorites list API returns a server-built card projection so the frontend does not issue one detail request per row. The projection is sufficient to render the same unified shop or service card and includes a stable detail path.

## Share Flow

1. The share icon opens a modal sheet and does not navigate the card.
2. The sheet loads all confirmed contacts and joined conversations through formal paginated IM APIs.
3. Search filters contact display name/NeeDo ID and group title/member names.
4. Contacts and groups can be selected together. Duplicate direct conversations are collapsed by peer user ID.
5. Pressing “分享” resolves or creates direct conversations, then sends each destination independently using a unique idempotency key.
6. The backend verifies target visibility, conversation membership, friendship/group send permission, and builds the card snapshot from authoritative records in the same transaction as the message/share event.
7. Partial failure stays visible per destination; successful destinations are not sent twice when retrying failures.

## Visual System

The reference's dark spa-console character is preserved without adding another theme variant.

- `night-ink`: `#031014`
- `night-panel`: `#07181b`
- `night-line`: `#244047`
- `signal-lime`: `#b8ff4a`
- `paper-white`: `#f7f9f7`
- `steel-muted`: `#9aacb5`

The signature element is the top metrics rail joined to a cinematic image/content split. Wide cards use the reference's left image and right description. At narrow widths, the same DOM and metric order reflow into a two-column rail, image block, and content block; this is responsive behavior, not a second design.

Service card order:

1. Bookability, usage, distance/region, favorite, share.
2. Cover image with duration badge and price plate.
3. Service name, description, tags, and circular detail arrow.

Shop card order:

1. Rating, distance/region, favorite, share.
2. Cover image without duration or price overlays.
3. Shop name, full address, description/tags, and circular detail arrow.

Technician card order:

1. Rating, completed-order count, distance, favorite, share.
2. Portrait without duration or price overlays.
3. Display name, introduction, language chips, and the four fixed special-review icons.
4. Each special icon has no outer chip/container. Its persisted evaluation count is shown in a small badge at the icon's upper-right, overlapping the icon edge.

User card order:

1. No metrics rail.
2. Portrait without duration or price overlays.
3. Display name, introduction, and language chips.

Management action controls stay outside the navigation link. All interactive controls have at least a 44 px target, visible keyboard focus, reduced-motion behavior, and labels in simplified Chinese, traditional Chinese, Japanese, English, and Korean.

## Compatibility And Replacement Boundary

Legacy data adapters may continue to supply existing formal/compatibility records, but they all delegate to the new card bodies. No old service, shop, technician, user, or chat-card JSX remains reachable from a simplified-card/name-card entry. Entity-specific differences are data configuration inside the same component system, not separately styled variants. Full profile/detail pages outside their embedded simplified cards are not redesigned.

No crop tool is added to service-card image upload. No remote operation, port 5180 operation, fake API, static engagement count, or client-authored share snapshot is allowed.

## Testing And Acceptance

- Migration/schema checks assert exactly-one-target constraints, soft-delete uniqueness, group-share recipient rules, indexes, and foreign keys.
- Repository/service/API tests cover both service target types, favorite add/remove/list, direct/group share, idempotent replay, cross-user rejection, and authoritative snapshots.
- Component tests assert the single card body, all four entity field differences, special-icon count badges, action isolation, honest missing states, share selection/retry, and five-language copy.
- Page tests assert “我的收藏” renders formal service/shop cards without N+1 detail reads.
- Build/typecheck and targeted full suites run in the feature worktree, then again after local-main merge.
- Browser acceptance, if required, uses a verified free non-5180 port and checks desktop, 440 px, and 320 px widths.
