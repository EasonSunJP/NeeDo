# Task 7 Web Locks Critical Fix Report

## Scope

This follow-up completes only the frontend V8 persisted-auth-envelope critical
section on top of `52468e20`. It changes no backend, migration, OpenAPI,
Task 8-10 dashboard page, deployment, remote, merge, or push state.

## Durable-envelope serialization

- `needo.auth.envelope.v8` writes are now asynchronous and fail closed when
  Web Locks are unavailable. An injectable adapter makes lock interleavings
  deterministic in tests.
- While the exclusive lock is held, a regular commit compares the complete raw
  durable value. A terminal tombstone only applies to its own auth instance and
  is constructed from the latest locked value, so it wins over a same-instance
  commit but cannot delete a newer different-instance login.
- Every V8 write, rotating/existing coordinator commit, tombstone flow, portal
  remembered-authority mutation, and Admin login logout call now propagates and
  awaits its asynchronous result. An intermediate test-only caller in the HTTP
  client and all coordinator tests were likewise migrated.
- The Provider storage listener parses `StorageEvent.newValue` directly; it
  never rereads browser storage to decide the remote authority. For a remote
  same-instance tombstone it first captures the current R2 credentials,
  starts best-effort revocation, and then terminally clears local credentials
  and React session state.

## Regression coverage

- Controlled lock ordering covers both commit-first and logout-first
  same-instance interleavings; both end with the tombstone, so an R1 stale
  commit cannot replace it.
- A different auth instance rejects an old logout tombstone.
- No Web Locks adapter fails closed without a browser write.
- The Provider storage-event regression deliberately leaves physical storage at
  the prior committed envelope while sending a tombstone in `event.newValue`.
  It proves the event payload is authoritative, local state is terminated, and
  R2 (`access-r2` / `refresh-r2`) is revoked best-effort.

## Verification

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/httpClient.test.ts src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/auth/authCredentialCoordinator.test.ts src/pages/auth/LoginPage.test.ts src/auth/authEnvelope.test.ts src/features/settings/UnifiedSettingsPages.test.ts
```

Result: 12 test files passed, 274 tests passed.

`git diff --check` passed. Target ESLint passed using the bundled backend
runtime. The root workspace has no local Prettier binary; network-backed `npx`
cannot resolve the registry in this environment. The bundled backend Prettier
reports all ten targeted files unformatted, and the same check shows all ten
were already unformatted at `52468e20`; no whole-file mechanical rewrite was
made because it would obscure this security-only diff.

`npm run lint` reports exactly the pre-existing 66 TypeScript errors in these
four untouched Task 8-10 pages, and no Task 7 file:

- `src/pages/admin/AnalyticsPage.tsx` (16)
- `src/pages/admin/DashboardPage.tsx` (14)
- `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` (17)
- `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` (19)

No live-browser, backend, deployment, merge, or production acceptance is
claimed by this report.
