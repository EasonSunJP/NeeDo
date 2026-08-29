# Task 10 Report: User-home formal carousel cutover

## Outcome

- Replaced the user-home `homeCarouselStore` slice with the formal `PublishedCarousel` adapter fixed to `user-home`.
- Kept the carousel between the appointment reminder region and the existing quick actions.
- Preserved the previous `h-[204px]` card height by completing the shared `PublishedCarousel` prop contract and forwarding the optional height to `FeatureCarousel`.
- Applied the resolved height to loading, error, empty, and published states so asynchronous transitions do not shift the home layout.
- Removed the page's browser carousel store, local scene resolution, target resolution, and revision dependencies. The legacy store remains untouched for other compatibility boundaries.
- Added rendered coverage for isolated API failure/retry UI, recommendation survival, locale reload, formal target navigation, and independence from legacy storage events.

## TDD evidence

1. Added the source and rendered HomePage contracts first.
2. Confirmed RED: `HomePage.test.ts` failed 6 new assertions because the page still rendered the legacy carousel and never requested the formal API.
3. Added the explicit height passthrough test to `PublishedCarousel.test.tsx`.
4. Confirmed RED: the new height assertion failed because the shared adapter did not forward `cardHeightClassName`.
5. Implemented the minimal production cutover and height prop, then reran the focused and full suites GREEN.
6. Review found that only the published-success state consumed the height. Added loading/error/empty height assertions, confirmed all three RED, then routed one resolved height through every state.

## Files

- `src/pages/user/HomePage.tsx`
- `src/pages/user/HomePage.test.ts`
- `src/features/content-publication/PublishedCarousel.tsx`
- `src/features/content-publication/PublishedCarousel.test.tsx`

## Verification

- Focused carousel/home tests: 3 files, 35 tests passed.
- Full frontend tests: 194 files, 1,102 tests passed.
- TypeScript lint: passed.
- i18n quality audit: passed with zero missing translations and zero spreadsheet errors.
- Formal production build: passed.
- Production bundle audit: passed for 8 HTML entries and 22 assets.
- `git diff --check`: passed.

## Scope and preservation

- No local fallback, mock carousel content, placeholder, or browser-persisted carousel truth was added.
- Recommendations, booking/reminder behavior, Social, header, quick actions, layout store, and unrelated routes were not changed.
- Pre-existing unrelated dirty files were not edited or staged for this task.
- No unresolved Task 10 concerns.
