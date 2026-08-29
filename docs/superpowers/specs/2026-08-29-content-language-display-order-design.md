# Content Language Display Order Design

## Goal

Use one product-wide display order for every visible five-language selector and localized-content editor:

1. 日本語 (`ja`)
2. English (`en`)
3. 한국어 (`ko`)
4. 繁體中文 (`zh-TW` / `zh-Hant`)
5. 简体中文 (`zh-CN` / `zh`)

## Scope

- Keep the existing global application language selector in this order.
- Change the shared localized-content editor order used by the user-home carousel editor and the Affiliate announcement/carousel editor.
- Any other UI that imports the shared content-editor locale list receives the same order automatically.
- Keep existing selected-language state and the default source locale for new drafts unchanged; this request changes display order only.

## Data Boundary

Backend locale enums, database values, API validation, stored translations, publication versions, and source-language provenance do not change. The backend canonical locale collection may remain `zh-CN`, `zh-TW`, `en`, `ja`, `ko` because its order is not user-visible and is used for completeness checks rather than navigation.

## Implementation

The frontend shared `contentEditorLocales` array is the single source of truth for localized-content tab rendering. Its order changes to `ja`, `en`, `ko`, `zh-TW`, `zh-CN`. Labels remain unchanged.

No per-page sorting is added. This avoids drift between user-home carousel and Affiliate content administration.

## Verification

- Add or update a focused test that asserts the shared content-editor locale codes and rendered labels in the required order.
- Run the focused content-publication tests, frontend lint, full frontend regression, and production build verification.
- Reopen both operations routes and verify the visible tab order in the browser:
  - `/admin/carousel`
  - `/admin/afirieito/announcements/carousel`
- Confirm both pages have no browser warnings or errors.

## Non-goals

- Changing translation text.
- Migrating stored content.
- Reordering backend enum values.
- Changing which locale is selected by default.
