# Service Detail Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the false service review summary with a paginated, public-safe list of persisted reviews and remove the service page's dark edge masks.

**Architecture:** Extend the existing Core Read route-controller-service-repository chain with a service-scoped review list. Keep presentation mapping in the user frontend and keep all review truth in Prisma-backed API results.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma, Jest, Supertest.

## Global Constraints

- Work only on `codex/service-detail-reviews` until verification and commit are complete.
- Do not use, inspect, stop, restart, or reconfigure port 5180.
- Do not add mock, demo, placeholder, fake API, or fabricated review data.
- Do not push, open a PR, deploy, or modify staging/production.

---

### Task 1: Public service review contract

**Files:**
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/controllers/core-read.controller.ts`
- Modify: `backend/src/routes/core-read.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/core-read.repository.test.ts`
- Test: `backend/tests/core-read-api.test.ts`

**Interfaces:**
- Consumes: `coreReadServiceIdParamSchema`, Prisma `OrderReview`, `BookingOrder`, `MediaAsset`, and standard pagination helpers.
- Produces: `listServiceReviews(id, input)` and `GET /api/v1/services/:id/reviews?page=1&pageSize=20` returning `PaginatedResponse<ServiceReviewPayload>`.

- [ ] Write repository tests for completed service bookings, effective amendments, public reviewer fields, active media, newest-first ordering, and pagination.
- [ ] Run `npm test -- --runInBand --runTestsByPath tests/core-read.repository.test.ts` and confirm the new test fails because `listServiceReviews` is missing.
- [ ] Implement `ServiceReviewPayload`, Prisma selectors, service existence check, review query/count, amendment projection, media batching, and pagination mapping.
- [ ] Run the repository test and confirm it passes.
- [ ] Write API tests for numeric/UUID service IDs, pagination validation, public-safe payload, and unpublished/missing service 404.
- [ ] Run the API test and confirm the new route fails with 404.
- [ ] Add validated route, controller, service method, and OpenAPI schemas/path.
- [ ] Run both backend targeted suites and confirm they pass.

### Task 2: Service review card UI and mask removal

**Files:**
- Modify: `src/features/core-read/api.ts`
- Modify: `src/pages/user/ServiceDetailPage.tsx`
- Test: `src/features/core-read/api.test.ts`
- Test: `src/pages/user/ServiceDetailPage.test.ts`

**Interfaces:**
- Consumes: `GET /services/:id/reviews`, `CoreServiceReview`, `PaginatedCoreReadData`.
- Produces: `coreReadApi.listServiceReviews`, a service review section whose badge equals API `total`, and cards with avatar/name/date/bubble/title/comment/images/rating.

- [ ] Write frontend API and source/render tests for the review request, actual total, requested information order, empty/error states, and mask removal.
- [ ] Run the targeted Vitest files and confirm failures identify the missing API method and old summary markup.
- [ ] Add review types/API method and implement the card/list states with existing client theme tokens and responsive image grid.
- [ ] Remove the service page's `ClientEdgeMask` and override only its header panel to remove the dark glass fill and blur.
- [ ] Run the targeted Vitest files and confirm they pass.

### Task 3: Verification, commit, local main integration, and cleanup

**Files:**
- Modify only files already named above if verification reveals an in-scope regression.

**Interfaces:**
- Consumes: committed feature branch and verified local main reference.
- Produces: one coherent local commit, a locally merged main commit, and no discarded user work.

- [ ] Run frontend targeted tests and full `npm test`.
- [ ] Run backend targeted tests and the relevant complete Core Read suite.
- [ ] Run `npm run lint`, `npm run build`, backend lint, backend typecheck/build as available.
- [ ] Start only an unused allowed frontend port such as 5181 and perform mobile browser acceptance; stop only that process.
- [ ] Inspect `git diff`, scan changed files for forbidden placeholders, and commit the feature.
- [ ] Integrate into local main without touching the 5180 runtime directory, verify the merged commit in a separate worktree, then remove only the worktree/branch proven safe.
