# Merchant Schedule Header And Navigation Design

## Goal

Unify the merchant current-status, appointment-overview, and scheduling headers; remove their bottom primary navigation; move the current-status schedule-detail action into that vacated bottom area; and retire the merchant-confirm scheduling mode shown in the approved reference images.

## Design

- Render one shared toolbar structure above all three schedule tabs: the existing left back button, a central page-specific region, and `MobileFullscreenCloseButton` on the right.
- Keep the working appointment search field in the central region for appointment overview. Show a plain `现状确认` or `排班` title for the other tabs rather than introducing a non-functional search control.
- Give the close button a page-specific accessible name and route both back and close through the existing exit callback to `/merchant`.
- Hide `MobileShell` primary navigation whenever the merchant schedule module is active, regardless of its selected tab.
- Remove the in-card `查看详细排班表` action from the mobile current-status summary and render the same action as a fixed, safe-area-aware bottom floating button. Preserve its loading/error disabled state and its existing detail-overlay state transition.
- Remove `STORE_COLLECT_CONFIRM` from the current dispatch cycle type, mode choices, new-cycle defaults, launch flow, and automatic-confirm behavior. New cycles default to technician self-scheduling; direct merchant scheduling remains available.
- Remove the obsolete feedback-collection step from the merchant automation wizard. Normalize any unsupported legacy persisted cycle mode to technician self-scheduling during local hydration so old browser data cannot revive the retired behavior.

## Verification

- Add focused source-contract and store regression assertions before implementation and observe them fail.
- Verify the three header states, bottom-navigation condition, fixed schedule-detail action, two remaining mode choices, retired-mode hydration safety, and direct/self scheduling launch behavior.
- Run lint, relevant frontend suites, and the production build.
- Browser-check the three merchant schedule tabs at a mobile viewport when a suitable local authenticated runtime is available.
