# Overdue Appointment Resolution Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the formal `过期预约未处理门禁` setting, transaction-time start gate, immutable overdue resolution, system ratings/notifications, and prepaid settlement/payroll reuse.

**Architecture:** Extend immutable platform settings and the existing BookingOrder authority. Start-service performs the gate under the same serializable transaction; resolution is a participant-authorized, idempotent transaction that reuses fulfillment, ledger, review-summary, finance and payroll authorities.

**Tech Stack:** TypeScript strict mode, Express, Zod, Prisma/MySQL, React/Vite, Jest/Supertest, Vitest.

## Global Constraints

- Default `overdueAppointmentGateEnabled` to `FALSE`; never expose it in public platform settings.
- Do not block booking creation; enforce only later service start.
- Treat `expectedEndsAt` as authoritative when present, otherwise `BookingOrder.endsAt`.
- Do not create revenue/payroll for non-prepaid resolutions.
- Keep NDP and JPY distinct; capture the existing snapshotted platform fee exactly once.
- No 5180 use, push, PR, deployment, SSH, or remote database writes.

---

### Task 1: Persist and publish the operations setting

**Files:**
- Modify: `backend/tests/system-settings-schema.test.ts`
- Modify: `backend/tests/platform-settings.service.test.ts`
- Modify: `backend/tests/platform-settings-api.test.ts`
- Modify: `backend/tests/platform-settings-openapi.test.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260911160000_overdue_appointment_gate/migration.sql`
- Modify: `backend/src/domain/platform-settings.ts`
- Modify: `backend/src/repositories/platform-settings.repository.ts`
- Modify: `backend/src/services/platform-settings.service.ts`
- Modify: `backend/src/validators/platform-settings.validator.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces: `PlatformSettingsRecord.overdueAppointmentGateEnabled: boolean`.
- Produces: strict basic-settings request/response field with existing read/write permissions and version audit.

- [ ] Add failing schema/service/API/OpenAPI assertions for the false default, strict boolean input, version copy, changed-field audit, and public-projection exclusion.
- [ ] Run `npm --prefix backend test -- --runInBand system-settings-schema.test.ts platform-settings.service.test.ts platform-settings-api.test.ts platform-settings-openapi.test.ts`; expect failures naming the missing field.
- [ ] Add the schema column, additive migration, selects/mappers/types, basic update persistence, validation, and OpenAPI property.
- [ ] Re-run the focused tests; expect all selected suites to pass.

### Task 2: Add immutable resolution persistence and rating provenance

**Files:**
- Create: `backend/tests/overdue-appointment-schema.test.ts`
- Modify: `backend/tests/order-review-repository.test.ts`
- Modify: `backend/tests/backoffice-user-review.repository.test.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/migrations/20260911160000_overdue_appointment_gate/migration.sql`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/repositories/backoffice-user-review.repository.ts`

**Interfaces:**
- Produces: `OrderOverdueResolution` unique per order and idempotency key.
- Produces: nullable reviewer only for `OrderReviewAuthorType.SYSTEM`, plus `systemSourceKey` uniqueness.

- [ ] Write failing schema/repository tests for immutable resolution uniqueness, nullable system author, rating `0`, CUSTOMER/TECHNICIAN target mapping, summary inclusion, and amendment exclusion.
- [ ] Run the focused tests and verify they fail because models/fields and behavior are absent.
- [ ] Implement the additive schema/migration and minimum mapping/query changes; reject system-authored rows from amendment.
- [ ] Re-run focused tests; expect all selected suites to pass.

### Task 3: Enforce the transaction-time start gate

**Files:**
- Modify: `backend/tests/order-fulfillment-service.test.ts`
- Create: `backend/tests/overdue-appointment.repository.test.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces: `FulfillmentMutationResult.outcome = "overdue_appointment_blocked"` with `{ orderId, orderNo, serviceName, startsAt, endsAt }`.
- Consumes: active `overdueAppointmentGateEnabled` inside the start transaction.

- [ ] Add failing tests for OFF pass-through; ON user/technician OR-scope; expected-end/fallback semantics; Booking/Request orders; terminal/resolved exclusion; earliest deterministic result; cross-shop narrow projection; and rollback/no side effects.
- [ ] Run the focused tests and verify expected missing-outcome/query failures.
- [ ] Add setting-row and candidate locks after replay and before fulfillment writes; map the repository outcome to stable 409 error data and OpenAPI.
- [ ] Re-run focused tests; expect all selected suites to pass.

### Task 4: Implement resolution, settlement, notification and payroll reuse

**Files:**
- Create: `backend/tests/overdue-appointment.service.test.ts`
- Create: `backend/tests/overdue-appointment-api.test.ts`
- Create: `backend/tests/overdue-appointment-openapi.test.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/payroll-settlement-repository.test.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/repositories/payroll.repository.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces: `POST /api/v1/orders/:id/overdue-resolution`.
- Produces: `{ applied, resolution: { orderId, resolution, serviceName, startsAt, endsAt, resolvedAt } }`.

- [ ] Add failing service/API/OpenAPI tests for participant permission and RBAC, all resolutions, immutable first winner, replay/conflict, notification, audit and error envelopes.
- [ ] Add failing ledger/payroll tests for confirmed prepaid vs non-prepaid, exact one-time 500 NDP snapshot capture, correct bearer/currency, saved compensation basis and no-show payroll eligibility.
- [ ] Run focused tests and verify expected missing-route/method behavior.
- [ ] Implement strict route/controller/service, transactional repository resolution, shared fulfillment-history helpers, system rating/summary, notification/audit, ledger callback and finance/payroll projection.
- [ ] Re-run focused tests; expect all selected suites to pass.

### Task 5: Add customer and technician blocking prompts

**Files:**
- Modify: `src/features/booking/api.ts`
- Create: `src/features/booking/OverdueAppointmentPrompt.tsx`
- Create: `src/features/booking/OverdueAppointmentPrompt.test.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.formal.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `readOverdueAppointmentBlock(error)` and `bookingApi.resolveOverdueAppointment`.
- Produces: shared prompt with three resolution actions and immutable-result display.

- [ ] Add failing API/component/page tests for parsing, date/service copy, all actions, retained idempotency, immutable winner, customer/technician surfaces and five languages.
- [ ] Run the selected Vitest files and verify expected missing-symbol/render failures.
- [ ] Implement the strict client contract, shared prompt, page integration and translations.
- [ ] Re-run selected Vitest files; expect all selected suites to pass.

### Task 6: Guarded integration and closure

**Files:**
- Create: `backend/scripts/check-overdue-appointment-gate-flow.ts`
- Modify: `backend/tests/system-settings-flow-script.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm --prefix backend run check:overdue-appointment-gate-flow` that rejects remote/production databases and restores its local fixture baseline.

- [ ] Add failing checker-contract tests for local target validation, rollback sentinel, ON/OFF, concurrency, cross-shop, prepaid/non-prepaid, rating, notification, audit, ledger and payroll evidence.
- [ ] Implement the guarded checker and document the exact local command and evidence boundary.
- [ ] Run focused backend and frontend suites, then full `npm --prefix backend test`, `npm --prefix backend run lint`, `npm --prefix backend run build`, `npm test`, `npm run lint`, `npm run build`, `npm run i18n:audit`, `npm run i18n:quality`, and `git diff --check`.
- [ ] If a verified local formal env is available, run the guarded checker and confirm rollback restored baseline; otherwise report that database acceptance remains unproved.
- [ ] Review `git diff`, confirm no unrelated files/5180/remote changes, commit the bounded branch, and report `READY_FOR_INTEGRATION` without merging.
