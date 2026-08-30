# Social Single Reply System — Task 6 Report

## Status

Implemented Task 6 on branch `codex/social-single-reply-system` from base commit `3271d27ac906c08bd9e9817062b5dbfc56f15c23`.

The canonical scoped post-detail URL is now the only reply destination. The two historical entry forms are compatibility redirects only:

- `*/moments/compose?replyToPostId=<numeric-id>` redirects before the lazy full composer is rendered.
- `*/moments/posts/:postId/replies` redirects through `SocialLegacyReplyRedirectPage`.

Both valid redirects carry `{ focusSocialReply: true }`. An invalid or empty historical compose reply id returns to the scoped timeline. A bad legacy path id still reaches the canonical detail route and uses its existing not-found behavior.

Legacy reply drafts are now handled only by a best-effort startup cleanup of the existing `needo.social.module.v2` object. Formal Provider state does not hydrate legacy drafts, no new draft-storage key is created, and no ongoing browser draft-persistence effect exists.

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
- Removed reply-specific draft compatibility knowledge from `SocialDraftsPage`; it now renders valid new-post, edit, and quote drafts generically.
- Removed legacy reply draft records in place at the Social startup storage boundary while preserving valid drafts and unrelated legacy fields.
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
  PASS — 252 files, 1,527 tests

npm run build
  PASS — 495 modules transformed

git diff --check
  PASS
```

Build output retains existing non-fatal warnings about `SocialProfilePage.tsx` being both statically and dynamically imported and the configured large-chunk threshold. No new build error or audit failure was introduced.

## Self-review

- Scope: the only Provider change is the best-effort legacy reply-draft cleanup call at Social startup; no backend, database, migration, mock, deploy, or Task 7/8 implementation was added.
- Data behavior: persisted replies and inline `createPost({ replyToPostId })` remain intact; only the deleted full-page reply composer and duplicate reply routes were removed.
- Compatibility: new-post, edit, quote, repost, media, profile, notification, and search routes remain unchanged.
- Lazy boundary: redirect logic executes before `FullSocialRoute`; the mocked lazy composer render count stays zero in the redirect test.
- Portal coverage: user, merchant, and technician legacy routes are asserted in `App.test.tsx`.
- Invalid IDs: historical compose values that are empty/non-numeric return to the scoped timeline; legacy path IDs use canonical detail not-found behavior.
- Drafts: legacy reply drafts are physically removed in place from the old `needo.social.module.v2` object at Social startup; no legacy draft is imported into formal Provider state.
- Shared plus control: still rendered under the shared `ImChatComposer`; it no longer navigates to obsolete UI and remains ready for Task 8 action injection.
- No push or deployment was performed.

## Final changed-file inventory

This inventory describes the final cleanup-only tree. The rejected intermediate `src/features/social/draft-storage.ts` subsystem does not exist in the final tree.

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
- `src/features/social/context.tsx`
- `src/features/social/legacy-reply-draft-cleanup.ts`
- `src/features/social/formal-provider.test.ts`
- `src/features/social/types.ts`
- `src/features/im/components.composer.test.tsx`
- `src/i18n/translations.ts`
- `src/i18n/translations.test.ts`
- `.superpowers/sdd/social-single-reply-task-6-report.md`

---

## Rejected intermediate revision — permanent draft persistence attempt

Task 6 review identified two remaining deletion gaps: obsolete reply-draft support and obsolete copy/tests. The first attempted fix removed the reply field and copy, but also introduced a new permanent browser draft-persistence subsystem. Although its tests passed, review rejected that subsystem because it was unscoped to account identity and could leak drafts across accounts. The cleanup-only behavior documented later in this report did **not** exist in this intermediate revision.

### Follow-up RED

Tests were changed before the intermediate implementation. Command:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/pages/SocialComposerPage.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx
```

Observed output:

```text
Test Files  3 failed | 1 passed (4)
Tests       3 failed | 77 passed (80)
exit code   1
```

The three expected assertion failures proved that the pre-follow-up code still lacked the requested draft/copy deletion behavior:

- no persisted-draft compatibility/cleanup function existed;
- `SocialComposerDraft` still contained `replyToPostId` and `SocialDraftsPage` still knew how to filter it;
- the three obsolete translation keys were still present.

The neutral generic IM composer label change passed immediately because it deliberately changes no IM behavior.

### Rejected intermediate implementation

- Removed `replyToPostId` from `SocialComposerDraft`.
- Removed reply-specific compatibility filtering from `SocialDraftsPage`; it now lists all valid scoped composer drafts generically.
- Added the now-rejected `needo.social.composer-drafts.v1` browser-storage key and a draft-storage module.
- Imported compatible legacy drafts from `needo.social.module.v2` into formal Provider state and persisted every subsequent formal draft change into the new key.
- Sanitized and rewrote the old object's drafts during hydration, but also copied the retained drafts into the new permanent key; cleanup was therefore coupled to hydration and ongoing persistence rather than being cleanup-only.
- Removed five-language translation rows for `打开完整回复`, `回复草稿`, and the old explanation that directed users into the full post composer.
- Updated translation coverage to assert those obsolete keys stay absent while preserving `回复中` localization.
- Replaced the generic IM composer test's Social-specific `打开完整回复` example with neutral `执行自定义操作`; IM behavior and the `moreAction` contract are unchanged.

### Rejected intermediate GREEN evidence

These passing results belong only to the rejected permanent-persistence revision. They do not prove or describe cleanup-only behavior.

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

### Why this passing revision was rejected

- The new `needo.social.composer-drafts.v1` store was not scoped to an authenticated account and therefore could expose one account's drafts to another account using the same browser profile.
- Hydrating legacy drafts into formal Provider state and persisting every draft was broader than Task 6's deletion/compatibility boundary.
- Passing 80/117/1,526 tests did not make that account-boundary risk acceptable.
- Review required deleting this subsystem and replacing it with the narrowly scoped, in-place cleanup documented and verified in the final section below.

---

## Final re-review fix — cleanup-only legacy draft removal

Re-review correctly rejected the intermediate unscoped `needo.social.composer-drafts.v1` persistence because it could share drafts across accounts. That subsystem was removed completely.

This final section and its 13/81/118/1,527 passing evidence are authoritative for the delivered cleanup-only state.

### Cleanup-only RED

The formal Provider test was changed first:

```bash
npm test -- src/features/social/formal-provider.test.ts
```

Observed output:

```text
Test Files  1 failed (1)
Tests       2 failed | 11 passed (13)
exit code   1
```

Both failures were expected assertions: the narrowly named cleanup function and its non-blocking storage-error behavior did not exist yet.

### Cleanup-only GREEN

Provider cleanup behavior:

```bash
npm test -- src/features/social/formal-provider.test.ts
```

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

Focused cleanup/provider/drafts/i18n/IM suite:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/pages/SocialComposerPage.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx
```

```text
Test Files  4 passed (4)
Tests       81 passed (81)
```

Full Task 6 relevant suite:

```bash
npm test -- src/features/social/formal-provider.test.ts src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/components/UnifiedSocialUi.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/i18n/translations.test.ts src/features/im/components.composer.test.tsx src/App.test.tsx
```

```text
Test Files  10 passed (10)
Tests       118 passed (118)
```

Full frontend regression:

```bash
npm test
```

```text
Test Files  252 passed (252)
Tests       1,527 passed (1,527)
```

Type, build, and whitespace verification:

```bash
npm run lint
npm run build
git diff --check
```

```text
lint        PASS — tsc -b --noEmit
build       PASS — 495 modules transformed; built in 9.04s
diff check  PASS — no output
```

The build retains only the existing non-fatal mixed static/dynamic Social profile import warning and configured large-chunk warning.

### Cleanup-only assertions

- A legacy draft owning `replyToPostId` is physically absent after cleanup.
- Ordinary, quote, and edit drafts remain byte-for-byte equivalent after JSON parsing.
- Legacy posts, notifications, and custom unrelated fields remain unchanged.
- Cleanup writes only `needo.social.module.v2`; `needo.social.composer-drafts.v1` remains absent.
- Formal Provider state is initialized from `emptyFormalSocialState` and does not import legacy drafts.
- Storage read or write failures are swallowed at this best-effort cleanup boundary and cannot block Social rendering.
- No new key, ongoing browser persistence, backend change, push, or deployment was introduced.
