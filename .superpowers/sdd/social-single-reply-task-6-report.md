# Social Single Reply System — Task 6 Report

## Status

Implemented Task 6 on branch `codex/social-single-reply-system` from base commit `3271d27ac906c08bd9e9817062b5dbfc56f15c23`.

The canonical scoped post-detail URL is now the only reply destination. The two historical entry forms are compatibility redirects only:

- `*/moments/compose?replyToPostId=<numeric-id>` redirects before the lazy full composer is rendered.
- `*/moments/posts/:postId/replies` redirects through `SocialLegacyReplyRedirectPage`.

Both valid redirects carry `{ focusSocialReply: true }`. An invalid or empty historical compose reply id returns to the scoped timeline. A bad legacy path id still reaches the canonical detail route and uses its existing not-found behavior.

Task 7 focus consumption/detail restyling and Task 8 plus-menu actions remain intentionally deferred.

## RED evidence

Tests were changed before production code. The RED command was:

```bash
npm test -- src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/App.test.tsx
```

Observed RED result:

```text
Test Files  7 failed (7)
Tests       9 failed | 36 passed (45)
exit code   1
```

The nine expected failures proved that:

- the compose path type still accepted arbitrary/reply query parameters;
- no transient focus marker existed;
- the compatibility query still rendered the lazy full composer;
- the legacy replies route mounted the detail page directly;
- `SocialComposerPage` still contained reply mode and reply draft payloads;
- timeline reply controls still navigated to the full composer;
- `SocialQuickReplyComposer` still required the obsolete full-composer callback and claimed the plus button;
- the detail page still had `/replies`-specific rendering and full-composer links;
- all three portal route tables still owned duplicate reply detail entries.

The failures were assertion failures against the old behavior, not syntax, import, or environment failures.

## GREEN implementation

### Paths and route wrappers

- Added typed `SocialComposeParams` containing only `author`, `editPostId`, and `quotePostId`.
- Added shared `socialReplyFocusState`.
- Removed `socialPaths.replies`.
- Added `SocialLegacyReplyRedirectPage`.
- Moved the historical compose-query guard into `route-pages.tsx`, before `FullSocialRoute` can render the lazy composer.
- Added a jsdom route test with a mocked composer module proving the full composer component is not rendered for `?replyToPostId=700`.

### Obsolete full reply UI deletion

- Removed reply query parsing, reply parent lookup, reply post type, reply-specific draft key/payload, reply labels, reply preview, reply placeholder, and reply mutation input from `SocialComposerPage`.
- Filtered legacy reply drafts out of `SocialDraftsPage`; removed their resume query and `回复草稿` label.
- Preserved root-post, edit, and quote composer behavior.

### Canonical reply navigation

- Timeline reply controls now navigate to `socialPaths.post(scope, post.id)` with transient focus state.
- All three `/replies` routes now use the redirect-only wrapper.
- Removed the detail page's historical `/replies` title/list branch and full-composer reply links. Its reply affordances stay on the canonical detail route and pass transient focus state for Task 7.
- Removed `onOpenFullComposer` and the `moreAction` override from `SocialQuickReplyComposer`; the shared plus control remains available with no Task 8 actions yet.

## GREEN and verification evidence

Focused GREEN command:

```bash
npm test -- src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/App.test.tsx
```

Result:

```text
Test Files  7 passed (7)
Tests       45 passed (45)
```

Deletion guard:

```bash
rg -n "replyPost|isThreadPage|socialPaths\.replies|socialPaths\.compose\([^\n]*replyToPostId|onOpenFullComposer" src/features/social src/App.tsx
```

The only remaining match is `src/features/social/contracts.ts:16`, the still-valid reply mutation API contract (`POST /social/posts/:id/reply`), not a route or obsolete UI entry. Dedicated checks confirm zero `onOpenFullComposer`, zero `isThreadPage`, zero `socialPaths.replies`, and zero reply-compose navigation occurrences in production Social UI. The compatibility `replyToPostId` literal exists only in `route-pages.tsx` and its route test, plus persisted/domain reply fields required by the inline reply data model.

Additional verification:

```text
npm run lint
  PASS — tsc -b --noEmit

npm test
  PASS — 252 files, 1,524 tests

npm run build
  PASS — 494 modules transformed

npm run verify:production-build
  PASS — formal build; production bundle audit PASS (8 HTML entries, 23 assets)

git diff --check
  PASS
```

Build output retains existing non-fatal warnings about `SocialProfilePage.tsx` being both statically and dynamically imported and the configured large-chunk threshold. No new build error or audit failure was introduced.

## Self-review

- Scope: no backend, database, migration, provider, mock, deploy, or Task 7/8 implementation was added.
- Data behavior: persisted replies and inline `createPost({ replyToPostId })` remain intact; only the deleted full-page reply composer and duplicate reply routes were removed.
- Compatibility: new-post, edit, quote, repost, media, profile, notification, and search routes remain unchanged.
- Lazy boundary: redirect logic executes before `FullSocialRoute`; the mocked lazy composer render count stays zero in the redirect test.
- Portal coverage: user, merchant, and technician legacy routes are asserted in `App.test.tsx`.
- Invalid IDs: historical compose values that are empty/non-numeric return to the scoped timeline; legacy path IDs use canonical detail not-found behavior.
- Drafts: legacy reply drafts are hidden rather than mutated or deleted from persisted local draft state.
- Shared plus control: still rendered under the shared `ImChatComposer`; it no longer navigates to obsolete UI and remains ready for Task 8 action injection.
- No push or deployment was performed.

## Files changed

- `src/App.tsx`
- `src/App.test.tsx`
- `src/features/social/paths.ts`
- `src/features/social/paths.test.ts`
- `src/features/social/route-pages.tsx`
- `src/features/social/route-pages.test.tsx`
- `src/features/social/pages/SocialComposerPage.tsx`
- `src/features/social/pages/SocialComposerPage.test.tsx`
- `src/features/social/pages/SocialDraftsPage.tsx`
- `src/features/social/pages/SocialPostDetailPage.tsx`
- `src/features/social/pages/SocialPostDetailPage.test.ts`
- `src/features/social/components/UnifiedSocialUi.tsx`
- `src/features/social/components/UnifiedSocialUi.test.ts`
- `src/features/social/components/SocialQuickReplyComposer.tsx`
- `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- `.superpowers/sdd/social-single-reply-task-6-report.md`
