# iPhone standalone composer height follow-up

The user reported that the chat composer still floated above a large bottom gap after fully closing and reopening the installed PWA on an iPhone 16 running their current iOS version. This is not accepted as a stale-tab explanation, and prior desktop/DOM checks did not establish physical iPhone acceptance.

## Change

When no software keyboard is reducing the visual viewport, a full-width installed iPhone/iPod window uses the matching `screen` extent in CSS pixels for the conversation frame height. The width match selects the appropriate dimension after rotation. Ordinary browser tabs, Android, iPad windowed environments and nonmatching window widths keep the existing viewport-inset behavior. When an editor is focused and the viewport is reduced by the keyboard, the existing visual viewport frame remains in use.

Composer spacing continues to use `safe-nav-bottom`; no extra safe-area padding is added or removed. The correction is to the frame height, rather than an arbitrary negative bottom offset or device-specific pixel constant. On restoration and resize the frame is reevaluated, including a still-focused editor after keyboard dismissal.

WebKit reports document related standalone/viewport-fit height and fixed-inset issues:
- https://bugs.webkit.org/show_bug.cgi?id=237961
- https://bugs.webkit.org/show_bug.cgi?id=254868

These reports support the compatibility hypothesis; they do not prove the exact runtime measurements on the user's physical device, which is not connected to this machine.

## Verification

Three new regression cases failed before the correction: full-height standalone initialization, return from keyboard to full display, and landscape rotation. The corrected hook, composer and PWA install suites pass 30 tests across three files, including ordinary Safari and a window narrower than the display. Frontend lint and production build passed for the viewport correction.

No API, schema, database content, membership settings or chat messages change. Per user instruction, this correction is local only: no push or staging deployment. Physical iPhone acceptance remains pending after a future approved release: cold launch, keyboard open/close, background/foreground and both orientations. A desktop/browser simulation cannot replace that check.
