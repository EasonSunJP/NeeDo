# Profile cards, technician data center, and schedule design

## Scope

This batch aligns the customer, merchant, and technician personal-center cards without changing their established visual language. It also restores the technician privacy control, makes the technician data center theme-driven, and removes the shop-affiliation read barrier from the technician schedule page.

## Data contract

- All personal-center NDP figures come from `GET /api/v1/wallets/me/summary`.
- The main value is always the formal NDP available balance.
- Test NDP is a secondary, smaller line only when the current wallet summary represents or contains Test NDP.
- Merchant usage and rating are inapplicable to the manager identity and display `-`.
- Missing technician aggregate statistics resolve to product defaults: acceptance rate `100%`, rating `5.0/5` with `0` reviews, and completed orders `0`.
- No new mock or fallback business data is introduced.

## Layout

- Merchant and technician personal-center content share a consistent gap below the fullscreen header.
- Merchant statistics use the same three-column rhythm as the customer card.
- Technician statistics retain the existing top row and use a two-column second row: NDP on the left, completed orders on the right.
- Privacy controls remain at the bottom of the basic-information area and include a visible switch in read-only mode.
- The data-center schedule action uses the same viewport width and safe-area alignment as the main mobile navigation, with no visible outer panel.

## Independent technician schedule

The schedule loader uses the authenticated technician self profile as its authority. Shop affiliation is nullable and no longer blocks loading the technician-scoped service list, schedule calendar, or order/status records. Creating a new bookable slot remains unavailable without a shop because the current formal booking contract requires a shop; the page explains that constraint while keeping the schedule readable.

## Verification

Focused component/resource tests cover each acceptance rule, followed by frontend lint, typecheck/build, the relevant test suites, and local UI inspection where the authenticated local runtime permits it.
