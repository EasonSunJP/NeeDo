# Booking Service Source And Settlement Split Implementation

1. Technician first service
   - Keep the failing component test that proves an empty portfolio can select a formal category and POST a real category ID.
   - Load active categories and save the selected category without inventing fallback data.

2. Settlement split semantics
   - Add tests that require `店铺 X%：Y% 技师`, 10-point adjustment, and a maximum technician share of 100%.
   - Change API validation/normalization from the obsolete 200% price multiplier range to a settlement share range.
   - Stop modifying public technician service prices with the settlement percentage.
   - Synchronize pricing-mode updates with a versioned shop compensation rule and preserve individual technician overrides.

3. Historical compensation
   - Preserve archived shop rule versions as readable history.
   - Resolve payroll orders by `OrderFinancial.compensationBasisVersion`; use current rules only for explicit legacy records without a version.

4. Booking source contract
   - Add failing tests for merchant-mode technician-service suppression and retain final booking transaction validation for wrong-source IDs.
   - Reuse one source-resolution rule across navigation, detail, checkout, and rebooking.

5. Shop menu quota and booking cards
   - Add backend concurrency-safe limit enforcement for 20 shop services and a matching frontend guard.
   - Return and render the formal booking-card fields without shop ID/address duplication.

6. Independent and multi-shop technician scope
   - Reuse active technician-shop affiliations for a selected shop.
   - Keep the profile-wide technician portfolio available to independent technicians; do not infer a fake shop.
   - Verify schedule and booking ownership before expanding nullable shop relations.

7. Verification
   - Run focused frontend/backend tests after each microstep.
   - Run full lint and the formal production build at the end.
   - Report implementation, deferred schema-sensitive work, local integration state, and browser/device acceptance separately.
