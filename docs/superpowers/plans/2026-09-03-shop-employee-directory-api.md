# Shop Employee Directory API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only merchant employee directory backed by `ShopEmployee`, including owners, administrators, staff, technicians, and other formal roles without changing the existing technician-only employee detail contract.

**Architecture:** A dedicated service enforces the authenticated merchant shop scope and records a list audit event. A Prisma repository performs one paginated `ShopEmployee` query plus one count query and returns public user NeeDoIDs, localized roles, and an optional technician projection. A new merchant-only route exposes this contract at `GET /api/v1/merchant-admin/employee-directory`; the existing `/merchant-admin/employees` technician routes remain unchanged.

**Tech Stack:** Express, TypeScript strict mode, Prisma, Zod, Jest, Supertest, existing NeeDo Auth/RBAC/audit/OpenAPI conventions.

## Global Constraints

- Reuse the approved `docs/superpowers/specs/2026-09-03-portal-backend-notification-boundaries-design.md` authority model.
- The authenticated server context supplies the current `shopId`; query and body input must reject client-supplied `shopId`.
- Use the existing `merchant-admin:employee-affiliation:read` permission; do not broaden role grants in this read-only step.
- Return only public NeeDoIDs and public employee fields; do not expose `ShopEmployee.id`, `User.id`, role IDs, affiliation IDs, or identity IDs.
- Keep `/merchant-admin/employees`, employee detail, schedule, payroll, compensation, and affiliation mutation behavior unchanged.
- Do not add employee writes, notification audience snapshots, frontend cutover, mock data, or a migration.
- The list is paginated, filters `deletedAt IS NULL`, avoids N+1 queries, and derives all rows from formal MySQL relations.

---

### Task 1: Lock the directory service contract

**Files:**
- Create: `backend/tests/shop-employee-directory.service.test.ts`
- Create: `backend/src/services/shop-employee-directory.service.ts`

**Interfaces:**
- Consumes: `AuthenticatedAccessContext`, `AuthRequestContext`, `PaginationInput`, and `requireMerchantShopId`.
- Produces: `ShopEmployeeDirectoryRepositoryPort`, `ShopEmployeeDirectoryItem`, `ShopEmployeeDirectoryListInput`, and `ShopEmployeeDirectoryService.listCurrentShopEmployees(...)`.

- [x] **Step 1: Write the failing service test**

  Cover these behaviors:

  1. A shop-scoped merchant forwards only the server-resolved `shopId` and validated list filters to the repository.
  2. A global or unrelated identity receives the existing 403 scope error before the repository is called.
  3. A successful read records `merchant_admin.employee_directory.list` against `shop_employee`, with only `{ shopId }` in audit metadata.

  Use this public item shape in fixtures:

  ```ts
  {
    needoId: "u0000000047",
    displayName: "斋藤 花子",
    avatarUrl: null,
    email: "staff@example.com",
    phone: null,
    status: "active",
    startsAt: "2026-08-28T00:00:00.000Z",
    endsAt: null,
    roles: [{
      code: "TECHNICIAN",
      names: { zhHans: "技师", zhHant: "技師", ja: "技術者", en: "Technician", ko: "기술자" },
      isTechnicianRole: true
    }],
    technician: {
      needoId: "s0000000047",
      relationshipType: "partner",
      workStatus: "active"
    }
  }
  ```

- [x] **Step 2: Run the service test to verify RED**

  Run from `backend/`:

  ```bash
  node ./node_modules/jest/bin/jest.js --runInBand tests/shop-employee-directory.service.test.ts
  ```

  Expected: FAIL because `shop-employee-directory.service.ts` does not exist.

- [x] **Step 3: Implement the minimal service**

  Define filters `keyword?: string`, `status?: "active" | "on_leave" | "suspended"`, and `roleCode?: string`. Resolve the shop exclusively with `requireMerchantShopId(actor)`, call `repository.listCurrentShopEmployees({ ...input, shopId })`, then record:

  ```ts
  {
    actor,
    action: "merchant_admin.employee_directory.list",
    targetType: "shop_employee",
    context,
    metadata: { shopId }
  }
  ```

- [x] **Step 4: Run the service test to verify GREEN**

  Run the exact command from Step 2. Expected: one suite passes with no warnings.

### Task 2: Implement the Prisma directory projection

**Files:**
- Create: `backend/tests/shop-employee-directory.repository.test.ts`
- Create: `backend/src/repositories/shop-employee-directory.repository.ts`

**Interfaces:**
- Consumes: `ShopEmployeeDirectoryRepositoryInput` from the service.
- Produces: `ShopEmployeeDirectoryRepository.listCurrentShopEmployees(input)` returning `PaginatedResponse<ShopEmployeeDirectoryItem>`.

- [x] **Step 1: Write the failing repository test**

  Use an injected Prisma-client double to prove:

  - `shopId`, current employee statuses, current time range, active user, non-deleted shop, employee, role assignment, and role filters are present.
  - pagination uses `skip` and `take`, and count uses the same `where` object.
  - keyword searches public user NeeDoID, username, email, phone, technician display name, technician public NeeDoID, and role code/names.
  - role filtering is server-side through an effective assignment.
  - mapping returns five localized role names and optional technician data, but serialized output contains no internal `id` fields.

- [x] **Step 2: Run the repository test to verify RED**

  ```bash
  node ./node_modules/jest/bin/jest.js --runInBand tests/shop-employee-directory.repository.test.ts
  ```

  Expected: FAIL because the repository module does not exist.

- [x] **Step 3: Implement the minimal Prisma query**

  Query `shopEmployee.findMany` and `shopEmployee.count` with one shared `Prisma.ShopEmployeeWhereInput`. Select the user, active role assignments, localized role fields, and optional linked `TechnicianShopAffiliation -> TechnicianProfile -> active S public identifier`. Order by `user.username`, then employee ID for deterministic pagination. Map status, relationship, and work-status enums to lowercase public values.

  Current rows satisfy all of:

  ```ts
  {
    shopId: input.shopId,
    status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    activeKey: { not: null },
    deletedAt: null,
    shop: { status: { not: "archived" }, deletedAt: null },
    user: { isActive: true, deletedAt: null }
  }
  ```

  Effective roles and technician relations must independently filter their start/end/status/deleted fields at the same injected `now` value.

- [x] **Step 4: Run the repository test to verify GREEN**

  Run the exact command from Step 2. Expected: one suite passes.

### Task 3: Expose the merchant-only paginated endpoint

**Files:**
- Create: `backend/tests/shop-employee-directory-api.test.ts`
- Create: `backend/tests/shop-employee-directory-openapi.test.ts`
- Create: `backend/src/validators/shop-employee-directory.validator.ts`
- Create: `backend/src/controllers/shop-employee-directory.controller.ts`
- Create: `backend/src/routes/shop-employee-directory.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Consumes: service and repository from Tasks 1-2, existing auth middleware, authorization middleware, and `successResponse`.
- Produces: `GET /api/v1/merchant-admin/employee-directory?page=1&pageSize=20&keyword=&status=&roleCode=`.

- [x] **Step 1: Write the failing HTTP and OpenAPI tests**

  Assert:

  - unauthenticated requests return 401;
  - missing `merchant-admin:employee-affiliation:read` returns 403;
  - a valid request returns the standard paginated envelope;
  - `shopId`, unknown query keys, malformed status, page size over 100, and role code over 64 characters return 400;
  - the service receives only parsed filters and the authenticated context;
  - the endpoint is 401 on `createMerchantApp` but 404 on `createOpsApp`;
  - OpenAPI documents auth, RBAC, pagination, filters, response fields, nullable technician projection, and error responses.

- [x] **Step 2: Run both tests to verify RED**

  ```bash
  node ./node_modules/jest/bin/jest.js --runInBand tests/shop-employee-directory-api.test.ts tests/shop-employee-directory-openapi.test.ts
  ```

  Expected: FAIL because the route and OpenAPI path do not exist.

- [x] **Step 3: Implement validator, controller, route, and dependency wiring**

  The strict query schema is:

  ```ts
  z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(["active", "on_leave", "suspended"]).optional(),
    roleCode: z.string().trim().min(1).max(64).optional()
  }).strict()
  ```

  Add optional `shopEmployeeDirectoryRepository` to `AppDependencies`. Mount the route with ownership `merchant-admin`, authenticate first, authorize with the existing read permission, validate the query, and keep all business logic in the service.

- [x] **Step 4: Add the OpenAPI contract**

  Document the exact route and public response shape. State that `needoId` is the user-level public NeeDoID and `technician.needoId` is present only for a current formally linked technician.

- [x] **Step 5: Run HTTP, OpenAPI, and portal-boundary tests to verify GREEN**

  ```bash
  node ./node_modules/jest/bin/jest.js --runInBand tests/shop-employee-directory-api.test.ts tests/shop-employee-directory-openapi.test.ts tests/portal-api-apps.test.ts
  ```

  Expected: all suites pass.

### Task 4: Document and verify the microstep

**Files:**
- Modify: `docs/backoffice-real-data.md`
- Modify: `docs/superpowers/plans/2026-09-03-shop-employee-directory-api.md`

**Interfaces:**
- Consumes: the completed endpoint.
- Produces: explicit acceptance and deferred-scope documentation.

- [x] **Step 1: Document the directory boundary**

  Record the endpoint, filters, public response fields, current-shop enforcement, existing permission reuse, and the fact that the old technician endpoints remain unchanged. Explicitly defer employee writes, frontend cutover, notification audience snapshots, migration deployment, and browser acceptance.

- [x] **Step 2: Run final verification**

  From `backend/`:

  ```bash
  ./node_modules/.bin/prisma validate --schema prisma/schema.prisma
  npm run build
  npm run lint
  node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js --runInBand \
    tests/shop-employee-directory.service.test.ts \
    tests/shop-employee-directory.repository.test.ts \
    tests/shop-employee-directory-api.test.ts \
    tests/shop-employee-directory-openapi.test.ts \
    tests/portal-api-apps.test.ts \
    tests/shop-employee-foundation-schema.test.ts \
    tests/shop-employee-foundation-checker.test.ts \
    tests/technician-shop-affiliation-api.test.ts
  ```

  From the repository root:

  ```bash
  git diff --check
  ```

  Expected: validation, build, lint, and every listed suite exit zero.

- [x] **Step 3: Commit only this microstep**

  Stage the service, repository, validator, controller, route, tests, `app.ts`, `openapi.ts`, documentation, and this plan. Commit as:

  ```bash
  git commit -m "feat(merchant): add formal employee directory API"
  ```
