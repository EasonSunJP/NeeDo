# User Center Language and Benefits Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate localized language labels in the customer information card and collapse the membership-benefits list behind a count summary by default.

**Architecture:** Add one display-only language normalization helper shared by the user-center mapper and membership detail card. Keep the formal membership API unchanged; `CurrentMembershipBenefits` derives its summary from the returned `effective` flags and owns only local expansion state.

**Tech Stack:** React 19, TypeScript, Vitest, React DOM test utilities, Tailwind utility classes.

## Global Constraints

- Preserve the existing formal profile and membership API payloads.
- Do not add mock data, schema changes, migrations, push, or deployment.
- Use server-authoritative `effective` values for the enabled count.
- Keep unknown saved language labels visible.

---

### Task 1: Normalize profile language display labels

**Files:**
- Create: `src/shared/profile-card/profileLanguages.ts`
- Create: `src/shared/profile-card/profileLanguages.test.ts`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Test: `src/pages/user/UserCenterPage.interaction.test.tsx`

**Interfaces:**
- Produces: `PROFILE_LANGUAGE_OPTIONS: readonly string[]`
- Produces: `normalizeProfileLanguageLabels(values: readonly string[]): string[]`
- Consumes: the unchanged formal `languages: string[]` payload.

- [ ] **Step 1: Write failing normalization and user-center tests**

  Cover alias mapping, duplicate removal, unknown-label preservation, and a profile containing `ja`, `zh`, `en`, `日本語`, `中文`, and `English`.

- [ ] **Step 2: Run tests and verify RED**

  Run: `npm test -- --run src/shared/profile-card/profileLanguages.test.ts src/pages/user/UserCenterPage.interaction.test.tsx`

  Expected: the helper import or duplicate-language assertion fails because the normalization behavior does not exist yet.

- [ ] **Step 3: Implement the minimal helper and wire the user-center profile mapper**

  Map supported aliases to the seven existing canonical option labels, trim values, deduplicate by canonical label, retain unknown labels, and replace the page-local option constant with `PROFILE_LANGUAGE_OPTIONS`.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `npm test -- --run src/shared/profile-card/profileLanguages.test.ts src/pages/user/UserCenterPage.interaction.test.tsx`

  Expected: both files pass with zero failures.

- [ ] **Step 5: Commit the language fix**

  Commit: `fix: normalize profile language labels`

### Task 2: Collapse membership benefits with an authoritative count

**Files:**
- Modify: `src/features/platform-membership/CurrentMembershipBenefits.tsx`
- Modify: `src/features/platform-membership/CurrentMembershipBenefits.test.tsx`

**Interfaces:**
- Consumes: `CurrentMembershipBenefitsPayload.list[].effective`.
- Produces: a collapsed header button with `aria-expanded`, localized `<enabled>/<total>` summary, expanded list, and plain-text collapse button.

- [ ] **Step 1: Write failing collapsed-state and interaction tests**

  Assert that status rows are absent initially, `1/4 已开启` is visible for the fixture, the header expands the list, and the plain-text `收起` action collapses it again without rounded or bordered classes.

- [ ] **Step 2: Run the component test and verify RED**

  Run: `npm test -- --run src/features/platform-membership/CurrentMembershipBenefits.test.tsx`

  Expected: the current always-expanded list violates the collapsed-state assertions.

- [ ] **Step 3: Implement minimal expansion state and localized copy**

  Add local `expanded` state defaulting to `false`, derive the effective and total counts from the ready payload, render the list only when expanded, and add the semantic plain-text collapse action.

- [ ] **Step 4: Run the component test and verify GREEN**

  Run: `npm test -- --run src/features/platform-membership/CurrentMembershipBenefits.test.tsx`

  Expected: all component tests pass with zero failures.

- [ ] **Step 5: Commit the membership interaction**

  Commit: `feat: collapse current membership benefits`

### Task 3: Verify and integrate locally

**Files:**
- Verify all files changed in Tasks 1 and 2.

**Interfaces:**
- Produces: a locally merged `main` commit with no push or deployment.

- [ ] **Step 1: Run focused regression tests**

  Run: `npm test -- --run src/shared/profile-card/profileLanguages.test.ts src/features/platform-membership/CurrentMembershipBenefits.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx`

- [ ] **Step 2: Run full frontend verification**

  Run: `npm test`, then `npm run lint`, then `npm run build -- --mode formal`.

- [ ] **Step 3: Review the diff and commit any remaining documentation/test adjustments**

  Confirm no unrelated files, mock data, API, schema, migration, push, or deployment changes.

- [ ] **Step 4: Merge to local `main` and verify again**

  Merge `codex/user-center-profile-card-fixes` into the worktree that owns `main`, rerun the focused tests there, and confirm the merge commit is present.

- [ ] **Step 5: Clean only the merged feature worktree and branch**

  Remove `.worktrees/user-center-profile-card-fixes`, prune stale registrations, and delete `codex/user-center-profile-card-fixes` with normal `git branch -d`.
