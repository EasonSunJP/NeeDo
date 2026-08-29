# Task 8 Report — Typed frontend API, locale mapping, and shared carousel adapter

## Scope

Implemented only the Task 8 frontend client slice:

- one typed `contentPublicationApi` over the existing `httpClient`;
- canonical app-language to content-locale mapping;
- a cancellation-safe published-carousel hook with retry revision;
- a shared `PublishedCarousel` adapter over the existing `FeatureCarousel`;
- Service-only UUID route preservation without broadening Shop or Technician detail APIs.

No page was switched from an existing carousel to the new adapter in this task. No mock, production fallback, font, palette, theme, or second carousel component was added.

## Design self-review

- Existing `FeatureCarousel`, `featureCarouselFrameClassName`, `h-[176px]`, and `--client-*` tokens remain authoritative.
- Loading, error, and empty states occupy the same carousel footprint.
- Error state gives one localized Retry action; empty state does not substitute demo slides.
- The only signature element remains the existing carousel.

## RED

Tests were written before production code.

Command:

```bash
npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts
```

Observed failures:

- `src/api/contentPublication.test.ts`: `contentPublication` module did not exist.
- `src/features/content-publication/PublishedCarousel.test.tsx`: `PublishedCarousel` module did not exist.
- Service UUID parsing returned `null` instead of preserving the UUID.
- `ServiceDetailPage` did not opt in to Service UUID parsing.
- The existing positive numeric Service path remained green.

## GREEN implementation

### API and types

- Added exact public payload types that omit backoffice release IDs and affiliate task IDs.
- Added typed public carousel and announcement reads.
- Added fixed-scene backoffice carousel read, draft, history, target search, release, locale update/copy, preview, publish, schedule, disable, and rollback methods.
- Added backoffice announcement list, draft, history, release, locale update/copy, preview, publish, schedule, disable, and rollback methods.
- Added raw image `Blob` upload with the Blob as the request body, its exact MIME type as `Content-Type`, and optional `alt_text` query.
- All methods reuse `src/api/httpClient.ts`; no second fetch wrapper exists.

### Shared published carousel

- `toContentLocale` maps `zh -> zh-CN`, `zh-Hant -> zh-TW`, and preserves `ja`, `en`, and `ko`.
- `usePublishedCarousel` clears prior data on scene/locale/retry revisions, ignores settled promises after cleanup, and keeps errors in local state.
- `PublishedCarousel` maps only returned API slides into `FeatureCarousel` slides.
- Target routes are scene-compatible existing routes for shop, technician, service, and Affiliate announcement.
- Loading, error, retry, and empty copy is complete for all five app languages.

### Service UUID route

- `coreReadIdFromRoute` accepts UUIDs only with explicit `{ allowUuid: true }`.
- `ServiceDetailPage` is the only existing detail page changed to use that option.
- Positive numeric routes still return numbers.
- `getServiceDetail` accepts number or UUID string; Shop and Technician API signatures remain number-only.

## Files

Created:

- `src/api/contentPublication.ts`
- `src/api/contentPublication.test.ts`
- `src/features/content-publication/locales.ts`
- `src/features/content-publication/i18n.ts`
- `src/features/content-publication/usePublishedCarousel.ts`
- `src/features/content-publication/PublishedCarousel.tsx`
- `src/features/content-publication/PublishedCarousel.test.tsx`

Modified:

- `src/features/core-read/api.ts`
- `src/pages/user/ServiceDetailPage.tsx`
- `src/pages/user/ServiceDetailPage.test.ts`
- `src/i18n/translations.test.ts` (Task 8 import and five-language quality assertion only)

## Verification

```text
npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts src/i18n/translations.test.ts
PASS — 4 files, 58 tests

npm test -- src/features/core-read/api.test.ts src/features/core-read/transientRetry.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/user/ServiceDetailPage.test.ts
PASS — 4 files, 13 tests

npm test
PASS — 192 files, 1055 tests

npm run lint
PASS

npm run i18n:quality
PASS — missing translations 0 for zh-Hant/ja/en/ko; spreadsheet errors 0

npm run verify:production-build
PASS — TypeScript build, Vite formal build, and production bundle audit

git diff --check
PASS
```

## Concerns

- The shared adapter is intentionally not mounted into Home or Affiliate pages in Task 8; mounting and browser acceptance belong to the later page integration task.
- The production build retains the repository's existing SocialProfile mixed static/dynamic import and large-chunk warnings; the production bundle audit passes and Task 8 adds neither warning source.
- The i18n quality audit passes its gate and reports zero missing/error entries; its existing Japanese simplified-character observations remain outside Task 8.

## Review follow-up — localized carousel semantics

### RED

Review tests were added before the follow-up implementation. The first focused run failed three runtime assertions:

- `FeatureCarousel` replaced authored image alt text with the title;
- an explicit `null` CTA rendered the legacy Chinese fallback;
- `PublishedCarousel` discarded the public payload's authored alt and no-CTA semantics.

The first TypeScript check also proved that the draft and target-search scene types were not linked: the generic input types did not exist and all four negative `@ts-expect-error` assertions were unused.

### GREEN

- `FeatureCarouselSlide` now accepts authored `imageAlt` and preserves CTA tri-state semantics: `undefined` keeps the legacy fallback, a string renders exactly as authored, and `null` renders no CTA.
- `PublishedCarousel` passes `imageAltText` and the unmodified nullable `ctaLabel` from the localized public payload.
- `CarouselTargetInput`, draft create/replace inputs, and target-search queries are scene-keyed. `NoInfer` keeps the scene argument authoritative at API call sites.
- Positive exact-contract tests cover both canonical and slug scene names. Negative compile-time tests reject cross-scene draft targets and search filters.
- Deferred-promise tests prove that locale and scene changes start fresh requests, stale responses do not replace current data, and a late response after unmount does not update state.

### Follow-up verification

```text
npm test -- src/components/client-ui/FeatureCarousel.test.tsx src/features/content-publication/PublishedCarousel.test.tsx src/api/contentPublication.test.ts
PASS — 3 files, 21 tests

npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts src/i18n/translations.test.ts src/components/client-ui/FeatureCarousel.test.tsx
PASS — 5 files, 68 tests

npm test -- src/features/core-read/api.test.ts src/features/core-read/transientRetry.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/user/ServiceDetailPage.test.ts
PASS — 4 files, 13 tests

npm test
PASS — 192 files, 1064 tests

npm run lint
PASS

npm run i18n:quality
PASS — missing translations 0 for zh-Hant/ja/en/ko; spreadsheet errors 0

npm run verify:production-build
PASS — TypeScript build, Vite formal build, and production bundle audit
```

### Follow-up concerns

- The Chinese legacy CTA remains only for pre-existing `FeatureCarousel` callers that omit `cta`; formal published slides always pass the API's localized `string | null` and therefore never use that fallback.
- No visual structure, theme token, palette, typography, loading/error/empty state, or navigation behavior changed.
