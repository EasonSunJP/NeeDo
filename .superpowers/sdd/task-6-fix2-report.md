# Task 6 Second Review Fix Report

## Fixture audit and fixes

The audit enumerated every `backend/tests/**/*.test.ts` containing `createApp(` or `createAuthService(`, then checked both literal/dynamic merchant scope declarations and multiline `identities` arrays for `shop` or `merchant_account` identities without a `merchantShopContextRepository` dependency.

Nine real fallback fixtures were found and fixed:

1. `affiliate-task-api.test.ts`
2. `finance-center-api.test.ts`
3. `manual-payment-api.test.ts`
4. `master-data-api.test.ts`
5. `merchant-technician-application-api.test.ts`
6. `order-acceptance-pause-api.test.ts`
7. `platform-fee-policy-api.test.ts`
8. `schedule-api.test.ts`
9. `wallet-adjustment-api.test.ts`

Direct-shop fixtures use a deterministic port that returns exactly the authenticated identity's own shop from `listManageableShops`. Merchant-account fixtures use formal active memberships and implement all three port methods: paginated `listManageableShops`, `resolveDefaultShop`, and exact-public-ID `resolveShop`. The platform-fee foreign-account case has its own account 5 to Shop 12 membership, so authentication succeeds before the business authorization correctly denies access to Shop 11.

The final multiline identity-object scan returns no missing repository. A deliberately broad scan returns only `affiliate-platform-fee-api.test.ts`; manual inspection proves this is a false positive because every login identity is `platform_admin + platform`, while its `scopeType: "shop"` occurrence belongs to a fee-rule request body. The malformed API-fixture scan for `merchant + merchant_account` also returns no results.

## Formal identity and business subject

- Updated old merchant-account fixture identities in order acceptance and platform fee policy to `merchant_organization + merchant_account`.
- Kept direct `merchant + shop` fixtures formal and unchanged.
- Did not modify Affiliate or order-acceptance production code. Order-acceptance repository assertions still prove `authorityType: "merchant"` for the merchant-account business subject and `authorityType: "shop"` for the direct shop.

## Dashboard public IDs

- Dashboard merchant fixtures now consistently use `shop0000000011`.
- `DashboardShopSnapshot.publicId` and the shop branch of `Dashboard.scope.shopPublicId` declare the formal OpenAPI pattern `^shop[0-9]{10}$`, matching manageable shops and merchant shop switching.

## TDD and open-handle evidence

Initial reproduction:

```text
npm test -- --runInBand tests/master-data-api.test.ts
```

Result before fixture injection: 6 tests failed at merchant login with `403`, 2 passed, and Jest remained alive with the open-handle warning because authentication fell back to the real Prisma-backed context repository.

OpenAPI RED:

```text
npm test -- --runInBand tests/openapi.test.ts
```

Result before the schema change: the new dashboard public-ID assertion failed because the schema exposed only `minLength: 1`.

Required suites after the fix, each without `--forceExit`:

```text
npm test -- --runInBand tests/master-data-api.test.ts
npm test -- --runInBand tests/affiliate-task-api.test.ts
npm test -- --runInBand tests/order-acceptance-pause-api.test.ts
```

Results: 8/8, 5/5, and 5/5 tests passed respectively; every Jest process exited naturally.

The six other repaired fixture suites also passed without `--forceExit`: finance center, manual payment, merchant technician application, platform fee policy, schedule, and wallet adjustment.

## Full verification

The complete Task 6 regression included the previous 20 suites, all nine repaired fixture suites, dashboard, and Affiliate/order-acceptance service tests:

```text
32 suites passed
272 tests passed
```

Jest exited naturally after 66.74 seconds without `--forceExit`.

```text
npm run lint
npm run build
npx prettier --check <all Task 6 fix2 source and test files>
git diff --check
```

All passed. No schema, migration, frontend, production Affiliate, or production order-acceptance file changed. No push, merge, or deployment was performed.
