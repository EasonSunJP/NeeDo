---
name: needo-mobile-headers
description: Use when working on NeeDo mobile/fullscreen headers, data-center metric/detail pages, transparent glass/refraction headers, lower spacer masks, MobileFullscreenHeader, FloatingHomeHeader, EntityDetailPage, MobileFullscreenPage, or solid overlay/sheet headers with title/info/close controls.
---

# NeeDo Mobile Headers

## Core Rule

Treat fullscreen/detail/solid-overlay headers as one shared system. Start from `src/components/mobile/MobileFullscreenHeader.tsx` or the nearest shared header before changing one page.

For transparent glass/refraction headers, match the message/contact search header pattern: the header floats over content and must not create a visible lower layer.

## Required Header Shape

- Keep title, circle `i`, and right controls on the shared header row.
- Do not add a lower gradient mask, solid underlay, or normal-flow spacer beneath an entity/detail overlay header.
- For transparent glass pages, pass `showSpacer={false}` to `MobileFullscreenHeader`/`FloatingHomeHeader`; do not compensate with `spacerGapPx`.
- Keep the header as `client-liquid-glass-header` with backdrop blur/saturate/refraction.
- Put collision avoidance on the scroll container with top padding such as `pt-[calc(env(safe-area-inset-top)+86px)]`.

## Workflow

1. Search shared headers first:
   `rg -n "MobileFullscreenHeader|FloatingHomeHeader|EntityDetailPage|MobileFullscreenPage|ContactInfoStatusPanel" src`
2. Use shared `MobileFullscreenHeader` unless the page has a genuinely different surface.
3. If the reference is transparent/refractive, set `showSpacer={false}` and add top padding on the scrollable content, not a spacer div.
4. Remove page-local radial/linear gradients, dark sheet backgrounds, masks, and underlays below the header.
5. Browser-check the mobile viewport and confirm there is no `aria-hidden` spacer or solid visible layer immediately under the glass.

## References

- Header entrypoint: `src/components/mobile/MobileFullscreenHeader.tsx`
- Glass/spacer implementation: `src/components/mobile/FloatingHomeHeader.tsx`
- Good transparent references: `src/features/im/chat-home.tsx`, `src/pages/user/UserOrdersPage.tsx`, `src/pages/user/StoreDetailPage.tsx`, `src/pages/mobile/NeedoRoutePages.tsx`

