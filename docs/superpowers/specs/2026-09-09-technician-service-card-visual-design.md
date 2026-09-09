# Technician Service Card Visual Design

## Goal

Match the technician profile service card to the supplied reference: a dark rounded card with a patterned title band, an overlapping rounded-square cover, a compact usage row, metadata chips, description, and factual price/duration chips.

## Scope

- Apply the new visual only to service cards rendered in technician profile information, including the technician's own information page.
- Preserve the shared default card used by checkout, orders, categories, and merchant flows.
- Keep the existing direct image selection, validation, upload, removal, retry, and persistence behavior. No crop editor is opened.
- Render only existing formal service data. Do not introduce static locations, capabilities, prices, counts, or tags.
- Add no API, schema, migration, or remote-environment change.

## Layout

- Use a dark navy surface with a subtle primary-color border and a near-black patterned header.
- Place the service title in the header to the right of the cover.
- Place the cover as a responsive rounded square that overlaps header and body.
- Place usage count, service tags, and a two-line description in the body to the right of the cover.
- Place price and duration as compact factual chips. Preserve honest missing-value states.
- Keep management actions outside any navigation link and overlay the up-arrow, down-arrow, and edit buttons at the card's upper-right. Place the service title below that action row, near the bottom of the patterned header.

## Acceptance

- Profile cards expose a stable `showcase` variant and the intended header/cover/body test hooks.
- Default cards retain their existing markup and ordering contract.
- Technician profile services request the `showcase` variant.
- A selected JPEG, PNG, or WebP is passed through unchanged to the existing save/upload path.
- Targeted component tests, technician profile tests, typecheck, and production build pass locally.
