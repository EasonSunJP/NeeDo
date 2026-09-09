# Technician Booking and Request Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the technician's existing formal calendar intact while adding persisted Booking auto-accept and Request auto-apply settings that reuse the existing order and Exchange claim state machines.

**Architecture:** A single versioned technician-automation setting model stores validated rule JSON for `booking` and `request`; an append-only decision log records every attempted automatic action. Authenticated technician settings routes expose read/update/contact-option APIs, while a shared evaluator and processor call the existing `BookingService.transitionOrder` and `ExchangeClaimService.createClaim` authorities after formal Booking/Request creation. The schedule page owns the three visible tabs and renders focused settings panels without changing the calendar branch.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma/MySQL, Vitest/Jest/Supertest.

## Global Constraints

- Preserve the existing `UnifiedUserCalendar` schedule, timeline, search, date navigation, cards, and formal API data.
- Do not add mock, demo, placeholder, browser-local persistence, parallel booking state, parallel Exchange claim state, or parallel NDP math.
- All enabled user conditions use AND semantics; missing evidence fails safe to manual handling and never auto-rejects a Booking.
- Settings are server-authoritative, versioned, audited, and protected by authenticated technician identity plus RBAC.
- Keep all work local, do not use port 5180, and do not push or deploy.

---

### Task 1: Persist versioned automation settings and decision logs

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260909090000_technician_order_automation/migration.sql`
- Create: `backend/src/validators/technician-automation.validator.ts`
- Test: `backend/tests/technician-automation-schema.test.ts`
- Test: `backend/tests/technician-automation-validator.test.ts`

**Interfaces:**
- Produces `TechnicianAutomationKind`, `TechnicianAutomationSetting`, `TechnicianAutomationDecisionLog`.
- Produces `technicianAutomationRulesSchema` with bounded time windows, numeric thresholds, source/contact selectors, service IDs, payment methods, and optimistic `expectedVersion`.

- [ ] Write schema and validator tests that require two settings per technician, immutable rule-version logging, unique action idempotency, soft-delete timestamps, and invalid-range rejection.
- [ ] Run the focused tests and verify they fail because the model and validator do not exist.
- [ ] Add the Prisma models/migration and Zod schemas with no placeholder fields.
- [ ] Re-run the focused tests and Prisma validation until green.

### Task 2: Add authenticated settings API, contacts, optimistic locking, and audit

**Files:**
- Create: `backend/src/repositories/technician-automation.repository.ts`
- Create: `backend/src/services/technician-automation.service.ts`
- Create: `backend/src/controllers/technician-automation.controller.ts`
- Create: `backend/src/routes/technician-automation.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/technician-automation.service.test.ts`
- Test: `backend/tests/technician-automation-api.test.ts`
- Test: `backend/tests/technician-automation-openapi.test.ts`

**Interfaces:**
- Produces `GET /api/v1/technician/automation-settings/:kind`.
- Produces `PUT /api/v1/technician/automation-settings/:kind` with `{ enabled, expectedVersion, rules }`.
- Produces paginated `GET /api/v1/technician/automation-settings/contacts` scoped to the current technician's real IM friends.

- [ ] Write failing service/API/OpenAPI tests for technician scope, defaults, persistence, version conflict, validation, contact pagination, permission declarations, and audit metadata.
- [ ] Run the focused tests and verify expected missing-route/service failures.
- [ ] Implement repository, service, controller, routes, permissions, and OpenAPI using the standard response envelope.
- [ ] Re-run focused tests until green.

### Task 3: Evaluate rules and invoke existing Booking/Request authorities

**Files:**
- Create: `backend/src/domain/technician-automation-rules.ts`
- Create: `backend/src/services/technician-automation-processor.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/controllers/exchange.controller.ts`
- Modify: `backend/src/routes/exchange.routes.ts`
- Test: `backend/tests/technician-automation-rules.test.ts`
- Test: `backend/tests/technician-booking-automation.test.ts`
- Test: `backend/tests/technician-request-automation.test.ts`

**Interfaces:**
- Produces `evaluateTechnicianAutomationRules(kind, rules, context)` returning matched condition keys and fail-safe reason codes.
- Produces idempotent processors keyed by `booking:{orderId}:{technicianId}:accept` and `request:{postId}:{technicianId}:apply`.
- Consumes the existing `BookingService.transitionOrder(..., "confirm")` and `ExchangeClaimService.createClaim(...)` methods; no order, claim, hold, or notification mutation is duplicated.

- [ ] Write failing pure-rule tests for AND semantics, schedule windows, lead/buffer time, region/distance, amount, customer history/eKYC/source, order traits, payment, service, online state, and missing-data fail safe.
- [ ] Write failing processor tests proving match calls the existing authority once, mismatch logs but performs no action, Booking remains pending on mismatch, Request remains user-selected, and retries are idempotent.
- [ ] Implement the evaluator, repository projections, decision logging, and post-create processor hooks.
- [ ] Re-run focused tests until green.

### Task 4: Replace the second schedule tab with two real settings panels

**Files:**
- Create: `src/features/technician-schedule/automation-api.ts`
- Create: `src/features/technician-schedule/TechnicianAutomationSettingsPanel.tsx`
- Create: `src/features/technician-schedule/TechnicianAutomationSettingsPanel.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.approved-ui.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Changes `WorkspaceTab` to `calendar | bookingSettings | requestSettings`.
- Keeps `tab="calendar"` rendering the unchanged `UnifiedUserCalendar` and status timeline.
- Settings panels load and save only through the formal `/api/v1/technician/automation-settings` API and expose dirty-leave confirmation.

- [ ] Write failing route/workspace/component tests for exactly three visible tabs, TEST badges, independent info triggers, preserved calendar, server read/write, validation, unsaved-leave confirmation, and Request's non-auto-deal explanation.
- [ ] Run the focused frontend tests and verify the missing tabs/panels fail.
- [ ] Implement the tab labels, lightweight info UI, responsive settings forms, fixed save dock, formal API client, and translated copy.
- [ ] Re-run focused frontend tests until green.

### Task 5: Batch verification, local merge, and cleanup

**Files:**
- Modify: `docs/api.md`
- Modify: `README.md`

- [ ] Document the two settings endpoints, fail-safe behavior, and local-only acceptance commands.
- [ ] Run Prisma generation/validation, backend lint/typecheck/tests, frontend focused tests, root lint/typecheck/build, and source scans for forbidden mocks/placeholders.
- [ ] If a local runtime is needed, check an unused port such as 5181/5182/5183/5190/5200 before launch and leave 5180 untouched.
- [ ] Commit the complete batch on `codex/technician-auto-order-request-settings`.
- [ ] Merge locally into `main` without pull/push, repeat the verification on `main`, then delete only the fully merged local branch; leave unrelated worktrees unchanged.
