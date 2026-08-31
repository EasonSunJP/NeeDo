# Task 7 Second Independent Review Fix Report

## Scope and outcome

This follow-up addresses the second independent review of Task 7 on top of
`cf5ee935`. It changes only the frontend auth/API/session/resource wiring and
its tests. It does not change backend code, OpenAPI, Prisma/schema, Task 8-10
visual pages, deployment, or remote state. This report supersedes the auth
transition and storage conclusions in `task-7-fix-report.md`.

## Credential authority and transition safety

- Added a single `AuthCredentialCoordinator` for login, registration, Google
  auth, startup/remembered restore, automatic 401 refresh, explicit session
  refresh, identity/shop switching, and logout.
- The coordinator owns the monotonic operation revision, generation,
  committed credential version, transition phase, access/refresh credentials,
  expected user, rotation queue, pending server credentials, revocation, and
  subscriptions.
- Latest authentication operations supersede earlier work. Rotations are FIFO,
  cannot begin while a latest operation owns the generation, and each queued
  request reads the refresh token committed by its predecessor.
- Preflight failures explicitly abandon their operation, preventing ghost
  latest/rotation locks. A terminal operation or a newer latest operation
  revokes any server-issued but uncommitted credentials.
- Logout is immediately local and terminal. It increments the committed auth
  epoch, clears memory and browser auth state, publishes anonymous state,
  invalidates subscribers/resources, and performs remote revocation without
  blocking the UI or allowing a late response to republish a session.
- Normal requests capture both credential version and auth generation.
  Automatic refresh is unavailable while a credential transition is active;
  an old 401 cannot refresh/clear over a login or rotation. Refresh
  singleflight is scoped to one version and generation.

## Pure API responses and strict validation

- Auth APIs are request/validation only and do not persist or clear auth state.
  Caller-owned rotating calls disable automatic 401 handling.
- Token-bearing invalid 200 responses carry any non-empty returned token pair
  in a typed error. Provider/coordinator logic revokes that candidate and
  fails closed when current; stale responses are revoked without changing the
  newer session.
- The shared runtime parser requires the backend DTO fields, exact access TTL
  `900`, strict RFC 3339 date-time syntax and calendar values, formal public ID
  patterns, unique identities, full current-identity equality, exact expected
  user/identity, and requested merchant shop equality.
- Startup restore trusts stored portal/login metadata only when the stored
  session user ID equals the freshly authenticated `/me` user. It preserves a
  selected merchant shop only for the same user and same merchant identity.

## Atomic persistence and fail-closed behavior

- A rotated response has explicit `preflight`, `server_rotated`, and
  `client_committed` stages. Only one successful commit publishes tokens,
  session, remembered authorization, and expected user.
- Any persistence failure after server rotation fails closed and revokes the
  newest rotated pair. Old credentials are never restored after the server has
  rotated them, including when browser storage remains unavailable.
- Existing-session writes capture browser and remembered authorization state.
  The old in-memory session is retained only when both rollback paths succeed.
  If the original write and rollback are both rejected, Provider immediately
  terminates locally, revokes the old credentials best-effort, clears all auth
  keys, and returns `error.auth.reauth_required`.
- Provider subscribes to coordinator snapshots so an external terminal change
  cannot leave React session state authenticated after credentials are gone.

## Merchant resource ownership

- Manageable shops accept `AbortSignal`, strictly validate requested page,
  page size, bounded list length, formal public IDs, and required safe fields.
  Layout scans at most the server-declared bounded page count and aborts on
  owner changes.
- Layout waits for a server-confirmed selected shop and never treats local
  storage or an unselected owner as dashboard authority.
- Dashboard resource keys include user, identity, signed selected shop,
  committed auth epoch, period, from, to, and city. Owner changes abort and
  invalidate work; cached return, retry, and commit all recheck the current
  owner/epoch/scope.
- Merchant dashboard scope never serializes `shopId` or `city`. Platform and
  merchant serializers use explicit whitelists; `custom` requires both bounds
  and non-custom periods omit them.
- Cache entries are bounded and swept with LRU/expiry behavior. A mismatched
  response `scope.shopPublicId` is rejected and never cached.

## TDD evidence

The second-review RED cycle produced 6 failures across 95 passing/failing
auth/API/coordinator tests for stored-user metadata, coordinator subscription,
malformed rotated response revocation, latest-versus-rotation exclusion, typed
rotated errors, and write-free rejection. Subsequent focused RED cases covered
old 401 during rotation, pending-token logout revocation, preflight ghost
operations, malformed late responses, invalid identity-switch responses,
newest-pair revocation during login completion, and persistent rollback
failure. Each case was observed failing before its implementation change.

Fresh expanded command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/httpClient.test.ts src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/auth/authCredentialCoordinator.test.ts src/pages/auth/LoginPage.test.ts
```

Final result: 10 files passed and 216 tests passed. The focused Task 7 subset
also passed 4 files and 128 tests.

## Static and sequence gates

- Target ESLint uses `backend/eslint.config.mjs` because the root project has
  no separate ESLint dependency/configuration.
- Target Prettier uses `backend/.prettierrc.json` across every Task 7 changed
  file.
- `git diff --check` must pass.
- Full `npm run lint` remains the planned Task 9/10 sequence gate with exactly
  66 TypeScript errors in only these untouched pages:

| Deferred page                                             | Errors |
| --------------------------------------------------------- | -----: |
| `src/pages/admin/AnalyticsPage.tsx`                       |     16 |
| `src/pages/admin/DashboardPage.tsx`                       |     14 |
| `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` |     17 |
| `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` |     19 |

No Task 7 source or test file appears in the strict TypeScript output. Full
lint and production build must return to green after Tasks 8-10 migrate the
four planned consumers.

Final target ESLint, target Prettier, and `git diff --check` passed. Full
`npm run lint` produced exactly the 66-error allowlist above and no other
files.

## Remaining risk and deferred acceptance

- This task provides source-contract, unit, race, persistence-failure, and
  strict-TypeScript evidence. It does not claim live-backend browser,
  deployment, or production acceptance.
- Remote revocation is best-effort by design after terminal local logout or
  storage failure; a network outage cannot block local anonymity.
- No compatibility DTO/parser, optional legacy dashboard field, suppression,
  mock/fake/placeholder, backend change, or Task 8-10 visual rewrite was added.
