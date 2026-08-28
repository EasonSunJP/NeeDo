# NeeDo 员工从属关系与 NeeDoID 身份地基实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless the user explicitly requests them.

**Goal:** 建立全局唯一技师档案与多店员工从属关系的正式地基，以技师身份 canonical `s...` NeeDoID 提供店铺作用域的员工列表、详情与从属维护 API，并通过可审计回填把现有单店关系安全迁移到新表。

**Architecture:** 保留 `User → UserIdentity(type=technician) → TechnicianProfile` 作为账号和全局技师档案链路，新增 `TechnicianShopAffiliation` 表达店铺关系。新 API 严格走 `Route → Controller → Service → Repository → Prisma`，由既有 `IdentifierAllocator/PublicIdentifierRepository` 解析技师身份公开号，由 JWT 当前店铺决定作用域，不接受客户端 `shopId`。旧 `TechnicianProfile.shopId/employmentType` 本微步骤只作为回填来源和现有页面兼容字段，不作为新 API 权威；下一微步骤在切换员工卡后再退役旧商户路由。

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7.8, MySQL 8.0/UTF8MB4, Zod, JWT/RBAC, Jest/Supertest, existing AuditLog and unified PublicIdentifier foundation.

## Global Constraints

- 本计划只执行设计规格中的微步骤 1：从属与身份地基。不要改员工卡视觉、日程投影、薪酬、结账周期、财务结清或时间线。
- 不新增 mock、demo、placeholder、browser-local persistence、假 API 或自动转账暗示。
- 新公开员工路由只接受 active technician identity 的 canonical `PublicIdentifier.kind = S`；不得读取、拼接或回退到旧 `User.needoId`、`User.id`、`TechnicianProfile.id`。
- 一个 `TechnicianProfile` 继续全局唯一；多店关系只能通过 `TechnicianShopAffiliation` 表达，不能复制技师档案。
- `TechnicianProfile.status` 继续表示资料发布状态；`TechnicianShopAffiliation.workStatus` 表示在职/合作状态，两者不得混用。
- `active`、`on_leave`、`suspended` 都属于“当前关系”；只有 `ended` 或软删除行不属于当前关系。
- 当前关系的 `activeKey` 固定为 `technician:<technicianProfileId>:shop:<shopId>`；结束关系时置空，历史行保留。
- 专属关系与合作关系的互斥必须在数据库事务和技师行锁内判断，不能只在前端校验。
- 商户请求的店铺 ID 只来自 authenticated identity scope；body、query、path 均不接受 `shopId`。
- 对未从属当前店铺的员工详情统一返回 404，不能通过错误差异枚举其他店铺关系。
- 所有写操作都有 Zod、RBAC、OpenAPI、事务和 AuditLog；审计 metadata 不含邮箱、电话、姓名或完整公开号。
- migration 仅新增表、枚举、索引和关系；不得删除或改写旧字段。回填单独 dry-run/apply，非开发环境 apply 前必须有数据库备份。
- 保留并绕开用户当前未提交改动。尤其不要在本微步骤修改已经 dirty 的 `src/api/backofficeRealData.ts`、`src/api/backofficeRealData.test.ts` 或 `docs/backoffice-real-data.md`。
- 每个任务只提交列出的文件；不要使用 `git add .`。

## Scope Boundary

本微步骤完成后：

- 新表、新回填工具、新 `/merchant-admin/employees` 正式 API 可独立运行和验收；
- 新 API 的员工列表与详情只读取 affiliation 和 canonical technician public ID；
- 现有 `/merchant-admin/technicians` 页面继续原样运行，尚未切到新 API；
- 旧 `TechnicianProfile.shopId/employmentType` 仍保留，供旧页面兼容和回滚，但不得被新 API 读取为关系权威；
- 下一计划负责切换并重构“员工详细信息卡”，成功验收后再移除旧商户技师详情/雇佣写路径。

后续独立计划依次处理：

1. 员工详细信息卡骨架、顶部身份、基础资料和真实编辑；
2. 多店日程投影、灰色脱敏锁定与共享日程组件；
3. 卡内薪酬规则、统计与工资单连接；
4. 店铺/员工结账周期和日本法定节假日规则；
5. 财务人工支付登记与最终结清；
6. 自然语言动态记录和完整浏览器验收。

## Public Contract

```text
GET /api/v1/merchant-admin/employees
GET /api/v1/merchant-admin/employees/:needoId
PUT /api/v1/merchant-admin/employees/:needoId/affiliation
```

- `needoId` 是 technician identity 的 canonical `s` + 10 位数字。
- 列表分页并支持 `keyword`、`workStatus`、`relationshipType`。
- `PUT` 是当前店铺关系的幂等 create/update/end；店铺由 JWT scope 提供。
- response 可以携带内部主键供服务间关联，但前端不得展示；用户可见账号标签只有 `needoId`。

核心 response：

```ts
export interface MerchantEmployeePayload {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  profileStatus: string;
  verifiedAt: string | null;
  affiliation: {
    id: number;
    relationshipType: "exclusive" | "partner";
    workStatus: "active" | "on_leave" | "suspended" | "ended";
    startsAt: string;
    endsAt: string | null;
    shop: { id: number; publicId: string; name: string };
  };
}
```

## File Map

- `backend/prisma/schema.prisma`: affiliation enums/model and relations on `User`, `Shop`, and `TechnicianProfile`.
- `backend/prisma/migrations/20260828100000_technician_shop_affiliation_foundation/migration.sql`: additive table, FKs, unique key and indexes.
- `backend/tests/technician-shop-affiliation-schema.test.ts`: schema/migration contract.
- `backend/scripts/backfill-technician-shop-affiliations.ts`: deterministic dry-run/apply planner and Prisma runtime.
- `backend/scripts/check-technician-shop-affiliation-cutover.ts`: fail-closed readiness report.
- `backend/tests/technician-shop-affiliation-backfill.test.ts`: mapping, evidence, conflict and idempotency tests.
- `backend/src/repositories/technician-shop-affiliation.repository.ts`: public-ID target lookup, paginated reads, row lock, transactional upsert/end.
- `backend/src/services/technician-shop-affiliation.service.ts`: scope, invariant, safe error and audit orchestration.
- `backend/tests/technician-shop-affiliation.repository.test.ts`: transaction/locking/data-access tests.
- `backend/tests/technician-shop-affiliation.service.test.ts`: domain/RBAC-scope/audit tests.
- `backend/src/validators/technician-shop-affiliation.validator.ts`: public ID, list and mutation schemas.
- `backend/src/controllers/technician-shop-affiliation.controller.ts`: request/response only.
- `backend/src/routes/technician-shop-affiliation.routes.ts`: authentication, permissions, validation and wiring.
- `backend/src/app.ts`: affiliation/public-identifier dependency seams and route registration.
- `backend/src/constants/error-codes.ts`: stable not-found/conflict codes.
- `backend/src/constants/permissions.constants.ts`: read/write permission catalog and role assignment.
- `backend/src/api/openapi.ts`: employee schemas and three routes.
- `backend/tests/technician-shop-affiliation-api.test.ts`: Supertest envelope, RBAC, scope and validation coverage.
- `backend/tests/technician-shop-affiliation-permissions.test.ts`: permission catalog/role coverage.
- `backend/tests/backoffice-profile-detail-openapi.test.ts`: protects current OpenAPI while adding the employee contract.
- `backend/package.json`: backfill and cutover checker scripts.
- `docs/employee-affiliation.md`: authority, migration, API, rollback and next-step boundary.
- `README.md`: concise link and verification commands.

---

### Task 1: Add the affiliation schema and additive migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260828100000_technician_shop_affiliation_foundation/migration.sql`
- Create: `backend/tests/technician-shop-affiliation-schema.test.ts`

**Interfaces:**

- Produces: `TechnicianShopAffiliation`, `TechnicianShopRelationshipType`, `TechnicianShopWorkStatus`.
- Preserves: `TechnicianProfile.shopId`, `employmentType`, `employmentStartedAt` as nullable/legacy-compatible inputs for later cutover.

- [ ] **Step 1: Write the failing schema contract test**

```ts
it("defines one soft-deletable shop affiliation authority", () => {
  const model = modelBlock("TechnicianShopAffiliation");
  expect(model).toMatch(/technicianProfileId\s+Int\s+@map\("technician_profile_id"\)/);
  expect(model).toMatch(/shopId\s+Int\s+@map\("shop_id"\)/);
  expect(model).toMatch(/activeKey\s+String\?\s+@unique/);
  expect(model).toMatch(/@@index\(\[technicianProfileId, workStatus, deletedAt\]\)/);
  expect(model).toMatch(/@@index\(\[shopId, workStatus, deletedAt\]\)/);
  expect(model).toMatch(/@@index\(\[shopId, technicianProfileId, deletedAt\]\)/);
  for (const field of ["createdAt", "updatedAt", "deletedAt"]) {
    expect(model).toContain(field);
  }
});
```

Also assert that the migration creates lowercase enum values, FKs with `RESTRICT`, the unique `active_key`, all listed indexes, and does not drop/change legacy technician columns.

- [ ] **Step 2: Run schema RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-schema.test.ts
```

Expected: FAIL because the model and migration do not exist.

- [ ] **Step 3: Add the Prisma enums/model and relations**

```prisma
enum TechnicianShopRelationshipType {
  EXCLUSIVE @map("exclusive")
  PARTNER   @map("partner")

  @@map("technician_shop_relationship_type")
}

enum TechnicianShopWorkStatus {
  ACTIVE    @map("active")
  ON_LEAVE  @map("on_leave")
  SUSPENDED @map("suspended")
  ENDED     @map("ended")

  @@map("technician_shop_work_status")
}

model TechnicianShopAffiliation {
  id                  Int                            @id @default(autoincrement())
  technicianProfileId Int                            @map("technician_profile_id")
  shopId              Int                            @map("shop_id")
  relationshipType    TechnicianShopRelationshipType @map("relationship_type")
  workStatus          TechnicianShopWorkStatus       @default(ACTIVE) @map("work_status")
  startsAt            DateTime                       @default(now()) @map("starts_at")
  endsAt              DateTime?                      @map("ends_at")
  activeKey           String?                        @unique @map("active_key") @db.VarChar(191)
  createdById         Int?                           @map("created_by_id")
  updatedById         Int?                           @map("updated_by_id")
  createdAt           DateTime                       @default(now()) @map("created_at")
  updatedAt           DateTime                       @updatedAt @map("updated_at")
  deletedAt           DateTime?                      @map("deleted_at")

  technicianProfile TechnicianProfile @relation(fields: [technicianProfileId], references: [id], onDelete: Restrict)
  shop              Shop              @relation(fields: [shopId], references: [id], onDelete: Restrict)
  createdBy         User?             @relation("TechnicianShopAffiliationCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy         User?             @relation("TechnicianShopAffiliationUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  @@index([technicianProfileId, workStatus, deletedAt])
  @@index([shopId, workStatus, deletedAt])
  @@index([shopId, technicianProfileId, deletedAt])
  @@index([createdById])
  @@index([updatedById])
  @@index([deletedAt])
  @@map("technician_shop_affiliations")
}
```

Add named relation arrays to `User`, and `technicianShopAffiliations` arrays to `Shop` and `TechnicianProfile`.

- [ ] **Step 4: Generate and inspect the additive migration**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate:dev -- --name technician_shop_affiliation_foundation
```

Inspect the generated SQL. It may create only enums/table/indexes/FKs; it must not update existing data or drop/change `technician_profiles.shop_id`, `employment_type`, or `employment_started_at`.

- [ ] **Step 5: Run schema GREEN and Prisma validation**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-schema.test.ts tests/technician-employment-schema.test.ts
npm --prefix backend exec prisma validate -- --schema prisma/schema.prisma
```

Expected: both suites PASS and Prisma reports a valid schema.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828100000_technician_shop_affiliation_foundation/migration.sql backend/tests/technician-shop-affiliation-schema.test.ts
git commit -m "feat: add technician shop affiliation schema"
```

---

### Task 2: Build a dry-run-first legacy backfill and cutover audit

**Files:**

- Create: `backend/scripts/backfill-technician-shop-affiliations.ts`
- Create: `backend/scripts/check-technician-shop-affiliation-cutover.ts`
- Create: `backend/tests/technician-shop-affiliation-backfill.test.ts`
- Modify: `backend/package.json`

**Interfaces:**

- Produces: `planTechnicianShopAffiliationBackfill(batch): { operations, issues }`.
- Produces: `runTechnicianShopAffiliationBackfill(runtime, { mode, batchSize })`.
- Produces: JSON report with counts only and issue codes; no names, emails, phone numbers or tokens.

- [ ] **Step 1: Write failing pure planner tests**

Cover these exact rules:

```ts
expect(plan(fullTimeWithShopAndSId).operations[0]).toMatchObject({
  relationshipType: "EXCLUSIVE",
  workStatus: "ACTIVE"
});
expect(plan(temporaryWithShopAndSId).operations[0]).toMatchObject({
  relationshipType: "PARTNER",
  workStatus: "ACTIVE"
});
expect(plan(independentWithVerifiedBusinessEvidence).operations[0]).toMatchObject({
  relationshipType: "PARTNER"
});
expect(plan(independentWithoutEvidence).issues).toContainEqual(
  expect.objectContaining({ code: "INDEPENDENT_RELATION_UNVERIFIED" })
);
```

Valid business evidence is at least one non-deleted current-shop row in `TechnicianService`, `Service`, `BookingOrder`, `ScheduleSlot`, or `TechnicianCompensationProfile`. Also test missing active `S` public ID, deleted shop, mismatched existing affiliation, duplicate active key, exclusive conflict, `shopId=null`, rerun idempotency and bounded batches.

- [ ] **Step 2: Run planner RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-backfill.test.ts
```

Expected: FAIL because the backfill module does not exist.

- [ ] **Step 3: Implement the pure plan/report types**

```ts
export type TechnicianShopAffiliationBackfillMode = "dry-run" | "apply";

export interface TechnicianShopAffiliationBackfillIssue {
  technicianProfileId: number;
  code:
    | "TECHNICIAN_PUBLIC_ID_MISSING"
    | "SHOP_NOT_ACTIVE"
    | "INDEPENDENT_RELATION_UNVERIFIED"
    | "AFFILIATION_MISMATCH"
    | "EXCLUSIVE_CONFLICT";
}

export interface TechnicianShopAffiliationBackfillOperation {
  technicianProfileId: number;
  shopId: number;
  relationshipType: "EXCLUSIVE" | "PARTNER";
  startsAt: Date;
  activeKey: string;
}
```

`shopId=null` is a deliberate skip, not an issue. Any issue makes apply fail closed before writes. `FULL_TIME` maps to exclusive; `TEMPORARY` maps to partner; `INDEPENDENT` maps only when evidence exists.

- [ ] **Step 4: Implement bounded Prisma scan and idempotent apply**

The runtime scans ordered `TechnicianProfile.id` batches and selects only required fields/evidence. Apply uses `createMany({ skipDuplicates: true })` only after a complete clean planning pass; it never updates or deletes legacy rows. Rerunning after success must plan zero operations and report `ready=true`.

Before planning affiliations, invoke the existing unified identifier dry-run checker. If any technician lacks an active `S` identity identifier, report `TECHNICIAN_PUBLIC_ID_MISSING`; never fall back to `User.needoId`.

- [ ] **Step 5: Add CLI parsing and package scripts**

```json
{
  "backfill:technician-shop-affiliations": "tsx scripts/backfill-technician-shop-affiliations.ts",
  "check:technician-shop-affiliation-cutover": "tsx scripts/check-technician-shop-affiliation-cutover.ts"
}
```

Supported arguments are `--mode=dry-run|apply` and `--batch-size=1..500`. Default mode is `dry-run`. The checker always dry-runs and exits 1 unless unified IDs are ready, issue count is zero, and pending operations are zero after apply.

- [ ] **Step 6: Run GREEN and dry-run against the configured local database**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-backfill.test.ts tests/unified-identifier-backfill.test.ts tests/unified-identity-cutover-audit.test.ts
ENV_FILE=.env.dev npm --prefix backend run backfill:technician-shop-affiliations -- --mode=dry-run --batch-size=100
```

Expected: tests PASS; dry-run prints only counts/issue codes and changes zero rows. If issues exist, stop and preserve the report; do not run apply.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/scripts/backfill-technician-shop-affiliations.ts backend/scripts/check-technician-shop-affiliation-cutover.ts backend/tests/technician-shop-affiliation-backfill.test.ts backend/package.json
git commit -m "feat: add technician affiliation backfill audit"
```

---

### Task 3: Implement the transactional affiliation repository and service

**Files:**

- Create: `backend/src/repositories/technician-shop-affiliation.repository.ts`
- Create: `backend/src/services/technician-shop-affiliation.service.ts`
- Create: `backend/tests/technician-shop-affiliation.repository.test.ts`
- Create: `backend/tests/technician-shop-affiliation.service.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**

- Consumes: active `PublicIdentifier(kind=S)`, active technician `UserIdentity`, global `TechnicianProfile`, authenticated merchant shop scope.
- Produces: paginated employee list, current-shop employee detail, and atomic current affiliation upsert/end.

- [ ] **Step 1: Write failing service tests**

Test list/detail/upsert with `currentIdentityScopeType="shop"`; reject global/customer identities; resolve only active `S` IDs; return safe 404 for absent/out-of-shop detail; record reads and writes; exclude personal fields from audit metadata.

```ts
await service.upsertCurrentShopAffiliation(actorForShop(16), context, "s0000000047", {
  relationshipType: "partner",
  workStatus: "active",
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: null
});

expect(repository.upsertCurrentAffiliation).toHaveBeenCalledWith(
  expect.objectContaining({ shopId: 16, publicId: "s0000000047", actorUserId: 86 })
);
expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
  action: "merchant_admin.employee_affiliation.update",
  metadata: expect.not.objectContaining({ publicId: expect.anything() })
}));
```

- [ ] **Step 2: Run service RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Define repository/service payloads**

```ts
export type EmployeeRelationshipType = "exclusive" | "partner";
export type EmployeeWorkStatus = "active" | "on_leave" | "suspended" | "ended";

export interface TechnicianShopAffiliationRepositoryPort {
  listCurrentShopEmployees(input: EmployeeListRepositoryInput): Promise<PaginatedResponse<MerchantEmployeePayload>>;
  findCurrentShopEmployee(shopId: number, technicianIdentityId: number): Promise<MerchantEmployeePayload | null>;
  upsertCurrentAffiliation(input: AffiliationMutationRepositoryInput): Promise<MerchantEmployeePayload | "not_found" | "exclusive_conflict">;
}
```

The service receives `Pick<IdentifierAllocator, "resolve">`, resolves every path public ID through the existing unified resolver, requires `kind === "S"` and a non-null `userIdentityId`, then passes only that identity ID to the repository. The repository query joins `active technician UserIdentity → active PublicIdentifier → User → TechnicianProfile → current affiliation → Shop`. It must never select `User.needoId` for the public response.

- [ ] **Step 4: Write failing repository transaction tests**

Use a transaction-capable Prisma test double and assert:

- employee list filters `shopId`, `deletedAt=null`, and work status in `ACTIVE/ON_LEAVE/SUSPENDED`;
- detail also requires the exact active `S` public ID and current-shop affiliation;
- mutation first locks `technician_profiles.id` with `FOR UPDATE`;
- new exclusive is rejected when any other current relation exists;
- new partner is rejected when any current exclusive exists;
- partner may coexist at A and B;
- converting partner to exclusive is rejected while another current relation exists;
- ending sets `workStatus=ENDED`, `endsAt`, `activeKey=null`, and preserves the row;
- rejoining after ended creates a new row with a new current `activeKey`;
- concurrent creation can produce at most one current row for the same technician/shop.

- [ ] **Step 5: Run repository RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.repository.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 6: Reuse the unified public-ID resolver and implement the locked transaction**

Resolve the public ID in the service before entering repository logic:

```ts
const identifier = await this.identifierResolver.resolve(publicId);
if (!identifier || identifier.kind !== "S" || identifier.userIdentityId === null) {
  throw this.notFound();
}
```

Then start the transaction with the exact active technician identity target:

```ts
const target = await tx.userIdentity.findFirst({
  where: {
    id: input.technicianIdentityId,
    type: "technician",
    isActive: true,
    deletedAt: null,
    publicIdentifier: {
      is: {
        kind: "S",
        status: "ACTIVE",
        deletedAt: null,
      }
    },
    user: { is: { isActive: true, deletedAt: null } }
  },
  select: { userId: true }
});
```

Resolve the single non-deleted `TechnicianProfile` by `userId`, then lock it with parameterized Prisma SQL:

```ts
await tx.$queryRaw(
  Prisma.sql`SELECT id FROM technician_profiles WHERE id = ${profile.id} AND deleted_at IS NULL FOR UPDATE`
);
```

Read all current affiliations under the same transaction, enforce the exclusive/partner rules, then create/update/end. Map the response from the same transaction and exact current shop.

- [ ] **Step 7: Add stable errors and service audit orchestration**

Add unique codes after the current 40927 boundary:

```ts
TECHNICIAN_AFFILIATION_NOT_FOUND: 40411,
TECHNICIAN_AFFILIATION_CONFLICT: 40928,
```

Use messages `error.technician_affiliation.not_found` and `error.technician_affiliation.exclusive_conflict`. Detail and target resolution both use the same 404. Only a valid target with an invariant collision returns 409.

- [ ] **Step 8: Run repository/service GREEN and strict build**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.repository.test.ts tests/technician-shop-affiliation.service.test.ts
npm --prefix backend run build
```

Expected: both suites PASS and TypeScript build exits 0.

- [ ] **Step 9: Commit Task 3**

```bash
git add backend/src/repositories/technician-shop-affiliation.repository.ts backend/src/services/technician-shop-affiliation.service.ts backend/src/constants/error-codes.ts backend/tests/technician-shop-affiliation.repository.test.ts backend/tests/technician-shop-affiliation.service.test.ts
git commit -m "feat: enforce technician shop affiliations"
```

---

### Task 4: Expose the protected employee API with Zod, RBAC and OpenAPI

**Files:**

- Create: `backend/src/validators/technician-shop-affiliation.validator.ts`
- Create: `backend/src/controllers/technician-shop-affiliation.controller.ts`
- Create: `backend/src/routes/technician-shop-affiliation.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/technician-shop-affiliation-api.test.ts`
- Create: `backend/tests/technician-shop-affiliation-permissions.test.ts`
- Modify: `backend/tests/backoffice-profile-detail-openapi.test.ts`

**Interfaces:**

- `merchant-admin:employee-affiliation:read`
- `merchant-admin:employee-affiliation:write`
- All responses use `{ code: 0, message: "success", data }`.

- [ ] **Step 1: Write failing validator and HTTP contract tests**

```ts
export const merchantEmployeeParamSchema = z.object({
  needoId: publicIdentifierSchema.refine(
    (value) => value.kind === "S",
    "Technician NeeDoID is required"
  ).transform((value) => value.publicId)
});

export const merchantEmployeeListQuerySchema = paginationSchema.extend({
  keyword: z.string().trim().max(100).optional(),
  relationshipType: z.enum(["exclusive", "partner"]).optional(),
  workStatus: z.enum(["active", "on_leave", "suspended"]).optional()
});
```

Mutation body is strict and allows `relationshipType`, `workStatus`, `startsAt`, `endsAt`; `workStatus="ended"` requires `endsAt`, while other statuses require `endsAt=null`. Test malformed IDs, `u...`, client-supplied `shopId`, unknown fields, bad time order, missing auth, missing permissions, correct pagination envelope and safe 404/409.

- [ ] **Step 2: Run API RED**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-api.test.ts
```

Expected: FAIL with route 404.

- [ ] **Step 3: Implement a thin controller and route factory**

```ts
router.get(
  "/merchant-admin/employees",
  authenticate(),
  authorize(EMPLOYEE_AFFILIATION_PERMISSIONS.read),
  validateRequest({ query: merchantEmployeeListQuerySchema }),
  controller.list
);
router.get(
  "/merchant-admin/employees/:needoId",
  authenticate(),
  authorize(EMPLOYEE_AFFILIATION_PERMISSIONS.read),
  validateRequest({ params: merchantEmployeeParamSchema }),
  controller.detail
);
router.put(
  "/merchant-admin/employees/:needoId/affiliation",
  authenticate(),
  authorize(EMPLOYEE_AFFILIATION_PERMISSIONS.write),
  validateRequest({ params: merchantEmployeeParamSchema, body: merchantEmployeeAffiliationBodySchema }),
  controller.upsertAffiliation
);
```

Construct `IdentifierAllocator` with `dependencies.publicIdentifierRepository ?? new PublicIdentifierRepository()`, then construct the affiliation repository, service and AuditLogService in the route factory. Add optional `publicIdentifierRepository` and `technicianShopAffiliationRepository` dependency seams to `AppDependencies`, then register the route before the OpenAPI route.

- [ ] **Step 4: Add permission definitions and least-privilege role assignment**

Add both permission definitions to the catalog. Assign read/write only to the existing shop-scoped merchant roles that already receive `merchant-admin:technicians:list/write`; do not grant them to customer, technician, or global platform-finance roles. Later payroll plans add the separate finance permissions required for settlement-cycle and payout operations.

Permission tests must prove uniqueness, merchant assignment and absence from customer/technician roles.

- [ ] **Step 5: Add exact OpenAPI schemas and paths**

Document query filters, `s##########` path format, request body, pagination, employee payload, 400/401/403/404/409, and standard envelopes. State that `shopId` comes from authenticated identity and is not a request parameter.

- [ ] **Step 6: Run API/RBAC/OpenAPI GREEN**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-api.test.ts tests/technician-shop-affiliation-permissions.test.ts tests/backoffice-profile-detail-openapi.test.ts tests/openapi.test.ts
npm --prefix backend run build
```

Expected: all suites PASS and build exits 0.

- [ ] **Step 7: Commit Task 4**

```bash
git add backend/src/validators/technician-shop-affiliation.validator.ts backend/src/controllers/technician-shop-affiliation.controller.ts backend/src/routes/technician-shop-affiliation.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/technician-shop-affiliation-api.test.ts backend/tests/technician-shop-affiliation-permissions.test.ts backend/tests/backoffice-profile-detail-openapi.test.ts
git commit -m "feat: expose merchant employee affiliation API"
```

---

### Task 5: Verify migration, backfill, isolation and rollback documentation

**Files:**

- Create: `docs/employee-affiliation.md`
- Modify: `README.md`

**Interfaces:**

- Documents: authority, mappings, API, RBAC, audit actions, dry-run/apply, cutover check, rollback boundary and next microstep.

- [ ] **Step 1: Apply the migration to the local formal database**

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

Expected: migration applies once and status reports up to date.

- [ ] **Step 2: Run dry-run, inspect issues, then apply only when clean**

```bash
ENV_FILE=.env.dev npm --prefix backend run check:unified-identifier-cutover -- --batch-size=100
ENV_FILE=.env.dev npm --prefix backend run backfill:technician-shop-affiliations -- --mode=dry-run --batch-size=100
```

If either command reports issues, stop; do not mutate data. Resolve only by repairing the authoritative identity/business rows in a separately reviewed change. When both are clean and a local backup exists:

```bash
ENV_FILE=.env.dev npm --prefix backend run backfill:technician-shop-affiliations -- --mode=apply --batch-size=100
ENV_FILE=.env.dev npm --prefix backend run check:technician-shop-affiliation-cutover -- --batch-size=100
```

Expected: apply reports created rows; final checker reports `ready=true`, zero issues and zero pending operations.

- [ ] **Step 3: Verify formal API behavior with two merchant scopes**

Use existing formal auth helpers/Supertest fixtures, not a browser mock. Prove:

1. Shop A lists its exclusive and partner employees.
2. Shop B lists the shared partner after its affiliation is added.
3. Shop A cannot detail a Shop B-only employee.
4. A partner may exist in A and B.
5. Creating an exclusive relation while another current relation exists returns safe 409.
6. Ending the B relation removes the employee from B's current list without deleting the global profile or A relation.
7. Every write creates one shop-scoped audit record.

- [ ] **Step 4: Run focused and full verification**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation-schema.test.ts tests/technician-shop-affiliation-backfill.test.ts tests/technician-shop-affiliation.repository.test.ts tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts tests/technician-shop-affiliation-permissions.test.ts tests/backoffice-profile-detail-openapi.test.ts
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend run format:check
```

Expected: every command exits 0. If an unrelated pre-existing test/lint failure remains, capture its exact file/error and do not describe the full suite as passing.

- [ ] **Step 5: Write the operations/rollback document**

`docs/employee-affiliation.md` must state:

- current authority and relationship/work-status semantics;
- exact backfill evidence and issue codes;
- backup requirement and commands;
- canonical `S` public ID rule;
- API/RBAC/audit actions;
- old route is still compatibility-only and not yet cut over;
- rollback is code rollback plus ignoring the additive affiliation rows; legacy columns remain intact;
- dropping the table or deleting affiliation history is not part of rollback;
- next accepted microstep is the employee detail card cutover.

- [ ] **Step 6: Commit Task 5**

```bash
git add docs/employee-affiliation.md README.md
git commit -m "docs: record employee affiliation foundation"
```

## Acceptance Gate

Do not start the employee-card UI plan until all are true:

- additive migration applied and `prisma:status` is clean;
- unified identifier cutover checker is ready;
- affiliation backfill checker reports zero issues/pending operations;
- employee list/detail never reads legacy `User.needoId` or exposes numeric IDs as labels;
- exclusive/partner invariants pass transaction and concurrent-write tests;
- cross-shop detail isolation returns safe 404;
- RBAC, Zod, OpenAPI and AuditLog tests pass;
- focused tests, full backend test, lint, build and format check are honestly reported;
- no existing merchant page or unrelated dirty file was overwritten.

After this gate, write and execute the separate “员工详细信息卡基础结构与真实编辑” plan. That next plan will switch the current merchant UI to `/merchant-admin/employees`, rename the drawer, remove visible internal profile/account IDs, and retire the old merchant employment mutation only after browser acceptance.
