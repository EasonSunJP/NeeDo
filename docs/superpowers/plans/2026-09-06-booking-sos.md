# Booking SOS Implementation Plan

> For agentic workers: use subagent-driven-development for the backend task and inline integration for the shared frontend, then independent final review. User approved the design on 2026-09-06.

**Goal:** Persist booking SOS requests and display scoped actionable alerts in matching merchant and operations portals.

**Architecture:** A dedicated SOS module owns sender authorization, persistence, scope checks, audit and notifications. A shared React feature owns the sender, alert drawer and backoffice toolbar. Existing order state transitions remain untouched.

**Tech Stack:** React 19, TypeScript, Vite, Express, Prisma/MySQL, Redis/SSE, Jest and Vitest.

## Global constraints

- Preserve all existing unrelated edits; baseline patch saved at `/private/tmp/needo-before-sos-20260906.patch`.
- User revision: always show and allow SOS regardless of service timing/status; keep authorization and booking ownership checks.
- No fake APIs or browser business persistence. Zod, scoped RBAC, atomic audit, pagination and migration required.
- Red gradient capsule with white SOS lettering in the existing mobile header; shared toolbar ordering SOS, language, theme, messages, support.
- Existing five-language support, explicit pending/resolved lifecycle; opening the list never resolves alerts.

## Task 1: backend formal SOS module

Files: new `backend/src/{services,repositories,controllers,routes,validators}/sos.*.ts`, `backend/tests/sos*.test.ts`, Prisma schema/new migration, permissions catalog, OpenAPI and app registration.

Contract under `/api/v1`:

```ts
type SosAvailability = {
  canSend: boolean; serverNow: string; expiresAt: string | null;
  activeAlertId: number | null;
};
type SosAlert = {
  id: number; orderId: number; orderNo: string; shopId: number;
  shopName: string; serviceName: string; senderName: string;
  senderType: 'customer' | 'technician'; status: 'pending' | 'resolved';
  createdAt: string; resolvedAt: string | null; resolvedByName: string | null;
};
// GET /bookings/:orderId/sos-availability => SosAvailability
// POST /bookings/:orderId/sos {idempotencyKey:string} => {alert:SosAlert,replayed:boolean}
// GET /sos-alerts?status=pending|resolved&page=1&page_size=20
//   => {list:SosAlert[],total:number,page:number,page_size:number}
// GET /sos-alerts/count => {pending:number}
// POST /sos-alerts/:alertId/resolve {} => {alert:SosAlert,replayed:boolean}
// Permissions: sos:create, sos:list, sos:resolve
// SSE types: sos.created, sos.resolved (minimal invalidation payload)
```

- [x] Add failing service/API tests for all booking statuses, authority, isolation, idempotency and resolution.
- [x] Run `npm --prefix backend test -- --runInBand --runTestsByPath tests/sos.service.test.ts tests/sos-api.test.ts` and retain expected red evidence.
- [x] Add independent module, schema migration and deployment permissions; generate Prisma.
- [x] Final full backend build after user revision, focused service tests, lint and local MySQL persistence/concurrency proof passed.

## Task 2: frontend sender and shared backoffice controls

Files: `src/features/sos/{api,i18n,BookingSosButton,SosAlertsButton,BackofficeHeaderActions}.tsx/ts` and focused tests; minimal callsite edits in both booking details and both layouts.

- [x] Failing HTTP contract and React interaction tests: always-visible behavior, unavailable status reads, single-click submission, pending button, errors/retry, list opening without resolution, resolve and count refresh.
- [x] Implement API adapter to the Task 1 contract and translated shared UI components.
- [x] Bind actual booking detail header action slots; preserve all other controls.
- [x] Replace duplicated right utility controls with shared toolbar; retain existing navigation destinations and use scoped existing message/support flows.
- [x] Frontend lint/formal build and focused tests passed; morning bundle audit passed. After evening browser layout fix, 41 focused tests and formal build passed again, but current shared-workspace bundle audit reports main JS 12,699 bytes over budget. Record as a release gate; do not raise the budget or claim release acceptance.

## Task 3: integrated verification and review

- [x] Independently review changes against the approved spec, fix actionable findings and rerun only affected checks.
- [x] User explicitly authorized temporary account login; four-role authenticated browser sending, receipt, durable count, cross-portal resolution and cancelled/no-start sending are verified. Shared desktop toolbar and mobile sender/merchant layout verified; narrow toolbar overlap fixed. Matching/nonmatching merchant scope is also proven by the real MySQL checker.
- [x] Verify actual MySQL write, duplicate handling, durable pending count and audited resolution using isolated records with cleanup.
- [x] Document evidence and remaining external limitations; do not conflate local changes with push/deployment/staging acceptance.

Final evidence and build/browser limitations: `docs/qa/2026-09-06-booking-sos.md`.
