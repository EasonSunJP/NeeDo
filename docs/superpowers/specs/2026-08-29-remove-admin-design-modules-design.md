# Remove Admin Design Modules Design

**Date:** 2026-08-29  
**Status:** Implemented

## Goal

Completely remove the merchant-admin “UI装修” module and the operations-admin “设计” module. The removed modules must leave no navigation section, routable page, module-specific redirect, compatibility alias, placeholder, or capability-gate screen.

## Scope

### Merchant admin

- Remove the complete “UI装修” primary navigation section.
- Remove the “店铺 UI 装修” and “信息卡装修” navigation items.
- Remove the `/merchant-admin/design` route and its component import.
- Delete `MerchantAdminDesignPage` and its dedicated test.

### Operations admin

- Remove the complete “设计” navigation section.
- Remove the “装修中心” navigation item.
- Remove the `/admin/decoration` route and its component import.
- Delete `DecorationPage`.
- Update shared capability-route tests so they no longer load or assert the deleted page.

### Documentation

- Remove documentation that lists either deleted module as a current admin capability or capability gate.
- Keep historical product records only when they are explicitly historical and cannot be mistaken for a current route.

## Route Behavior

There is no module-specific redirect for either deleted URL. `/merchant-admin/design` and `/admin/decoration` are no longer registered routes and receive only the application’s ordinary unknown-route behavior.

## Preserved Boundaries

- Client theme switching and shared admin theme tokens remain unchanged.
- Shared storefront presentation helpers that are consumed outside the two deleted admin modules remain unchanged unless repository search proves they are exclusively owned by the deleted modules.
- Carousel and avatar-badge modules are not part of this deletion.
- Employee detail, schedule, payroll, settlement, and timeline work remain separate microsteps.

## UI Direction For Following Employee Microsteps

Future employee-card and employee-schedule work must reuse the current merchant-admin visual system: blue-black surfaces, existing theme tokens, restrained blue selection states, current border/radius scale, compact desktop information density, and established semantic schedule colors. It must not introduce a parallel visual language.

## Verification

- Source search finds no `MerchantAdminDesignPage`, `DecorationPage`, `/merchant-admin/design`, `/admin/decoration`, merchant “UI装修” section, or operations “设计” section in active frontend code.
- Navigation tests assert both sections and their items are absent.
- Route-level tests assert the deleted modules are not registered.
- Shared capability-route tests continue to cover the remaining carousel and avatar-badge gates.
- Focused tests, TypeScript lint, and the production build pass.
- Browser acceptance confirms neither primary navigation contains the deleted section.
- Direct visits to the old URLs show only ordinary unknown-route behavior, with no compatibility page or module-specific redirect.

## Rollback

Rollback is the single commit revert for this microstep. No database schema, migration, API, permission, or persisted user data is changed.

## Implementation Record

- `94776fa0` removed both navigation groups and added permanent absence tests.
- `e43ccc84` deleted both routes, imports, page components, the obsolete page test, and module-only i18n copy.
- Logged-in browser acceptance on formal `5182` confirmed that both navigation groups are absent, the remaining classic blue-black styling is unchanged, and each deleted URL receives only the application's ordinary unknown-route fallback.
