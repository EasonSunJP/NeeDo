# Task 5 — Social judgement sticker renderer

## Scope

Render only validated `SocialPost.richText` judgement parts through the existing IM judgement SVG component. The change is limited to the shared Social text renderer and every `SocialPost` text surface that already consumes it: timeline cards, embedded quote previews, detail main content, reply items, detail mini cards, and the media viewer's source-post summary.

No routes, composer behavior, persistence, data shape, sticker catalog, or visual language changed.

## RED

Before production changes, `src/features/social/components/UnifiedSocialUi.test.ts` received real jsdom renderer coverage for:

- a structured `Pending` part rendering as the shared SVG without duplicate fallback text;
- plain `Pending` with no rich text remaining text;
- collapsed content retaining a structured judgement part and appending an ellipsis text part;
- hashtag and URL linkification in text parts surrounding a judgement part.

Command run:

```text
npm test -- src/features/social/components/UnifiedSocialUi.test.ts
```

Observed RED: 8 tests ran, with the structured-SVG and collapsed-structured-judgement assertions failing because the current renderer rendered only `text` and had no `data-social-judgement` SVG node. The plain-text and existing source-contract checks continued to pass.

## GREEN

`UnifiedPostText` now resolves the validated rich-text structure once with the existing IM validator. It passes resolved parts to `SocialPostTextRenderer`, which:

- tokenizes mention, hashtag, and URL matches inside each text part using the pre-existing linkification behavior;
- emits judgement parts through `ImReactionValue` in `summary` display mode and marks their wrapper with `data-social-judgement`;
- truncates resolved parts by Unicode code point, never converting a judgement part into text, and appends a final `...` text part only when content is omitted.

Structured rich text is supplied from the originating `SocialPost` at the timeline/embedded-card renderer, all detail surfaces, and the media-viewer source-post summary. The detail-page test asserts the main post, reply, and mini/quoted preview paths retain that prop.

Verification run:

```text
npm test -- src/features/social/components/UnifiedSocialUi.test.ts src/features/social/pages/SocialPostDetailPage.test.ts
```

Result: 2 files, 10 tests passed.

## Self-review

- Verified `rg '<UnifiedPostText' src/features/social` shows every SocialPost-originating call site now passes `richText`.
- Verified plain `Pending` does not render a sticker.
- Verified structured parts do not duplicate fallback content and text parts keep hashtag/URL links.
- Verified collapsed structured text keeps qualifying judgement parts as SVGs and uses Unicode-safe slicing.
- Ran `git diff --check` with no whitespace errors.
- Ran `npm run lint` successfully.
- Ran `npm run build` successfully.

## Build note

The production build completed with the pre-existing Vite warning that `SocialProfilePage` is both dynamically and statically imported, plus the existing large-chunk warning. This task did not alter either import graph or bundle-splitting configuration.
