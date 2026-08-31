# Task 6 Implementer Report

## What was implemented

- Added centralized `requireMerchantShopId` and `assertMerchantShopId` resolution in this order: operations read-only preview, direct shop identity, then the authenticated merchant-account selected shop. The selected-shop branch also verifies the formal identity kind is `merchant_account`; an unrelated identity carrying an internal selected-shop field still fails closed.
- Replaced the duplicated shop-only guards in Backoffice, Booking, Compensation, Ledger, merchant finance rules, order finance, payroll schedule policy, Payroll, pricing mode, and technician-shop affiliation services. Explicit path/body shop IDs use the shared assertion before repository mutations.
- Preserved Affiliate publisher and order-acceptance business-subject behavior: neither module was changed. No client shop header or arbitrary request shop selector was added.
- Added `GET /api/v1/merchant-admin/manageable-shops` under the existing Backoffice namespace with `merchant-admin:dashboard:read`, strict `page`/`page_size`, the Task 5 context repository, standard pagination, public-safe rows, and audit action `merchant_admin.manageable_shops.read`.
- Direct shop identities receive their single selected shop. Merchant accounts preserve the repository's deterministic requested page and global selected semantics: a page may correctly contain zero selected rows when the selected shop is outside that page; the service never inserts or moves a row.
- Added OpenAPI response schemas and explicit `400`, `401`, and `403` responses. No schema, migration, frontend, Task 7+, mock production path, push, merge, or deployment was added.

## TDD evidence

Initial RED command:

```text
npm test -- --runInBand tests/merchant-selected-shop-scope.test.ts
```

Observed expected failures: Backoffice, Booking, and payroll policy rejected the Task 5 merchant-account actor selected to Shop B because their private guards accepted only direct shop scope. The Shop A pricing mutation test already proved both repository calls remained at zero.

Manageable-shops RED command:

```text
npm test -- --runInBand tests/backoffice-api.test.ts -t "manageable-shop"
```

Observed expected `404` before the route was added. A later security RED proved that a customer identity carrying an internal selected-shop field was incorrectly accepted before the formal merchant-account check was added.

Final focused regression command:

```text
npm test -- --runInBand --forceExit tests/merchant-selected-shop-scope.test.ts tests/merchant-shop-scope.test.ts tests/backoffice-api.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/ledger-service.test.ts tests/ledger-api.test.ts tests/order-finance-service.test.ts tests/merchant-finance-rules-service.test.ts tests/merchant-finance-rules-api.test.ts tests/employee-compensation-profile.test.ts tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts tests/payroll-schedule-policy.service.test.ts tests/payroll-schedule-policy.routes.test.ts tests/payroll-service.test.ts tests/payroll-api.test.ts tests/pricing-mode-service.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts
```

Result: 20 suites passed and 191 tests passed.

```text
npm run lint
npm run build
npx prettier --check tests/merchant-selected-shop-scope.test.ts src/services/merchant-shop-scope.ts src/services/booking.service.ts src/services/merchant-finance-rules.service.ts src/services/order-finance.service.ts src/services/payroll-schedule-policy.service.ts src/services/payroll.service.ts src/services/pricing-mode.service.ts tests/merchant-finance-rules-api.test.ts tests/payroll-api.test.ts
git diff --check
```

Result: lint, build, targeted Prettier, and `git diff --check` all passed.

## Coverage highlights

- Shop B propagation through Dashboard, order and schedule queries, finance, employee list, payroll policy read/write, pricing read/write, compensation, wallet, and shop settings read/write.
- Preview-over-direct-over-selected precedence, selected merchant-account formal-kind enforcement, and Shop A `40305` before mutation repository calls.
- Direct-shop manageable list, strict `page`/`page_size`, authentication, permission denial, safe row fields, and audit.
- Merchant-account deterministic pagination with Shop B outside the current page and zero fabricated selected rows.
- Existing operations preview, Backoffice, Booking, Ledger, order finance, employee, compensation, payroll, pricing, permissions, and OpenAPI regressions.

## Test fixture compatibility

- Two older API fixtures reached the Task 5 formal login revalidation without supplying `MerchantShopContextRepositoryPort`, so focused regression initially failed at login with `403` before reaching Task 6 endpoints. Supplying the formal direct-shop repository contract in those fixtures restored all six tests; authentication and production scope logic were not relaxed.

## Self-review and concerns

- `backend/prisma/schema.prisma`, `backend/prisma/migrations`, frontend files, Affiliate services, and order-acceptance services have no diff.
- No new route accepts a client-controlled shop header. The manageable endpoint sends only the existing authenticated identity scope and revalidated selected public ID to the Task 5 repository.
- Global `npm run format:check` remains a pre-existing repository-wide baseline failure (235 files reported). The new Task 6 test and all previously formatted changed files pass targeted Prettier; lint, build, and `git diff --check` are used as the commit gates.
- The large combined Jest run reports the repository's existing open-handle warning, so the final combined evidence uses Jest `--forceExit` after all assertions complete; individual newly added/fixed suites exit normally without it.
