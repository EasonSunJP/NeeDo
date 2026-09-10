# Formal checkout approved UI verification

Date: 2026-09-02 (Asia/Tokyo)

## Scope

- Restore the approved six-step right-arrow checkout header.
- Illuminate the current step and every preceding step as content crosses the visible page midpoint.
- Restore the approved package, fulfillment, time, address, technician, notes, notice, and fixed submission surfaces.
- Preserve the formal service, availability, and booking APIs; do not add mock data or a booking bypass.

## Automated verification

- `npx vitest run src/pages/user/FormalCheckoutPage.test.ts src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx`
  - PASS: 2 files, 11 tests.
- `npm run lint`
  - PASS: TypeScript project build with `--noEmit`.
- `npm test -- --reporter=dot`
  - PASS: 345 files, 2418 tests.
- `npm run verify:production-build`
  - PASS: formal Vite build and production bundle audit (8 HTML entries, 35 assets).
- `git diff --check`
  - PASS.

## Formal runtime evidence

- Formal backend: `http://127.0.0.1:3000/api/v1`.
- `GET /api/v1/health`: PASS; Redis status `ok`.
- `GET /api/v1/ready`: PASS; MySQL and Redis status `ok`.
- `GET /api/v1/services/753`: PASS; returned the real service `麻布十番ボディケア 60分`, shop 217, technician 186, JPY 8,800, and a 100% acceptance rate.
- `GET /api/v1/schedule/availability` for service 753: PASS; returned 13 real bookable slots in the requested 21-day window.

## Browser acceptance

A temporary uncommitted read-only entry rendered the exact production `FormalCheckoutPage` component at `127.0.0.1:5190` without the route-level auth redirect. It used the formal backend and service 753; it did not replace or mock any API. The entry, its browser tabs, and the isolated Vite process were removed after the checks.

- 390 x 844: PASS; six visible arrow controls, no horizontal overflow, no console warning/error.
- 440 x 956: PASS; six visible arrow controls, no horizontal overflow, no console warning/error.
- Initial state: PASS; package is the current highlighted step.
- Time section crossing the page midpoint: PASS; package, fulfillment, and time are highlighted, with time exposed as `aria-current=step`.
- Bottom/notes section: PASS; all six steps are highlighted, with notes exposed as `aria-current=step`.
- Fixed action footer: PASS; final NDP content ends above the 168 px footer at maximum scroll.
- Step controls: PASS; arrow buttons navigate to their corresponding section.

## Authentication boundary

The protected production route correctly redirects an anonymous browser session to `/login/user?redirect=%2Fcheckout%2F753`. No customer credentials were entered and no booking was submitted during this UI task. Authenticated booking creation remains governed by the existing route guard, RBAC, and formal `POST /api/v1/bookings` flow.

## Post-merge verification on local main

- Local `main` merge completed without overwriting unrelated working-tree changes.
- Standard frontend listener: port 5180, cwd `/Users/eason/Documents/New project`.
- Standard backend listener: port 3000, cwd `/Users/eason/Documents/New project/backend`.
- The 5180 source response contains `CheckoutProgressNav`, `resolveActiveCheckoutStep`, and the formal `bookingApi.createBooking` call.
- Full current-main suite: PASS, 790 suites / 2452 tests (includes the user's current uncommitted test files).
- `npm run lint`: PASS.
- `npm run verify:production-build`: PASS, including the production bundle audit.
- Standard route `user.html#/checkout/753`: PASS; an anonymous session redirects to the expected login URL with no console warning/error.
