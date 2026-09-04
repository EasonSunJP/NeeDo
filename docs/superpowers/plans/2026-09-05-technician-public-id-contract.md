# Technician Public ID Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every formal user-facing technician profile link and resolved detail URL use the canonical `s##########` identifier while preserving numeric database keys for internal relations.

**Architecture:** Keep `Technician.id` and API `id` as internal compatibility values, and resolve public navigation through the existing `Technician.systemId`/`CoreTechnicianCard.publicId`. Centralize path construction in the shared profile-card module, update formal entry points, and canonicalize legacy numeric detail URLs after the authoritative API response arrives.

**Tech Stack:** React 18, TypeScript, React Router, Vite, Vitest.

## Global Constraints

- Do not change Prisma schema or migrate numeric technician foreign keys.
- Canonical public technician identifiers match lowercase `^s\d{10}$`.
- Do not fabricate a public ID when formal data does not provide one.
- Preserve user, merchant, and technician scoped detail routes.
- Write and run each failing test before production changes.

---

### Task 1: Central public technician profile path

**Files:**
- Modify: `src/shared/profile-card/TechnicianShowcaseCard.tsx`
- Modify: `src/shared/profile-card/index.ts`
- Test: `src/shared/profile-card/TechnicianShowcaseCard.test.ts`

**Interfaces:**
- Consumes: `Technician.id` as an internal/legacy string and `Technician.systemId` as the canonical public identifier.
- Produces: `getTechnicianPublicProfileId(technician): string`, `getTechnicianDynamicPath(technician): string`, and `getScopedTechnicianDynamicPath(scope, technician): string`.

- [ ] **Step 1: Write the failing public-path tests**

Add behavioral assertions that a technician with `id: "186"` and `systemId: "s0000000002"` produces `/profiles/technician/s0000000002` and that merchant/technician scopes retain their prefixes. Add one compatibility assertion that a missing or invalid `systemId` uses the existing `id` without inventing a value.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/shared/profile-card/TechnicianShowcaseCard.test.ts`

Expected: FAIL because `getTechnicianDynamicPath` currently returns the numeric `technician.id` and the new scoped helper is absent.

- [ ] **Step 3: Implement the minimal shared resolver**

Implement the following behavior in `TechnicianShowcaseCard.tsx` and export it from `index.ts`:

```ts
export function getTechnicianPublicProfileId(technician: Pick<Technician, "id" | "systemId">) {
  const publicId = technician.systemId?.trim();
  return publicId && /^s\d{10}$/u.test(publicId) ? publicId : technician.id;
}

export function getTechnicianDynamicPath(technician: Pick<Technician, "id" | "systemId">) {
  return getScopedProfileDetailPath("user", "technician", getTechnicianPublicProfileId(technician));
}

export function getScopedTechnicianDynamicPath(
  scope: "user" | "merchant" | "technician",
  technician: Pick<Technician, "id" | "systemId">
) {
  return getScopedProfileDetailPath(scope, "technician", getTechnicianPublicProfileId(technician));
}
```

Use the scoped helper for the card's default `detailHref`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/shared/profile-card/TechnicianShowcaseCard.test.ts`

Expected: PASS.

### Task 2: Convert formal technician-card entry points

**Files:**
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/ServiceDetailPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/TechnicianServicesPage.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.tsx`
- Modify: `src/shared/info-card/mappers.ts`
- Test: `src/pages/user/CategoryPage.test.ts`
- Test: `src/pages/user/ServiceDetailPage.test.ts`
- Test: `src/pages/user/StoreDetailPage.test.ts`
- Test: `src/pages/user/FormalCheckoutPage.test.ts`
- Test: `src/pages/user/UserOrderDetailPage.test.ts`
- Test: `src/pages/user/TechnicianServicesPage.test.ts`
- Test: `src/pages/mobile/MerchantOrderRoutePages.test.tsx`
- Test: `src/components/scheduling/UnifiedUserCalendar.test.ts`
- Test: `src/shared/profile-card/SocialProfileMiniCard.test.ts`
- Test: `src/shared/info-card/mappers.test.ts`

**Interfaces:**
- Consumes: shared `getTechnicianDynamicPath` and `getScopedTechnicianDynamicPath` from Task 1, or authoritative `CoreTechnicianCard.publicId` where the unmapped DTO is still available.
- Produces: canonical `s##########` profile links for formal cards without changing selection, checkout, booking, or schedule IDs.

- [ ] **Step 1: Write failing source-contract assertions**

Require Category to use `item.profile.publicId`; require mapped `Technician` entry points, social mini cards, information-card mappers, technician services, calendar participants, and merchant order assignments to call the shared public-path helper; reject the known direct numeric patterns such as ``/profiles/technician/${technician.id}`` and `getScopedProfileDetailPath(..., displayTechnician.id)` in formal technician-card links.

- [ ] **Step 2: Run the focused page tests and verify RED**

Run: `npm test -- src/pages/user/CategoryPage.test.ts src/pages/user/ServiceDetailPage.test.ts src/pages/user/StoreDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/user/UserOrderDetailPage.test.ts src/pages/user/TechnicianServicesPage.test.ts src/pages/mobile/MerchantOrderRoutePages.test.tsx src/components/scheduling/UnifiedUserCalendar.test.ts src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/info-card/mappers.test.ts`

Expected: FAIL on the new canonical public-ID assertions.

- [ ] **Step 3: Replace only public profile link construction**

Use `item.profile.publicId` in Category and shared path helpers in every mapped technician profile entry point. Keep `technician.id` unchanged for service selection, booking payloads, schedule lookups, React keys, map joins, and merchant staff administration routes.

- [ ] **Step 4: Run focused page tests and verify GREEN**

Run the same command as Step 2.

Expected: PASS.

### Task 3: Canonicalize legacy numeric detail URLs

**Files:**
- Modify: `src/pages/user/ProfileDetailPage.tsx`
- Test: `src/pages/user/ProfileDetailPage.routing.test.tsx`
- Test: `src/pages/user/ProfileDetailPage.render.test.tsx`

**Interfaces:**
- Consumes: an inbound numeric or canonical route identifier plus the authoritative `CoreTechnicianDetail.publicId` returned by the formal API.
- Produces: a replace navigation to the matching scoped canonical URL while preserving `location.search`.

- [ ] **Step 1: Write a failing router behavior test**

Render `/profiles/technician/17?view=card` with a location probe and a formal detail response whose `publicId` is `s0000000017`; assert that the resulting location becomes `/profiles/technician/s0000000017?view=card` and that the API was initially called with internal `17`.

- [ ] **Step 2: Run the routing test and verify RED**

Run: `npm test -- src/pages/user/ProfileDetailPage.routing.test.tsx`

Expected: FAIL because the page currently leaves the numeric route unchanged.

- [ ] **Step 3: Add minimal replace navigation**

After a successful detail response, if the inbound identifier is numeric, build the route with `getScopedProfileDetailPath(scope, "technician", detail.publicId)` and call `navigate({ pathname, search: location.search }, { replace: true })`. Do not redirect on loading, error, empty data, or an already canonical route.

- [ ] **Step 4: Run profile-detail tests and verify GREEN**

Run: `npm test -- src/pages/user/ProfileDetailPage.routing.test.tsx src/pages/user/ProfileDetailPage.render.test.tsx`

Expected: PASS.

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: the completed frontend behavior.
- Produces: an explicit compatibility contract: public navigation uses `s##########`; numeric `GET /technicians/:id` lookup remains transition-only for existing internal consumers.

- [ ] **Step 1: Document the canonical public route and compatibility boundary**

Add concise wording to README identity acceptance and the technician API table. State that numeric IDs remain internal/transition-compatible and must not be displayed or used by new public links.

- [ ] **Step 2: Run focused regression tests**

Run: `npm test -- src/shared/profile-card/TechnicianShowcaseCard.test.ts src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/info-card/mappers.test.ts src/pages/user/CategoryPage.test.ts src/pages/user/ServiceDetailPage.test.ts src/pages/user/StoreDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/user/UserOrderDetailPage.test.ts src/pages/user/TechnicianServicesPage.test.ts src/pages/mobile/MerchantOrderRoutePages.test.tsx src/components/scheduling/UnifiedUserCalendar.test.ts src/pages/user/ProfileDetailPage.routing.test.tsx src/pages/user/ProfileDetailPage.render.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run complete frontend gates**

Run: `npm test`

Expected: all frontend tests PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS; existing chunk-size warnings may remain but no new errors are allowed.

- [ ] **Step 4: Browser acceptance**

On the formal main runtime, open a technician card for the entity whose internal profile ID is `186` and public ID is `s0000000002`. Confirm the destination URL uses `s0000000002`, the complete shared detail card renders, refresh succeeds, and the browser console has no new application errors.

- [ ] **Step 5: Commit the verified microstep**

Commit only the design, plan, tests, implementation, and documentation for this contract with message:

```text
fix(technician): canonicalize public profile ids
```
