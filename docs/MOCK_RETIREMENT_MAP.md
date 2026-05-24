# Mock Retirement Map

> Step 01 baseline map. This document records existing mock/demo/local state boundaries and the planned retirement order.  
> It does not replace any mock by itself.

## 1. Retirement Policy

- Existing mock/demo/local state can remain as legacy compatibility until its assigned step.
- Do not add new mock data sources, fake backend endpoints, or placeholder APIs in later formal-development steps.
- When a module is retired, replace it with a real API contract, validation, pagination where applicable, RBAC where protected, tests, and documentation.
- Frontend UI, portal entries, theme tokens, and routes must remain stable during mock retirement unless a step document explicitly says otherwise.

## 2. Current Mock Sources

| Source | Current responsibility | Persistence / runtime behavior | Retirement target | Planned step |
|---|---|---|---|---|
| `src/auth/demoAccount.ts` | Demo login account, demo verification code, linked customer/technician/store IDs | Imported by auth, IM account sync, mock data | Real User Management seed plus real auth/session identity | Step 04-07 |
| `src/auth/AuthProvider.tsx` | Local auth session, portal switching, demo credential validation | `needo.auth.session` in browser storage | JWT + refresh token + `/api/v1/auth/me` + RBAC permission response | Step 05-07 |
| `src/auth/featurePermissions.ts` | Static frontend feature permission list | In-memory only | Backend permissions, role assignments, menu/action permissions | Step 06-07 |
| `src/data/mock.ts` | Core customers, stores, technicians, services, orders, settlements, reviews, campaigns, cities, inventory, permission modules, images | Static frontend seed module | Real read APIs and database-backed entities. Step 09 now routes Home recommendations, Category/Search services, numeric Service detail, numeric Store detail, numeric Technician/User/Shop profile detail through `src/features/core-read/api.ts`; transaction, admin, social, reviews, and presentation helper data remain legacy. | Step 08-12 by domain |
| `src/state/entityStore.ts` | Editable customer/store/technician overlay | `needo.entity-store.v4` with legacy migration keys | User/Profile/Store/Technician APIs with audit history. Step 09 bypasses this store for API-backed numeric browsing/detail routes, while nonnumeric legacy profile/store links and editable/admin surfaces keep the overlay until their owning steps. | Step 08-09 for read, Step 12 for admin writes |
| `src/state/userOrderStore.ts` | User-created orders layered over mock orders | `needo.user-created-orders.v1` | Booking/order API and database order records | Step 10 |
| `src/state/orderServiceSessionStore.ts` | In-service/extension/review/reward session state | `needo.order-service-sessions.v1` | Order service session state machine and audit logs | Step 10-11 |
| `src/state/scheduleStore.ts` | Shared schedule data, edits, auto schedule/dispatch settings | `needo.schedule-store.v1` | Schedule API, conflict checks, generated schedule records | Step 10 |
| `src/state/shiftPlanningStore.ts` | Shift planning cycles and projections | `needo.shift-planning.v2` | Merchant scheduling backend and projection tables | Step 10 |
| `src/state/technicianScheduleStore.ts` | Technician duty shifts, bookings, custom events, transfer requests | `needo.technician-schedule.v1` | Technician schedule and transfer APIs | Step 10 |
| `src/features/dispatch-center/store.ts` | Merchant dispatch center cycles, feedback, final shifts, smart schedule data, audit-like logs | `needo.dispatch-center.v1` | Merchant schedule/dispatch APIs, backend audit logs | Step 10 and Step 12 |
| `src/features/im/api.ts` | Browser-side `/api/im/*` fetch interception and IM database mutation | `needo.im.mock-database.v3.<scope>` plus browser events | Realtime IM REST/WebSocket APIs | Step 13 |
| `src/features/im/store.ts` and `src/features/im/seed.ts` | IM UI state and seeded conversations/contacts/messages | `needo.im.ui.v*` keys and scoped seed data | User/contact/conversation/message backend state | Step 13 |
| `src/features/social/context.tsx` | Social profiles, posts, interactions, notifications, follows | `needo.social.module.v2` | Social post/profile/follow/notification APIs | Step 13 |
| `src/features/dine-in/store.ts` | QR sessions, menus, carts, dine-in orders, checkout state | `needo.dine-in.state.v1` | Dine-in menu/order/session APIs and merchant permissions | Step 10 or Step 12, depending on final API cut |
| `src/features/shop-member/store.ts` and `src/features/shop-member/seed.ts` | Member cards, top-up/consume/refund/freeze flows, member snapshots | `needo.shop-member-system.v1` | Shop member/customer/ledger APIs with audit logs | Step 11-12 |
| `src/features/business-cps/model.ts`, `logic.ts`, admin/mobile pages | Afirieito campaigns, commissions, promoters, tracking, settlement-like state | `needo.afirieito.runtime.v1`, legacy `needo.business-cps.runtime.v1`, admin draft keys | Afirieito campaign/attribution/commission/payout APIs | Step 12 |
| `src/features/settings/portalSettingsState.ts` | Per-portal settings preferences | `needo.settings.portal.<portal>.v1` | Account/profile/settings APIs after auth is real | Step 07 and Step 12 by field |
| `src/components/scheduling/UnifiedUserCalendar.tsx` | Local calendar events and IM tag UI | `needo.user-unified-calendar.v1` and UI keys | User calendar API and external calendar sync records | Step 10 |
| `scripts/mock-backend.mjs` | Local health service plus Google account/calendar and translation helper routes | Node process on port `4176`; temp JSON token stores by env path | Formal backend service, env config, API contracts | Step 02 onward; helper behavior removed or renamed when real backend owns it |

## 3. Current Direct `src/data/mock.ts` Consumers

These files import from the central mock module and should not be rewired until their planned step:

- Step 09 retired for core browsing: `src/pages/user/CategoryPage.tsx` and `src/pages/user/ServiceDetailPage.tsx` no longer import `src/data/mock.ts`; `src/pages/user/ProfileDetailPage.tsx` uses Step 08 APIs for numeric `user` / `technician` / `shop` profile IDs and keeps Social profile fallback for legacy nonnumeric links.
- Step 09 partially retired with legacy compatibility: `src/pages/user/HomePage.tsx` reads homepage recommendations from `/api/v1/home/recommendations`; its remaining `src/data/mock.ts` import is limited to appointment reminder/category label compatibility owned by Booking/Order later steps. `src/pages/user/StoreDetailPage.tsx` reads numeric `/api/v1/shops/:id` details; remaining imports support presentation menu/review helpers and nonnumeric legacy store links until Backoffice/Merchant/Admin and Social/Review steps.
- User booking/order/account surfaces not rewired in Step 09: `src/pages/user/CheckoutPage.tsx`, `UserOrdersPage.tsx`, `UserOrderDetailPage.tsx`, `UserCenterPage.tsx`
- Mobile portals: `src/pages/mobile/MerchantPortalPage.tsx`, `TechnicianPortalPage.tsx`, `NeedoExchangePage.tsx`, `NeedoRoutePages.tsx`, `MerchantOrderRoutePages.tsx`, `MerchantAutoDispatchRoutePage.tsx`
- Admin surfaces: `src/pages/admin/DashboardPage.tsx`, `DataCenterPage.tsx`, `OrdersAdminPage.tsx`, `FinancePage.tsx`, `ReviewsPage.tsx`, `MerchantsPage.tsx`, `RolesPage.tsx`, `MarketingPage.tsx`, `InventoryPage.tsx`, `TechniciansPage.tsx`, `AnalyticsPage.tsx`, `NeedoExchangeAdminPage.tsx`
- Merchant admin analytics: `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx`
- Feature stores/models: `src/features/im/*`, `src/features/social/context.tsx`, `src/features/dispatch-center/*`, `src/features/technician-schedule/*`, `src/features/shop-member/*`, `src/features/dine-in/*`
- Shared/components: `src/components/mobile/MobileMessageCenter.tsx`, `src/components/mobile/OrderServiceMiniCard.tsx`, `src/components/admin/*`, `src/components/scheduling/UnifiedUserCalendar.tsx`

## 4. Replacement Priority By Product Step

| Priority | Scope | Replace first | Keep until later |
|---|---|---|---|
| P0 | Auth/User Management | Demo credentials, local auth session, static permissions | Legacy UI routes and portal shells |
| P1 | Core read APIs | Home/search/category/profile/store/service read data | Booking, orders, scheduling, finance, IM, Social |
| P2 | Frontend first mock retirement | User browsing pages and read-only profile/detail views | Transaction and realtime workflows |
| P3 | Booking/scheduling/order | Checkout, order creation, order status, service sessions, schedule conflict checks, technician transfer | NDP finance and realtime IM/Social |
| P4 | NDP/finance/accounting | Settlement-like flows, NDP reward/ledger, shop-member card finance operations | Non-financial UI preferences |
| P5 | Backoffice/merchant admin | Operations admin and merchant admin read/write workflows | Realtime IM/Social/notification internals if not in Step 13 |
| P6 | IM/Social/Notification | IM REST/WebSocket, social posts/follows/notifications, official notification delivery | Local UI-only preferences |

## 5. Non-Retirement Notes

- Generated images under `public/images/generated` are visual assets, not API mocks. They may remain as assets unless a later media storage/CDN step replaces them.
- UI preferences such as theme, drawer width, collapsed navigation, floating button position, pet settings, and dismissed notices can remain browser-local unless a later product requirement asks for account sync.
- Tests may continue to use seed fixtures as test fixtures. Test fixtures must not become production API behavior.
- `docs/FRONTEND_IA.md`, admin docs content, and API doc editor data are documentation/UI content, not real backend contracts.

## 6. Guardrails For Each Retirement PR

Before retiring any row in this map:

- Confirm the owning step document allows that module.
- Add or update API contract docs before frontend rewiring.
- Add backend validation and pagination for list APIs.
- Add permission declarations for protected APIs.
- Keep old route paths and portal entries working.
- Include migration/seed only when the database step allows it.
- Update this map with the final source of truth and removed legacy keys.
