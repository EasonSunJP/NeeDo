# Task 11 Report: Affiliate notice carousel and announcement detail

## Result

- The Affiliate home keeps the completed identity-switching header and now renders the formal `affiliate-home-notice` carousel immediately below it.
- The existing Affiliate marketplace capability boundary remains explicit and usable after carousel loading, empty, or error states.
- `/afirieito/announcements/:announcementPublicId` is registered inside the authenticated Affiliate portal.
- The announcement detail reads the current five-language locale from the formal API, rejects stale public-ID/locale responses, and never uses browser storage or fallback content.
- The task CTA follows the current server contract and appears only for `taskAction.claimable === true`; it forwards the public `taskCode` to `/afirieito/plan` without exposing an internal task ID.

## TDD evidence

The first focused run was RED:

- `BusinessCpsPage.test.tsx` failed because the separate Affiliate carousel was absent.
- `App.test.tsx` failed because the announcement route/import was absent.
- `AffiliateAnnouncementDetailPage.test.tsx` could not resolve the absent module.

After the minimum implementation, a second RED/GREEN cycle added protection against the runtime translation walker rewriting server-authored announcement text. The new assertion failed until the server-content article was marked `data-no-i18n`.

Focused GREEN:

```text
Test Files  4 passed (4)
Tests       37 passed (37)
```

Covered behavior:

- fixed-scene placement before the existing capability boundary;
- independent formal carousel with no `homeCarouselStore`/`localStorage` dependency;
- title, summary, body, safe line breaks, and publication/effective times;
- all five locale mappings (`zh-CN`, `zh-TW`, `en`, `ja`, `ko`);
- public-ID change and stale-response protection;
- claimable CTA visibility/navigation and unavailable CTA omission;
- stable 404 state, isolated transient retry, and back navigation;
- protected route registration.

## Verification

```text
npm test
Test Files  195 passed (195)
Tests       1113 passed (1113)

npm run lint
exit 0

npm run i18n:quality
missingByLanguage: 0 for zh-Hant, ja, en, ko
spreadsheetErrorCount: 0

npm run verify:production-build
vite build: PASS
production-bundle-audit: PASS (8 HTML entries, 22 assets)

git diff --check
exit 0
```

The build retains the existing SocialProfile dynamic/static import and large-chunk warnings; neither was introduced by Task 11.

## Scope preserved

- No change to the Affiliate identity-switching header behavior from commit `351aa19e`.
- No user-home carousel change.
- No mock, demo response, browser persistence, or local business-truth fallback.
- No claim that the unrelated task marketplace, settlement, social, chat, or request capability is complete.
- Pre-existing unrelated dirty worktree changes remain outside the Task 11 staging boundary.
