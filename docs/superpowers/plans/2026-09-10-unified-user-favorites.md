# Unified User Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/me/favorites` the single bottom-nav-free list for saved shops, technicians, services, social posts, and chat records, while fixing forwarded social video previews.

**Architecture:** Keep each formal source authoritative: entity favorites continue through `entityEngagementApi`, chat-record favorites through the IM store API, and post bookmarks through the formal Social provider. Extract the compact forwarded-post presentation into a shared IM/Social card so the favorites page and chat bubbles cannot drift. Extend only the existing message metadata envelope with optional media kind and thumbnail fields; legacy messages infer video from the URL.

**Tech Stack:** React 19, TypeScript strict mode, React Router, Tailwind utility classes, Vitest/JSDOM, Express/Prisma repository tests.

## Global Constraints

- Work only on `codex/favorites-unified-list` and merge locally after validation.
- Do not operate port 5180; browser validation uses a confirmed-free temporary port.
- Do not add mocks, browser persistence, schema changes, migrations, or new remote calls beyond the existing formal APIs.
- Preserve five-language user-visible copy.
- Do not push, deploy, or change remote environments.

---

### Task 1: Shared compact social-post card and forwarded-media compatibility

**Files:**
- Create: `src/features/im/SocialPostCompactCard.tsx`
- Create: `src/features/im/SocialPostCompactCard.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/model.ts`
- Create: `backend/src/utils/social-post-share-card.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Create: `backend/tests/social-post-share-card.test.ts`

**Interfaces:**
- Consumes: `MessageExt.socialPostCard`, `SocialMediaItem.type`, `url`, and optional `thumbnailUrl`.
- Produces: `SocialPostCompactCard`, `SocialPostCompactCardData`, and optional `mediaType` / `mediaThumbnailUrl` message metadata.

- [ ] **Step 1: Write failing component and repository tests**

  Assert that image media uses an image preview, video media uses a video preview, legacy video URLs are inferred, and newly shared post metadata snapshots media kind and thumbnail.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `npm test -- src/features/im/SocialPostCompactCard.test.tsx` and `npm --prefix backend test -- --runInBand --runTestsByPath tests/social-post-share-card.test.ts`.

- [ ] **Step 3: Implement the shared card and metadata extension**

  Move the existing compact card markup out of `MessageBubble`, keep the same localized open-original action, and render `<video muted playsInline preload="metadata">` for video snapshots. Persist `mediaType` and `mediaThumbnailUrl` when present without changing the database schema.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Re-run both focused commands and keep existing legacy-message behavior green.

### Task 2: Unified favorites route, header, search, and five content groups

**Files:**
- Modify: `src/pages/user/UserFavoritesPage.tsx`
- Modify: `src/pages/user/UserFavoritesPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing entity-favorite and chat-record APIs plus formal Social provider state/profiles.
- Produces: `/me/favorites` as the canonical unified route; `/me/favorites/chat-records` becomes a compatibility redirect.

- [ ] **Step 1: Write failing page tests**

  Assert the shared `MobileFullscreenHeader`, return/search/close controls, hidden bottom navigation, canonical route wiring, all five grouped list types, compact social card, and query filtering.

- [ ] **Step 2: Run the page test and verify RED**

  Run: `npm test -- src/pages/user/UserFavoritesPage.test.tsx` and confirm failure is caused by the missing unified behavior.

- [ ] **Step 3: Implement the minimal unified page**

  Reuse `UnifiedEntityInfoCard`, `UnifiedServiceInfoCard`, `ImChatRecordCard`, and `SocialPostCompactCard`. Add a header search action that reveals one search field and filters already-authoritative loaded rows; use `showBottomNav={false}` and route close to `/me`.

- [ ] **Step 4: Run the page test and verify GREEN**

  Re-run the page test and the affected card tests.

### Task 3: Batch verification and local integration

**Files:**
- Modify only files required by failures directly caused by Tasks 1–2.

**Interfaces:**
- Consumes: the committed feature branch.
- Produces: a locally merged and revalidated `main`.

- [ ] **Step 1: Run static and automated verification**

  Run focused tests, `npm run lint`, `npm run build`, and relevant backend tests. Failures unrelated to this batch are reported without widening scope.

- [ ] **Step 2: Browser-check on a free non-5180 port**

  Confirm the selected port is unused, start only the frontend there, and inspect the mobile favorites route for header controls, no bottom nav, compact cards, search, media preview, overflow, and console errors.

- [ ] **Step 3: Commit and merge locally**

  Commit the batch on `codex/favorites-unified-list`, verify ancestry/conflicts, merge into the local `main` worktree, and do not push.

- [ ] **Step 4: Revalidate main and safely clean the feature worktree**

  Re-run the critical tests/build on main, preserve pre-existing unrelated untracked files, and remove only the fully merged clean feature worktree/branch.
