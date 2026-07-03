# Static Functional Gap Audit — 2026-06-07

> Scope: current NeeDo static/demo surface plus the formal backend slices already present in this repository.
> Goal: identify functional gaps and risks without changing the online static-page default behavior.

## Executive Summary

The static version has high presentation coverage: user app, merchant mobile, technician mobile, platform admin, merchant admin, IM, Social, dine-in, Afirieito/CPS, scheduling, finance, payroll, settings, and data-center surfaces are all routed through the current React/Vite app.

It is not yet a fully formal product runtime. The main gap is not missing screens; it is that multiple workflows still rely on static data, browser storage, browser-side API interception, or compatibility fallbacks while only selected backend slices have been formalized.

## Current Formal Backend Coverage

Formal backend code now exists under `backend/` and includes:

- Auth / OTP / JWT / refresh / logout / `/auth/me`.
- User / Role / Permission APIs with RBAC middleware.
- Core read APIs for home recommendations, categories, search, services, shops, technicians, and customer profiles.
- Booking / schedule availability / order state-machine APIs.
- NDP ledger, fee calculation, finance reconciliation, order finance, merchant finance rules, compensation profiles, payroll, and backoffice/merchant-admin real-data APIs.
- Realtime API slices for IM/Social/Notification foundations.
- Prisma schema and migrations through the Step 12 finance/payroll slices.

## Static Demo Boundary

`src/api/staticDemo.ts` remains the browser-side static-demo adapter. Default static builds use:

```text
VITE_NEEDO_STATIC_DEMO=true
```

Default behavior remains permissive so the current online static pages keep rendering. Unknown static-demo API paths still fall back to an empty object or empty paginated list.

For local acceptance only, enable:

```text
VITE_NEEDO_STATIC_DEMO_STRICT=true
```

With strict mode enabled, known static-demo endpoints still return static data, but unknown paths fall through to the real request. This is meant to reveal missing API coverage during development and should not be enabled for the current online static demo without a dedicated QA pass.

## Functional Gaps

### P0 — Auth / Session / Permission Retirement

- Formal backend auth exists, but frontend still keeps compatibility session state and preview bypass behavior.
- `demoAccount`, static feature permissions, and frontend-only portal switching still need controlled retirement.
- Provider login and QR login remain unavailable paths rather than formal integrations.

### P1 — Booking / Orders / Schedule Formal Acceptance

- Booking APIs and state-machine tests exist.
- This slice now prevents customer actors from listing, reading, or transitioning other customers' orders.
- Merchant/shop-specific scope should still be narrowed in the merchant-admin API slice so merchant actors only operate on their current shop.
- Frontend checkout/orders still keep legacy local/demo fallback for nonnumeric/static ids.

### P2 — Backoffice And Merchant Admin Real-Data Completion

- Finance, payroll, dashboard/order/settlement/technician/shop read APIs exist.
- Some admin and merchant-admin surfaces still import `src/data/mock.ts` or use local stores.
- Scheduling UI has formal schedule APIs available, but the existing dispatch/schedule workspaces still need data-source switching and acceptance.

### P3 — IM / Social / Notification Formalization

- Static IM and Social experiences are rich enough for demos.
- They still depend on browser-side state/interception and local persistence for important user-visible behavior.
- Realtime backend slices exist, but full message/contact/post/follow/notification backend ownership and delivery semantics remain future work.

### P4 — Dine-in, Shop Member, Afirieito/CPS

- Dine-in QR/session/menu/order, shop-member cards/ledger-like flows, and Afirieito/CPS commission/settlement screens still behave as local/static product lanes.
- These flows should not be treated as audited financial or operational systems until their owning backend/API slices are completed.

### P5 — Performance And Bundle Risk

- Static build currently succeeds, but large chunks remain a launch-readiness concern.
- The app still ships a large all-in-one route surface, including i18n and many portal modules.
- Code-splitting should be handled as a later Step 14/performance slice, not mixed into mock retirement or security fixes.

## Current Risk Controls Added In This Slice

- Customer order list scope is enforced server-side from the authenticated actor.
- Customer order detail and transition attempts for another customer's order now return `error.order.not_found`.
- Static-demo strict mode is opt-in and tested, so current static online usage is not changed by default.

## Suggested Next Micro-Steps

1. Merchant-admin order scope hardening: bind merchant order actions to the current `shop` identity, then add API tests.
2. Static strict-mode acceptance pass: run selected critical routes with `VITE_NEEDO_STATIC_DEMO_STRICT=true` locally and list missing API/static adapters.
3. Backoffice/merchant scheduling data-source switch: connect one dispatch-center read view to the existing formal schedule API.
4. IM/Social backend ownership plan: choose the smallest non-realtime REST slice before opening WebSocket/SSE behavior.

## Non-Goals

- No new mock source is introduced.
- No static online default is changed.
- No database schema or migration is changed in this slice.
- No route, portal entry, or frontend visual structure is refactored.
