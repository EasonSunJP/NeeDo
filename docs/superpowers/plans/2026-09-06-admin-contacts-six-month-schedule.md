# Admin contacts and six-month schedules Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with verification between steps.

**Goal:** Complete both admins' three identity contact books and two shops' six-month 24-hour staffing locally, then deploy the verified release and scoped data to staging.

**Architecture:** Reuse formal Prisma entities and identity boundaries. A deterministic, audited maintenance dataset adds only missing test-account relationships and schedule records, with a dry-run, manifest, idempotence check and scoped rollback. UI repairs retain existing shared schedule components.

**Tech Stack:** React/TypeScript/Vite; Express/Prisma/MySQL; existing AWS staging release tooling.

## Global constraints

- User authorized local writes first and staging version/data deployment after all local work passes.
- Preserve unrelated dirty work, existing contacts, credentials, bookings and financial records.
- Each of the six identities needs at least 20 customer, more than 20 technician and 5 merchant contacts from active test accounts.
- Window: 2026-09-06 00:00 JST through 2027-03-06 00:00 JST, end exclusive; each shop needs at least 10 staff continuously.
- No mock API, auth/RBAC bypass, invented avatars or unrelated seed execution.

## Sequential microsteps

- [x] Add failing plan tests for identity-specific contacts, distinct staff pools, daily continuous coverage, overnight boundaries and hard booking conflicts.
- [x] Implement scoped plan and audited apply/inspect/rollback maintenance command under backend/src/simulation and backend/scripts. Dry-run and review counts; apply local only, then verify idempotence and persisted coverage.
- [x] Reproduce and fix any missing affiliated-technician avatars/roster or schedule data issues using shared UI and failing regression tests.
- [ ] Verify authenticated local contacts across six identities, both shop schedules, build/lint and focused API/UI tests. Record listener cwd/proxy and use the correct served source.
- [ ] Inspect current staging revision, schema, scoped destination account mapping and release tooling. Build a reviewable release, back up affected data, deploy version and scoped dataset using stable account identifiers rather than local numeric IDs.
- [ ] Verify staging HTTPS/readiness plus authenticated six-identity contacts, both schedules and deployed assets. Record rollback references and final exact counts.

Current checkpoint: local rows written, approved 53 affiliation conversions applied (audit 9748/9749), and full formal API/coverage checks passed; browser login and correct AWS account session are pending. See docs/qa/2026-09-06-admin-contacts-six-month-schedule.md.
