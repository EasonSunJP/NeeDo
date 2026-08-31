# Task 7 Third Independent Review Fix Report

## Scope and outcome

This follow-up addresses the third independent review of Task 7 on top of
`92e4ef5d`. It changes only frontend authentication/session persistence,
strict auth API validation, merchant dashboard ownership, bounded resource
handling, and their tests. It does not change backend code, OpenAPI,
Prisma/schema, Task 8-10 visual pages, deployment, or remote state.

## Single persisted authentication authority

- Browser authentication authority is now one versioned local-storage value:
  `needo.auth.envelope.v8`. The strict `PersistedAuthEnvelopeV8` is either a
  complete committed session or an anonymous tombstone.
- A committed envelope contains `schemaVersion: 8`, `authInstanceId`, the
  committed credential version, refresh token, strict auth session, and the
  remembered authorization map. Access tokens are memory-only and are never
  persisted.
- Startup reads only a strictly valid V8 envelope. Legacy refresh/session,
  portal, and remembered-auth keys are not an authentication fallback and
  cannot become runtime authority.
- Login, registration verification, Google authentication, restore, refresh,
  and rotation construct the complete next envelope and perform one
  `localStorage.setItem`. Coordinator credentials and React session state are
  published only after that atomic browser write succeeds.
- If the server has already rotated credentials and the envelope write fails,
  runtime fails closed and best-effort revokes the returned credentials. The
  previous envelope remains the only durable value and contains the already
  consumed old refresh token; no multi-key rollback can resurrect the new
  session.
- Logout immediately makes the running application anonymous and invalidates
  the credential generation. Durable logout is confirmed by either one
  anonymous tombstone write or successful server revocation. If browser
  persistence and remote revocation both fail, logout returns
  `error.auth.durable_logout_unconfirmed` while runtime remains anonymous.
  A frontend alone cannot guarantee anonymous state after reload across that
  simultaneous storage/network failure boundary.
- Remembered portal updates transform and rewrite the whole envelope once;
  the envelope module is the only browser auth writer/reader.
- Every committed/tombstone write now supplies the expected durable state,
  auth instance, and credential version. A stale tab cannot replace a newer
  envelope, a different auth instance, or an anonymous tombstone. A storage
  event terminates the old tab's memory credentials/session immediately.
- All five production logout callers await the durability result and navigate
  only on success. The double-failure result is also recorded as the Provider
  auth error instead of being silently discarded.

## Strict backend auth contracts

- Password and Google authenticated token DTOs contain only backend token
  fields. Extra `me` payloads are rejected and cannot supply client RBAC or
  identity authority.
- Every token-producing login, registration, or Google success performs a
  caller-owned `/auth/me` request with the newly issued access token before a
  session can be constructed or persisted.
- Runtime parsers use exact-key validation, exact access TTL `900`, strict
  RFC 3339 calendar/date-time validation, safe numeric IDs, formal public-ID
  patterns, unique identities, and full equality between the selected
  identity and its identities-list entry.
- Both Google result branches use exact union validation. A
  `verification_required` response carrying any extra access/refresh token is
  rejected as a rotated response, revoked by Provider, and never exposed as a
  successful challenge.
- Switch results require the trusted expected user, expected current
  identity, and requested merchant shop. Malformed rotated responses retain
  any valid returned refresh-token candidate for best-effort revocation,
  including refresh-only malformed responses; they are never persisted.
- HTTP 401 handling occurs before JSON, CSV, data-URL, or binary body parsing,
  so credential-version retry/supersession semantics are consistent across
  response types.

## Merchant dashboard ownership and resource bounds

- Layout dashboard state is owner-tagged as `{ ownerKey, payload }`. Context,
  header, and rendering expose a payload only while its owner equals the
  current authenticated epoch/user/identity/shop owner. Switching from an
  already resolved shop A to pending shop B therefore exposes no A payload.
- Owner changes synchronously abort the prior dashboard and manageable-shop
  requests. Manageable shop pagination passes `AbortSignal`, checks safe
  integer `total`, `page`, and `page_size`, requires the exact requested page
  and page size, bounds page scanning, validates list length/fields, and can
  select a server-confirmed shop on a later page.
- Dashboard cache reads, retries, and commits recheck the current credential
  epoch and signed scope. In-flight entries count toward the 32-entry LRU;
  excess oldest work is aborted instead of allowing hung requests to grow the
  cache without bound.

## TDD evidence

RED cases were observed for missing V8 envelope authority, atomic write
failure, tombstone/revocation durability boundaries, legacy-only reload,
extra login `me`, mandatory `/auth/me`, refresh-only malformed rotation,
owner A to pending owner B visibility, later-page manageable selection,
owner abort, response pagination invariants, in-flight LRU eviction, and
pre-parse JSON/CSV/binary 401 handling. Each was made GREEN within the Task 7
scope.

The post-commit blocker review added four further RED failures: a stale
committed authority overwriting a tombstone, another tab's storage event not
terminating local credentials, a double-failure logout not recording its
durability error, and a token-bearing Google challenge being accepted. The
four production boundaries are covered by GREEN tests.

Fresh expanded command:

```bash
npm test -- src/api/backofficeDashboard.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts src/features/merchant-admin/dashboardResource.test.ts src/api/httpClient.test.ts src/auth/rbac.test.ts src/auth/portalAuthorization.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/auth/authCredentialCoordinator.test.ts src/pages/auth/LoginPage.test.ts src/auth/authEnvelope.test.ts src/features/settings/UnifiedSettingsPages.test.ts
```

Final result: 12 test files passed and 270 tests passed.

## Static verification

- Target ESLint passed for every Task 7 changed source and test file using
  `backend/eslint.config.mjs`.
- Target Prettier passed for the Task 7 auth/API/session/resource sources and
  tests. Three pre-existing legacy UI files touched only to await logout
  (`AdminAccountMenu.tsx`, `CpsSidebar.tsx`, and
  `UnifiedSettingsPages.tsx`) remain globally nonconforming under whole-file
  Prettier; they were not mechanically reformatted because that would add a
  1,700-line unrelated visual/settings diff. Their changed logout hunks are
  minimal and `git diff --check` clean.
- `git diff --check` passed.
- Full `npm run lint` remains the planned Task 9/10 sequence gate with exactly
  66 TypeScript errors in only the four untouched pages below.

| Deferred page                                             | Errors |
| --------------------------------------------------------- | -----: |
| `src/pages/admin/AnalyticsPage.tsx`                       |     16 |
| `src/pages/admin/DashboardPage.tsx`                       |     14 |
| `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx` |     17 |
| `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx` |     19 |

No Task 7 source/test or logout caller appears in the strict TypeScript
output. No deferred page was changed. Full lint and production build must
return to green after Tasks 8-10 migrate those planned consumers.

## Remaining boundary and exclusions

- The simultaneous permanent browser-write failure plus unreachable server
  logout boundary is explicitly surfaced as durable logout unconfirmed; the
  current runtime still stays anonymous.
- This evidence covers source contracts, unit behavior, race boundaries,
  persistence failure, ownership, and strict TypeScript. It does not claim
  live-backend browser, deployment, or production acceptance.
- No compatibility DTO/parser, legacy auth fallback, optional dashboard
  compatibility field, suppression, mock/fake/placeholder, backend change, or
  Task 8-10 visual rewrite was added.
