# Step 01 Baseline Checklist

> Step: 01 — 仓库审计与基线保护  
> Date: 2026-05-25  
> Result: Passed for Step 01 scope.

## 1. Scope Confirmation

| Item | Status | Evidence |
|---|---|---|
| Read `README.md` | Done | Current run/build scope and mock backend notes reviewed |
| Read `AGENTS.md` | Done | Small-step rules and prohibited actions reviewed |
| Read `docs/00_MASTER_MICRO_STEP_PLAN.md` | Done | 14-step gate plan reviewed |
| Read `docs/01_REPO_AUDIT_AND_BASELINE.md` | Done | Step 01 deliverables and prohibitions reviewed |
| Read `docs/User Management.md` | Done | Auth/RBAC baseline included in audit |
| Only execute Step 01 | Done | No business code, schema, mock replacement, or UI refactor performed |

## 2. Repository Areas Checked

| Area | Status | Baseline finding |
|---|---|---|
| `package.json` | Done | React 19, TypeScript, Vite, Vitest; scripts confirmed |
| `src/App.*` | Done | Single `src/App.tsx` owns central routes, portal guards, legacy redirects |
| `src/main.tsx` | Done | React app mounted under `HashRouter` |
| `src/pages` | Done | User, mobile, admin, merchant-admin, auth, CPS admin surfaces present |
| `src/features` | Done | IM, Social, scheduling/dispatch, dine-in, shop-member, Afirieito/CPS, settings present |
| `src/state` | Done | Multiple local stores backed by mock data and browser storage |
| `src/shared` | Done | Shared profile-card, profile-detail, info-card, order-detail modules present |
| Root HTML entries | Done | `index`, `user`, `merchant`, `technician`, `afirieito`, `pf-admin`, `store-admin`, `afirieito-admin` entries confirmed |
| Mock boundary | Done | Current mock/local state mapped in `docs/MOCK_RETIREMENT_MAP.md` |
| High-risk modules | Done | Listed in `docs/CURRENT_ARCHITECTURE_AUDIT.md` |

## 3. Prohibited Actions Check

| Prohibited action | Status |
|---|---|
| Wrote backend business code | Not done |
| Added database tables | Not done |
| Added Prisma migration | Not done |
| Replaced or expanded mock data/API | Not done |
| Refactored UI | Not done |
| Changed routes or portal entries | Not done |
| Changed package dependencies | Not done |

## 4. Verification Commands

| Command | Status | Result |
|---|---|---|
| `npm run dev` | Passed | `dev-all` detected existing frontend `5180` and mock backend `4176`, reused both, and exited cleanly |
| `curl -I -s http://127.0.0.1:5180` | Passed | HTTP `200 OK` |
| `curl -s http://127.0.0.1:4176/health` | Passed | Returned `ok: true`, `mode: "mock-backend"` |
| `npm run lint` | Passed | `tsc -b --noEmit` completed successfully |
| `npm test` | Passed | 36 test files passed, 223 tests passed |
| `npm run build` | Passed | `tsc -b && vite build` completed successfully |

Build note: Vite reported the existing large chunk warning after minification. This is not a build failure and was not addressed in Step 01.

## 5. Deliverables

| Deliverable | Status |
|---|---|
| `docs/CURRENT_ARCHITECTURE_AUDIT.md` | Added |
| `docs/MOCK_RETIREMENT_MAP.md` | Added |
| `docs/STEP_01_BASELINE_CHECKLIST.md` | Added |

## 6. Interfaces And Database

| Item | Status |
|---|---|
| New or modified API interfaces | None |
| New or modified database tables | None |
| New or modified migrations | None |
| New or modified seed data | None |

## 7. Step 01 Acceptance

| Acceptance item | Status |
|---|---|
| Current actual technology stack is documented | Passed |
| Startup commands are documented and verified | Passed |
| Mock source and retirement priority are documented | Passed |
| Three mobile/client portal families are documented | Passed |
| Platform and merchant/Afirieito admin entries are documented | Passed |
| High-risk modules are documented | Passed |
| Existing lint/test/build are runnable and passing | Passed |

## 8. Known Baseline Notes

- The working tree already contained unrelated modified and untracked files before this Step 01 documentation work. Those files were not reverted or changed by this audit.
- The current local backend process is still explicitly a mock backend helper. It must not be treated as the formal production backend in Step 02+.
- The next formal development step should be Step 02 only: backend scaffold, environment, and Docker baseline.
