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
- The previous Task 6 report was already modified in the worktree and is intentionally left unstaged and untouched by this task.
- Browser acceptance at 320px and 440px was not run in this task; the final-card and safe-area source behavior is preserved and ready for that separate QA gate.

## Task 7 changed-file inventory

- `src/features/social/components/SocialQuickReplyComposer.tsx`
- `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- `src/features/social/pages/SocialPostDetailPage.tsx`
- `src/features/social/pages/SocialPostDetailPage.test.ts`
- `src/i18n/translations.ts`
- `src/i18n/translations.test.ts`
- `.superpowers/sdd/social-single-reply-task-7-report.md`
