# Social Single Reply System — Task 7 Report

## Status

Implemented Task 7 from base commit `46771a8e`: canonical Social post detail is now the sole reply surface. The work stays within the existing formal Social flow; no API, schema, migration, mock, persistence, Task 8 attachment action, push, or deployment was added.

## RED evidence

Tests were changed before production code. The RED command was:

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
```

Observed result:

```text
Test Files  3 failed (3)
Tests       3 failed | 55 passed (58)
exit code   1
```

The three expected assertion failures proved that the pre-change code lacked:

- the `SocialQuickReplyComposer` forwarded focus handle;
- the canonical detail header, transient focus consumption, and independent reply-card shell; and
- the five-language `回复动态` entry.

The failures were assertion failures for missing behavior, not syntax, import, or test-environment errors.

## GREEN implementation

### Composer focus contract

- `SocialQuickReplyComposer` now forwards `SocialQuickReplyComposerHandle` with `focus()`.
- The existing `ImChatComposer` `textareaRef` exposes its rich contenteditable input without changing shared IM behavior.
- `focus()` focuses that rich input, selects its contents, and collapses the selection at the end. Structured judgement/sticker rendering and formal submission continue to use the existing shared composer flow.
- The keyed `targetIdentity` child remains in place, so draft, sending, error, and input-ref state reset on actor or post changes.

### Canonical detail behavior

- Detail consumes `location.state.focusSocialReply` once, schedules the local focus action, then replaces the same pathname with `state: null`; it does not change the URL and cannot carry the request into a later post/actor state.
- The replace target explicitly preserves `location.pathname`, `location.search`, and `location.hash`; an independent review identified this literal URL-preservation edge case, and a follow-up RED source assertion proved the old implementation did not preserve query/hash before the fix.
- The detail reply icon and `写回复` call the local `focusReply` action; neither navigates or receives a route target.
- Success and missing-post headers now both read `回复动态`.
- The visible reply count is `post.replyCount`, including the reply-list summary, rather than deriving the displayed count from loaded reply rows.

### Reply-card presentation

- The list is a spaced `mt-4 space-y-3` stack.
- Each `ReplyListItem` owns its rounded, bordered, glass card surface.
- The former shared rounded/overflow shell and row dividers are removed.
- Existing detail bottom padding and the shared composer safe-area bottom padding are retained for the 320px/440px browser-QA surfaces.

### Localization

- Added `回复动态`: Traditional Chinese `回覆動態`, Japanese `投稿に返信`, English `Reply to Post`, Korean `게시물에 답글`.
- `rg -n "打开完整回复" src` finds only the existing deletion-guard assertion in `translations.test.ts`; no production caller or translation key remains.

## GREEN and verification evidence

Focused GREEN command:

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
```

```text
Test Files  3 passed (3)
Tests       58 passed (58)
```

Additional verification:

```text
npm run i18n:audit     PASS
npm run i18n:quality   PASS (all four languages complete; existing unrelated quality findings reported)
npm run lint           PASS — tsc -b --noEmit
git diff --check       PASS
npm test               PASS — 252 files, 1,530 tests
npm run build          PASS
```

The production build retains only the repository's existing warnings about `SocialProfilePage.tsx` static-plus-dynamic import and configured large chunks; this task introduced no build failure.

## Independent review

The review found no Critical issues. It identified the query/hash preservation gap in the initial transient-state replacement and noted a future maintenance opportunity to share the existing IM caret helper. The query/hash gap was fixed with a RED/GREEN assertion before final regression/build verification. The helper remains intentionally local in this microstep so the shared IM component and its behavior are unchanged.

## Self-review

- Focus calls the existing shared rich-input ref rather than changing IM components or behavior.
- The request is transient: state is cleared through replace navigation while pathname, query string, and hash remain the same.
- Reply controls no longer navigate from the canonical detail page; all external reply entry points continue to supply the existing transient state for this page to consume.
- Reply cards preserve existing structured rich-text/sticker rendering by keeping `UnifiedPostText` and `post.richText` unchanged.
- `post.replyCount` remains server-authoritative for display; reply rows determine only whether to render the list or empty state.
- At the initial `dd0bd315` Task 7 commit, the previous Task 6 report was already modified in the worktree and was intentionally left unstaged and untouched. `65843bb6` is the later, separately approved report-only commit in the final range.
- Browser acceptance at 320px and 440px was not run in this task; the final-card and safe-area source behavior is preserved and ready for that separate QA gate.

## Task 7 changed-file inventory

- `src/features/social/components/SocialQuickReplyComposer.tsx`
- `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- `src/features/social/pages/SocialPostDetailPage.tsx`
- `src/features/social/pages/SocialPostDetailPage.test.ts`
- `src/features/social/pages/SocialPostDetailPage.runtime.test.tsx`
- `src/i18n/translations.ts`
- `src/i18n/translations.test.ts`
- `.superpowers/sdd/social-single-reply-task-7-report.md`

---

## Accessibility re-review remediation — semantic detail links

### RED evidence

The semantic-link and i18n contracts were written before changing production code:

```bash
npm test -- src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/i18n/translations.test.ts
```

Observed result:

```text
Test Files  2 failed (2)
Tests       3 failed | 58 passed (61)
exit code   1
```

The failures proved the page lacked both card-owned post-detail links and the explicit five-language `查看动态详情` translation entry.

### GREEN implementation

- Reply and mini-post cards are now ordinary, non-focusable `<article>` containers with a real internal post-detail `<Link>`; the link is visually revealed on keyboard focus and keeps its native Enter behavior.
- Whole-card pointer activation remains a convenience only. The existing interactive-target guard leaves profile/detail links and buttons to their own native behavior, while an inner quoted-card shell still stops propagation before the outer reply card can navigate.
- The one explicit `查看动态详情` key covers Simplified Chinese source plus Traditional Chinese, Japanese, English, and Korean translations; no dynamic accessible-name concatenation remains.

### GREEN verification

```bash
npm test -- src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
```

```text
Test Files  3 passed (3)
Tests       64 passed (64)
```

---

## Review remediation — runtime focus lifecycle and nested cards

### Root cause

The initial focus effect scheduled an animation frame and immediately replaced location state. A post that arrived after the first render therefore lost its focus request before a composer could mount. Because the frame was not retained or cancelled, StrictMode replay, route changes, and unmount could leave an obsolete callback alive.

`DetailMiniPostCard` navigated on click but did not stop propagation, so a quoted card inside `ReplyListItem` then activated the enclosing reply card. Neither card exposed keyboard activation.

### RED evidence

The runtime reproductions were written before the production fix. The initial RED command was:

```bash
npm test -- src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/route-pages.test.tsx
```

Observed result:

```text
Test Files  1 failed | 3 passed (4)
Tests       7 failed | 13 passed (20)
exit code   1
```

The expected behavioral failures proved that the old page:

- replaced `{ focusSocialReply: true }` before a delayed post/composer mounted;
- retained a pending frame after route navigation and unmount;
- navigated a quoted reply card to the outer reply instead of the quoted post; and
- did not activate reply cards with Enter or Space.

The same first run exposed an author-link selector tied too closely to markup. That test fixture was narrowed to the rendered author label before production code changed; the remaining failures were the intended runtime defects.

### GREEN implementation

- `composerTargetIdentity` is keyed from the current actor and mounted post.
- The focus effect requires the transient request, the current post, its target identity, and an attached composer ref. It schedules one frame, focuses first, then replace-clears state while preserving pathname/search/hash.
- The effect dependencies include route key, post, and composer target identity; cleanup cancels the retained frame, covering StrictMode replay, route changes, and unmount.
- Reply and mini cards are focusable articles with Enter/Space activation. They have no nested `role="link"` or nested button markup; descendant links, buttons, summaries, inputs, and media keep their own native behavior.
- A card activation stops propagation only after it has claimed the event, so a nested quoted card opens exactly its quoted post.

### GREEN and final verification

Focused runtime/detail/router command:

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/features/social/route-pages.test.tsx src/i18n/translations.test.ts
```

```text
Test Files  5 passed (5)
Tests       69 passed (69)
```

Full Task 7 regression:

```text
npm test -- [9 Task 7 route/detail/composer/i18n/App suites]
PASS — 9 files, 106 tests

npm run i18n:audit
PASS — command exit 0; repository-wide missing-source report remains informational

npm run i18n:quality
PASS — no missing target-language rows; existing Japanese simplified-character findings remain reported

npm run lint
PASS — tsc -b --noEmit

git diff --check
PASS

npm test
PASS — 253 files, 1,539 tests

npm run build
PASS — existing SocialProfilePage import and large-chunk warnings only
```

During the first broader verification, TypeScript correctly rejected duplicate required fields in the test fixture and the nullable `targetIdentity` JSX value. Those test/type-boundary errors were corrected without changing scope; the focused and final suites above are the authoritative results.

---

## Follow-up review remediation — actor-bound transient focus request

### Root cause

The retained animation-frame cleanup prevented an old frame from firing, but the transient location state itself remained true. If the active actor changed before the frame, the effect could schedule a new frame for the same route under the new actor, incorrectly moving the caret to that actor's composer.

### RED evidence

The actor-switch reproduction was added before the production correction:

```bash
npm test -- src/features/social/pages/SocialPostDetailPage.runtime.test.tsx
```

Observed result:

```text
Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
exit code   1
```

The failing assertion showed one replacement frame remained queued after switching from `user:1` to `user:5`, proving that the request would have been retargeted.

### GREEN implementation

- The effect binds a pending transient request to `actorKey:postId` in `focusRequestTargetRef`, including while a post is still unavailable.
- A later actor/post identity mismatch replace-clears the stale request while preserving pathname, search, and hash; it never focuses another actor's composer.
- The frame callback rechecks that bound identity before focus. Normal requests remain one-shot: the state is replace-cleared only after the target composer is mounted and its `focus()` call has run.

### GREEN verification

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/features/social/route-pages.test.tsx src/i18n/translations.test.ts
```

```text
Test Files  5 passed (5)
Tests       70 passed (70)
```

```bash
npm test -- src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/i18n/translations.test.ts src/App.test.tsx
```

```text
Test Files  9 passed (9)
Tests       107 passed (107)
```

---

## Final review remediation — commit-phase composer remount race

### Root cause

Even after binding the request to the original actor/post, an obsolete animation-frame callback could run during a later React commit: a keyed quick-composer state remount can attach a new imperative handle before passive-effect cleanup cancels the old frame.

### RED evidence

The runtime harness now keys its mocked quick-composer state exactly as production does and invokes the retained old frame from a sibling layout effect during the actor-switch commit. With the mounted-composer identity check removed, the reproduction command failed:

```bash
npm test -- src/features/social/pages/SocialPostDetailPage.runtime.test.tsx
```

```text
Test Files  1 failed (1)
Tests       1 failed | 10 passed (11)
exit code   1
```

The stale callback invoked the new composer's `focus()` once, proving the commit-before-passive-cleanup race.

### GREEN implementation and verification

- The detail page now records the identity of the currently mounted composer alongside its imperative ref.
- The retained frame verifies both the original transient-request identity and the mounted-composer identity before calling `focus()`. A remounted actor/post therefore cannot receive the old request even if a cancelled frame fires late.

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/features/social/pages/SocialPostDetailPage.runtime.test.tsx src/features/social/route-pages.test.tsx src/i18n/translations.test.ts
```

```text
Test Files  5 passed (5)
Tests       71 passed (71)
```

### Completion verification after final typecheck correction

```text
npm test -- [9 Task 7 route/detail/composer/i18n/App suites]
PASS — 9 files, 108 tests

npm test
PASS — 253 files, 1,541 tests

npm run i18n:audit
PASS — exit 0; existing repository-wide 4,692 missing-source findings are informational

npm run i18n:quality
PASS — no missing target-language rows; existing 462 Japanese simplified-character findings remain reported

npm run lint
PASS — tsc -b --noEmit

git diff --check
PASS

npm run build
PASS — existing SocialProfilePage chunking and large-chunk warnings only
```

---

## Accessibility re-review final verification

```text
npm test -- [focused detail/runtime/i18n suites]
PASS — 3 files, 64 tests

npm test -- [9 Task 7 route/detail/composer/i18n/App suites]
PASS — 9 files, 109 tests

npm test
PASS — 253 files, 1,542 tests

npm run i18n:audit
PASS — exit 0; existing repository-wide 4,691 missing-source findings remain informational

npm run i18n:quality
PASS — 14,402 entries and no missing target-language rows; existing 462 Japanese simplified-character findings remain reported

npm run lint
PASS — tsc -b --noEmit

git diff --check
PASS

npm run build
PASS — existing SocialProfilePage chunking and large-chunk warnings only
```
