# Shop Employee Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the formal shop employee and role foundation needed to resolve merchant notice employees and technicians from MySQL instead of browser-local labels.

**Architecture:** Keep `TechnicianShopAffiliation` as the technician-specific authority and add a user-level `ShopEmployee` aggregate for every shop worker. Global system roles and shop-local custom roles live in `ShopEmployeeRole`; time-bounded assignments live in `ShopEmployeeRoleAssignment`. One additive migration seeds the system role catalog and deterministically backfills shop owners, scoped merchant identities, merchant-account owners, and current technician affiliations without importing unverifiable browser-local employees.

**Tech Stack:** Prisma, MySQL 8, TypeScript strict mode, Jest, existing NeeDo migration conventions.

## Global Constraints

- This microstep adds schema, migration, deterministic backfill, a read-only checker, tests, and documentation only.
- Do not add merchant employee CRUD routes, notification audience resolution, notification UI, or browser-local storage migration.
- `ShopEmployee` is user-level; technician data continues to come from `TechnicianProfile` and `TechnicianShopAffiliation`.
- All tables include `id`, `createdAt`, `updatedAt`, and `deletedAt`; foreign keys and active lookup paths are indexed.
- System role codes are `OWNER`, `ADMINISTRATOR`, `STAFF`, `TECHNICIAN`, `ACCOUNTANT`, `DRIVER`, `GENERAL_AFFAIRS`, and `CHEF` with Simplified Chinese, Traditional Chinese, Japanese, English, and Korean names.
- Backfill is idempotent and fails closed by leaving browser-only employees unmaterialized when no formal User/shop relationship exists.
- Do not apply this migration to the shared database in this code microstep.

---

### Task 1: Lock the schema and migration contract

**Files:**
- Create: `backend/tests/shop-employee-foundation-schema.test.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260903130000_shop_employee_foundation/migration.sql`

**Interfaces:**
- Consumes: existing `Shop`, `User`, `TechnicianProfile`, `TechnicianShopAffiliation`, and `UserIdentity` records.
- Produces: Prisma models `ShopEmployee`, `ShopEmployeeRole`, `ShopEmployeeRoleAssignment` and enum `ShopEmployeeStatus`.

- [x] **Step 1: Write the failing schema/migration test**

  Assert that the Prisma schema contains all three models, the technician affiliation link, five localized role-name fields, soft-delete/audit fields, and indexed shop/user/status paths. Assert that the migration creates the three tables, eight system role codes, restrictive foreign keys, and idempotent backfill statements for owners, merchant identities, merchant-account ownership, and technician affiliations.

- [x] **Step 2: Run the test to verify RED**

  Run: `npm test -- shop-employee-foundation-schema.test.ts`

  Expected: FAIL because the migration and models do not exist.

- [x] **Step 3: Add the minimal Prisma models**

  Use these stable fields:

  ```prisma
  enum ShopEmployeeStatus {
    ACTIVE    @map("active")
    ON_LEAVE  @map("on_leave")
    SUSPENDED @map("suspended")
    ENDED     @map("ended")
  }

  model ShopEmployee {
    id                          Int                @id @default(autoincrement())
    shopId                      Int                @map("shop_id")
    userId                      Int                @map("user_id")
    status                      ShopEmployeeStatus @default(ACTIVE)
    startsAt                    DateTime           @default(now()) @map("starts_at")
    endsAt                      DateTime?          @map("ends_at")
    technicianShopAffiliationId Int?               @unique @map("technician_shop_affiliation_id")
    activeKey                   String?            @unique @map("active_key") @db.VarChar(191)
    createdById                 Int?               @map("created_by_id")
    updatedById                 Int?               @map("updated_by_id")
    createdAt                   DateTime            @default(now()) @map("created_at")
    updatedAt                   DateTime            @updatedAt @map("updated_at")
    deletedAt                   DateTime?           @map("deleted_at")
  }
  ```

  `ShopEmployeeRole` contains nullable `shopId`, stable `code`, five localized names, `isSystem`, `isTechnicianRole`, `activeKey`, actor audit fields and lifecycle timestamps. `ShopEmployeeRoleAssignment` contains employee/role IDs, effective dates, `activeKey`, actor audit fields and lifecycle timestamps.

- [x] **Step 4: Add the additive migration and deterministic backfill**

  Create tables first, seed the eight system roles with stable `system:<CODE>` keys, then insert employees with `shop:<shopId>:user:<userId>` keys. Backfill sources are:

  1. `shops.owner_user_id` -> `OWNER`.
  2. active `user_identities` scoped directly to `shop` -> `OWNER`, `ADMINISTRATOR`, or `STAFF` by formal identity type.
  3. active merchant-account memberships and their owner/scoped identities -> `OWNER` or `ADMINISTRATOR`.
  4. current `technician_shop_affiliations` -> `TECHNICIAN`, preserving `ACTIVE`, `ON_LEAVE`, and `SUSPENDED` status and linking the exact affiliation row.

  Use `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE` so the backfill is idempotent. Do not synthesize users for browser-local names.

- [x] **Step 5: Generate and validate Prisma**

  Run from `backend/`:

  ```bash
  npm run prisma:generate
  npm exec -- prisma validate
  npm test -- shop-employee-foundation-schema.test.ts
  ```

  Expected: Prisma generation/validation succeeds and the test passes.

### Task 2: Add the read-only foundation checker

**Files:**
- Create: `backend/scripts/check-shop-employee-foundation.ts`
- Create: `backend/tests/shop-employee-foundation-checker.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: generated Prisma delegates for the three new models and existing shop/technician relations.
- Produces: `checkShopEmployeeFoundation(repository): Promise<ShopEmployeeFoundationReport>` and CLI script `check:shop-employee-foundation`.

- [x] **Step 1: Write the failing checker test**

  Define a repository port returning counts for missing system roles, active shop owners without employees, current technician affiliations without linked employees, invalid technician-role assignments, and orphan active employees. Assert `ready=true` only when every issue count is zero and assert the report contains counts only, not user emails or internal payloads.

- [x] **Step 2: Run the checker test to verify RED**

  Run: `npm test -- shop-employee-foundation-checker.test.ts`

  Expected: FAIL because the checker module does not exist.

- [x] **Step 3: Implement the minimal checker**

  ```ts
  export interface ShopEmployeeFoundationCounts {
    missingSystemRoles: number;
    ownersWithoutEmployee: number;
    techniciansWithoutEmployee: number;
    invalidTechnicianAssignments: number;
    orphanActiveEmployees: number;
  }

  export const checkShopEmployeeFoundation = async (
    repository: ShopEmployeeFoundationCheckRepository
  ): Promise<ShopEmployeeFoundationReport> => {
    const counts = await repository.countIssues();
    return { ready: Object.values(counts).every((count) => count === 0), counts };
  };
  ```

  The Prisma repository performs only read queries. The CLI prints JSON and exits non-zero when `ready=false`.

- [x] **Step 4: Run checker and existing affiliation regressions**

  Run:

  ```bash
  npm test -- shop-employee-foundation technician-shop-affiliation employee-affiliation-permissions merchant-selected-shop-scope
  ```

  Expected: all selected suites pass.

### Task 3: Document the authority boundary and verify the microstep

**Files:**
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Consumes: schema, migration, and checker from Tasks 1-2.
- Produces: explicit documentation of what is authoritative now and what remains deferred.

- [x] **Step 1: Document the formal employee boundary**

  Record that `ShopEmployee` is the user/shop employment authority, `TechnicianShopAffiliation` remains technician-specific, role assignments are time-bounded, and browser-local manual employees are not migrated without a formal User relationship. State that CRUD APIs, frontend cutover, notice audience snapshots, database application, and browser acceptance remain deferred.

- [x] **Step 2: Run final verification**

  Run from `backend/`:

  ```bash
  npm exec -- prisma validate
  npm run build
  npm run lint
  npm test -- shop-employee-foundation technician-shop-affiliation employee-affiliation-permissions merchant-selected-shop-scope
  ```

  Run from the repository root:

  ```bash
  git diff --check
  ```

  Expected: every command exits zero.

- [ ] **Step 3: Commit the isolated microstep**

  ```bash
  git add backend/prisma/schema.prisma backend/prisma/migrations/20260903130000_shop_employee_foundation/migration.sql backend/scripts/check-shop-employee-foundation.ts backend/tests/shop-employee-foundation-schema.test.ts backend/tests/shop-employee-foundation-checker.test.ts backend/package.json docs/backoffice-real-data.md docs/superpowers/plans/2026-09-03-shop-employee-foundation.md
  git commit -m "feat(merchant): add shop employee foundation"
  ```
