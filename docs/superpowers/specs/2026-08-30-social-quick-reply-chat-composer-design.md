# Social quick-reply chat composer design

Date: 2026-08-30  
Scope: Step 13, Social post detail quick reply only

## Goal

Make the fixed quick-reply composer on every Social post-detail surface use the same visual structure and interaction vocabulary as the current IM chat composer. The sole intentional leading-control difference is that Social shows the current signed-in account avatar where chat shows the voice-input button.

## Current problem

`SocialPostDetailPage` currently renders an independent dark footer containing a standalone avatar, pill input, and reply button. Its outer background, spacing, corner treatment, input height, and controls do not match `ImChatComposer`. This creates a visibly separate composer design and allows the two implementations to drift.

## Chosen approach

Extend the existing `ImChatComposer` with narrowly scoped customization points and reuse that component from `QuickReplyComposer`.

- Add an optional leading accessory. Chat keeps the current voice-input button by default; Social supplies the current account avatar in the same 40-by-40 control position.
- Add a configurable send label so chat continues to show its existing send copy while Social shows `回复`.
- Keep the existing emoji control and shared reaction catalog.
- Keep the existing plus control. On Social it opens the existing full reply composer for the same post, which already owns richer Social content such as images, location, mentions, visibility, and comment permissions.
- Preserve all chat defaults and existing chat behavior when the new options are omitted.

This gives Social the real chat composer instead of copying its Tailwind classes. It also avoids cloning chat-only recording, attachment, order, call, and payment behavior into Social.

## Component and data flow

`SocialPostDetailPage` continues to resolve the authenticated actor, post, and `canComment` state from the existing Social provider.

`QuickReplyComposer` will own only transient UI state:

- reply draft text;
- active emoji panel state;
- submission availability.

It will pass those values to `ImChatComposer` together with:

- the authenticated actor avatar as the leading accessory;
- `回复` as the send label;
- a plus action that navigates to `socialPaths.compose(scope, { replyToPostId: post.id })`;
- the existing `createPost` submission callback.

Quick text replies continue through the current formal Social provider and API path. The change does not add browser mock data, a new API, a new database field, or a second reply state store.

## Interaction rules

1. The left avatar occupies the same layout slot and nominal dimensions as the chat voice control. It has meaningful alternative text and does not start recording.
2. The emoji button opens and closes the same composer panel used by chat. Selecting an item inserts its sendable text value into the reply draft and returns focus to the input.
3. The plus button is always visible when the draft is empty. On Social it enters the existing full reply composer for the current post instead of opening chat-only actions.
4. When a non-empty reply draft is present, the plus position changes to the `回复` send action, matching chat's existing send-state behavior.
5. Submitting trims the reply text, creates one reply, and clears the draft only after the current synchronous Social create action is accepted.
6. When commenting is not allowed, the composer remains visible but every editing/action control is natively disabled and the existing permission placeholder remains visible.
7. The fixed composer uses the current safe-area padding, glass surface, maximum width, and responsive behavior of `ImChatComposer`; the old independent black gradient footer is removed.

## Visual contract

- Outer glass capsule, border, blur, shadow, radius, height, and responsive width come from `ImChatComposer` and its existing CSS tokens.
- Input typography and placeholder color come from the same chat input implementation.
- Avatar: 40 by 40 pixels, circular, `object-cover`, non-shrinking.
- Right controls: same 40-by-40 emoji and plus controls as chat; active send control uses the existing primary button treatment and reads `回复`.
- The composer stays within the existing 720-pixel Social content width while remaining safe at 320-pixel mobile widths and accounting for `env(safe-area-inset-bottom)`.
- The page bottom padding must keep the final reply/content fully scrollable above the fixed composer.

## Accessibility

- Avatar receives the current account display name as alternative text.
- Emoji and plus controls retain explicit accessible labels.
- Disabled comment state uses native `disabled`/`aria-disabled` behavior rather than visual opacity alone.
- Keyboard submission and visible focus behavior remain available through the shared composer.
- The emoji panel respects the current reduced-motion rule.

## Testing and acceptance

Automated regression coverage will prove:

- Social renders the shared IM composer root and glass input shell.
- The leading slot contains the current account avatar and no voice-input control.
- Emoji and plus controls are present and enabled only when commenting is allowed.
- Emoji selection updates the quick-reply draft.
- Plus navigation targets the full composer with the correct `replyToPostId`.
- A non-empty draft exposes a `回复` send action and creates one reply.
- Chat still renders its default voice-input control when no leading accessory is supplied.
- The restricted-comment state leaves the composer visible and natively disabled.

Fresh verification before handoff will include the targeted frontend tests, TypeScript/lint, the formal production build, and live mobile browser acceptance at the actual Social post-detail route. Browser acceptance will check the 440-by-956 reference viewport and a narrow 320-pixel viewport, avatar alignment, emoji open/close, plus navigation, reply submission, bottom safe area, horizontal overflow, console errors, and that port 5180 is serving this checkout.

## Non-goals

- No Social or IM API changes.
- No schema or migration changes.
- No new mock, placeholder, or local business persistence.
- No change to chat recording, chat attachment actions, or message sending.
- No redesign of the Social post body, reply list, header, or full composer.
- No push, deployment, or production publication.

## Rollback

Revert the Social use of `ImChatComposer` and remove the optional component props. Because chat defaults remain unchanged and no persisted data contract changes, rollback is source-only and does not require data repair.
