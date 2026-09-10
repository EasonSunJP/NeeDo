# Social single reply system design

Date: 2026-08-30
Scope: Step 13, Social reply entry points, post detail, reply persistence, and quick-reply attachments

## Goal

Keep exactly one Social reply experience across the user, merchant, and technician portals. Every reply action must land on the existing post-detail surface, whose fixed chat-style composer is the only place for creating a reply. The obsolete full-page reply composer shown by `SocialComposerPage` must be removed rather than hidden behind another branch.

The same change also makes the visible reply count authoritative, renders every reply in its own container, and preserves judgement reactions as SVG stickers after a reply is saved and reloaded.

## Confirmed product decisions

1. The post-detail header reads `回复动态` in every portal and state.
2. Each reply is an independent rounded container. Replies are separated by space, not by white divider lines inside one shared outer container.
3. The full-page reply composer is obsolete. Its reply-mode UI, code paths, entry points, copy, and tests are deleted.
4. Timeline reply icons, detail reply icons, and `写回复` all use the post-detail quick-reply system.
5. The quick composer keeps the current account avatar on the left and the shared chat emoji and plus controls on the right.
6. The plus panel reuses the chat composer panel and interaction, but exposes only Social reply actions that can be persisted formally: `相册`, `拍照`, and `位置`.
7. The reply icon count reflects the formal number of active replies and remains correct after reload.
8. A judgement value such as `Pending`, `NO`, or `Thanks` remains the corresponding judgement sticker after submission and reload. Plain authored text containing those words remains plain text.

## Current problems

The current implementation has several conflicting reply paths:

- `SocialPostDetailPage` renders the desired fixed quick composer.
- The timeline reply icon and the detail reply icon navigate to `SocialComposerPage` with `replyToPostId`, producing a second full-page reply UI.
- The quick composer plus button is overridden with the same navigation, so it also leaves the approved reply surface.
- `SocialComposerPage` contains reply-specific state, labels, quoted-post presentation, draft keys, and submission branches mixed with the valid publish/edit/quote composer.
- The reply list wraps all replies in one rounded container and uses per-row borders.
- The detail icon reads `post.replyCount` from a stale JSON counter even when the loaded reply list already contains more items.
- `SocialQuickReplyComposer` materializes judgement draft tokens into ordinary text before creating a Social post, and Social has no structured rich-text envelope with which to restore the sticker.

## Route and obsolete-page removal

### Canonical route

The only interactive reply destination is the canonical post detail route:

```text
.../moments/posts/:postId
```

The route renders the post, its independent reply cards, and the fixed `SocialQuickReplyComposer`.

### Entry-point behavior

- A timeline reply icon navigates to the canonical post detail route with a transient focus request.
- The detail reply icon and `写回复` focus the already-mounted quick composer without navigation.
- The composer exposes an imperative or DOM-ref-backed focus contract; callers do not reproduce composer state.
- Focus requests must not change the persisted URL into a second reply route or create another draft namespace.

### Deletion boundary

The implementation removes:

- `replyToPostId` mode parsing and reply-specific UI from `SocialComposerPage`;
- reply-specific composer draft keys and submit branches from that page;
- every `socialPaths.compose(scope, { replyToPostId })` call site;
- the `/posts/:postId/replies` alternate detail-mode branch and `isThreadPage` rendering differences;
- obsolete tests and copy that assert navigation to or rendering of the full reply composer.

The ordinary Social composer remains for new posts, editing, and quote posts. Removing reply mode must not remove those valid workflows.

### Historical deep links

Previously issued URLs must not render the obsolete UI. A lightweight route-level compatibility redirect may recognize either of these historical forms:

```text
.../moments/compose?replyToPostId=:postId
.../moments/posts/:postId/replies
```

It immediately replaces the location with the canonical post detail route and requests focus. The redirect owns no reply UI and does not import or mount `SocialComposerPage`. Invalid or missing post IDs return to the Social timeline or the existing not-found state.

## Post-detail visual design

### Header

- The shared glass header title is always `回复动态`.
- The missing-post state uses the same title so the route does not visibly switch identity while loading or failing.

### Reply section

- The reply summary row remains a natural section boundary.
- Every `ReplyListItem` owns its own rounded border, subtle theme surface, padding, hover/focus treatment, and click target.
- The list wrapper provides vertical spacing only. It has no shared border, background, clipping, or rounded outer shell.
- Per-row `border-bottom` and `last:border-none` rules are removed.
- Reply cards continue to support author-profile links and post-detail navigation without nested click conflicts.

### Fixed quick composer

- `SocialQuickReplyComposer` continues to render the shared `ImChatComposer` root.
- The leading slot remains the signed-in account's 40-by-40 avatar; Social never exposes chat voice recording.
- The emoji control uses the existing shared reaction catalog.
- The plus control toggles the existing `more` panel instead of executing a navigation override.
- When the draft contains sendable content, the plus position changes to the existing `回复` send action.
- Bottom padding and safe-area handling keep the final reply card scrollable above the fixed composer at 320-pixel and 440-pixel mobile widths.

## Plus-panel actions

The Social quick composer supplies three `ImChatComposerAction` entries through the same `actions` contract used by chat:

| Action | Behavior | Persisted result |
|---|---|---|
| 相册 | Open a JPEG/PNG/WebP file picker | Upload through the formal Social media endpoint and bind the returned asset to the reply |
| 拍照 | Open a capture-oriented image input where supported | Same formal upload and reply binding as 相册 |
| 位置 | Open the existing Social location selector | Persist the selected `locationLabel` with the reply |

Chat-only actions such as file, contact card, service, schedule invitation, and group creation are not shown in Social. They have no formal Social reply contract and must not appear as inert or fake actions.

The quick composer supports one pending image at a time, matching the current chat composer preview contract. Selecting another image replaces only after explicit user action; an upload error retains the preview and exposes retry/removal. Sending is disabled while upload is pending. Location selection is cancellable and returns to the same draft.

## Formal reply relationship and count

### Data model

Add a nullable, indexed, self-referencing `replyToPostId` field to `SocialPost` and a matching migration. The relation is the authoritative reply relationship. The existing JSON `media.replyToPostId` value remains readable during compatibility migration but is no longer the source used for counts.

The migration backfills valid existing reply relationships from `media.replyToPostId`. It must:

- update only rows whose referenced parent post exists;
- preserve soft-deleted rows and all existing media JSON;
- add the index and foreign-key behavior without rewriting unrelated Social data;
- provide a guarded pre/post verification for total replies, valid parents, and unchanged unrelated post counts.

### Write behavior

Creating a reply validates the target post and writes the new reply plus its `replyToPostId` in the existing transaction. The relation is supplied by the authenticated Social create flow; clients cannot update an existing post into a reply after publication.

### Read behavior

Formal Social responses expose a server-derived `replyCount` that counts active, non-deleted children of the relation. List and detail reads batch or include the count without issuing one query per post. The frontend maps this field directly instead of trusting `media.counters.replies`.

After a successful reply POST, the local provider inserts the returned reply and updates the mounted parent's visible count immediately. A subsequent list/detail read remains authoritative and corrects any concurrent change. The rendered list length is not used as the total because the loaded page may be paginated.

## Judgement sticker persistence

### Structured content

Social post creation accepts an optional versioned rich-text descriptor alongside the existing text fallback:

```ts
type SocialRichText = {
  version: 1;
  parts: Array<
    | { type: "text"; value: string }
    | { type: "judgement"; value: JudgementReactionValue }
  >;
};
```

It is stored in the existing Social media JSON envelope, so this slice does not need a second content table or a second reply store.

### Validation

- Judgement values are limited to the existing canonical set: `OK`, `NO`, `Pending`, `+1`, `Done`, `Cool`, `Good`, and `Thanks`.
- Concatenating all structured part values must equal the persisted text fallback exactly.
- Invalid versions, unknown part types, unknown judgement values, or content mismatches are rejected on write.
- Invalid or legacy data safely renders the text fallback.
- Plain text `Pending` without a valid judgement part remains text and is never guessed into a sticker.

### Rendering

Composer draft tokens are serialized before Social submission using the same canonical parser as IM. `SocialPost` carries the validated rich-text descriptor, and shared Social text rendering emits the existing judgement SVG component for judgement parts while preserving ordinary Social text handling for text parts.

Reply cards, the main detail body, timeline items, quoted previews, and reload/SSE mappings use the same renderer so a sticker cannot change form between surfaces. Copy/search/accessibility continue to use the text fallback.

## State and error handling

- Quick-reply state contains draft, active composer panel, pending image/upload state, selected location, submission state, and visible error text.
- The state is keyed by actor and parent post so switching identity or post cannot leak a draft or attachment.
- A reply clears only after the formal create request succeeds.
- Upload, location, or reply failures keep the draft and attachment for retry.
- Restricted comments leave the approved composer visible but natively disable the input, emoji, plus actions, and send action.
- Route redirects do not create or restore a full-page reply draft.

## Accessibility and localization

- Header, action labels, attachment status, upload errors, location summary, and compatibility errors use the existing five-language i18n system.
- The reply icon remains a labeled button or link with the visible count exposed to assistive technology.
- Focus navigation announces the reply input and places the caret at the end of the current draft.
- Every independent reply container preserves keyboard-reachable child links and does not rely on color or hover alone.
- Judgement SVGs retain meaningful alternative text through the shared sticker component.
- Disabled and pending states use native semantics, not opacity alone.

## Verification and acceptance

### Automated coverage

- Route tests prove every portal's timeline and detail reply controls target the canonical post detail composer.
- Source and component tests prove no `SocialComposerPage` reply mode, `isThreadPage` branch, or `socialPaths.compose(...replyToPostId)` call remains.
- Compatibility tests prove historical reply URLs replace-navigate to canonical detail without mounting the obsolete UI.
- Reply-list tests prove each item owns its container and no shared reply-card shell/divider remains.
- Repository/service/API tests prove migration backfill, parent validation, active reply counting, refresh consistency, and no N+1 count query.
- Rich-text tests prove sticker round-trip, mixed text/stickers, plain-word non-conversion, malformed fallback, SSE/reload mapping, and all eight judgement values.
- Composer tests prove the shared emoji and plus controls, three Social actions, upload/pending/error behavior, location persistence, submission, and native disabled state.
- Existing IM tests prove chat voice input and its full action set remain unchanged.

### Live browser acceptance

Run against the formal backend, real authenticated accounts, and the checkout actually serving port 5180. Check the user, merchant, and technician routes at 440-by-956 and 320-pixel widths:

1. Header reads `回复动态`.
2. Timeline reply icon lands on detail and focuses the fixed composer.
3. Detail reply icon and `写回复` do not navigate.
4. Historical full-reply URLs cannot display the obsolete UI.
5. Replies render as independent cards without internal white dividers.
6. Reply icon count matches the formal total before and after creating a reply and after reload.
7. Emoji panel and plus panel open and close correctly.
8. 相册, 拍照, and 位置 persist through the formal reply flow.
9. Judgement stickers remain SVGs immediately, after navigation, and after reload; plain `Pending` stays text.
10. No horizontal overflow, obscured final card, console error, failed request, or hidden alternate reply page remains.

Fresh verification includes targeted frontend/backend suites, migration validation, i18n audits, TypeScript/lint, `npm run verify:production-build`, and live browser acceptance. Passing tests alone is not sufficient evidence of the requested UI behavior.

## Non-goals

- No change to IM message actions, recording, files, cards, services, schedules, or group creation.
- No new mock, demo, placeholder, browser business database, or parallel reply store.
- No redesign of new-post, edit-post, or quote-post composer workflows.
- No general Social reaction, repost, like, bookmark, or notification redesign.
- No push, deployment, or production publication.

## Rollback

The UI and adapter changes can be reverted source-only. The new nullable reply relation is additive and may remain unused during rollback; its migration must not be edited after application. A rollback deployment may resume reading legacy JSON relationships, but must not restore the deleted full-page reply UI. Existing post text, media, replies, and rich-text fallbacks remain readable throughout rollback.
