# Task 7 Report — Frontend Dashboard API and merchant shop-switch session contract

## Scope and outcome

Implemented Task 7 from base commit `9deb171b` without changing backend code, Prisma schema, migrations, Task 8 visual primitives, Task 9/10 page composition, deployment, or remote state.

- Replaced the loose frontend Dashboard payload with the locked backend DTO and removed the Dashboard-only `Metric`, `metrics`, `orders`, `technicians`, and `shops` compatibility surface.
- Added explicit Dashboard queries. Platform scope may serialize `city`; merchant scope serializes only `period`, `from`, and `to` and never serializes `city` or an arbitrary `shopId`.
- Added the paginated safe manageable-shop contract and the formal merchant shop-switch request/response contract.
- Added atomic AuthProvider shop-switch handling, server-response-only `merchantShopPublicId`, rotated remembered authorization, invalid-response rollback, and stale-operation guards for concurrent shop switches, logout, identity switch, and refresh.
- Made the merchant Dashboard resource key query-aware and exact-key invalidatable. Its owner now signs the scope with user ID, identity ID, and the server-confirmed selected shop public ID; operations preview numeric storage is not used as merchant scope authority.
- Updated the two existing platform Dashboard call sites only enough to supply their required explicit query. Their Task 9 visual/data migration remains deferred.
- Updated `MerchantAdminLayout` only as the authorized resource owner: explicit query, signed scope key, exact-key retry, and locked `shop`/`summary` reads. Task 10 page work remains deferred.

## TDD evidence

Initial Task 7 RED command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts
```

Expected RED result before implementation: 4 files ran, 16 failed and 52 passed. Failures covered missing explicit query serialization, manageable-shop/switch APIs, Provider atomicity/races, and query/shop-aware caching.

Additional resource-owner RED cycles:

- `MerchantAdminLayout.test.ts`: 2 failed and 8 passed before the new locked DTO/scope/query wiring.
- `DashboardPage.test.ts` plus `AnalyticsPage.test.ts`: 2 failed and 4 passed before their calls supplied the required explicit query.

Final Task 7 GREEN command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts
```

Result: 4 files passed, 70 tests passed.

Expanded related regression:

```bash
npm test -- src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/api/backofficeRealData.test.ts src/api/httpClient.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/pages/admin/DashboardPage.test.ts src/pages/admin/AnalyticsPage.test.ts
```

Result: 7 files passed, 67 tests passed.

## Static, formatting, and build evidence

Targeted strict TypeScript for the Task 7 API/auth/session/resource/layout files and the two source-contract tests passed using the root compiler settings and an explicit file list:

```bash
node_modules/.bin/tsc --noEmit --target ES2022 --useDefineForClassFields --lib ES2022,DOM,DOM.Iterable --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --strict --forceConsistentCasingInFileNames --module ESNext --moduleResolution Bundler --resolveJsonModule --isolatedModules --jsx react-jsx src/vite-env.d.ts src/api/auth.test.ts src/api/auth.ts src/api/backofficeDashboard.test.ts src/api/backofficeRealData.ts src/auth/AuthProvider.test.ts src/auth/AuthProvider.tsx src/auth/rbac.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/merchant-admin/MerchantAdminLayout.tsx src/features/merchant-admin/dashboardResource.test.ts src/features/merchant-admin/dashboardResource.ts src/pages/admin/AnalyticsPage.test.ts src/pages/admin/DashboardPage.test.ts
```

The repository root has no frontend ESLint or Prettier config/script. As a supplemental targeted check, the installed backend ESLint parser found no Task 7 issue after the five pre-existing deprecated compatibility parameters in `src/api/auth.ts` were baseline-exempted (`_legacyCaptchaCode`, `_input`, `_email`, `_email`, `_otp`). The new `src/api/backofficeDashboard.test.ts` passes the installed Prettier with `backend/.prettierrc.json`. Applying that backend formatter to complete pre-existing frontend files would create unrelated whole-file churn, so it was not used as a bulk rewrite.

```bash
git diff --check
```

Result: PASS.

Full repository gate was run and is intentionally not reported as passing:

```bash
npm run lint
npm run build
```

Both stop at the same 66 TypeScript errors, all caused by the four planned Task 9/10 legacy pages still reading the Dashboard fields deleted by the locked Task 7 DTO:

| Deferred page | Errors | Planned owner |
| --- | ---: | --- |
| `src/pages/admin/AnalyticsPage.tsx` | 16 | Task 9 |
| `src/pages/admin/DashboardPage.tsx` | 14 | Task 9 |
| `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` | 17 | Task 10 deletion |
| `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` | 19 | Task 10 replacement |

No other file appears in the full lint/build diagnostics. `MerchantAdminLayout.tsx` is clean after its bounded Task 7 owner update. Per the approved sequencing boundary, no compatibility DTO/parser, optional legacy fields, cast, suppression, placeholder, or premature Task 9/10 rewrite was added. Full lint and production build must return to green after Tasks 8–10 complete the planned consumers.

## Changed-file inventory

- `src/api/backofficeRealData.ts`
- `src/api/backofficeDashboard.test.ts`
- `src/api/auth.ts`
- `src/api/auth.test.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/AuthProvider.test.ts`
- `src/auth/rbac.ts`
- `src/features/merchant-admin/dashboardResource.ts`
- `src/features/merchant-admin/dashboardResource.test.ts`
- `src/components/merchant-admin/MerchantAdminLayout.tsx`
- `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- `src/pages/admin/DashboardPage.tsx`
- `src/pages/admin/DashboardPage.test.ts`
- `src/pages/admin/AnalyticsPage.tsx`
- `src/pages/admin/AnalyticsPage.test.ts`
- `.superpowers/sdd/task-7-report.md`

## Review notes and remaining gate

- Shop selection is accepted into `AuthSession` only after the authenticated switch response passes token, formal `me`, requested-public-ID equality, and `^shop[0-9]{10}$` validation. Remembered browser input is explicitly tested and ignored as selection authority.
- Merchant Dashboard serialization is fail-closed for `city` and arbitrary `shopId`, even if a caller widens the TypeScript input object.
- Exact cache identity includes the caller's user/identity/signed-shop scope plus `period`, `from`, `to`, and `city`; invalidation increments only that exact generation.
- The known red full gate is a deliberate cross-task sequencing gate, not an accepted final release state. Independent review should reject any attempt to make it green by restoring the deleted legacy DTO.
