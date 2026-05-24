# Current Architecture Audit

> Step 01 audit date: 2026-05-25  
> Scope: repository audit and baseline protection only. No business code, database schema, mock replacement, or UI refactor was performed.

## 1. Required Reading

The Step 01 audit was based on the current repository files below:

- `README.md`
- `AGENTS.md`
- `docs/00_MASTER_MICRO_STEP_PLAN.md`
- `docs/01_REPO_AUDIT_AND_BASELINE.md`
- `docs/User Management.md`

`docs/User Management.md` was included because the audited baseline includes current auth, login, role, and permission boundaries.

## 2. Actual Technology Stack

NeeDo is currently a React / TypeScript / Vite frontend application with a local mock backend helper. It is not a Vue / Pinia / Element Plus project and must not be migrated as part of later steps unless explicitly requested.

| Area | Current state |
|---|---|
| App framework | React `19.1.1`, React DOM `19.1.1` |
| Routing | `react-router-dom` `7.9.4`, `HashRouter` mounted in `src/main.tsx` |
| Language | TypeScript `5.9.3`, build driven by `tsc -b` |
| Build tool | Vite, configured in `vite.config.ts` |
| Styling | Tailwind CSS `3.4.17`, shared CSS in `src/styles.css`, client/admin theme tokens |
| Tests | Vitest `4.1.4` |
| Backend | No independent real backend yet. `scripts/mock-backend.mjs` is a local mock/health helper only |
| Persistence | Browser `localStorage` through `src/lib/browserStorage.ts` plus some direct `window.localStorage` usage |
| i18n | `src/i18n/I18nProvider.tsx` and `src/i18n/translations.ts` |

## 3. Package Scripts And Runtime Commands

| Script | Current command | Baseline meaning |
|---|---|---|
| `npm run dev` | `npm run dev:all` | Starts or reuses frontend plus local mock backend |
| `npm run dev:frontend` | `vite --host 0.0.0.0` | Starts Vite frontend, default port `5180` |
| `npm run dev:backend` | `node scripts/mock-backend.mjs` | Starts local mock backend helper, default port `4176` |
| `npm run dev:all` | `node scripts/dev-all.mjs` | Probes ports and starts/reuses both services |
| `npm run build` | `tsc -b && vite build` | Type-checks and builds all portal entries |
| `npm run lint` | `tsc -b --noEmit` | TypeScript baseline check |
| `npm test` | `vitest run` | Unit/model/component test suite |
| `npm run preview` | `vite preview --host 0.0.0.0` | Serves built multi-entry bundle |

`vite.config.ts` sets both dev and preview default ports to `5180`. `scripts/mock-backend.mjs` uses `MOCK_BACKEND_PORT` or `4176`.

## 4. Entrypoints And Portal Boundaries

The app is a multi-entry Vite app. Each HTML entry mounts the same React application and routes through `HashRouter`.

| Entry file | Primary portal / route family | Notes |
|---|---|---|
| `index.html` | Default user route | General app entry |
| `user.html` | User app | User-facing mobile web/PWA entry |
| `merchant.html` | Merchant mobile portal | `/merchant`, `/login/merchant` |
| `technician.html` | Technician mobile portal | `/technician`, `/login/technician` |
| `afirieito.html` | Afirieito / business CPS portal | `/afirieito`; legacy `/business` and `/cps` redirect to this family |
| `pf-admin.html` | Platform operations admin | `/admin`, `/login/admin` |
| `store-admin.html` | Merchant admin desktop surface | `/merchant-admin`, `/login/merchant-admin` |
| `afirieito-admin.html` | NDA / Afirieito admin | `/NDA-admin`; legacy CPS/admin aliases redirect here |

Important routing files:

- `src/main.tsx` mounts React and `HashRouter`.
- `src/App.tsx` owns the central route table, auth gates, feature permission gates, splash behavior, and portal redirects.
- `portal-entry.js` resolves direct URL visits, legacy portal aliases, built `dist/` redirects, and document titles.
- `vite.config.ts` defines the multi-page Rollup input and local dev/preview HTML fallback for portal routes.

## 5. Directory Baseline

| Directory | Current ownership |
|---|---|
| `src/pages/user` | User app pages: home, category, service/store/profile detail, checkout, orders, messages, contacts, settings |
| `src/pages/mobile` | Mobile portal pages for merchant, technician, Afirieito, NeeDo exchange, merchant order routes, schedule cell routes |
| `src/pages/admin` | Platform operations admin: dashboard, analytics, data center, orders, CRM, finance, reviews, roles, merchants, notifications, Afirieito admin bridge |
| `src/pages/merchant-admin` | Merchant admin desktop pages and nested dispatch/store-ops routes |
| `src/pages/auth` | User/admin login pages that currently depend on demo auth |
| `src/features/im` | IM domain model, seed data, frontend mock API interception, pages, UI store |
| `src/features/social` | Social timeline/posts/profile context, persistence, and pages |
| `src/features/dispatch-center` | Merchant dispatch/scheduling state, API facade, grid components, automation/smart schedule data |
| `src/features/technician-schedule` | Technician schedule domain and route pages |
| `src/features/dine-in` | Dine-in menus, QR/session/order state, customer/merchant route pages |
| `src/features/shop-member` | Shop member/card/finance-like membership model, permissions, seed, service, local store |
| `src/features/business-cps` | Afirieito/CPS model, logic, commission, tracking, settlement-like runtime state |
| `src/features/settings` | Shared settings pages and per-portal settings local state |
| `src/state` | Cross-page local stores backed by `localStorage` and seed/mock data |
| `src/shared` | Shared profile card, profile detail, info card, and order detail components |
| `src/components` | UI, mobile shells, admin layouts, scheduling widgets, CPS sidebar, client settings scaffolds |

## 6. Current Auth And Permission Boundary

The current auth layer is demo/local only:

- `src/auth/demoAccount.ts` contains demo credentials, demo verification code, and linked entity IDs.
- `src/auth/AuthProvider.tsx` stores `needo.auth.session` in browser storage and validates against `demoAuthAccount`.
- `src/auth/featurePermissions.ts` contains a static frontend permission list. Most current protected routes only check portal access; selected merchant-admin routes check static feature permissions.
- There is no JWT, refresh token, Redis session, `/api/v1/auth/me`, backend RBAC middleware, or real permission API yet.

This makes User Management, Auth, RBAC, and admin/user identity the first high-risk boundary for later Steps 04-07.

## 7. Mock And Local State Boundaries

The repository still relies on legacy frontend data and browser persistence:

- `src/data/mock.ts` is the central entity/operations mock source for customers, stores, technicians, services, orders, settlements, reviews, campaigns, cities, inventory, permissions, and media.
- `src/state/entityStore.ts` overlays editable customers/stores/technicians onto `src/data/mock.ts`.
- `src/state/userOrderStore.ts`, `src/state/orderServiceSessionStore.ts`, `src/state/scheduleStore.ts`, `src/state/shiftPlanningStore.ts`, and `src/state/technicianScheduleStore.ts` persist user/order/schedule workflow state locally.
- `src/features/im/api.ts` intercepts `/api/im/*` requests in the browser by wrapping `window.fetch`; it is not a real backend API.
- `src/features/social/context.tsx`, `src/features/dine-in/store.ts`, `src/features/dispatch-center/store.ts`, `src/features/shop-member/store.ts`, and Afirieito runtime state use seed data plus `localStorage`.
- `scripts/mock-backend.mjs` exposes local health, Google account/calendar helper routes, and translation helper routes, but README explicitly identifies it as a mock backend status service.

These boundaries are documented in `docs/MOCK_RETIREMENT_MAP.md`.

## 8. High-Risk Modules For Formal Development

| Risk area | Why high risk | Current anchor files |
|---|---|---|
| Auth / User Management / RBAC | Demo credentials and static permissions must become JWT, Redis-backed sessions, real roles, real users, and audit logs | `src/auth/*`, `src/pages/auth/*`, `src/pages/admin/RolesPage.tsx` |
| Multi-entry portal routing | A route or HTML entry regression can break deployed user, merchant, technician, platform admin, store admin, or Afirieito surfaces | `src/App.tsx`, `portal-entry.js`, `vite.config.ts`, root `*.html` |
| Core entity data | Many pages share the same customers/stores/technicians/services/orders from mock state | `src/data/mock.ts`, `src/state/entityStore.ts`, `src/shared/profile-*` |
| Booking / orders / service session | User checkout, order detail, technician order work, extension/review state all depend on local stores | `src/pages/user/CheckoutPage.tsx`, `src/state/userOrderStore.ts`, `src/state/orderServiceSessionStore.ts` |
| Scheduling / dispatch | Merchant schedule, technician schedule, one-click/smart scheduling, and dispatch projections are deeply interconnected | `src/state/scheduleStore.ts`, `src/state/shiftPlanningStore.ts`, `src/features/dispatch-center/*`, `src/features/technician-schedule/*` |
| NDP / finance / settlement-like flows | Finance, shop-member cards, Afirieito commission, and settlements need ledger/audit correctness before real writes | `src/pages/admin/FinancePage.tsx`, `src/features/shop-member/*`, `src/features/business-cps/*`, mock `settlements` |
| IM / Social / Notification | Current IM is frontend-intercepted and social is local context; later realtime backend work must avoid breaking existing UX | `src/features/im/*`, `src/features/social/*`, `src/pages/admin/AdminNotificationsPage.tsx` |
| Dine-in QR/order workflow | Local QR/session/menu/order state will need formal API ownership and merchant/admin permission checks | `src/features/dine-in/*` |
| i18n and legal/settings content | Large translation/legal surfaces are shared across portals and can create build/test regressions | `src/i18n/*`, `src/features/settings/*` |

## 9. Step 01 Verification Results

| Command | Result | Notes |
|---|---|---|
| `npm run dev` | Passed | Existing services were detected and reused: frontend `5180`, mock backend `4176` |
| `curl -I -s http://127.0.0.1:5180` | Passed | Returned HTTP `200 OK` |
| `curl -s http://127.0.0.1:4176/health` | Passed | Returned `ok: true`, `mode: "mock-backend"` |
| `npm run lint` | Passed | `tsc -b --noEmit` completed successfully |
| `npm test` | Passed | 36 test files passed, 223 tests passed |
| `npm run build` | Passed | `tsc -b && vite build` completed; Vite reported the existing large chunk warning |

## 10. Baseline Protection Rules For Next Steps

- Keep React / TypeScript / Vite and the current HTML portal entry architecture.
- Do not delete existing routes, themes, PWA entries, or legacy aliases without a step document explicitly requiring it.
- Do not expand the mock layer. Existing mock/local stores may remain as legacy compatibility until their mapped replacement step.
- Do not connect frontend pages to new real APIs until the corresponding backend/API contract step exists.
- Do not change database schema before Step 03 and migration rules are in place.
- Treat `src/App.tsx`, `portal-entry.js`, `vite.config.ts`, auth, scheduling, orders, IM, Social, finance, and Afirieito/CPS as high-risk review areas.
