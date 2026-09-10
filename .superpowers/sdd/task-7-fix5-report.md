# Task 7 Final Web Locks Blocker Fix Report

## Scope

This final follow-up addresses only the two review blockers found after
`57ac0c27`: stale queued regular-envelope commits and awaiting asynchronous
terminal cleanup after HTTP 401 responses. It changes no backend, schema,
OpenAPI, Task 8-10 page, deployment, merge, or remote state.

## Stale queued envelope commits

- Regular V8 envelope writes accept an optional synchronous `canWrite`
  predicate. Inside the exclusive lock, after raw durable-value comparison and
  immediately before `setItem`, the writer rejects when that predicate is no
  longer true.
- Both Provider coordinator commit closures supply
  `isAuthOperationCurrent(operation)` as that predicate and retain the
  coordinator's post-await current-operation check.
- The controlled Provider test queues login A on the lock, starts login B,
  releases A first, and proves A makes no `setItem` call. Releasing B leaves
  only B's refresh token in the V8 authority.

## Awaited HTTP terminal cleanup

- `setAuthExpiredHandler` now accepts a synchronous or asynchronous callback.
  `awaitAuthExpired` awaits its completion and swallows cleanup failure so the
  original terminal 401 remains authoritative.
- All seven global async 401 terminal branches await this helper after local
  credential termination.
- The HTTP-client regression holds a simulated terminal tombstone lock attempt
  and proves the request does not settle its 401 until the cleanup completes.

## Verification

Focused regression:

```bash
npm test -- src/auth/AuthProvider.test.ts src/auth/authEnvelope.test.ts src/auth/authCredentialCoordinator.test.ts src/api/httpClient.test.ts
```

Result: 4 test files passed, 114 tests passed.

Expanded Task 7 regression:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/httpClient.test.ts src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/auth/authCredentialCoordinator.test.ts src/pages/auth/LoginPage.test.ts src/auth/authEnvelope.test.ts src/features/settings/UnifiedSettingsPages.test.ts
```

Result: 12 test files passed, 276 tests passed. `git diff --check` passed.

`npm run lint` reports no Task 7 error; it still reports the pre-existing 66
TypeScript errors in only these untouched Task 8-10 pages:

- `src/pages/admin/AnalyticsPage.tsx` (16)
- `src/pages/admin/DashboardPage.tsx` (14)
- `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` (17)
- `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` (19)

No browser acceptance, deployment, merge, push, or production result is
claimed.
