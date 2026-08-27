# LifeDance Admin Real Operations Cohort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local formal super-administrator login in place with `admin@lifedance.com`, give that same account formally scoped identities for every requested portal, and build one database-backed LifeDance shop whose 20 staff, work chats, schedules, bookings, completed-service revenue, payroll, and payouts reconcile through the existing production-shaped APIs.

**Architecture:** Extend the current Prisma `TechnicianProfile` as the single source of truth for employment type, then carry that field through the existing Route → Controller → Service → Repository boundary and the two merchant staff surfaces. Reuse the existing guarded three-month Prisma seed to reassign the existing first 20 technician accounts to one LifeDance shop, append persisted staff IM data, and invoke the existing `CompensationEngine`, `PayrollService`, and `PayrollRepository` for compensation and pay runs. Keep the account row, immutable NeeDoID, order state machine, OrderFinancial, formal IM, and RBAC models; do not add a parallel mock or browser-local implementation.

**Tech Stack:** Node.js 22, TypeScript strict mode, Express, Zod, Prisma/MySQL 8, Redis, Jest/Supertest, React 19, Vite, Vitest, formal `/api/v1/` endpoints.

## Global Constraints

- Execute the five acceptance gates in order: A employment contract, B administrator and identities, C operating cohort, D staff IM, E payroll and settlement. Do not begin a later gate until the preceding gate is green.
- The user-supplied weak local password must only enter through an untracked local environment variable. Never add its literal value to source code, tests, snapshots, commands, generated account CSV/XLSX, or logs.
- The account update preserves the existing administrator `User.id`, `needoId`, and audit history. It must never delete the old row and create a replacement.
- If the legacy and target administrator emails resolve to two different active users, abort with a stable conflict. Do not merge rows automatically.
- All business records go through Prisma/MySQL and existing formal services. Do not add mock, demo, placeholder, localStorage, fallback arrays, `TODO`, or `FIXME` behavior.
- Synthetic names and work conversations are deliberately realistic but must not contain real personal identifiers, bank details, or externally deliverable contact information.
- The cohort runner remains restricted to local/test MySQL and requires `ALLOW_SIMULATION_SEED=true`; production, remote hosts, and production-looking database names must fail before any write.
- Preserve unrelated dirty-worktree changes. In particular, do not edit or stage the currently modified `README.md`, `docs/MOCK_RETIREMENT_MAP.md`, merchant-admin layout/dashboard/analytics files, or untracked `src/features/merchant-admin/` directory.
- `src/pages/mobile/MerchantPortalPage.tsx` is not currently dirty, but it is large. Modify only the formal employment data loading/mapping hunk and its imports; inspect the diff before every checkpoint.
- Use the real backend from `backend && npm run dev`; the root legacy `npm run dev:backend` is not acceptance evidence.
- Each checkpoint commit stages only task-owned paths. Do not push, deploy, run production data changes, send messages, or trigger real payments.

## Stable Dataset Contract

Use these constants in `backend/src/simulation/three-month-simulation-plan.ts` and import them everywhere instead of duplicating strings:

```ts
export const SIMULATION_NAMESPACE = "lifedance_real_ops_v1";
export const LIFEDANCE_ADMIN_EMAIL = "admin@lifedance.com";
export const LIFEDANCE_SHOP_KEY = "shop-001";
export const LIFEDANCE_SHOP_NAME = "LifeDance Wellness 渋谷";
export const LIFEDANCE_STAFF_KEYS = Array.from(
  { length: 20 },
  (_, index) => `technician-${String(index + 1).padStart(3, "0")}`
);
```

Visible shop descriptions, order notes, messages, notifications, and contact sources must not contain `demo`, `mock`, `simulation`, `SIM3M`, or `Simulation booking`. Internal metadata uses only `namespace: SIMULATION_NAMESPACE` plus stable record keys.

---

## Gate A — Persisted Employment Type

### Task 1: Add the employment enum and migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260827200000_technician_employment_type/migration.sql`
- Create: `backend/tests/technician-employment-schema.test.ts`

**Interfaces:**

- Produces Prisma enum `TechnicianEmploymentType`.
- Produces `TechnicianProfile.employmentType` and `TechnicianProfile.employmentStartedAt`.
- Keeps existing technician rows valid by defaulting them to `INDEPENDENT`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("persists technician employment rather than deriving it in the client", () => {
  const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  expect(schema).toContain("enum TechnicianEmploymentType");
  expect(schema).toContain("employmentType      TechnicianEmploymentType @default(INDEPENDENT)");
  expect(schema).toContain("employmentStartedAt DateTime?");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- tests/technician-employment-schema.test.ts`

Expected: FAIL because the enum and fields do not exist.

- [ ] **Step 3: Add the minimal Prisma model change**

```prisma
enum TechnicianEmploymentType {
  INDEPENDENT
  FULL_TIME
  TEMPORARY
}

model TechnicianProfile {
  // existing fields stay unchanged
  employmentType      TechnicianEmploymentType @default(INDEPENDENT) @map("employment_type")
  employmentStartedAt DateTime?                 @map("employment_started_at")
}
```

Create an additive MySQL migration:

```sql
ALTER TABLE `technician_profiles`
  ADD COLUMN `employment_type` ENUM('INDEPENDENT', 'FULL_TIME', 'TEMPORARY') NOT NULL DEFAULT 'INDEPENDENT',
  ADD COLUMN `employment_started_at` DATETIME(3) NULL;

CREATE INDEX `technician_profiles_shop_id_employment_type_idx`
  ON `technician_profiles`(`shop_id`, `employment_type`);
```

Add the matching Prisma composite index `@@index([shopId, employmentType])`; do not edit an already-applied migration.

- [ ] **Step 4: Regenerate the client and run the focused test/build**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- tests/technician-employment-schema.test.ts
npm --prefix backend run build
```

- [ ] **Step 5: Inspect migration diff**

Confirm the migration is additive, sets a safe default for existing rows, and does not drop or rewrite any existing technician data.

### Task 2: Carry employment through formal APIs and both merchant staff surfaces

**Files:**

- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-api.test.ts`
- Modify: `backend/tests/backoffice-technician-list-avatar.test.ts`
- Modify: `backend/tests/backoffice-profile-detail-openapi.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/lib/merchantStaffRoles.ts`
- Create: `src/lib/merchantStaffRoles.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`

**Interfaces:**

- API output: `employmentType: "independent" | "full_time" | "temporary"` and `employmentStartedAt: string | null`.
- PATCH input accepts the same lower-case enum and an optional ISO date-time/null.
- Merchant writes remain scoped to the authenticated shop and emit `merchant_admin.technician.update` with changed fields.
- The mobile shop page fetches the protected merchant technician list and never derives employment from list position or `identityLabel`.

- [ ] **Step 1: Add failing backend API assertions**

In the technician list/detail fixtures, return Prisma values `FULL_TIME` and `TEMPORARY`, then assert:

```ts
expect(response.body.data.list[0]).toMatchObject({
  employmentType: "full_time",
  employmentStartedAt: "2026-06-01T00:00:00.000Z"
});

await request(app)
  .patch("/api/v1/merchant-admin/technicians/7")
  .set("Authorization", `Bearer ${merchantToken}`)
  .send({ employmentType: "temporary", employmentStartedAt: "2026-08-01T00:00:00.000Z" })
  .expect(200);
```

Also assert that the same merchant cannot update a technician outside the current shop and that an unknown enum returns the normalized 400 response.

- [ ] **Step 2: Run backend tests and verify RED**

Run:

```bash
npm --prefix backend test -- tests/backoffice-api.test.ts tests/backoffice-technician-list-avatar.test.ts tests/backoffice-profile-detail-openapi.test.ts
```

- [ ] **Step 3: Extend validator, payload, repository mapping, and OpenAPI**

Use one explicit mapper at the repository boundary:

```ts
const employmentTypeFromDb = (
  value: TechnicianEmploymentType
): "independent" | "full_time" | "temporary" =>
  value === "FULL_TIME" ? "full_time" : value === "TEMPORARY" ? "temporary" : "independent";
```

Add the API fields:

```ts
export interface BackofficeTechnicianPayload {
  // existing fields
  employmentType: "independent" | "full_time" | "temporary";
  employmentStartedAt: string | null;
}
```

Add strict Zod input fields:

```ts
employmentType: z.enum(["independent", "full_time", "temporary"]).optional(),
employmentStartedAt: z.string().datetime().nullable().optional()
```

Map input back to Prisma in `updateTechnician`, include both fields in the merchant `safeInput`, and retain the existing scoped lookup before update. OpenAPI must use the same enum and `date-time`/null contract.

- [ ] **Step 4: Write the failing frontend employment mapping test**

```ts
expect(toMerchantStaffEmploymentType("full_time")).toBe("fullTime");
expect(toMerchantStaffEmploymentType("temporary")).toBe("partTime");
expect(toMerchantStaffEmploymentType("independent")).toBe("independent");
expect(getMerchantStaffEmploymentLabel("fullTime")).toBe("正社员");
expect(getMerchantStaffEmploymentLabel("partTime")).toBe("临时工");
expect(getMerchantStaffEmploymentLabel("independent")).toBe("独立技师");
```

The source-level page tests must assert:

```ts
expect(source).toContain("row.employmentType");
expect(source).not.toContain("index % 4");
expect(source).not.toContain("getMerchantStaffEmploymentType(technician, index)");
```

- [ ] **Step 5: Run frontend tests and verify RED**

Run:

```bash
npm test -- src/lib/merchantStaffRoles.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

- [ ] **Step 6: Implement formal UI consumption**

In `src/api/backofficeRealData.ts`, mirror the backend fields and include them in `BackofficeTechnicianUpdateInput`.

Extend `MerchantStaffEmploymentType` to `"fullTime" | "partTime" | "independent"`. In the desktop merchant people table, add an employment column and a select in the existing edit drawer. Reuse the established label helper; do not introduce raw English enum text. Add the new employment field/label copy to the existing Simplified Chinese, Traditional Chinese, Japanese, English, and Korean translation table and render it through the current i18n provider.

In `MerchantPortalPage.tsx`, fetch `backofficeRealDataApi.technicians("merchant-admin", { page: 1, pageSize: 100, status: "published" })` only in an authenticated merchant context, build a `Map<number, BackofficeTechnicianPayload>`, and resolve each displayed current-shop technician with:

```ts
const formalEmployment = formalStaffById.get(Number(technician.id))?.employmentType;
if (!formalEmployment) return null;
const employmentType = toMerchantStaffEmploymentType(formalEmployment);
```

Filter the joined result with a type guard after mapping. For the LifeDance shop all 20 returned employees are full-time or temporary, so no default value is displayed. The existing manual-employee editor may still create only full-time/temporary local draft rows until a formal create-staff API exists, but it must not override a persisted technician's value. On protected API failure or a missing join, show the formal error state; never fall back to index-, identity-label-, or default-based classification.

- [ ] **Step 7: Run Gate A verification**

Run:

```bash
npm --prefix backend test -- tests/technician-employment-schema.test.ts tests/backoffice-api.test.ts tests/backoffice-technician-list-avatar.test.ts tests/backoffice-profile-detail-openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
npm test -- src/lib/merchantStaffRoles.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
npm run lint
```

- [ ] **Step 8: Commit Gate A only**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260827200000_technician_employment_type/migration.sql backend/src/validators/backoffice.validator.ts backend/src/services/backoffice.service.ts backend/src/repositories/backoffice.repository.ts backend/src/api/openapi.ts backend/tests/technician-employment-schema.test.ts backend/tests/backoffice-api.test.ts backend/tests/backoffice-technician-list-avatar.test.ts backend/tests/backoffice-profile-detail-openapi.test.ts src/api/backofficeRealData.ts src/lib/merchantStaffRoles.ts src/lib/merchantStaffRoles.test.ts src/i18n/translations.ts src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/mobile/MerchantPortalPage.tsx
git commit -m "feat: persist technician employment type"
```

---

## Gate B — Administrator In-Place Migration and Portal Identities

### Task 3: Migrate the administrator row safely and revoke old sessions

**Files:**

- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/user-management-seed.test.ts`
- Create: `backend/tests/admin-account-seed.test.ts`
- Modify: `backend/src/constants/test-login.constants.ts`
- Modify: `backend/tests/auth.test.ts`

**Interfaces:**

- Default formal admin email becomes `admin@lifedance.com`; legacy lookup supports `admin@example.com` for one-way in-place migration.
- Admin display name becomes `LifeDance 管理员`.
- `seedUserManagement` accepts an injectable `AuthSessionStore`-shaped revoker for tests and the real `RedisAuthSessionStore` in the executable seed.
- Password is hashed with the existing `BCRYPT_ROUNDS = 12`; the literal local password never appears in these files.

- [ ] **Step 1: Add failing config and conflict tests**

```ts
expect(getAdminSeedConfig({
  NODE_ENV: "development",
  DEPLOY_ENV: "local",
  ADMIN_DEFAULT_PASSWORD: "Local-only-password!"
})).toMatchObject({
  email: "admin@lifedance.com",
  username: "LifeDance 管理员"
});
```

Build mocked Prisma transaction cases for:

1. only legacy email exists → update that same `id` and preserve `needoId`;
2. only target email exists → update it idempotently;
3. both emails point to the same row → update once;
4. both emails point to different active rows → throw `ADMIN_SEED_ACCOUNT_CONFLICT` before a write.

Assert the update increments `sessionGeneration`, creates an audit row with action `seed.admin_account.migrate`, and calls `revokeAllRefreshTokens(adminUserId)` after the transaction.

- [ ] **Step 2: Run seed tests and verify RED**

Run:

```bash
npm --prefix backend test -- tests/user-management-seed.test.ts tests/admin-account-seed.test.ts
```

- [ ] **Step 3: Replace email-only upsert with deterministic resolution**

Resolve both emails before writing:

```ts
const candidates = await tx.user.findMany({
  where: {
    email: { in: [adminConfig.email, LEGACY_ADMIN_EMAIL] },
    deletedAt: null
  },
  select: { id: true, needoId: true, email: true, isActive: true }
});

const distinctIds = new Set(candidates.filter((user) => user.isActive).map((user) => user.id));
if (distinctIds.size > 1) throw new Error("ADMIN_SEED_ACCOUNT_CONFLICT");
```

If a row exists, call `tx.user.update({ where: { id }, data: ... })`; allocate a new NeeDoID only when neither email exists. Update `emailVerifiedAt`, `passwordHash`, `username`, `isActive`, `deletedAt`, and increment `sessionGeneration` in the same transaction.

Create an `AuditLog` record whose metadata contains old/new email, preserved NeeDoID, and `namespace: "lifedance_real_ops_v1"`, but never contains a password/hash/token.

After commit, call `revokeAllRefreshTokens`. A revocation failure must fail the command loudly; DB session generation still invalidates old access/refresh generations.

- [ ] **Step 4: Update the formal test-login definition without embedding a password**

Keep the admin account entry keyed by the new email and display name. The password remains sourced through the existing test-login environment path.

Update auth tests so:

```ts
await request(app).post("/api/v1/auth/login")
  .send({ email: "admin@example.com", password: validPassword })
  .expect(401);

await request(app).post("/api/v1/auth/login")
  .send({ email: "admin@lifedance.com", password: validPassword })
  .expect(200);
```

- [ ] **Step 5: Run focused auth/seed verification**

Run:

```bash
npm --prefix backend test -- tests/user-management-seed.test.ts tests/admin-account-seed.test.ts tests/auth.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

### Task 4: Make the LifeDance shop and cross-portal identities idempotent

**Files:**

- Modify: `backend/src/simulation/three-month-simulation-plan.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`
- Modify: `backend/tests/three-month-simulation-plan.test.ts`
- Create: `backend/tests/lifedance-admin-identities-seed-contract.test.ts`

**Interfaces:**

- The first persisted simulation shop row is updated in place as `LifeDance Wellness 渋谷` and owned by the administrator.
- The same administrator gets active identities/roles: platform/global, customer/customer_profile, merchant_owner/shop, technician/technician_profile, scout/global.
- A private administrator technician profile has `shopId = null`, `status = "private"`, `employmentType = INDEPENDENT`, no TechnicianService, no availability, and no booking.
- One active `MerchantAccount` and one active `MerchantShopMembership` link the admin and LifeDance shop.
- The previous shop-001 owner loses only its merchant_owner identity/role for shop 001; its unrelated customer/technician/scout data is preserved.
- If the previous owner has the seed-created owner technician profile, detach that profile from shop 001 and make it private/independent so the LifeDance employee directory remains exactly technicians 001–020.

- [ ] **Step 1: Add failing plan and source contract tests**

```ts
expect(plan.shops[0]).toMatchObject({
  key: LIFEDANCE_SHOP_KEY,
  ownerEmail: LIFEDANCE_ADMIN_EMAIL,
  name: LIFEDANCE_SHOP_NAME
});
```

The seed contract test must require `merchantAccount.upsert`, `merchantShopMembership.upsert`, `type: "merchant_owner"`, `type: "technician"`, `type: "scout"`, and an administrator technician profile with `status: "private"`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm --prefix backend test -- tests/three-month-simulation-plan.test.ts tests/lifedance-admin-identities-seed-contract.test.ts
```

- [ ] **Step 3: Update the first shop and its ownership in the plan/seed**

Do not create an eleventh shop. Resolve the existing first shop by its stable key/account, capture the previous `ownerUserId`, update the shop in place, and update all dependent owner maps to the administrator user ID.

The shop values are:

```ts
{
  name: LIFEDANCE_SHOP_NAME,
  city: "東京都",
  address: "東京都渋谷区道玄坂1-12-1",
  phone: "050-9101-1001",
  description: "渋谷のボディケア、ヘッドケア、訪問リラクゼーションを提供するウェルネス店舗です。",
  status: "published"
}
```

Create/update the merchant account and membership with stable business keys; restore soft-deleted matching rows rather than duplicating them.

If the captured previous owner is not the administrator, deactivate/soft-delete only that user's `merchant_owner` identity and role scoped to the LifeDance shop, and write an audit row. Detach only its seed-created, non-bookable owner technician profile from the shop (`shopId = null`, `status = "private"`, `employmentType = INDEPENDENT`). Do not disable the user account or remove its other identities.

- [ ] **Step 4: Upsert exact admin identities and roles**

Reuse the existing seed helpers and `activeKey` uniqueness rules. Set only the platform identity as default. Use the admin's own customer and private technician profile IDs for those profile-scoped identities, the LifeDance shop ID for merchant_owner, and global scope for scout.

Do not delete other active platform administrators or their roles.

- [ ] **Step 5: Extend checker assertions for identity scope**

The checker must assert:

```ts
expectIdentity(admin, "platform", "global", null);
expectIdentity(admin, "customer", "customer_profile", admin.customerProfile.id);
expectIdentity(admin, "merchant_owner", "shop", lifedanceShop.id);
expectIdentity(admin, "technician", "technician_profile", admin.technicianProfile.id);
expectIdentity(admin, "scout", "global", null);
```

Also assert the legacy administrator email resolves to no active User, the prior shop-001 owner no longer has an active merchant_owner scope for LifeDance, both private owner/admin technician profiles are excluded, and the shop's employee count/bookable staff set is exactly technician 001–020.

- [ ] **Step 6: Run Gate B tests**

Run:

```bash
npm --prefix backend test -- tests/user-management-seed.test.ts tests/admin-account-seed.test.ts tests/auth.test.ts tests/three-month-simulation-plan.test.ts tests/lifedance-admin-identities-seed-contract.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 7: Commit Gate B only**

```bash
git add backend/prisma/seed.ts backend/src/constants/test-login.constants.ts backend/src/simulation/three-month-simulation-plan.ts backend/scripts/seed-three-month-simulation.ts backend/scripts/check-three-month-simulation.ts backend/tests/user-management-seed.test.ts backend/tests/admin-account-seed.test.ts backend/tests/auth.test.ts backend/tests/three-month-simulation-plan.test.ts backend/tests/lifedance-admin-identities-seed-contract.test.ts
git commit -m "feat: migrate lifedance admin identities"
```

---

## Gate C — LifeDance Staff, Schedule, Booking, and Order Finance

### Task 5: Rebuild the deterministic operating plan around technicians 1–20

**Files:**

- Modify: `backend/src/simulation/three-month-simulation-plan.ts`
- Modify: `backend/tests/three-month-simulation-plan.test.ts`

**Interfaces:**

- Existing technician keys 001–020 belong to the LifeDance shop.
- 001–010 use `FULL_TIME`; 011–020 use `TEMPORARY`; all have `employmentStartedAt = 2026-06-01T00:00:00.000Z`.
- Technicians 021–100 are distributed deterministically across shops 002–010, with 8–9 per shop and explicit employment values.
- Order numbers use a formal-looking stable prefix such as `LD2026-`, not `SIM3M-`.

- [ ] **Step 1: Replace count-only tests with per-technician invariants**

```ts
const lifeDanceStaff = plan.technicians.filter((tech) => tech.shopKey === LIFEDANCE_SHOP_KEY);
const toTokyoMonth = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 7);
expect(lifeDanceStaff).toHaveLength(20);
expect(lifeDanceStaff.slice(0, 10).every((tech) => tech.employmentType === "FULL_TIME")).toBe(true);
expect(lifeDanceStaff.slice(10).every((tech) => tech.employmentType === "TEMPORARY")).toBe(true);

for (const technician of lifeDanceStaff) {
  const slots = plan.scheduleSlots.filter((slot) => slot.technicianKey === technician.key);
  const bookings = plan.bookings.filter((booking) => booking.technicianKey === technician.key);
  expect(slots.length).toBeGreaterThanOrEqual(26);
  expect(bookings.length).toBeGreaterThanOrEqual(12);
  expect(bookings.filter((booking) => booking.status === "COMPLETED").length).toBeGreaterThanOrEqual(6);
  expect(bookings.some((booking) => booking.status === "CONFIRMED" && booking.startsAt > SIMULATION_AS_OF_AT)).toBe(true);
  for (const month of ["2026-06", "2026-07", "2026-08"]) {
    expect(bookings.some((booking) =>
      booking.status === "COMPLETED" && toTokyoMonth(booking.endsAt) === month
    )).toBe(true);
  }
}
```

Assert no two slots overlap for the same technician and every booking's shop/service/technician service keys agree. The per-month completed-order assertion is required because `PayrollService` correctly generates a payslip only for a technician with a qualifying source order; it guarantees 20 payslips in each of the three runs without adding fake zero-work payroll rows.

- [ ] **Step 2: Run the plan test and verify RED**

Run: `npm --prefix backend test -- tests/three-month-simulation-plan.test.ts`

- [ ] **Step 3: Implement assignment and formal visible copy**

Add employment fields to `SimulationTechnicianPlan`. Assign technicians 1–20 directly to shop 001; distribute the remaining 80 with `shops[1 + ((sequence - 21) % 9)]` so every remaining shop gets 8–9 staff.

Replace visible descriptions, status-history reasons, booking notes, and order prefix with natural operating copy. Internal cleanup selection uses `SIMULATION_NAMESPACE` and stable keys rather than visible labels.

- [ ] **Step 4: Run plan tests and inspect exact cohort counts**

Run: `npm --prefix backend test -- tests/three-month-simulation-plan.test.ts`

Record the exact resulting totals for slots, bookings, status distribution, and completed LifeDance orders in the checker output. Do not weaken per-technician minima to preserve an old global total.

### Task 6: Persist the reconfigured cohort and enforce order/finance reconciliation

**Files:**

- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`
- Create: `backend/tests/lifedance-real-operations-seed-contract.test.ts`
- Modify: `backend/tests/finance-seed-source.test.ts`

**Interfaces:**

- All technician profile, service, availability, schedule slot, booking, status history, and financial writes use plan-derived IDs inside Prisma transactions.
- Completed bookings have exactly one confirmed `OrderFinancial`; non-completed bookings have no confirmed financial.
- The existing OrderFinancial fields remain readable by backoffice and payroll.

- [ ] **Step 1: Add failing persistence/cleanup contract tests**

Require the seed to write `employmentType`, `employmentStartedAt`, the new namespace in `BookingOrder.serviceSnapshotJson`, and formal order numbers. `OrderFinancial` has no metadata column, so its cohort membership must be resolved through the unique `bookingOrderId` relation. Reject source code containing broad cleanup patterns such as `deleteMany({})` for business tables.

At Gate C, assert cleanup removes order reviews/timeline/financial/status-history dependents before cohort bookings, and schedule slots before availabilities. Payroll-period cleanup is added and tested later in Gate E, after payroll rows exist. Reactions-before-messages remains covered by the dedicated Gate D IM contract.

- [ ] **Step 2: Run source contract tests and verify RED**

Run:

```bash
npm --prefix backend test -- tests/lifedance-real-operations-seed-contract.test.ts tests/finance-seed-source.test.ts
```

- [ ] **Step 3: Persist employment and plan-derived shop relations**

When upserting each technician profile, write:

```ts
{
  shopId: getRequiredId(shopIds, technician.shopKey, "shop"),
  employmentType: technician.employmentType,
  employmentStartedAt: new Date(technician.employmentStartedAt),
  status: "published"
}
```

Ensure each TechnicianService, Availability, ScheduleSlot, BookingOrder, and OrderFinancial resolves the same `shopKey`. Do not patch foreign keys with SQL after seeding.

- [ ] **Step 4: Normalize completed and non-completed money behavior**

For each completed order create one financial with:

```ts
{
  serviceAmountJpy: booking.priceAmountJpy,
  offlineReportedServiceAmountJpy: booking.priceAmountJpy,
  paymentChannel: ordinal % 2 === 0 ? "offline_card" : "onsite_cash",
  serviceIncomeStatus: "confirmed",
  settlementStatus: "ready_for_payroll",
  platformFeePayerType: "shop",
  platformFeeBearerForPayroll: "shop",
  serviceIncomeConfirmedById: adminUserId,
  serviceIncomeConfirmedAt: new Date(booking.endsAt)
}
```

Do not create a confirmed financial for pending, confirmed, in-service, or cancelled orders.

- [ ] **Step 5: Strengthen the DB checker**

The checker must query actual persisted rows and fail unless:

- LifeDance has exactly 20 published employee technician profiles, excluding the admin's private profile;
- technician 001–010 are `FULL_TIME`, 011–020 are `TEMPORARY`;
- each of the 20 meets the slot/booking/completed/future-confirmed minima;
- no technician has overlapping slots;
- final BookingOrder status equals its latest OrderStatusHistory state;
- every completed cohort order has exactly one financial and all other cohort orders have no confirmed income;
- `serviceAmountJpy`, payment channel, confirmer, timeline, and settlement state are complete;
- the same order is visible in platform and merchant scoped repository queries.

Output JSON sections `account`, `shop`, `employment`, `schedule`, `bookingsByStatus`, and `orderFinancials` with exact totals.

- [ ] **Step 6: Run Gate C static verification**

Run:

```bash
npm --prefix backend test -- tests/three-month-simulation-plan.test.ts tests/lifedance-real-operations-seed-contract.test.ts tests/finance-seed-source.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 7: Commit Gate C only**

```bash
git add backend/src/simulation/three-month-simulation-plan.ts backend/scripts/seed-three-month-simulation.ts backend/scripts/check-three-month-simulation.ts backend/tests/three-month-simulation-plan.test.ts backend/tests/lifedance-real-operations-seed-contract.test.ts backend/tests/finance-seed-source.test.ts
git commit -m "feat: seed lifedance operating cohort"
```

---

## Gate D — Organization Directory and Staff Work Chats

### Task 7: Add admin-to-staff contacts, conversations, and realistic work messages

**Files:**

- Modify: `backend/src/simulation/three-month-simulation-plan.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`
- Modify: `backend/tests/three-month-simulation-plan.test.ts`
- Modify: `backend/tests/simulation-im-persistence-contract.test.ts`

**Interfaces:**

- IM participant types support the administrator without pretending it is a simulation customer or shop-owner account.
- Exactly 20 admin/staff DIRECT conversations, 40 directed Contact rows, and 10 messages per conversation are added.
- Existing customer conversations remain intact and continue passing their focused-customer assertions.

- [ ] **Step 1: Generalize the conversation plan contract in a failing test**

Replace the customer-specific pair shape with an explicit pair:

```ts
export interface SimulationConversationPlan {
  key: string;
  firstType: SimulationImParticipantType;
  firstKey: string;
  secondType: SimulationImParticipantType;
  secondKey: string;
  createdAt: string;
}

export interface SimulationContactPlan {
  key: string;
  ownerType: SimulationImParticipantType;
  ownerKey: string;
  contactType: SimulationImParticipantType;
  contactKey: string;
}
```

Add `"admin"` to `SimulationImParticipantType` and assert:

```ts
const staffConversations = plan.conversations.filter((item) =>
  item.key.startsWith("lifedance-staff-")
);
expect(staffConversations).toHaveLength(20);
expect(plan.contacts.filter((item) => item.key.startsWith("lifedance-staff-"))).toHaveLength(40);
expect(plan.messages.filter((item) => item.conversationKey.startsWith("lifedance-staff-"))).toHaveLength(200);
```

For each conversation, assert both senders appear and timestamps strictly increase.

- [ ] **Step 2: Run IM plan/contract tests and verify RED**

Run:

```bash
npm --prefix backend test -- tests/three-month-simulation-plan.test.ts tests/simulation-im-persistence-contract.test.ts
```

- [ ] **Step 3: Build deterministic natural work-chat plans**

Use 10 messages per employee, spaced across June–August. Each conversation must include both admin and technician senders and rotate through these natural Japanese topics:

```ts
[
  "来週のシフトを確認してください。変更希望は明日までにお願いします。",
  "確認しました。水曜日は12時から勤務できます。",
  "本日の訪問予約は渋谷駅南口で合流してください。",
  "承知しました。前の施術が終わり次第、到着予定を連絡します。",
  "タオルの在庫が少ないため、閉店前に補充をお願いします。",
  "補充完了しました。予備をバックヤード上段に置いています。",
  "先ほどの予約は完了処理まで進めてください。",
  "完了報告とお客様メモを登録しました。",
  "今月の給与明細を公開しました。内容を確認してください。",
  "確認しました。金額と勤務時間に問題ありません。"
]
```

Vary wording by deterministic templates so all 20 conversations are not byte-for-byte identical while preserving safe content.

- [ ] **Step 4: Persist through formal IM tables**

Resolve `admin` to the migrated admin user ID. Upsert/restore bidirectional contacts using stable owner/contact keys and `source: "lifedance_staff_seed"`. Create DIRECT conversations with exactly two active participants and messages with:

```ts
metadata: {
  namespace: SIMULATION_NAMESPACE,
  messageKey: message.key,
  purpose: "staff_operations"
}
```

Populate deterministic `lastReadAt`, `isPinned`, and `isMuted` values without altering message content or unread calculations in the service layer.

- [ ] **Step 5: Extend checker for organization and IM isolation**

Assert the organization API source query returns exactly the 20 LifeDance technicians with their persisted employment types. Separately assert 20 DIRECT conversations, two active participants each, 8–12 messages each, both senders, strict ordering, and 40 contacts.

Also assert no technician from shops 002–010 appears in the LifeDance merchant-scoped list or staff conversations.

- [ ] **Step 6: Run Gate D verification**

Run:

```bash
npm --prefix backend test -- tests/three-month-simulation-plan.test.ts tests/simulation-im-persistence-contract.test.ts tests/realtime-api.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 7: Commit Gate D only**

```bash
git add backend/src/simulation/three-month-simulation-plan.ts backend/scripts/seed-three-month-simulation.ts backend/scripts/check-three-month-simulation.ts backend/tests/three-month-simulation-plan.test.ts backend/tests/simulation-im-persistence-contract.test.ts
git commit -m "feat: seed lifedance staff conversations"
```

---

## Gate E — Compensation, Payroll, Payouts, and Settlement

### Task 8: Generate compensation and pay runs through formal services

**Files:**

- Create: `backend/src/simulation/lifedance-payroll-seed.ts`
- Create: `backend/tests/lifedance-payroll-seed.test.ts`
- Modify: `backend/src/services/payroll.service.ts`
- Modify: `backend/src/repositories/payroll.repository.ts`
- Modify: `backend/tests/payroll-api.test.ts`
- Create: `backend/tests/payroll-monthly-base.test.ts`
- Create: `backend/tests/payroll-settlement-repository.test.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`
- Modify: `backend/tests/lifedance-real-operations-seed-contract.test.ts`
- Modify: `backend/package.json`

**Interfaces:**

- The orchestrator depends on `PayrollService` methods rather than duplicating formulas.
- Technicians 1–10 get `base_plus_commission`, base 230,000 JPY, commission 20%, shop NDP bearer.
- Technicians 11–20 get `hourly`, 1,500 JPY/hour, worked minutes from completed BookingOrder start/end, shop NDP bearer.
- June and July runs finish paid with confirmed payout records; August finishes approved with non-zero unpaid amount.
- OrderFinancial moves `ready_for_payroll` → `payroll_approved` when its pay run is approved, then → `settled` only when the containing payslip is fully paid.

- [ ] **Step 1: Write a failing orchestration unit test with a fake service port**

Expose a narrow port:

```ts
export interface LifeDancePayrollPort {
  generateMerchantPayRun: PayrollService["generateMerchantPayRun"];
  publishMerchantPayRun: PayrollService["publishMerchantPayRun"];
  confirmTechnicianPayslip: PayrollService["confirmTechnicianPayslip"];
  approveMerchantPayRun: PayrollService["approveMerchantPayRun"];
  recordMerchantPayout: PayrollService["recordMerchantPayout"];
  confirmTechnicianPayoutRecord: PayrollService["confirmTechnicianPayoutRecord"];
}
```

Assert the call order for each month is generate → publish → 20 technician confirmations → approve. June/July then record 20 full payouts and confirm 20 payout records; August records none.

Assert each technician actor uses its own `technician_profile` scope and the merchant actor uses the LifeDance shop scope.

- [ ] **Step 2: Run the payroll seed test and verify RED**

Run: `npm --prefix backend test -- tests/lifedance-payroll-seed.test.ts`

- [ ] **Step 3: Upsert compensation profiles before generating pay runs**

Use stable profile rows with `effectiveFrom = 2026-06-01`, no overlapping active interval, and:

```ts
const fullTimeRule = {
  wageMode: "base_plus_commission",
  baseSalaryJpy: 230_000,
  fixedOrderPayJpy: 0,
  commissionRateBps: 2_000,
  hourlyRateJpy: 0,
  ndpFeeBearer: "shop",
  technicianNdpShareBps: 0
};

const temporaryRule = {
  wageMode: "hourly",
  baseSalaryJpy: 0,
  fixedOrderPayJpy: 0,
  commissionRateBps: 0,
  hourlyRateJpy: 1_500,
  ndpFeeBearer: "shop",
  technicianNdpShareBps: 0
};
```

Use the existing `TechnicianCompensationProfile` schema and repository resolution rules; do not calculate pay inside the seed.

- [ ] **Step 4: Make monthly base salary a once-per-payslip rule line**

Write `payroll-monthly-base.test.ts` around `PayrollService.generateMerchantPayRun` with two completed orders for one `base_plus_commission` technician. Assert the result contains:

```ts
expect(payslip.baseSalaryJpy).toBe(230_000);
expect(payslip.commissionJpy).toBe(4_000);
expect(payslip.netPayJpy).toBe(234_000);
expect(payslip.lines.filter((line) => line.lineType === "base_salary")).toEqual([
  expect.objectContaining({
    amountJpy: 230_000,
    sourceType: "rule",
    sourceId: compensationProfileId,
    orderId: null
  })
]);
expect(payslip.lines.filter((line) => line.sourceType === "order")).toHaveLength(2);
```

Run and verify RED:

```bash
npm --prefix backend test -- tests/payroll-monthly-base.test.ts
```

Update `PayrollService.buildDraft`/`getPayslipAccumulator` so `baseSalaryJpy` is added once when the technician accumulator is first created, represented by one `sourceType = "rule"` line. Keep `fixedOrderPayJpy` as the per-order base returned by `CompensationEngine`; never reuse it for the 230,000 JPY monthly base. Hourly temporary staff remain order/worked-minute based.

- [ ] **Step 5: Add formal payroll-to-order settlement tests**

Create a mocked-Prisma repository test proving that:

```ts
await repository.transitionPayRun({ payRunId: 61, status: "approved", approvedById: 1 });
expect(prisma.orderFinancial.updateMany).toHaveBeenCalledWith({
  where: {
    bookingOrderId: { in: [1001, 1002] },
    settlementStatus: "ready_for_payroll",
    deletedAt: null
  },
  data: { settlementStatus: "payroll_approved" }
});
```

Then fully pay one payslip and assert only the order IDs from that payslip's active `sourceType = "order"` lines move from `payroll_approved` to `settled`. A partial payout must leave them `payroll_approved`.

Update the service/API fake repository expectations so approval and payout still produce audit events and unchanged public response shapes.

Run and verify RED:

```bash
npm --prefix backend test -- tests/payroll-settlement-repository.test.ts tests/payroll-api.test.ts
```

- [ ] **Step 6: Implement settlement transitions inside PayrollRepository transactions**

Restrict `findPayrollSourceOrders` to `settlementStatus: "ready_for_payroll"` so an order cannot silently enter a second pay run.

When `transitionPayRun` approves a run, select its active order-source lines and update the matching financials to `payroll_approved` in the same Prisma transaction. When `addPayoutRecord` makes a payslip's unpaid amount zero, update only that payslip's order financials to `settled` in the same transaction. Do not mark any financial settled for a partial payout, failed payout, cancelled order, manual line, or August approval alone.

Keep settlement status changes in the repository transaction and service audit trail; do not issue post-hoc SQL from the seed.

- [ ] **Step 7: Implement the service-backed monthly workflow**

Instantiate `PayrollRepository(prisma)`, `AuditLogService(new AuditLogRepository(prisma))`, and `PayrollService` only after the main cohort transaction commits.

Use Tokyo month boundaries represented as UTC:

```ts
[
  ["2026-05-31T15:00:00.000Z", "2026-06-30T14:59:59.999Z"],
  ["2026-06-30T15:00:00.000Z", "2026-07-31T14:59:59.999Z"],
  ["2026-07-31T15:00:00.000Z", "2026-08-31T14:59:59.999Z"]
]
```

For June/July use a stable local payout method and reference number. Do not provide bank account data or call external payment APIs. For August stop after approval so `unpaidAmountJpy === totalNetPayJpy` and remains greater than zero.

- [ ] **Step 8: Make reruns safe**

Before regenerating a month, select the exact LifeDance pay run by shop and period. Delete/soft-delete only when every active payslip line with an order source points to a cohort order in `SIMULATION_NAMESPACE`; otherwise abort with `LIFEDANCE_PAYROLL_PERIOD_CONFLICT`.

Soft-delete active `PayoutRecord` → `PayslipLine` → `Payslip` → `PayRun` rows in that order using each model's `deletedAt`, and reset only those verified cohort order financials to `ready_for_payroll` before regeneration. If service orchestration fails after the main seed commit, run the same exact-period cleanup/reset and exit non-zero; never leave a partial month or physically erase unrelated history.

- [ ] **Step 9: Reconcile payroll and settlement in the checker**

Fail unless:

- exactly 20 active compensation profiles match the intended rules;
- exactly 3 cohort pay runs and 60 active payslips exist;
- each completed LifeDance order appears in exactly one `sourceType = "order"` payslip line in the correct Tokyo month;
- no incomplete/cancelled order appears in a payslip line;
- each payslip net equals its signed active line sum;
- each pay-run total equals its payslip total;
- June/July are paid, have 40 total full payout records, zero unpaid, and technician confirmation timestamps;
- August is approved, has no payout record, and retains full unpaid amount;
- June/July order financials are `settled`; August order financials are `payroll_approved`; none remain ambiguously `ready_for_payroll` after an approved run.

Output JSON sections `compensationProfiles`, `payRuns`, `payslips`, `payslipOrderLines`, `payoutRecords`, and `settlementReconciliation`.

- [ ] **Step 10: Add a single guarded convenience command**

Add a script that still relies on existing environment guards, for example:

```json
"seed:lifedance-operations": "tsx scripts/seed-three-month-simulation.ts",
"check:lifedance-operations": "tsx scripts/check-three-month-simulation.ts"
```

Do not embed environment variables or passwords in `package.json`.

- [ ] **Step 11: Run Gate E verification**

Run:

```bash
npm --prefix backend test -- tests/lifedance-payroll-seed.test.ts tests/lifedance-real-operations-seed-contract.test.ts tests/payroll-monthly-base.test.ts tests/payroll-settlement-repository.test.ts tests/payroll-api.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 12: Commit Gate E only**

```bash
git add backend/src/simulation/lifedance-payroll-seed.ts backend/src/services/payroll.service.ts backend/src/repositories/payroll.repository.ts backend/scripts/seed-three-month-simulation.ts backend/scripts/check-three-month-simulation.ts backend/tests/lifedance-payroll-seed.test.ts backend/tests/lifedance-real-operations-seed-contract.test.ts backend/tests/payroll-monthly-base.test.ts backend/tests/payroll-settlement-repository.test.ts backend/tests/payroll-api.test.ts backend/package.json
git commit -m "feat: seed lifedance payroll settlement"
```

---

## Local Application, Full Regression, and Acceptance

### Task 9: Apply, verify, and walk every portal with the real local services

**Files:**

- Create: `docs/lifedance-real-operations-cohort.md`
- Do not modify: `README.md`
- Do not modify: `docs/MOCK_RETIREMENT_MAP.md`

**Preconditions:**

- Local MySQL and Redis are running.
- `backend/.env.local` or the active shell contains `DATABASE_URL`, `REDIS_URL`, `ADMIN_DEFAULT_PASSWORD`, and `SIMULATION_DEFAULT_PASSWORD`; the file is ignored and never staged.
- `NODE_ENV=development`, `DEPLOY_ENV=local`, and `ALLOW_SIMULATION_SEED=true` are explicit for the data command.

- [ ] **Step 1: Inspect the final task diff before database writes**

Run:

```bash
git status --short
git diff --check
git diff -- backend/prisma backend/src backend/scripts backend/tests src/api src/lib src/pages docs/lifedance-real-operations-cohort.md
```

Confirm unrelated dirty files are neither staged nor modified by this work.

- [ ] **Step 2: Apply the additive migration and run User Management seed**

With secrets already loaded in the shell:

```bash
npm --prefix backend exec prisma migrate deploy
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:seed
```

Immediately verify by formal login/API that the target email works and legacy email returns the generic invalid-credentials response. Do not print the password, hash, refresh token, or access token.

- [ ] **Step 3: Seed and check the LifeDance cohort**

```bash
NODE_ENV=development DEPLOY_ENV=local ALLOW_SIMULATION_SEED=true npm --prefix backend run seed:lifedance-operations
NODE_ENV=development DEPLOY_ENV=local ALLOW_SIMULATION_SEED=true npm --prefix backend run check:lifedance-operations
```

Run the seed and checker a second time. The second checker output must have the same business counts and no duplicate identities, contacts, conversations, messages, order financials, pay runs, payslips, or payouts.

- [ ] **Step 4: Run the complete automated suite**

```bash
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
npm run lint
npm test
npm run build -- --mode formal
```

Do not classify an unrelated existing failure as this task's pass. If a baseline failure exists, record the exact command/error and rerun all task-focused suites separately.

- [ ] **Step 5: Start formal local services**

Backend:

```bash
cd backend
npm run dev
```

Frontend, in a separate terminal:

```bash
npm run dev:frontend -- --port 5180
```

Verify `/api/v1/health`, `/api/v1/ready`, and the frontend proxy before browser work.

- [ ] **Step 6: Perform browser acceptance with the formal account**

Use the `webapp-testing` skill during execution. Inspect actual rendered fields and network-backed persistence; do not rely on screenshots alone.

1. Login: target email succeeds, legacy email fails, logout/relogin succeeds.
2. Operations admin: inspect User, LifeDance Shop, 20 staff, orders, per-order status history, finance settlement, and all three pay runs.
3. Merchant admin: inspect LifeDance overview, exactly 20 employees, 1–10 “正社员”, 11–20 “临时工”, schedules, appointments, income, and payroll center.
4. Store/mobile merchant portal: inspect the organization directory and staff conversations; refresh and relogin to prove persistence.
5. Technician portal: switch to the admin's private technician identity; then sample one full-time and one temporary technician account for schedule, bookings, earnings, payslip, and paid confirmation.
6. User portal: switch the admin to customer identity and confirm the portal loads without leaking backoffice-only tags/notes.
7. Affiliate marketing: switch to scout identity and confirm the formal available affiliate capability loads.
8. Cross-shop isolation: confirm shop 002 staff/chats/orders do not appear inside the LifeDance merchant scope.

- [ ] **Step 7: Trace representative orders end to end**

Choose at least one completed June order from a full-time technician and one completed July order from a temporary technician. Record only non-secret business IDs and verify this chain:

```text
BookingOrder.orderNo
  → latest OrderStatusHistory = COMPLETED
  → unique OrderFinancial with confirmed service income
  → PayslipLine(sourceType=order, orderId=BookingOrder.id)
  → Payslip
  → PayRun
  → PayoutRecord
  → technicianConfirmedAt
```

Choose one August completed order and verify it reaches the approved unpaid payslip but has no payout record yet. Choose one cancelled order and prove it has neither confirmed income nor an order payroll line.

- [ ] **Step 8: Write the operations/acceptance runbook**

In `docs/lifedance-real-operations-cohort.md`, document:

- the local/test-only safety boundary;
- required environment variable names, never values;
- migration, seed, checker, and rerun commands;
- expected exact checker totals from the final plan;
- account email and portal identity matrix, but not the password;
- representative order trace IDs and browser acceptance outcomes;
- rollback scope limited to `lifedance_real_ops_v1`;
- clear status separation: local implementation, committed, pushed, deployed, production accepted.

- [ ] **Step 9: Final diff and verification checkpoint**

Run:

```bash
git status --short
git diff --check
git diff --stat
git log --oneline -6
```

Review every task-owned file, confirm secrets are absent with a targeted search for the user-supplied password, and ensure no unrelated dirty file is staged.

- [ ] **Step 10: Commit only the runbook/checker evidence**

```bash
git add docs/lifedance-real-operations-cohort.md
git commit -m "docs: record lifedance cohort acceptance"
```

## Completion Criteria

The implementation is complete only when all of the following are true:

- the target administrator email authenticates through formal Auth and the legacy email does not;
- the same preserved User row exposes all five formal identities needed for the six requested entry points;
- LifeDance has exactly 20 persisted employees with the requested full-time/temporary split;
- all 20 have persisted schedules, bookings, completed fulfillment, and confirmed completed-order financials;
- the admin and all 20 staff have persisted contacts and natural work conversations;
- three formal pay runs, 60 payslips, per-order lines, and June/July payout confirmations reconcile;
- the checker is green twice in succession;
- backend and frontend lint/test/build are green or any unrelated baseline failure is explicitly separated with task suites green;
- each requested portal has been manually inspected against the live local UI after refresh/relogin;
- no secret, mock data path, production write, push, deploy, or external payment occurred.
