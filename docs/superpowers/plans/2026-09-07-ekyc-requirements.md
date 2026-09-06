# eKYC requirements by workflow

Goal: Add four independently configurable eKYC requirements in operations System Settings: merchant applications, technician applications, customer home bookings, customer shop bookings. Default only home bookings on.

Design: Extend the existing versioned UserGlobalPolicyVersion with two application flags. Reuse formal read/draft/publish endpoints, RBAC and audit; add explicit immediate publishing for this tab without changing scheduled publication semantics. Preserve manually configured policies; initialize only the untouched bootstrap policy with the requested defaults.

Enforcement: Resolve the current policy on application submission, bank binding and approval. Disabled individual merchant eKYC uses a separately recorded declared-holder comparison against the application name, with no verified identity claim. Enabled flows require valid persisted eKYC. Booking uses existing per-mode enforcement. Affiliate withdrawal remains unchanged.

- [x] Extend schema/migration, policy DTOs, validation, repository, audit and OpenAPI.
- [x] Add workflow policy evaluation and use it for both application submit/review paths and merchant bank binding.
- [x] Add System Settings eKYC tab with four switches, current/draft states and permission-aware publication; synchronize legacy global-settings controls.
- [x] Cover on/off gates, true defaults, bank evidence provenance, RBAC, conflict and persistence; run focused checks and builds.
- [x] Apply only the local migration, refresh Prisma clients/runtimes and verify local settings; do not deploy or push.

## Application review and technician selection follow-up

- Merchant application adds a fourth review step; technician application uses its third step for review. Re-entry restores the current active application before older decisions. Purged decisions display retention status and rejected reapplications start a new draft.
- Floating review actions: pending withdraw plus disabled 审核中; approved switches the same applicant to the granted portal using one formal refresh/identity rotation; rejected uses one red 审核未通过，再次申请 action.
- Owner review projection includes protected media IDs, masked bank details, accepted contract text/receipt, formal target shop ID/name and taxonomy labels. Corporate legal names are preserved separately from representative names.
- Technician search returns formal `shop…` public identifiers, cover, rating and keywords in a paginated query. Standalone shared shop cards use a 29px plus/check single selector and show only the public identifier. Search stays on one line; bottom navigation is hidden; step actions float. Name is required; gender and uploads use shared application controls.
- Merchant applicant names use separate family/given inputs, with eKYC below. The existing full-name API contract remains intact.

Local database check: published policy v2 has merchant=false, technician=false, home=true, store=false. Migration applied locally only; no remote push or deployment. Authenticated technician page checked in Chrome. Automated tests cover policy enforcement, declared bank evidence and approval, versioned publishing, owner search ID, application actions, selector behavior and field widgets. Full approved/rejected browser acceptance still requires corresponding real application states.

Final validation: 139 frontend tests passed. Backend regression covered 88 tests; after updating the intentional created-time ordering assertion, the affected repository suite passed all 9 tests. Frontend/backend builds and backend lint passed. Authenticated Chrome verified formal ID search, single selection, hidden navigation, floating controls, required-name validation, shared gender dropdown and themed upload controls in a separate tab without submitting an application.
