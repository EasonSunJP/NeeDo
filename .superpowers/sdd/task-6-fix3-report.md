# Task 6 Direct-Shop Selection Follow-up

- The reported `selected: false` behavior was not reproducible at current HEAD: the direct branch already compared the row with its own public ID, and the existing repository test passed `selectedShopPublicId: null` while expecting `selected: true`.
- Made that contract explicit with a dedicated direct-shop mapper that always returns `selected: true`. The active/non-deleted shop and public-identifier query filters are unchanged.
- Added repository coverage proving both a null token selection and a stale foreign token selection still return the one direct shop as selected.
- Added API coverage that injects the real `MerchantShopContextRepository` over a deterministic Prisma port and verifies `/api/v1/merchant-admin/manageable-shops` returns the direct shop with `selected: true`.
- The existing merchant-account repository test continues to verify stable pagination and selection only by `selectedShopPublicId`; that branch was not changed.

Verification:

```text
npm test -- --runInBand tests/merchant-shop-context.repository.test.ts tests/backoffice-api.test.ts tests/openapi.test.ts
```

Result: 3 suites, 44 tests passed without `--forceExit`.

```text
npm run lint
npm run build
npx prettier --check src/repositories/merchant-shop-context.repository.ts tests/merchant-shop-context.repository.test.ts tests/backoffice-api.test.ts
git diff --check
```

All passed. No frontend, schema, migration, Affiliate, or order-acceptance file changed. No push, merge, or deployment was performed.
