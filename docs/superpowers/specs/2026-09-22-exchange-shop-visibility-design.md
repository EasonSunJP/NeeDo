# Exchange shop-card destination and visibility

## Goal

An Intelligence shop information card opens the linked shop homepage directly. An Intelligence post tied to a shop is readable only by identities allowed to read that shop under its current persisted visibility setting.

## Existing authority

`Shop.visibility` and `ShopVisibilityRepository.buildVisibilityWhere(viewer)` define the audience: `public` is open; `privateAll` is owner-only; `limited` adds reciprocal active friends; `network` adds the established business relationships. Do not copy this policy into Exchange or snapshot an audience at publication time. The current `sourcePostId` exception for limited shop details contradicts this design and must no longer grant access.

## Read and navigation behavior

- Filter Intelligence list rows and their total before pagination by the linked service's shop and the viewer's current identity. Demand behavior stays unchanged.
- Apply the same shop predicate to a single Intelligence post read and to read checks before comments, likes, and shares. A denied post returns the existing not-found error, without disclosing whether the post or shop exists.
- The information-card arrow goes straight to the appropriate protected store homepage route. User and merchant routes are already present; the technician route reuses the formal store-detail component under technician authentication. No intermediate profile page is required.
- Existing source-scoped profile URLs remain parseable for compatibility, but `sourcePostId` cannot widen the shop's audience.
- Changes to the shop's visibility take effect on already-published Intelligence at read time. No schema change or data migration is needed.

## Verification

Use red/green regression tests for card targets, all four visibility modes and identity relationships, filtered counts/pagination, direct post reads and interactions, and the removed `sourcePostId` bypass. Verify the final integrated code with focused tests, repository lint/build, and browser acceptance using an authorized and an unauthorized account. Do not claim staging or device proof without observing it.
