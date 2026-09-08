# Multi-shop pricing-mode isolation design

## Invariant

`pricingMode` belongs to `Shop`. It is never a technician-global flag. The booking service source is resolved from the current booking `shopId`, that shop's current pricing mode, and the selected `technicianProfileId`.

## Resolution

- Merchant/shop pricing: list and accept only active, bookable services owned by the current shop. Selecting a technician does not switch the source to that technician's services.
- Technician pricing: require the selected technician to be active in the current shop, then list and accept only that technician's own active, bookable services. Shop packages do not participate.
- Booking creation rechecks the source and ownership in the final database transaction and stores the pricing-mode and owner snapshots.
- The same transaction compares the current source price with the amount confirmed by the customer. A mismatch creates no order and returns the current amount so the confirmation page can reload and ask for confirmation again.

## Independence

Changing a shop's mode updates only that shop. It does not update, hide, disable, delete, or overwrite technician services. A technician affiliated with shops A and B can therefore produce different booking menus in each shop at the same time.

## Verification cases

1. Shop A in merchant mode plus technician X returns A's services and rejects X's own service.
2. Shop B in technician mode plus the same technician X returns X's services and rejects B's shop service.
3. Updating A's mode leaves B and X's service records unchanged.
4. Cross-shop technician/service ownership is rejected even when numeric identifiers are valid.
5. A cached or otherwise stale displayed price is rejected before commit and cannot silently become an order at a different amount.
