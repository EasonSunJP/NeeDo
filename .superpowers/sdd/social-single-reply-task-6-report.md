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

---

## Review follow-up — reply-draft and obsolete-copy deletion

Task 6 review identified two remaining deletion gaps. Both were addressed without changing formal `SocialPost.replyToPostId`, `SocialCreatePostInput.replyToPostId`, or the real inline create-reply mutation.

### Follow-up RED

Tests were changed before the cleanup implementation. Command:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/pages/SocialComposerPage.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx
```

Observed output:

```text
Test Files  3 failed | 1 passed (4)
Tests       3 failed | 77 passed (80)
exit code   1
```

The three expected assertion failures proved that:

- no persisted-draft hydration/cleanup function existed;
- `SocialComposerDraft` still contained `replyToPostId` and `SocialDraftsPage` still knew how to filter it;
- the three obsolete translation keys were still present.

The neutral generic IM composer label change passed immediately because it deliberately changes no IM behavior.

### Follow-up implementation

- Removed `replyToPostId` from `SocialComposerDraft`.
- Removed reply-specific compatibility filtering from `SocialDraftsPage`; it now lists all valid scoped composer drafts generically.
- Added a draft-only persistence boundary in `draft-storage.ts` using `needo.social.composer-drafts.v1`.
- On hydration, ordinary, quote, and edit drafts are migrated from the former `needo.social.module.v2` state without hydrating its posts or other browser business data.
- Any stored draft object that owns a `replyToPostId` field is dropped during both hydration and persistence. The old storage object is rewritten with that reply draft removed, so it cannot reappear on a later run.
- Browser storage access remains best-effort; unavailable or quota-rejected storage cannot block the formal Social UI.
- Removed five-language translation rows for `打开完整回复`, `回复草稿`, and the old explanation that directed users into the full post composer.
- Updated translation coverage to assert those obsolete keys stay absent while preserving `回复中` localization.
- Replaced the generic IM composer test's Social-specific `打开完整回复` example with neutral `执行自定义操作`; IM behavior and the `moreAction` contract are unchanged.

### Follow-up GREEN and verification

Initial focused GREEN:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/pages/SocialComposerPage.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx
```

```text
Test Files  4 passed (4)
Tests       80 passed (80)
```

Full Task 6 relevant suite:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/components/UnifiedSocialUi.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx src/App.test.tsx
```

```text
Test Files  10 passed (10)
Tests       117 passed (117)
```

Full frontend regression:

```bash
npm test
```

```text
Test Files  252 passed (252)
Tests       1,526 passed (1,526)
```

Type and build verification:

```bash
npm run lint
npm run build
```

```text
lint   PASS — tsc -b --noEmit
build  PASS — 495 modules transformed; built in 8.50s
```

The build retains the existing non-fatal `SocialProfilePage` mixed static/dynamic import warning and configured large-chunk warning.

Production caller deletion search:

```bash
rg -n "打开完整回复|回复草稿|进入完整发帖页" src -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx'
```

Result: no matches (`rg` exit 1).

Final whitespace verification:

```bash
git diff --check
```

Result: PASS with no output.

### Follow-up self-review

- The cleanup hydrates and persists composer drafts only; it does not restore old Social posts, profiles, interactions, notifications, mocks, or parallel business state.
- The legacy full-state key is read only to migrate safe drafts and physically remove reply drafts; unrelated legacy fields remain untouched.
- Ordinary, quote, and edit draft records retain their content and ordering, and are behaviorally covered through migration plus re-persistence.
- Persisting a runtime object with a legacy `replyToPostId` property drops the complete record, proving it cannot be re-saved.
- Formal reply post rendering, counts, parent relationships, and inline create-reply inputs remain present and covered by the full suite.
- No backend, schema, migration, push, deployment, or Task 7/8 work was performed.
