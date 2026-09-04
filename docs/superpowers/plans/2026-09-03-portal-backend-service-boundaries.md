# Portal Backend Service Boundaries Implementation Plan

> **Execution rule:** Complete only this service-boundary microstep. Do not add merchant employees, merchant notice publishing, audience resolution, or database migrations here.

**Goal:** Run operations administration and merchant administration through independently identifiable API processes while retaining the current compatibility API for client portals and workers.

**Architecture:** The existing `createApp` remains the compatibility surface. Two wrappers create `ops-api` and `merchant-api` applications from explicit route ownership manifests. A fail-closed admin-surface guard prevents a mixed legacy route module from exposing the opposite administration namespace. Each service signs and verifies JWTs with its own audience and uses its own configured Redis logical database. The frontend selects a same-origin API prefix from the current portal, and Vite proxies those prefixes to distinct local listeners.

**Tech stack:** Express, TypeScript, Zod, Redis, JWT HMAC, Vite, Jest/Supertest, Vitest.

---

## Task 1: Lock the application and route boundary contract

**Files:**

- Create: `backend/tests/portal-api-apps.test.ts`
- Create: `backend/src/apps/api-route-manifest.ts`
- Create: `backend/src/apps/ops-app.ts`
- Create: `backend/src/apps/merchant-app.ts`
- Modify: `backend/src/app.ts`

1. Write failing Supertest assertions that `ops-api` and `merchant-api` report different service names.
2. Assert that the merchant app returns the normal 404 envelope for a representative `/backoffice` route before authentication or repository access.
3. Assert that the operations app does the same for a representative `/merchant-admin` route.
4. Assert the exported route manifests are explicit and differ.
5. Run `npm test -- portal-api-apps.test.ts` from `backend/` and record the expected RED result.
6. Add the smallest app options, route ownership manifest, wrappers, and fail-closed cross-admin guard needed to make the test GREEN while keeping `createApp()` behavior unchanged.

## Task 2: Bind tokens to the service audience

**Files:**

- Create: `backend/tests/auth-token-audience.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/services/auth-token.service.ts`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/.env.dev.example`

1. Write a failing test proving a token issued for `needo-ops-api` is rejected by `needo-merchant-api`, and vice versa.
2. Add required `AUTH_TOKEN_AUDIENCE` configuration with a compatibility default only in checked-in local/test examples.
3. Add the standard JWT `aud` claim to access and refresh tokens and verify it on every decode.
4. Run the focused audience and existing authentication tests.

## Task 3: Add independent listeners and local runtime configuration

**Files:**

- Create: `backend/src/api-server.ts`
- Create: `backend/src/ops-server.ts`
- Create: `backend/src/merchant-server.ts`
- Modify: `backend/package.json`
- Modify: `scripts/dev-formal-config.mjs`
- Modify: `scripts/dev-formal-config.test.mjs`
- Modify: `scripts/dev-formal.mjs`

1. Extend the launcher-config test first so it expects compatibility, operations, merchant, and frontend ports plus distinct Redis URLs.
2. Use configurable defaults `3000`, `3001`, and `3002`; reject duplicate ports and identical Redis logical URLs for the two admin services.
3. Add a shared listener lifecycle with graceful Prisma/Redis disconnect and no background workers.
4. Keep workers in the compatibility backend only.
5. Start the two new listeners with service-specific `SERVICE_NAME`, `AUTH_TOKEN_AUDIENCE`, `PORT`, and `REDIS_URL` environment values.

## Task 4: Route each admin frontend to its service

**Files:**

- Create: `src/api/portalApiBaseUrl.ts`
- Create: `src/api/portalApiBaseUrl.test.ts`
- Modify: `src/api/httpClient.ts`
- Modify: `vite.config.ts`
- Modify: `vite.config.test.ts`
- Modify: `src/vite-env.d.ts`

1. Write failing tests for these defaults:
   - operations admin -> `/ops-api/v1`
   - merchant admin -> `/merchant-api/v1`
   - every other portal -> `/api/v1`
2. Write failing Vite proxy tests proving the two prefixes target distinct listeners and rewrite to `/api/v1`.
3. Implement portal-aware base URL resolution with explicit `VITE_OPS_API_BASE_URL` and `VITE_MERCHANT_API_BASE_URL` overrides.
4. Preserve the existing per-request `baseUrl` override and compatibility behavior.

## Task 5: Verification and handoff

**Files:**

- Modify: `README.md`

1. Document the three-process local topology, environment variables, shared MySQL, distinct Redis logical URLs, and compatibility boundary.
2. Run focused backend tests, focused frontend tests, backend lint/build, frontend lint/build.
3. Start the formal runtime and verify listener PID/cwd/branch for ports 3000, 3001, 3002, and 5180.
4. Verify `/api/v1/health` on each backend and confirm service names are `needo-backend`, `needo-ops-api`, and `needo-merchant-api`.
5. Browser-check operations and merchant login separately. Confirm each uses its portal API prefix and cannot access the opposite admin namespace.
6. Commit this microstep on `codex/portal-backend-service-boundaries`. Do not merge, push, deploy, or claim notification delivery/data consistency acceptance in this step.
