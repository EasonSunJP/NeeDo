# Merchant Official Notice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved formal operations/merchant notice list, create, detail, and current-identity inbox surfaces without browser-local or mock authority.

**Architecture:** A typed `officialNotices` frontend adapter consumes the existing platform, merchant, and recipient endpoints through `httpClient`. Shared presentational/workflow components retain the approved operations visual hierarchy while receiving an explicit `platform` or `merchant` scope; layout wrappers, routes, permissions, and navigation keep portal ownership separate.

**Tech Stack:** React 18, TypeScript, React Router, existing `httpClient`, Vitest/Testing Library, Vite, existing Admin/MerchantAdmin components and i18n catalog.

## Global Constraints

- Reuse `docs/superpowers/specs/2026-09-03-portal-backend-notification-boundaries-design.md`.
- Never restore `readStoredOfficialNotices`, `saveStoredOfficialNotice`, bundled update arrays, arbitrary account targeting, attachment upload, or other unimplemented capabilities.
- Merchant creation exposes only `shop_card_holders`, `shop_employees`, and `shop_technicians`; shop and recipients are server-derived.
- Platform and merchant management use separate endpoints and permissions; recipient inbox always uses the current authenticated identity.
- Every visible string uses the existing i18n system; desktop and mobile layouts must have no horizontal overflow.

---

### Task 1: Typed formal notice API adapter

**Files:**
- Create: `src/api/officialNotices.ts`
- Create: `src/api/officialNotices.test.ts`

**Interfaces:**
- Produces: `OfficialNotice`, `RecipientOfficialNotice`, `OfficialNoticePage`, `listManagedNotices(scope, query)`, `createManagedNotice(scope, input)`, `cancelManagedNotice`, `archiveManagedNotice`, `retryManagedNotice`, `listRecipientNotices`, `markRecipientNoticeRead`.

- [ ] Write failing adapter tests that assert platform paths use `/backoffice/official-notices`, merchant paths use `/merchant-admin/official-notices`, recipient reads use `/official-notices`, lifecycle requests carry version/reason/idempotency, and merchant bodies contain no shop or user IDs.
- [ ] Run `npm test -- --run src/api/officialNotices.test.ts` and observe missing-module failure.
- [ ] Implement the adapter with exact backend response shapes and `URLSearchParams`; use only `httpClient.request`.
- [ ] Re-run the focused adapter test and expect all assertions to pass.

### Task 2: Shared formal list, detail, create, and inbox workflows

**Files:**
- Create: `src/features/official-notices/OfficialNoticeManagement.tsx`
- Create: `src/features/official-notices/OfficialNoticeInbox.tsx`
- Create: `src/features/official-notices/OfficialNoticeManagement.test.tsx`
- Modify: `src/pages/admin/AdminNotificationsPage.tsx`
- Modify: `src/pages/admin/AdminNotificationComposePage.tsx`
- Create: `src/pages/merchant-admin/MerchantAdminNotificationsPage.tsx`

**Interfaces:**
- Consumes: Task 1 adapter.
- Produces: `OfficialNoticeManagement({scope, mode})`, `OfficialNoticeInbox`, operations wrappers using `AdminLayout`, and merchant wrappers using `MerchantAdminLayout`.

- [ ] Write failing component tests for loading/empty/error, server pagination, row-to-detail drawer, permission-aware create action, strict merchant audience choices, immediate/scheduled submission, cancel/archive/retry refresh, and inbox mark-read.
- [ ] Run the focused component tests and observe missing-component failures.
- [ ] Implement list/detail with existing `ModuleShell`, `Badge`, `Button`, and `Drawer`; render only persisted payload fields and delivery counts.
- [ ] Implement create with title, summary, supported text blocks, level, allowed audience, timing, and generated idempotency key; platform audience choices remain those supported by the platform API.
- [ ] Implement current-identity inbox and write back `readAt` through the recipient endpoint.
- [ ] Re-run focused component tests and expect pass.

### Task 3: Portal routes, navigation, permissions, and localization

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Create: `src/features/official-notices/OfficialNoticeRoutes.test.tsx`

**Interfaces:**
- Produces routes `/admin/notifications`, `/admin/notifications/compose`, `/merchant-admin/notifications`, `/merchant-admin/notifications/compose`, and `/merchant-admin/notifications/inbox` with existing portal auth plus notice permissions.

- [ ] Replace capability-gate assertions with formal-API assertions and write failing route/navigation permission tests.
- [ ] Run the exact route/layout tests and observe failure.
- [ ] Mount the operations and merchant wrappers with `protectPermission`; convert the merchant header notification control into a real inbox link and add a notice navigation item.
- [ ] Add five-language entries for every new visible string and remove no unrelated translation keys.
- [ ] Re-run route/layout/component tests and expect pass.

### Task 4: Acceptance, review, documentation, and local-main integration

**Files:**
- Modify: `docs/official-notice-delivery.md`
- Create: `docs/verification/2026-09-05-merchant-notice-ui-main-acceptance.md`

- [ ] Run focused frontend tests, `npm run lint`, `npm run build`, and the relevant backend notice tests.
- [ ] Start the verified standard frontend/backend runtimes only after proving listener PID, cwd, branch, proxy origin, and API health.
- [ ] In desktop and mobile browser viewports, verify operations list/create/detail and merchant list/create/detail/inbox against formal APIs; check console errors and horizontal overflow.
- [ ] Request read-only review and fix every Critical/Important finding.
- [ ] Record exact evidence, commit only scoped files, merge latest local `main`, rerun the focused gate, and fast-forward local `main`; do not push or deploy.
