# Merchant Shop Inline Multilingual Editing Design

## Goal

Keep merchant shop editing inside the existing shop display page. While editing, show a right-side language rail for Japanese, English, Korean, Simplified Chinese, and Traditional Chinese. Each language owns its shop display copy, header carousel selection, and service-menu presentation.

## Product behavior

- A merchant opens edit mode from any shop-display pencil action without navigating to or mounting a fullscreen editor page.
- Edit mode keeps the current tab and scroll position. A fixed right-side language rail switches the preview and draft between `ja`, `en`, `ko`, `zh-CN`, and `zh-TW`.
- Unsaved changes remain isolated by locale. Saving persists only the selected locale through the authenticated merchant shop scope.
- A sync action uses the current in-memory locale draft as the source. After the shared red-framed confirmation, the server validates all five optimistic versions and atomically copies the source images and text into five independent locale rows. Each locale can be edited separately again after the sync.
- The header carousel supports one to five images per locale. New and replacement images upload to formal content storage before the locale draft references them.
- Service-menu cards remain linked to real services. Localized names, descriptions, audience text, tags, highlights, and optional localized cover media are presentation fields; price, duration, currency, availability, and service ownership remain server-authoritative.
- Cancel restores the last persisted locale payload. A version conflict keeps the draft visible and asks the merchant to reload.

## Data and API

- Add one soft-deletable `ShopPresentationLocale` row per shop and content locale. The row stores validated presentation JSON and an optimistic `lockVersion`.
- Add authenticated merchant endpoints to read all five locale projections, update one locale, atomically sync the current locale to all language records, and upload presentation images. Shop scope comes only from the active identity or selected merchant-shop token context.
- Image upload writes a `MediaAsset` owned by the current user and identity, scoped to the current shop. Locale save verifies every referenced media checksum and every referenced service belongs to that shop.
- Every locale update and media upload writes an audit record.
- Public shop detail accepts a content locale and applies the persisted localized projection, falling back to the real base shop, services, and media when no locale row exists.

## UI structure

- `MerchantShopPresentationWorkspace` owns loading, locale drafts, save/cancel state, image upload, and API errors.
- `StoreDetailExperience` remains the shared display surface. Controlled edit props let the merchant workspace enable inline controls, pass localized data, and render the language rail and save bar.
- The mobile shop storefront and desktop merchant settings page mount the same `StoreDetailExperience` editor and call the same presentation APIs, so saves from either entry are read back from the same records.
- Existing inline fields and carousel/menu card previews are reused. The fullscreen editor is removed from merchant shop editing.

## Failure handling and verification

- Unsupported images, oversized images, cross-shop media, cross-shop services, stale lock versions, and missing merchant scope fail with stable API errors and do not partially update the locale row.
- Tests cover Zod validation, service scope/version behavior, route/RBAC/audit wiring, upload association, frontend API calls, inline editing, language switching, carousel append/replace, save/cancel, atomic synchronization, the shared red warning, both merchant entries, and localized public projection.
- Final verification runs focused frontend/backend tests, typecheck, lint, and production builds. Any runtime browser check uses a verified free port other than 5180.
