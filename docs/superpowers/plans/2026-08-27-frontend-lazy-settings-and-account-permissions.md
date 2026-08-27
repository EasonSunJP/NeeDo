# Frontend Lazy Settings And Test Account Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the production entry bundle by deferring settings/legal routes and refresh the formal test-account CSV from the live local database with active identities, roles, and effective permissions.

**Architecture:** Keep the synchronous translation runtime unchanged for this micro-step. Convert only the unified settings route module to one shared React lazy chunk behind a route-level Suspense boundary, then compare production bundle bytes before and after. Add a read-only account export path that combines current database access metadata with the existing local plaintext test-password CSV; never read or export password hashes and never run a seed.

**Tech Stack:** React 19, React Router, Vite/Rollup, TypeScript, Vitest, Prisma/MySQL, Node.js CSV tooling.

## Global Constraints

- Preserve React/TSX/Vite and all current routes.
- Do not split or remove translations in this micro-step.
- Do not modify the database, Seed data, roles, identities, or permissions.
- Preserve the existing CSV column order and append access columns at the end.
- Never return or log `passwordHash`.
- Preserve unrelated working-tree changes.

---

### Task 1: Defer unified settings and legal content

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: named exports from `src/features/settings/UnifiedSettingsPages.tsx`.
- Produces: lazy React components with the same names and route props; one Suspense boundary around `Routes`.

- [ ] **Step 1: Write the failing source-contract test**

Add assertions that `App.tsx` no longer statically imports `UnifiedSettingsPages`, dynamically imports it through `lazy`, and wraps the route tree in Suspense.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the settings module is still a static import.

- [ ] **Step 3: Implement the minimal lazy module boundary**

Add a typed `lazyNamed` helper, replace the settings named import with lazy components, and wrap `Routes` in a route-level Suspense fallback that uses no new user-visible copy.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Build formal production output and compare bytes**

Run: `npm run build -- --mode formal`

Expected: exit 0 and a separate settings chunk. Record exact before/after `main-*.js` raw and gzip bytes; do not claim an improvement unless bytes decrease.

---

### Task 2: Export current formal test-account permissions

**Files:**
- Modify: `backend/src/simulation/formal-test-account-export.ts`
- Modify: `backend/tests/formal-test-account-export.test.ts`
- Create: `backend/scripts/export-current-formal-test-accounts.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the 216-email formal social simulation plan, current Prisma `User`/`UserIdentity`/`UserRole`/`RolePermission` rows, and the existing local CSV password column.
- Produces: UTF-8 BOM CSV with `account_type,needo_id,nickname,email,password,is_active,email_verified,default_identity,identities,roles,enabled_permissions`.

- [ ] **Step 1: Write failing pure-function tests**

Cover sorted/deduplicated identities, roles, permissions, active/verified status, default identity, and rejection of missing persisted accounts/passwords.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/formal-test-account-export.test.ts`

Expected: FAIL because access-column helpers do not exist.

- [ ] **Step 3: Implement pure export helpers**

Return stable semicolon-separated exact codes and Chinese yes/no status values without accepting or exposing password hashes.

- [ ] **Step 4: Implement the read-only exporter**

Load `.env.dev`, reject production/remote database configuration using the existing simulation config guard, read only the planned formal test cohort, merge plaintext passwords by email from the source CSV, fail closed on any missing/duplicate row, and write only the requested output path.

- [ ] **Step 5: Run focused tests and generate the workspace candidate**

Run: `npm --prefix backend test -- --runTestsByPath tests/formal-test-account-export.test.ts`

Run: `ENV_FILE=.env.dev TEST_ACCOUNT_SOURCE_CSV=<source> TEST_ACCOUNT_OUTPUT_CSV=<workspace-candidate> npm --prefix backend run export:current-test-accounts`

Expected: 216 rows, no duplicates, no blanks, all active/verified, and permissions populated.

- [ ] **Step 6: Validate and replace the requested CSV**

Parse the candidate as RFC 4180 CSV, verify headers/counts/unique emails/NeeDo IDs/password preservation, then copy it over `/Users/eason/Documents/NeeDo/NeeDo_正式测试账号_2026-08-25.csv` only with the required filesystem authorization.

---

### Task 3: Final verification

**Files:**
- Verify all files changed by Tasks 1–2.

**Interfaces:**
- Consumes: final working tree.
- Produces: evidence-backed handoff with no commit or push.

- [ ] **Step 1: Run frontend and backend focused tests**

Run: `npm test -- src/App.test.tsx`

Run: `npm --prefix backend test -- --runTestsByPath tests/formal-test-account-export.test.ts`

- [ ] **Step 2: Run project verification**

Run: `npm run lint`

Run: `npm run build -- --mode formal`

Run: `npm --prefix backend run build`

- [ ] **Step 3: Validate diffs and artifact**

Run: `git diff --check`

Confirm the CSV contains no `passwordHash`, tokens, OTPs, or non-test users.
