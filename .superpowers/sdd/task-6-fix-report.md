# Task 6 Review Fix Report

## Review findings fixed

- Authorized shop scope now wins over every caller-supplied object field. Backoffice orders, schedule, finance list/export, technicians, customers, customer timeline, and services all spread validated input first and the resolved scope last. Booking schedule and technician-affiliation repository inputs received the same defensive ordering. Affiliate and order-acceptance behavior was not changed.
- Merchant list routes now use a strict `merchantAdminListQuerySchema` that deliberately has no `shopId`. All seven merchant list/export routes reject a client `shopId` with `40001` before repository access.
- `requireMerchantShopId` keeps operations read-only preview first, then resolves the Task 5 formal identity kind before accepting a direct shop or merchant-account selected shop. Malformed `customer + shop`, `merchant_organization + shop`, `merchant + merchant_account`, and `technician + shop` pairs fail with `40305`.
- `BackofficeService` no longer imports or constructs the concrete merchant-shop context repository. Its port is mandatory, the composition root explicitly supplies the production repository, and every test construction supplies a deterministic port.
- Merchant API fixtures for employee compensation, payroll schedule policy, and technician affiliation explicitly supply a deterministic merchant-shop context port, eliminating fallback Prisma connections and the Jest open handle.
- Manageable-shop `publicId` is constrained to `^shop[0-9]{10}$` in fixture data, API expectations, OpenAPI, and contract tests.

## TDD evidence

Initial scope RED:

```text
npm test -- --runInBand tests/merchant-selected-shop-scope.test.ts
```

Observed 6 expected failures: malformed formal identity pairs were accepted, and selected merchant-account, direct-shop, and operations-preview actors each allowed query Shop A to replace authorized Shop B in repository calls.

Route strictness RED:

```text
npm test -- --runInBand tests/backoffice-api.test.ts -t "rejects client shop scope"
```

Observed all seven merchant list/export endpoints accept `?shopId=22` before the dedicated strict query schema was connected.

Open-handle reproduction:

```text
npm test -- --runInBand tests/employee-compensation-profile.test.ts
```

Before fixture injection, all four assertions passed but Jest remained alive because authentication fell back to the real Prisma-backed merchant-shop context repository. After explicit port injection, the same suite passed 4/4 and exited naturally.

## Final verification

```text
npm test -- --runInBand tests/merchant-selected-shop-scope.test.ts tests/merchant-shop-scope.test.ts tests/backoffice-api.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/ledger-service.test.ts tests/ledger-api.test.ts tests/order-finance-service.test.ts tests/merchant-finance-rules-service.test.ts tests/merchant-finance-rules-api.test.ts tests/employee-compensation-profile.test.ts tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts tests/payroll-schedule-policy.service.test.ts tests/payroll-schedule-policy.routes.test.ts tests/payroll.service.test.ts tests/payroll-api.test.ts tests/pricing-mode.service.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts
```

Result: 20 suites passed, 205 tests passed, and Jest exited naturally without `--forceExit`.

```text
npm run lint
npm run build
npx prettier --check <all Task 6 fix source and test files>
git diff --check
```

Result: lint, build, targeted Prettier, and diff check passed. Repository-wide `npm run format:check` still reports the pre-existing baseline in 225 unrelated files; no unrelated files were rewritten.

## Scope and risk review

- No schema, migration, frontend, Task 7+, mock production path, push, merge, or deployment change.
- No client-controlled shop header or shop selector was introduced.
- The stricter formal identity contract intentionally required legacy service fixtures to declare their identity type; production validation was not relaxed.
- The merchant-account manageable-shop page remains repository-authored. A selected shop outside the requested page correctly yields zero selected rows on that page; no row is fabricated or moved.
