# Task 6 — Chat-record UI implementation report

## Design calibration (before implementation)

- Subject/job: an authenticated NeeDo user reviews an immutable, forwarded chat snapshot without mistaking it for a live conversation. The surface therefore reuses the existing `--client-*` theme tokens, current app font scale, rounded message bubbles, `MobileFullscreenPage`, and `MobileFullscreenHeader`; it does not introduce a generic palette, a second typography system, or a new glass/gradient language.
- Layout: the card is one compact, fully interactive record surface with a localized snapshot-derived title, two-line preview, count, and `聊天记录` caption. The fullscreen detail is a single-line title/header followed by a read-only chronological timeline; the explanation lives only behind the shared circle-info control and the right row uses the shared close button.
- Signature: the one deliberate visual distinction is a restrained timeline spine joining immutable snapshot items. It encodes chronology and snapshot provenance rather than decorating the page; all bubbles and media remain the existing NeeDo message language. No extra blur, refraction, lower header gradient, composer, reactions, menus, or mutation controls are added.
- Accessibility and motion: the complete card is a native keyboard-operable control with a visible focus ring; unavailable/retry states are announced; light/dark tokens and reduced-motion behavior are preserved. Closing returns focus to the exact opener where possible, with history/back and scoped route fallbacks for direct links.
- Skill constraints: `needo-mobile-headers` fixes the header shape (shared component, one-row title/info/right close, no visible subtitle or lower gradient). `frontend-design` limits novelty to the timeline spine and requires the rest to inherit NeeDo's existing subject-specific visual system.

## TDD evidence

- RED command: `npm test -- src/features/im/ImChatRecordCard.test.tsx src/features/im/ImChatRecordDetailPage.test.tsx src/pages/user/UserFavoritesPage.test.tsx`
- RED result: three suites failed before test collection because `ImChatRecordCard`, `ImChatRecordDetailPage`, and `UserFavoritesPage` did not exist. No production implementation preceded that evidence.
- GREEN progression: card `2/2`; detail/header/pagination/media/focus/UUID/routes `7/7`; favorites `2/2`. The focused command from the brief and the wider IM/API/store/User Center regressions all pass.
- The media suite covers first-load failure and retry, Blob-only rendering, object URL revocation on route unmount, and a deferred response completing after unmount without creating an object URL.

## Implementation and verification

### Delivered behavior

- `ImChatRecordCard` is a single native link with scoped routing, keyboard/focus affordances, opener state, a two-line preview, item count, and caption. Its display title is derived only from immutable `senderNames` plus `titleKind`; where the Task 5 summary/favorite contract omits `titleKind`, the UI derives it from snapshot `senderCount`. The backend `title` remains a compatibility field and is never rendered.
- Existing `MessageBubble` now renders `chat-record` messages through the shared card. Its media branch accepts `readOnly`, so immutable image snapshots retain the existing rich message rendering without an inert preview action.
- The detail uses `MobileFullscreenPage` and `MobileFullscreenHeader` with a one-line title, circle-info explanation, and right close. It contains only a chronological snapshot timeline and existing read-only bubbles—no subtitle, lower gradient, composer, reaction control, action menu, or mutation path.
- UUIDs are validated before calling the read API. All three routes are registered before `:conversationId`, preventing shadowing. Closing a card/favorite detail navigates back and restores that exact opener; direct entries use the scoped messages fallback.
- Protected media calls only the Task 5 authenticated binary adapter, receives a `Blob`, creates a local object URL, and revokes it on item/retry/route cleanup. Failures retain a retry state. Stale/unmounted completions neither materialize URLs nor update state. No bearer-bearing URL or protected file path reaches markup.
- `/me/favorites` reads a formal page (`pageSize: 20`), represents each complete bundle as one row/card, and removes it only after API success. Failure retains the row. User Center now routes “我的收藏 / 聊天记录” to this page through the existing runtime i18n mechanism.
- Styling stays on `--client-*` tokens with compact shared surfaces. The only new signature is the solid snapshot timeline spine; light/dark behavior, focus-visible treatment, and reduced motion are retained without new blur/refraction/gradient effects.

### Contract note

Task 5 intentionally returns strict summary/favorite keys `title`, `preview`, `senderNames`, `senderCount`, `itemCount`, and timestamps but no `titleKind`; forwarded-message metadata does include `titleKind`. Task 6 therefore keeps the API response unchanged, models `titleKind` as optional at the UI boundary, trusts it when present, and deterministically derives it from snapshot sender cardinality otherwise. This avoids coupling display to the backend Chinese title or to live profiles.

### Verification evidence

- `npm test -- src/features/im/ImChatRecordCard.test.tsx src/features/im/ImChatRecordDetailPage.test.tsx src/pages/user/UserFavoritesPage.test.tsx src/pages/user/UserCenterPage.test.tsx src/features/im/pages.test.tsx src/features/im/formal-api.test.ts src/features/im/store.test.ts` — PASS, 7 files / 129 tests.
- `npm test -- src/App.test.tsx src/components/mobile/MobileFullscreenHeader.test.tsx src/features/im/components.test.tsx` — PASS, 2 existing files / 18 tests (`components.test.tsx` is not present, so Vitest ran the two existing suites).
- `npm run lint` — PASS.
- `npm run build` — PASS. Vite reports only the existing SocialProfile mixed static/dynamic import notice and existing large-chunk warning.
- `git diff --check` — PASS.

No database, live API, Task 7 menu, or Task 8 multi-select change was made.

### Skill influence

- `needo-mobile-headers` made the shared fullscreen header contract non-negotiable: title truncation stays in the central slot, immutable-snapshot explanation is supplied through `info`, and the shared right close is driven only through `onClose`.
- `frontend-design` kept the visual change subject-specific and restrained: the timeline spine conveys snapshot chronology while every palette, type scale, surface, radius, and bubble remains recognizably NeeDo rather than becoming a generic new design system.
