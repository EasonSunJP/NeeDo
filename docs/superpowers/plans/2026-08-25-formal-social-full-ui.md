# Formal Social Full UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the single complete NeeDo Social UI for formal accounts and populate the formal local database with realistic text, image, quote, and video posts.

**Architecture:** Delete the standalone minimal formal pages and keep environment switching only in `SocialProvider`. Add a formal read-model adapter that maps paginated Social API responses into the existing SocialContext types, and seed deterministic SocialPost/Follows through the existing local-only three-month simulation workflow.

**Tech Stack:** React 19, TypeScript strict, Vite, Express, Prisma/MySQL, Zod, Vitest/Jest.

## Global Constraints

- Execute only Step 13 and preserve the existing React/TSX/Vite frontend.
- Do not add mock, demo, placeholder, fake API, localStorage formal business data, TODO, or FIXME.
- Preserve unrelated dirty-worktree changes.
- Use TDD: each behavior test must fail for the expected reason before implementation.
- Do not persist browser `blob:` media URLs.

---

### Task 1: Formal Social response and mapping contract

**Files:**
- Create: `src/features/social/formal-adapter.ts`
- Create: `src/features/social/formal-adapter.test.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Interfaces:**
- Consumes: `RealtimeSocialPost`, `SocialPost`, `SocialProfile`, `AuthSession`.
- Produces: `mapFormalSocialPost(post)`, `mapFormalSocialProfiles(posts, viewer)` and public author payload.

- [ ] Write a failing frontend adapter test for array media, envelope media, quote IDs, counters, author identity and hashtags.
- [ ] Run `npm test -- src/features/social/formal-adapter.test.ts` and confirm failure because the adapter does not exist.
- [ ] Write a failing backend integration assertion that list/detail responses include the safe public author object.
- [ ] Run `npm --prefix backend test -- realtime-api.test.ts` and confirm the author assertion fails.
- [ ] Implement the minimal safe author selection and frontend mapping.
- [ ] Run both tests and confirm they pass.

### Task 2: One full UI with the formal provider

**Files:**
- Delete: `src/features/social/formal-pages.tsx`
- Modify: `src/features/social/route-pages.tsx`
- Modify: `src/features/social/context.tsx`
- Modify: `src/features/social/formal-pages.test.ts`
- Modify: `src/features/social/formal-provider.test.ts`
- Modify: `src/features/social/pages/SocialComposerPage.tsx`

**Interfaces:**
- Consumes: `realtimeApi.listSocialPosts`, `realtimeApi.createSocialPost`, `subscribeRealtimeEvents`, mapping helpers from Task 1.
- Produces: one route per full page and `FormalSocialProvider` implementing the existing SocialContext read contract.

- [ ] Change the route/provider tests first so they require one full UI, formal API loading and no `formal-pages.tsx` switch.
- [ ] Run `npm test -- src/features/social/formal-pages.test.ts src/features/social/formal-provider.test.ts` and confirm the old dual-page architecture fails.
- [ ] Replace the formal compatibility empty state with API-backed state while leaving static-demo legacy state isolated.
- [ ] Make composer publication await the formal API result and surface failures without local fake success.
- [ ] Delete the minimal page file and route switch.
- [ ] Run the targeted Social tests and confirm they pass.

### Task 3: Deterministic formal Social simulation data

**Files:**
- Create: `backend/src/simulation/social-simulation-plan.ts`
- Create: `backend/tests/social-simulation-plan.test.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `buildSocialSimulationPlan()` with deterministic author keys, content, media envelope, visibility and dates.
- Consumes: existing `customerUserIds`, `technicianUserIds`, `ownerUserIds`, and preview customer mapping.

- [ ] Write a failing plan test requiring at least 12 posts, all four content kinds, local image URLs, one playable video URL and no transient URL.
- [ ] Run `npm --prefix backend test -- social-simulation-plan.test.ts` and confirm failure because the plan does not exist.
- [ ] Implement the pure plan and re-run the test green.
- [ ] Add idempotent persistence that deletes only Social rows carrying the simulation namespace/dataset marker and inserts follows plus posts.
- [ ] Extend the simulation check to verify total, type coverage, preview-account visibility and media URL shape.
- [ ] Run the local-only seed and check commands with `ALLOW_SIMULATION_SEED=true`.

### Task 4: Full verification and visual acceptance

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] Run targeted frontend and backend tests.
- [ ] Run `npm run lint`, `npm run build`, and the relevant backend lint/test/build commands.
- [ ] Log in as `customer@example.com`, query `/api/v1/social/posts`, and verify at least 12 posts and text/image/quote/video coverage without printing credentials or tokens.
- [ ] Open `/moments`, `/merchant/moments`, and `/technician/moments` with formal test sessions and visually inspect the existing complete design at desktop and mobile widths.
- [ ] Check console errors and play the visible video long enough to confirm media loading.
- [ ] Review `git diff` to ensure the minimal formal page is deleted and unrelated user changes are preserved.
