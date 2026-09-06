# User directory follow-up — local acceptance

Scope: Step 12, existing user directory and detail UI/API only.

- Removed the repeated membership/level/experience strip above the detail tabs. Membership tier and multiplier adjustment controls now sit beside their corresponding values in the membership tab. Existing operations capability, reason validation, optimistic locking and audit-backed save flow are unchanged.
- The operations identity projection emits one merchant personal name even when the account has multiple merchant portal/backoffice identities. An active, nondeleted personal `merchant` profile takes precedence over owner/staff role profiles. Scout badges and both user-directory filter choices are removed; no identities, permissions or historical records were deleted.
- NDP balance and booking-count headers expose localized ascending/descending numeric controls. API validation, frontend query types and both OpenAPI operations accept `ndpBalance` / `bookingCount`. The database orders the full filtered population before LIMIT/OFFSET, with descending user ID as a stable tie breaker. Only that bounded page is hydrated. NDP excludes Test NDP and deleted/non-user wallets; absent wallets sort as zero. Booking count excludes deleted orders and respects the authenticated merchant shop.
- Numeric ordering reuses the existing Prisma filter tree through a restricted parameterized SQL predicate adapter. Relation names are allowlisted; identifiers come from the generated Prisma schema; unsupported predicates fail closed. The count and final hydration retain the same original predicates. No database schema or business data changed.

## Experience clarification

The September 1 design document line 137 proposed `10,000 units = 1 EXP` as storage precision. Commit `a238febc` adopted it. This is an implementation choice, not evidence of a user-confirmed business rule. The earlier QA wording saying “approved conversion” has been corrected. The user questioned whether such storage units are necessary. Exact decimals are an alternative, but neither conversion, level thresholds nor existing experience records were changed in this follow-up. The current raw-unit display remains unresolved pending the choice of representation; changing the constant alone would misinterpret historical balances.

## Verification

- Frontend: 5 focused files / 53 tests passed, including tab placement, edit-dialog behavior, identity/scout display, numeric sort query and pagination reset.
- Backend: repository/SQL behavior tests 19 passed; API/OpenAPI 3 passed. SQL tests execute actual parameterized queries with boundary pagination, absent/deleted wallets, Test NDP separation, merchant scoping and injection-like text. SQLite verifies the portable query semantics; live authenticated operations UI additionally exercised MySQL queries.
- Frontend TypeScript and formal production build passed; backend TypeScript build and targeted ESLint passed. Existing Vite mixed-import and bundle-size warnings remain.
- Live operations page: merchant name appears once; no scout option; membership controls appear only in the membership panel and open the existing reasoned editor. No save was submitted.
- Live booking-count descending page 1: 422 ... 393; page 2: 388 ... 297. Switching ascending returns to page 1. NDP numeric ordering returns without errors; current displayed formal balances are zero, while Test NDP remains separate.
- Vite PID 43732 serves port 5180 from `.worktrees/dashboard-remaining-acceptance`. Existing worktree watcher exclusion required a restart preserving public proxy configuration. Tests used a separate Chrome tab; the user's original tab was not navigated.

The user requested local main integration after acceptance. This follow-up is committed directly in the existing main worktree. No push, deployment, migration or account mutation is included.

The raw-unit display limitation above is addressed by the [EXP read-contract correction](2026-09-06-experience-display.md), which preserves historical storage and event values.
