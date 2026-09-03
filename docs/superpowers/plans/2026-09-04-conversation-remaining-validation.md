# Conversation Remaining Validation Plan

> **For agentic workers:** Execute each task as one isolated, reversible microstep. Keep every resulting branch separate from `main` until the user authorizes the final integration.

**Goal:** Close the remaining defects discovered while accepting the order add-on timeline work, without changing, merging, pushing, or deploying `main` prematurely.

**Architecture:** Treat generated Prisma client reliability and historical formatting debt as separate concerns. First make a clean backend install self-generate its schema-derived client before compilation. Then audit the formatter baseline without performing a repository-wide mechanical rewrite; only task-owned files may be formatted or changed.

**Tech Stack:** Node.js 22, npm, TypeScript strict mode, Prisma 7, Jest, Prettier 3.

## Global Constraints

- Do not merge into `main`, push, deploy, or apply migrations while executing this plan.
- Do not add mocks, placeholders, fake APIs, or fabricated profile fields.
- Preserve the formal technician gender contract already present in Prisma and OpenAPI.
- Do not mass-format historical files or weaken the existing `format:check` command.
- Keep each implementation branch clean, reviewable, and independently reversible.

## Task 1: Make fresh backend installs build with the generated Prisma client

**Files:**

- Modify: `backend/package.json`
- Create: `docs/superpowers/plans/2026-09-04-conversation-remaining-validation.md`

- [x] Reproduce the failure with `cd backend && npm ci && npm run build`.
- [x] Confirm `gender` exists in `backend/prisma/schema.prisma` and the public technician contract.
- [x] Confirm `npm run prisma:generate && npm run build` passes without a source-code type workaround.
- [x] Add a package lifecycle hook that runs `prisma generate` after backend dependency installation.
- [x] Document that a backend install generates the Prisma client and does not apply migrations.
- [x] Re-run `npm ci`, backend build, focused technician tests, lint, and the complete backend test suite.
- [x] Commit the isolated fix without merging it.

The `postinstall` hook is generation-only: it reads `backend/prisma/schema.prisma`
and writes the local generated client under `backend/node_modules`. It neither
connects to MySQL nor executes `prisma migrate`.

## Task 2: Audit the historical backend Prettier baseline

**Files:**

- Inspect: `backend/package.json`
- Inspect: files reported by `npm run format:check`
- Create only if evidence is useful: `docs/verification/2026-09-04-backend-prettier-baseline.md`

- [x] Run the unchanged formatter check and record exact current failure count and file families.
- [x] Verify all files changed by this conversation pass Prettier independently.
- [x] Separate task-owned formatting failures from historical baseline failures.
- [x] Record the bounded next action; do not mass-format or alter the formatter gate.

## Task 3: Final pre-integration reconciliation

- [x] Re-check `main`, list every conversation branch and its commits, and detect patch-equivalent commits.
- [x] Verify each remaining branch is clean and has fresh acceptance evidence.
- [x] Report the exact integration set and any external blockers.
- [x] Wait for explicit user authorization before merging anything into `main`.

The add-on timeline patch is already present on `main` as `f7428967`. The final
candidate adds only the Prisma post-install generation hook, the remaining
membership expiry fixture correction, formatting limited to the two
conversation-owned tests, and these plan/audit records. The user explicitly
authorized merging after all conversation tasks pass acceptance; push and
deployment remain outside that authorization.
