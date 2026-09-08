# Formal Profile Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer avatar, biography, platform membership tier, and languages agree across the formal personal center, IM lists, and IM contact information card.

**Architecture:** Keep the database and formal APIs authoritative. Project the current platform membership tier in the realtime repository using the database clock, refresh the long-lived IM store on list entry, and render empty profile values honestly instead of inventing defaults.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Prisma 7, Jest.

## Global Constraints

- Work locally only.
- Do not push, deploy staging, trigger remote CI/CD, or modify any remote environment.
- Do not add mocks, schema changes, migrations, or browser-storage profile fallbacks.
- Preserve identity privacy rules and unrelated dirty worktrees.
- Use one final task commit after all tests pass, then merge it into local `main`.

---

### Task 1: Honest customer profile empty states

**Files:**
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Test: `src/pages/user/UserCenterPage.interaction.test.tsx`
- Test: `src/features/settings/UnifiedSettingsPages.test.ts`

**Interfaces:**
- Consumes: `Customer.languages`, `Customer.bio`, and `CustomerSelfProfile` from the formal customer-profile API.
- Produces: draft/display values where missing language is `[]` and missing biography is `""`; display-only empty copy is `未设置`.

- [ ] Add assertions proving empty formal language and biography values are not replaced with `日本語` or example copy.
- [ ] Run the two focused Vitest files and confirm the new assertions fail for the intended defaults.
- [ ] Remove the business defaults from `buildUserProfile` and `UserProfileSettingsPage.initialDraft`; keep empty display copy outside the stored draft.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Authoritative membership projection

**Files:**
- Modify: `backend/src/repositories/realtime.repository.ts`
- Test: `backend/tests/realtime-repository-identity.test.ts`

**Interfaces:**
- Consumes: database `dbNow`, `UserMembershipAdjustment`, `PlatformMembershipEntitlement`, and `PlatformMembershipTierVersion` relations.
- Produces: `DirectoryIdentityCardPayload.identityLabel` as `free | silver | gold | black_diamond` using adjustment-first precedence.

- [ ] Add repository tests for active adjustment precedence, active entitlement fallback, and free fallback.
- [ ] Run the focused Jest file and confirm the new tests fail because the repository reads legacy `CustomerProfile.membershipLevel`.
- [ ] Extend the directory user query with adjustment and entitlement selections bounded by `dbNow`, preserving the formal resolver's archived-version semantics.
- [ ] Add one private mapper that normalizes Prisma tier enums to the four public tier codes.
- [ ] Run the focused Jest file and confirm all tests pass.

### Task 3: Fresh avatar and IM list synchronization

**Files:**
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/ConversationIdentityProfileCard.tsx`
- Test: `src/features/im/pages.test.tsx`
- Test: `src/features/im/ConversationIdentityProfileCard.test.tsx`

**Interfaces:**
- Consumes: `DirectoryProfile.user` returned by `store.getDirectoryProfile` and `store.refresh()`.
- Produces: list-entry refresh and a card whose avatar/ID are from the same directory response as the identity fields.

- [ ] Add source/component assertions proving both IM list pages refresh and the conversation card receives `conversationDirectoryProfile.user` when available.
- [ ] Run the focused Vitest files and confirm the assertions fail against the current stale-snapshot wiring.
- [ ] Add one mount refresh effect shared by the message and contact list pages without changing failure presentation.
- [ ] Pass the latest directory participant to `ConversationIdentityProfileCard`; preserve fallback to the conversation user until the directory request resolves.
- [ ] Run the focused Vitest files and confirm all tests pass.

### Task 4: Card membership labels and complete local verification

**Files:**
- Modify: `src/features/im/ConversationIdentityProfileCard.tsx`
- Modify: `src/shared/profile-card/customerMembership.ts`
- Create: `src/shared/profile-card/platformMembershipTierText.ts`
- Modify: `src/features/platform-user-management/i18n.ts`
- Test: `src/features/im/ConversationIdentityProfileCard.test.tsx`
- Update: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: the four public tier codes from Task 2.
- Produces: distinct localized labels for free, silver, gold, and black-diamond membership.

- [ ] Add card assertions for all four tier labels and their five-language translation entries.
- [ ] Run the focused card test and confirm unsupported labels fail.
- [ ] Map the four tier codes through existing membership helpers and add missing localized copy.
- [ ] Document the formal consistency contract and local-only verification boundary.
- [ ] Run focused frontend/backend suites, frontend lint, backend lint, TypeScript/production build, and `npm run verify:production-build`.
- [ ] Review `git diff`, commit only the files in this plan, merge the branch into local `main`, rerun focused tests on the merged result, then remove only this worktree and branch.
