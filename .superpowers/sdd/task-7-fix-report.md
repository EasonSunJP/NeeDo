# Task 7 Independent Review Fix Report

## Scope and result

This follow-up fixes the independent-review findings against Task 7 commit
`59ce89f2` without amending that commit. It does not change backend code,
OpenAPI, Prisma/schema, Task 8 visual components, Task 9/10 pages, deployment,
or remote state.

The fix makes auth transitions caller-owned and serial, validates the shared
runtime auth contract, makes browser persistence transactional, and binds the
merchant Dashboard resource to a server-confirmed shop and credential epoch.

## Review findings addressed

### Serialized auth transitions

- `switchIdentity`, `switchMerchantShop`, explicit-credential `/me`, refresh,
  and logout requests use caller-owned unauthorized handling. A stale 401
  cannot invoke the global session-expired handler or clear a newer session.
- Shop switch, identity switch, refresh-session work, remembered-portal
  restoration, and logout share a FIFO Provider transition queue.
- Every operation carries an auth generation, operation revision, credential
  epoch, and pre-commit snapshot. A second queued shop switch therefore sends
  the first successful response's rotated refresh token rather than reusing the
  original token.
- Login/session replacement invalidates older transitions. Late switch
  success, late 401, logout, identity switch, and refresh-session races cannot
  commit or roll back over a newer operation.

### Strict auth runtime contract and atomic commit

- Added one shared runtime parser for `AuthMe`, identity availability, token
  pairs, refresh responses, identity-switch responses, and merchant-shop
  switch responses.
- Required fields and formal public-ID patterns mirror the backend/OpenAPI.
  Access TTL is a positive integer capped by the backend environment contract
  (`AUTH_ACCESS_TOKEN_TTL_SECONDS <= 900`). Email/date-time fields, current
  identity alignment, expected user/identity, merchant-account identity
  semantics, and requested shop equality are checked before commit.
- Transition APIs are pure request/validation functions and never persist
  their response. Provider commit is the single writer for rotated tokens,
  current session, portal/session storage, and remembered authorization.
- Every low-level token/browser/remembered write returns success. Any rejected
  stage restores the captured access/refresh credentials, expected user,
  local/session auth records, remembered records, React session/ref, and
  restore error. Only the currently active operation may roll back.

### Confirmed merchant scope and Dashboard isolation

- `/me` refresh preserves `merchantShopPublicId` only for the same user, same
  current merchant identity, and merchant portal. Identity change and logout
  clear it.
- `MerchantAdminLayout` waits for the server-confirmed session shop or a
  selected shop returned by the paginated manageable-shops API. It never
  requests or caches an `unselected` Dashboard owner and never trusts a shop
  public ID from local storage.
- Manageable-shop fallback is bound to user, identity, and credential epoch.
  This closes the self-review race where the first render after switching to B
  could temporarily combine B's session with A's previously resolved shop.
- Dashboard cache identity includes user, identity, signed shop public ID,
  credential epoch, period, from, to, and city. Owner cleanup aborts in-flight
  work. Retry and commit recheck epoch/scope, and a response whose
  `scope.shopPublicId` differs from the expected signed shop is rejected and
  never cached.

### Query and pagination contracts

- Platform and merchant Dashboard serializers use explicit whitelists.
  `custom` requires both `from` and `to`; non-custom periods omit boundaries.
  Platform may send city. Merchant never sends city, `shopId`, or unknown
  fields.
- Manageable shops use bounded positive pagination and project only
  `publicId`, `name`, `city`, `status`, and `selected` plus formal pagination
  metadata.

## TDD evidence

Review RED cycles included:

- Initial auth/http hardening: 9 failures and 38 passes before caller-owned
  unauthorized handling and transition persistence were implemented.
- Dashboard serializer hardening: 3 failures and 5 passes before explicit
  whitelist/range behavior was implemented.
- Final self-review owner-scope case: `MerchantAdminLayout.test.ts` failed 1
  of 11 before manageable selection was owner/epoch-bound.
- Final backend-semantic parser case: `auth.test.ts` failed 1 of 32 before a
  direct-shop `merchant_staff` identity was rejected in merchant-account
  switch scope.

Fresh focused command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts
```

Result: 4 files passed, 105 tests passed.

Fresh expanded command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/httpClient.test.ts src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts
```

Result: 8 files passed, 156 tests passed.

The regression set covers FIFO A-to-B token rotation, stale 401 after a new
login, shop-vs-logout/identity/refresh races, invalid 200 responses, six
storage rejection stages, same-identity `/me` shop preservation, slow A after
B, A retry after B, logout/login with the same IDs but a new epoch, response
scope mismatch, query whitelisting, pagination, and no-unselected layout
wiring.

## Verification gates

The final verification run must pass:

- 4 focused Task 7 suites.
- 8 expanded auth/http/RBAC/resource/layout suites.
- Strict targeted TypeScript for every changed Task 7 source/test file.
- Targeted ESLint (with only the pre-existing deprecated compatibility
  parameters baseline-exempted).
- Prettier for the four fully Task-owned new/rewritten files.
- `git diff --check`.

The repository root has no frontend Prettier configuration. The backend
formatter is therefore applied only to the four fully Task-owned files;
running it across old frontend files would create unrelated whole-file churn.

Full `npm run lint` remains the explicit sequence gate: 66 TypeScript errors,
and only these four deferred Task 9/10 consumers appear:

| Deferred page | Errors |
| --- | ---: |
| `src/pages/admin/AnalyticsPage.tsx` | 16 |
| `src/pages/admin/DashboardPage.tsx` | 14 |
| `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` | 17 |
| `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` | 19 |

No compatibility DTO/parser, optional legacy Dashboard fields, suppression,
placeholder, or premature page rewrite was added. Full lint and the production
build must be restored after Tasks 8-10 migrate/delete those four consumers.

## Final verification results

- Focused Task 7 suites: PASS, 4 files and 105 tests.
- Expanded auth/http/RBAC/resource/layout suites: PASS, 8 files and 156
  tests.
- Target strict TypeScript: PASS.
- Target ESLint: PASS with the documented pre-existing deprecated-parameter
  baseline exemption.
- Task-owned Prettier: PASS for all four files.
- `git diff --check`: PASS.
- Full lint sequence gate: 66 errors in exactly the four pages listed above;
  no Task 7 source/test file appears.

## Remaining risks and deferred gates

- This is unit/source-contract and strict-TypeScript evidence; it does not
  claim live backend, browser, deployment, or production acceptance.
- Browser storage rejection tests model a one-shot failed write followed by a
  successful rollback. If the browser rejects both the original write and all
  rollback writes, JavaScript cannot guarantee durable restoration; the
  Provider still leaves React/module state on the captured session and reports
  storage unavailable.
- Full repository lint/build intentionally remain red until the planned Task
  9/10 page migrations. This is not a release-ready green gate.
