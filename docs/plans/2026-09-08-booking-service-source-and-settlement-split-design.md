# Booking Service Source And Settlement Split Design

## Scope

This batch fixes the technician first-service creation dead end and makes shop pricing mode a booking-source switch rather than a data mutation. It also corrects the existing pricing percentage so that it represents compensation settlement, never a customer-facing price multiplier.

No remote push, deployment, staging mutation, or production data backfill is part of this batch.

## Invariants

1. Shop services and technician services remain independently persisted. Switching pricing mode does not create, update, hide at rest, or delete either set.
2. A shop in merchant pricing mode exposes shop services to booking. A shop in technician pricing mode exposes technicians first and loads services only after a technician is selected.
3. Booking creation validates the current shop pricing mode and the selected service owner in the final database transaction.
4. The shop service menu has a hard limit of 20 active records. The backend is authoritative; the frontend prevents an obviously invalid attempt.
5. Technician portfolios keep their existing hard limit of 5 and can be managed regardless of the shop pricing mode.
6. The settlement split is displayed as `店铺 X%：Y% 技师`. Adjusting the technician share automatically derives the shop share, so the total is always 100% and therefore cannot exceed 100%.
7. The settlement split does not change a public service price. It feeds the existing compensation rule model:
   - `ShopFinanceRuleSet` is the shop-wide default.
   - `TechnicianCompensationProfile` is the per-technician override.
8. Orders retain the exact compensation rule version used for settlement. Later global or technician-specific changes cannot alter historical payroll.

## Data Ownership

- `Shop.pricingMode` remains the booking-source selector.
- `ShopFinanceRuleSet.commissionRateBps` is the canonical global technician share; the shop share is `100 - technician share`.
- `TechnicianCompensationProfile.commissionRateBps` remains the canonical individual override.
- The legacy `Shop.technicianPricingRatePercent` field is only a compatibility mirror and must be kept within 0..100. It must not be used to rewrite service prices.
- `OrderFinancial.compensationBasisVersion` identifies the immutable `shop_default:<id>` or `technician_override:<id>` version used by payroll.

## Failure Behaviour

- Invalid settlement percentages are rejected by Zod and by service normalization; no value above 100 reaches persistence.
- A direct public technician-service request in merchant pricing mode returns no bookable technician services.
- A service from the wrong owner type is rejected during booking even if a client tampers with identifiers.
- Creating a 21st shop service fails with a conflict and leaves existing services unchanged.
- If a technician has no service yet, the editor loads active formal categories and requires an explicit category before saving.

## Acceptance Evidence

- Focused frontend interaction tests for first-service creation and split display/bounds.
- Backend service/API/repository tests for split validation, no price multiplication, source visibility, service quota, and historical compensation selection.
- Fresh TypeScript lint, focused test suites, formal frontend build, and `git diff --check`.
