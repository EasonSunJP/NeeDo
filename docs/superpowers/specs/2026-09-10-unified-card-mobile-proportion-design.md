# Unified Card Mobile Proportion Correction Design

## Goal

Make the existing unified service, shop, technician, and user cards preserve the supplied reference composition at every supported width. This is a correction to the only shared card system, not a new variant.

## Reference Reading

The approved composition has two invariant bands:

1. A single five-column metrics rail across the full card width when metrics exist.
2. A cinematic body with the image on the left and descriptive content on the right.

The current narrow layout breaks both invariants by changing the metrics rail to two columns and stacking the image above the details. That produces a tall feed tile instead of the approved horizontal information card.

## Responsive Contract

- Service, shop, and technician metric rails remain exactly five columns at 320 px, 390 px, 440 px, and desktop widths.
- Service, shop, technician, and user bodies remain a two-column image/content split at those widths.
- Narrow widths reduce icon size, type size, padding, chip spacing, image height, corner radius, price plate, duration badge, and detail-arrow size.
- Desktop sizing remains unchanged from the approved card.
- Long or unavailable metric values truncate within their own column and never force wrapping or horizontal overflow.
- Images keep `object-cover`; missing-image and unavailable-data honesty remain unchanged.
- Favorite and share controls remain independently clickable above the whole-card navigation target.

## Visual Tokens

The existing palette remains authoritative: `#031014`, `#07181b`, `#244047`, `#b8ff4a`, `#f7f9f7`, and `#9aacb5`. No new theme or alternate card skin is introduced.

The signature remains the uninterrupted neon metrics rail joined to the left-image/right-content split. Mobile density is reduced through responsive type and spacing only.

## Scope And Safety

- Modify only shared unified-card layout and responsive presentation classes plus their tests.
- Do not change engagement APIs, distance calculations, formal unavailable states, routes, data models, database schema, or translations.
- Do not add a mobile-only card component or retain the stacked layout as an alternate variant.
- Do not operate port 5180 or any remote environment.

## Acceptance

- Component tests fail against the current two-column rail and stacked body, then pass after the correction.
- The static entrypoint audit still confirms one reachable card system.
- Typecheck, targeted tests, and production build pass.
- Browser screenshots at a phone-sized viewport and a desktop viewport show the same composition, with no horizontal overflow.

