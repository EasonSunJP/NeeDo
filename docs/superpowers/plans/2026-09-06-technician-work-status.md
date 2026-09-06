# Technician Work Status Implementation Plan

> Execute sequential review gates using test-driven development and subagent-driven-development. Continue within approved scope without repeat confirmation.

**Goal:** Persist technician work state, zero-grace attendance incidents, cross-portal status and filterable monthly incident timelines.
**Architecture:** Dedicated Prisma state/events; repository transaction + scoped service/API; shared frontend feature feeding existing portals. Reuse formal booking execution and timeline renderer.
**Tech Stack:** React/TypeScript/Vite; Express/Zod/Prisma/MySQL/Jest.

## Global Constraints
- No grace: compare precise server times; preserve raw timestamps and deviation seconds.
- Formal DB, RBAC, transaction audit, idempotency, pagination. No fake data or automatic financial penalties.
- Preserve existing dirty workspace snapshot; all implementation in isolated worktree.
- Shared contract: `.superpowers/work-status/contract.md`; approved spec: `docs/superpowers/specs/2026-09-06-technician-work-status-timeline-design.md`.

## Task 1: Backend state and incident contract
Files: new backend `technician-work-status` domain/service/repository/validator/controller/routes, worker, tests, migration; scoped additions to app/server/openapi/backoffice/employee projections.
- [x] Write failing domain tests: punctual boundary, one-second lateness, early departure, overnight/split duty and no Availability-only attendance.
- [x] Run `npm --prefix backend test -- --runInBand technician-work-status` and inspect expected failure.
- [x] Implement persisted state and immutable events plus incident dedup, scope gates and precise filters using the contract.
- [x] Add API/service/repository tests for identity isolation, concurrency/version/idempotency, comments, count/list parity and date filters.
- [x] Generate Prisma, run focused tests and backend build/lint; document actual DB verification separately.

## Task 2: Frontend state, timeline and incident details
Files: `src/features/technician-work-status/*`; technician portal, formal detail panels, list mappings and employee panels.
- [x] Write failing date-range, event presentation and API contract tests, plus status button interaction coverage.
- [x] Replace inert status UI with formal request flow, async feedback and early-leave in-app confirmation; service action opens existing booking route.
- [x] Build shared status timeline with persisted comments and precise event messages; use existing ContactEventTimelinePanel with compatible theme variables.
- [x] Add monthly count card and date/type/pagination drawer; support today/7/30 days/week/month/year/custom.
- [x] Wire authoritative statuses into merchant/operations lists and refresh via existing real-time notification/reconnect plus bounded foreground fallback.
- [x] Run focused Vitest and frontend lint/build.

## Task 3: Integration and verification
- [x] Review backend and frontend against approved spec, fix actionable issues and re-run covering tests.
- [x] Verify migration on isolated local MySQL with rollback-safe evidence; do not mutate old attendance history.
- [x] Verify actual listener cwd and proxy, then authenticated technician→merchant→operations status, monthly counts, date filters and timeline desktop/narrow layout.
- [x] Record exact passed/blocked scope and reversible commits; distinguish local implementation, integration, migration and deployment.

## Completion boundary
Implemented and verified in the isolated worktree. The full pre-existing migration chain fails on the unrelated SOS CHECK/FK constraint; both owned migrations and transactional flows passed independently. Shared runtime, remote push and deployment are not changed. See `docs/qa/technician-work-status-20260906/acceptance.md`.
