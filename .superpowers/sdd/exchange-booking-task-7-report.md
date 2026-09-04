# Exchange booking Task 7 report

## Scope and commit

- Implementation commit: `70fb8d73a2d6dfc4e8cb90ce363ca8a4a51cb2e8` (`feat(exchange): confirm matched bookings in app`).
- Scope: formal Exchange owner booking conversion UI and matched-provider booking projection only. No backend, schema, payment, deployment, or push change was made.

## RED / GREEN evidence

- RED: the initial focused run had the expected missing API method, missing provider card, and absent owner conversion action: 3 failing files and 2 failing tests (plus the unresolved new card import).
- RED: persisted booking-created status and the stale-version non-generic-error behavior each failed before their minimal UI state/copy implementation.
- RED: provider-specific matching read failure copy failed before the five-locale key and card message were added.
- GREEN: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx` passed 4 files / 39 tests.
- GREEN: `npm run lint` passed.
- GREEN: `npm run build` passed.

## Formal-state and privacy evidence

- The conversion client posts only `{ expectedVersion }` to the formal `/exchange/posts/{id}/matching/bookings` endpoint with `Idempotency-Key`.
- Owner retries reuse the key for an unchanged post/version signature; a refreshed version receives a new key. A `409` refreshes matching and claim state and reports the persisted-state refresh without a generic failure message.
- The conversion response is deliberately ignored for display; rendered order rows come only from a subsequent `getExchangeMatching` response.
- Booking entry is shown only for `viewer.canCreateBookings`; the page makes the no-payment boundary explicit.
- Provider card loads the privacy-projected matching response, renders only its returned participant, and derives the formal context-specific order route with `getScheduleOrderDetailRoute`.
- Detail-page coverage confirms selected providers receive the provider panel while unselected viewers receive neither matching nor booking panels.

## Design / accessibility review

- Reused existing Exchange card shapes, client tokens, type scale, focus-ring controls, and no-motion default. The restrained batch-to-individual-order signature is the matched participant count/row relationship followed by independent order links; no palette, font, or unrelated page redesign was introduced.
- Owner/provider rows have `min-w-0`, truncation, wrapping actions, and responsive grid/flex behavior suitable for 320px and 440px widths. Loading uses `role=status`; failures use `role=alert`; retry and order links remain keyboard reachable.

## Localization

- Added five complete locales for every new booking key. Provider names, public IDs, service names, authored content, and order numbers remain server-authored and are not translated.
- `npm run i18n:audit` is currently blocked before Exchange validation by an existing generated-audit import failure: `exports/features/order-performance/i18n` cannot be resolved. No audit script or unrelated export was changed in this task.

## Residual risks

- Focused automated coverage and build are green, but authenticated browser acceptance against a running formal backend was not performed in this isolated frontend task.
- The repository-wide i18n audit must be repaired outside this scope and rerun before a release gate can claim full localization-audit completion.
