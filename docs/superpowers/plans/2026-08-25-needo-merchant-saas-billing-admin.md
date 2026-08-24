# NeeDo Merchant SaaS Billing Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real merchant-group cards, SaaS trial/billing controls, manual payment review, overdue highlighting, and manual suspension enforcement in the NeeDo operations admin.

**Architecture:** Add an explicit merchant-account aggregate and a versioned SaaS billing profile backed by Prisma. Keep calendar policy in a pure service, route all writes through audited services and repositories, expose typed `/api/v1/backoffice` endpoints, and render the existing admin cards from those APIs. Booking availability and booking creation read the same suspension state so UI state cannot bypass enforcement.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma 7/MySQL 8, Zod, Jest/Supertest, React 19, Vite 7, Vitest, existing NeeDo i18n and Tailwind utilities.

## Global Constraints

- Execute only this Step 12 feature; do not add mock, demo, placeholder, fake API, Stripe network calls, or unrelated refactors.
- Preserve the React / TSX / Vite frontend and the existing operations-admin card topology.
- Every new database table has `id`, `createdAt`, `updatedAt`, `deletedAt`; every relation is indexed and every delete is soft.
- Every new API uses `/api/v1`, Zod, OpenAPI, JWT, granular RBAC, uniform JSON envelopes, and audit logs.
- Lists are paginated and exclude `deletedAt IS NOT NULL`; controllers do not access Prisma or contain business rules.
- Dates are stored in UTC and SaaS calendar policy is resolved in `Asia/Tokyo`.
- A single-person shop is always free and never accumulates trial/free duration; a trial interrupted for any reason can never resume.
- Non-free service is prepaid before natural-month day 1; annual price is `monthlyFeeJpy * 10` for 12 natural months.
- Overdue state is operations-admin-only red highlighting and never triggers automatic suspension.
- Suspension is manual, preserves existing bookings and in-service work, blocks new availability/bookings, and does not prohibit login.
- Existing unrelated staged and unstaged changes must remain untouched.

---

### Task 1: Pure SaaS calendar and billing policy

**Files:**
- Create: `backend/src/services/saas-billing-policy.service.ts`
- Test: `backend/tests/saas-billing-policy.service.test.ts`

**Interfaces:**
- Produces: `class SaasBillingPolicyService` with `classifyShop`, `calculateInitialTrial`, `calculateExtension`, `calculateAnnualFee`, `resolveState`, and `formatFreeDuration`.
- Produces types: `BillingSubjectType`, `BillingCadence`, `TrialStatus`, `BillingState`, `FreePeriodInput`, `BillingProfileSnapshot`.

- [ ] **Step 1: Write failing classification and trial tests**

```ts
describe("SaasBillingPolicyService", () => {
  const policy = new SaasBillingPolicyService();

  it.each([[0], [1]])("keeps %i active technicians free", (activeTechnicians) => {
    expect(policy.classifyShop(activeTechnicians)).toEqual({ type: "single_shop", billable: false });
  });

  it("starts the only trial when a shop reaches two technicians", () => {
    expect(policy.classifyShop(2)).toEqual({ type: "shop", billable: true });
    expect(policy.calculateInitialTrial(new Date("2026-08-10T00:00:00+09:00"))).toMatchObject({
      paidFrom: new Date("2026-10-31T15:00:00.000Z"),
      automaticBonusDays: 0
    });
  });

  it("adds the non-counting 15-day bonus for a late-month start", () => {
    expect(policy.calculateInitialTrial(new Date("2026-08-20T00:00:00+09:00"))).toMatchObject({
      paidFrom: new Date("2026-11-30T15:00:00.000Z"),
      automaticBonusDays: 15
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/saas-billing-policy.service.test.ts`

Expected: FAIL because `saas-billing-policy.service.ts` does not exist.

- [ ] **Step 3: Implement the pure policy API**

```ts
export type BillingCadence = "monthly" | "annual" | "free";
export type TrialStatus = "not_started" | "active" | "completed" | "interrupted" | "not_applicable";
export type BillingState = "trial" | "paid" | "free" | "overdue";

export interface InitialTrialResult {
  startsAt: Date;
  endsAt: Date;
  paidFrom: Date;
  automaticBonusDays: 0 | 15;
}

export class SaasBillingPolicyService {
  public classifyShop(activeTechnicians: number) {
    return activeTechnicians >= 2
      ? { type: "shop" as const, billable: true }
      : { type: "single_shop" as const, billable: false };
  }

  public calculateAnnualFee(monthlyFeeJpy: number): number {
    return monthlyFeeJpy * 10;
  }
}
```

Implement Tokyo civil-date helpers with `Intl.DateTimeFormat`, UTC storage, `[start, end)` intervals, and no new runtime dependency.

- [ ] **Step 4: Add failing tests for interruption, extensions, state, and duration**

```ts
it("never restarts an interrupted trial", () => {
  expect(policy.resolveState({ trialStatus: "interrupted", cadence: "monthly", paidThrough: null }, new Date("2026-09-01"))).toBe("overdue");
});

it("limits admin extensions to three and accepts a paid-from date", () => {
  expect(policy.calculateExtension({ currentEndsAt, extensionCount: 2, paidFrom })).toMatchObject({ extensionCount: 3 });
  expect(() => policy.calculateExtension({ currentEndsAt, extensionCount: 3, paidFrom })).toThrow("error.saas_billing.trial_extension_limit");
});

it("charges ten monthly fees for twelve annual months", () => {
  expect(policy.calculateAnnualFee(9800)).toBe(98000);
});
```

- [ ] **Step 5: Finish policy implementation and verify GREEN**

Run: `cd backend && npm test -- --runTestsByPath tests/saas-billing-policy.service.test.ts`

Expected: PASS with all policy tests and no warning output.

- [ ] **Step 6: Commit Task 1 only**

```bash
git add backend/src/services/saas-billing-policy.service.ts backend/tests/saas-billing-policy.service.test.ts
git commit -m "feat: add SaaS billing calendar policy"
```

### Task 2: Prisma merchant, billing, invoice, payment, and suspension foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260825090000_merchant_saas_billing_admin/migration.sql`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Test: `backend/tests/merchant-saas-billing-schema.test.ts`

**Interfaces:**
- Consumes: billing enum vocabulary from Task 1.
- Produces Prisma models: `MerchantAccount`, `MerchantShopMembership`, `SaasBillingProfile`, `SaasFreePeriod`, `SaasInvoice`, `SaasInvoiceLine`, `SaasPayment`, `EntitySuspension`.
- Produces relations on `User`, `Shop`, and `TechnicianProfile` without changing existing relation behavior.

- [ ] **Step 1: Write a failing schema contract test**

```ts
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

it.each([
  "model MerchantAccount",
  "model MerchantShopMembership",
  "model SaasBillingProfile",
  "model SaasFreePeriod",
  "model SaasInvoice",
  "model SaasInvoiceLine",
  "model SaasPayment",
  "model EntitySuspension"
])("contains %s", (model) => expect(schema).toContain(model));
```

- [ ] **Step 2: Run schema test and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/merchant-saas-billing-schema.test.ts`

Expected: FAIL on the first missing model.

- [ ] **Step 3: Add Prisma models and explicit indexes**

Use string columns for business enums to keep existing migration conventions and avoid a destructive MySQL enum rewrite. Required uniqueness:

```prisma
model SaasBillingProfile {
  id                Int       @id @default(autoincrement())
  subjectType       String    @map("subject_type") @db.VarChar(40)
  subjectId         Int       @map("subject_id")
  activeKey         String?   @unique @map("active_key") @db.VarChar(80)
  billingCadence    String    @default("monthly") @map("billing_cadence") @db.VarChar(40)
  monthlyFeeJpy     Int       @default(9800) @map("monthly_fee_jpy")
  cadenceLocked     Boolean   @default(false) @map("cadence_locked")
  amountLocked      Boolean   @default(false) @map("amount_locked")
  trialStatus       String    @default("not_started") @map("trial_status") @db.VarChar(40)
  trialStartedAt    DateTime? @map("trial_started_at")
  trialEndsAt       DateTime? @map("trial_ends_at")
  trialUsedAt       DateTime? @map("trial_used_at")
  paidThrough       DateTime? @map("paid_through")
  paymentProvider   String    @default("manual") @map("payment_provider") @db.VarChar(40)
  version           Int       @default(1)
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")

  @@index([subjectType, subjectId])
  @@index([trialStatus])
  @@index([paidThrough])
  @@index([deletedAt])
  @@map("saas_billing_profiles")
}
```

`activeKey` is `${subjectType}:${subjectId}` for the current Profile and becomes `NULL` when archived, which provides a real MySQL uniqueness guarantee despite nullable soft-delete columns. All other models follow the same timestamp/soft-delete/index contract and store explicit actor IDs and idempotency keys where required.

- [ ] **Step 4: Create the matching MySQL migration**

The SQL creates all eight tables with `utf8mb4_unicode_ci`, indexes each foreign key, adds foreign keys with `RESTRICT` or `SET NULL`, and adds no destructive changes to existing tables except nullable relations where required.

- [ ] **Step 5: Add RBAC permissions and real development seeds**

Add the nine exact permissions from the design to `SYSTEM_PERMISSION_DEFINITIONS` and assign read/write permissions to `admin` and `operator`; do not grant suspension, payment review, or dissolution permissions to merchant roles. Seed one real `MerchantAccount`, four `MerchantShopMembership` rows, group/shop billing Profiles, initial free-period records, and deterministic manual invoices against existing core-read shops so `/admin/merchants` can be verified without frontend mock data.

- [ ] **Step 6: Generate Prisma and verify schema**

Run: `cd backend && npm run prisma:generate`

Expected: Prisma client generation succeeds.

Run: `cd backend && npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 7: Run schema and seed tests**

Run: `cd backend && npm test -- --runTestsByPath tests/merchant-saas-billing-schema.test.ts tests/user-management-seed.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2 only**

```bash
git add backend/prisma backend/src/constants/permissions.constants.ts backend/tests/merchant-saas-billing-schema.test.ts
git commit -m "feat: add merchant SaaS billing schema"
```

### Task 3: Audited merchant billing read/write API

**Files:**
- Create: `backend/src/services/merchant-saas-billing.service.ts`
- Create: `backend/src/repositories/merchant-saas-billing.repository.ts`
- Create: `backend/src/validators/merchant-saas-billing.validator.ts`
- Create: `backend/src/controllers/merchant-saas-billing.controller.ts`
- Create: `backend/src/routes/merchant-saas-billing.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/merchant-saas-billing-api.test.ts`

**Interfaces:**
- Consumes: `SaasBillingPolicyService` and generated Prisma models.
- Produces: `MerchantSaasBillingRepositoryPort`, `MerchantSaasBillingService`, paginated `MerchantAccountCardPayload`, and all `/backoffice/merchant-accounts`, `/billing-subjects`, `/saas-invoices`, membership, billing-profile, trial, and manual-payment routes from the design, including `POST /backoffice/merchant-accounts`.
- Produces: `PaymentProvider` and `ManualReviewPaymentProvider`; Stripe is represented only by the interface discriminator, with no external request.

- [ ] **Step 1: Write failing Supertest cases for list, RBAC, and update validation**

```ts
it("returns grouped cards with nested shops and derived billing state", async () => {
  const response = await request(app)
    .get("/api/v1/backoffice/merchant-accounts?page=1&pageSize=20")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
  expect(response.body.data.list[0]).toMatchObject({
    type: "merchant_group",
    paymentResponsibility: "group_consolidated",
    shops: expect.any(Array)
  });
});

it("rejects billing writes without backoffice:saas-billing:write", async () => {
  await request(app)
    .patch("/api/v1/backoffice/shops/11/billing-profile")
    .set("Authorization", `Bearer ${viewerToken}`)
    .send({ billingCadence: "annual", monthlyFeeJpy: 9800, cadenceLocked: true })
    .expect(403);
});
```

- [ ] **Step 2: Run API test and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/merchant-saas-billing-api.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement Zod schemas and typed controller handlers**

Required validators include paginated queries, positive IDs, subject type union, billing cadence union, non-negative integer JPY, version integer, extension quick-month union `1 | 2 | 3`, ISO paid-from date, payment responsibility union, and manual payment amount/date/reference.

- [ ] **Step 4: Implement repository with batched relations**

The list repository performs one paginated merchant query, one membership/shop query for returned merchant IDs, one grouped technician count query, and batched profile/suspension queries. It must not issue one query per card.

- [ ] **Step 5: Implement audited service methods**

Every write accepts `AuthenticatedAccessContext` and `AuthRequestContext`, validates optimistic `version`, calls the pure policy, writes within a Prisma transaction, and records before/after metadata through `AuditLogService`.

Manual payment review creates `SaasPayment`, marks the matching invoice paid, and advances `paidThrough` exactly once using the payment idempotency key.

- [ ] **Step 6: Wire routes and OpenAPI**

Add `merchantSaasBillingRepository?: MerchantSaasBillingRepositoryPort` to `AppDependencies`, mount the route factory after current backoffice routes, and declare response/request schemas and all permission requirements in OpenAPI.

- [ ] **Step 7: Verify API GREEN and regression tests**

Run: `cd backend && npm test -- --runTestsByPath tests/merchant-saas-billing-api.test.ts tests/backoffice-api.test.ts tests/openapi.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 3 only**

```bash
git add backend/src backend/tests/merchant-saas-billing-api.test.ts
git commit -m "feat: add merchant SaaS billing APIs"
```

### Task 4: Manual suspension and booking enforcement

**Files:**
- Extend: `backend/src/services/merchant-saas-billing.service.ts`
- Extend: `backend/src/repositories/merchant-saas-billing.repository.ts`
- Extend: `backend/src/validators/merchant-saas-billing.validator.ts`
- Extend: `backend/src/controllers/merchant-saas-billing.controller.ts`
- Extend: `backend/src/routes/merchant-saas-billing.routes.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Test: `backend/tests/entity-suspension.service.test.ts`
- Test: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Produces: `createSuspension`, `releaseSuspension`, `softDeleteMerchant`, `softDeleteShop`.
- Produces repository method `isShopSuspended(shopId, client?)` and error key `error.entity.suspended`.
- Booking availability and booking creation consume active suspension state; existing order transitions do not.

- [ ] **Step 1: Write failing suspension service tests**

```ts
it("blocks only unbooked slots and preserves existing bookings", async () => {
  await service.createSuspension(actor, context, "shop", 11, {
    reasonCodes: ["overdue_payment"],
    note: "Manual operations action",
    scope: "subject_only"
  });
  expect(repository.blockUnbookedSlots).toHaveBeenCalledWith(11, expect.any(Date));
  expect(repository.cancelBookings).not.toHaveBeenCalled();
});

it("detaches shops and promotes deterministic account admins", async () => {
  await service.createSuspension(actor, context, "merchant_group", 5, {
    reasonCodes: ["serious_violation"],
    note: "Group only",
    scope: "merchant_detach_shops"
  });
  expect(repository.detachShopsAndPromoteAdmins).toHaveBeenCalledWith(5, actor.userId);
});
```

- [ ] **Step 2: Run suspension tests and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/entity-suspension.service.test.ts`

Expected: FAIL because suspension methods are missing.

- [ ] **Step 3: Implement suspension transactions**

Validate multi-select reason codes, require note, create immutable suspension history, block only `AVAILABLE` future slots with `bookedCount = 0`, preserve booked slots/orders, and write group-wide or detach-shop behavior in a single transaction.

- [ ] **Step 4: Write failing booking enforcement tests**

Add cases proving suspended-shop slots are absent from `GET /schedule/availability`, `POST /bookings` returns 409 for a suspended shop, and an existing confirmed order can still transition to `IN_SERVICE` and `COMPLETED`.

- [ ] **Step 5: Enforce suspension in booking repository and service**

Add an active-suspension relation filter to availability and the transactional slot lookup. Preserve the existing slot-unavailable response for races, but use `error.entity.suspended` when a direct pre-check identifies suspension.

- [ ] **Step 6: Add soft-delete guards**

Before shop deletion, count `PENDING`, `CONFIRMED`, and `IN_SERVICE` orders. Return a 409 business error when count is nonzero. Merchant deletion requires explicit `detach_shops` or `delete_eligible_shops` strategy.

- [ ] **Step 7: Verify suspension and booking GREEN**

Run: `cd backend && npm test -- --runTestsByPath tests/entity-suspension.service.test.ts tests/booking-api.test.ts`

Expected: PASS with existing booking-state tests unchanged.

- [ ] **Step 8: Commit Task 4 only**

```bash
git add backend/src backend/tests/entity-suspension.service.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: enforce manual merchant suspension"
```

### Task 5: Typed frontend API and group-card view model

**Files:**
- Create: `src/api/merchantSaasBilling.ts`
- Create: `src/features/merchant-saas-billing/model.ts`
- Test: `src/features/merchant-saas-billing/model.test.ts`
- Modify: `src/api/staticDemo.ts` only to reject unsupported billing writes explicitly when static demo is active; do not add fake billing data.

**Interfaces:**
- Consumes backend `MerchantAccountCardPayload` and write DTOs.
- Produces `merchantSaasBillingApi`, `formatBillingState`, `formatFreeDuration`, `calculateGroupMonthlyTotal`, and UI-safe discriminated unions.

- [ ] **Step 1: Write failing view-model tests**

```ts
it("excludes single shops from consolidated monthly total", () => {
  expect(calculateGroupMonthlyTotal(groupWithFourPaidAndOneSingle)).toBe(49000);
});

it("marks overdue only for operations presentation", () => {
  expect(formatBillingState("overdue")).toEqual({ label: "逾期未付", overdue: true });
});
```

- [ ] **Step 2: Run frontend model test and verify RED**

Run: `npm test -- src/features/merchant-saas-billing/model.test.ts`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement typed API and pure formatter**

Use the existing `httpClient.request` and never import domain mocks. All mutations return the updated authoritative group or shop card payload.

- [ ] **Step 4: Verify frontend model GREEN**

Run: `npm test -- src/features/merchant-saas-billing/model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5 only**

```bash
git add src/api/merchantSaasBilling.ts src/features/merchant-saas-billing src/api/staticDemo.ts
git commit -m "feat: add merchant billing frontend model"
```

### Task 6: Operations-admin group cards and billing editors

**Files:**
- Create: `src/components/admin/MerchantBillingCard.tsx`
- Create: `src/components/admin/MerchantBillingEditorDialog.tsx`
- Create: `src/components/admin/MerchantSuspensionDialog.tsx`
- Modify: `src/pages/admin/MerchantsPage.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `src/pages/admin/MerchantsPage.test.tsx`

**Interfaces:**
- Consumes `merchantSaasBillingApi` and view-model types from Task 5.
- Produces collapsible merchant cards, bordered nested-shop grids, clickable billing fields, payment review, suspension/release, and soft-delete UI.

- [ ] **Step 1: Write failing source/behavior contract tests**

```ts
it("renders one collapsible group card and a bordered child grid", () => {
  expect(pageSource).toContain("MerchantBillingCard");
  expect(cardSource).toContain('data-testid="merchant-group-expand"');
  expect(cardSource).toContain('data-testid="merchant-group-frame"');
});

it("keeps overdue styling inside operations admin", () => {
  expect(cardSource).toContain('data-overdue={billing.state === "overdue"}');
  expect(clientSources).not.toContain("data-overdue");
});
```

- [ ] **Step 2: Run page test and verify RED**

Run: `npm test -- src/pages/admin/MerchantsPage.test.tsx`

Expected: FAIL because components and markers are absent.

- [ ] **Step 3: Implement `MerchantBillingCard`**

Keep the current image/content/card proportions. Put entity type in the upper-right cluster and a compact clickable billing strip at lower right. Expanded state wraps the group and nested two-column shop grid in one visible frame. Use buttons with `aria-expanded`, focus rings, and keyboard activation.

- [ ] **Step 4: Implement billing and payment dialogs**

The billing editor shows old/new comparison, monthly/annual/free mode, amount lock, calculated annual price, group responsibility effective cycle, trial history, `+1/+2/+3` shortcuts, paid-from date preview, and the three-extension limit.

Manual payment review records amount, received date, cadence, coverage period, and reference; it never directly mutates card state without the API response.

- [ ] **Step 5: Implement suspension and dissolution dialogs**

Support the eight approved reason choices, multi-select, mandatory internal note, group scope choice, impacted account count, release reason, and soft-delete guards. Use danger styling only for destructive actions.

- [ ] **Step 6: Replace the shop-only list data flow**

`MerchantsPage` reads paginated merchant groups and standalone shops from the new API, preserves the existing tabs and non-list legacy sections, and does not map the same shop row into a fake Merchant object.

- [ ] **Step 7: Add i18n strings**

Add Chinese, Japanese, and English strings for every new visible label and error. If the existing translation map requires Korean for full coverage, add Korean values in the same entries rather than falling back to Chinese.

- [ ] **Step 8: Verify frontend GREEN**

Run: `npm test -- src/pages/admin/MerchantsPage.test.tsx src/features/merchant-saas-billing/model.test.ts`

Expected: PASS.

Run: `npm run i18n:audit`

Expected: exit 0 with no missing newly introduced key.

- [ ] **Step 9: Commit Task 6 only**

```bash
git add src/components/admin/MerchantBillingCard.tsx src/components/admin/MerchantBillingEditorDialog.tsx src/components/admin/MerchantSuspensionDialog.tsx src/pages/admin/MerchantsPage.tsx src/pages/admin/MerchantsPage.test.tsx src/i18n/translations.ts
git commit -m "feat: add merchant billing admin cards"
```

### Task 7: Documentation, full verification, and visual QA

**Files:**
- Modify: `docs/backoffice-real-data.md`
- Modify: `README.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces final operating documentation and fresh verification evidence.

- [ ] **Step 1: Update formal documentation**

Document models, migrations, API routes, permissions, manual-payment-to-Stripe adapter boundary, trial examples, overdue rule, suspension behavior, and rollback notes.

- [ ] **Step 2: Scan prohibited implementation markers**

Run:

```bash
rg -n "TODO|FIXME|not implemented|placeholder|fake API" \
  backend/src/services/saas-billing-policy.service.ts \
  backend/src/services/merchant-saas-billing.service.ts \
  backend/src/repositories/merchant-saas-billing.repository.ts \
  src/api/merchantSaasBilling.ts \
  src/features/merchant-saas-billing \
  src/components/admin/MerchantBillingCard.tsx \
  src/components/admin/MerchantBillingEditorDialog.tsx \
  src/components/admin/MerchantSuspensionDialog.tsx
```

Expected: no matches.

- [ ] **Step 3: Run backend verification**

Run: `cd backend && npm run prisma:generate && npx prisma validate && npm run lint && npm test && npm run build`

Expected: all commands exit 0, zero failed tests.

- [ ] **Step 4: Run frontend verification**

Run: `npm run lint && npm test && npm run i18n:audit && npm run build`

Expected: all commands exit 0, zero failed tests.

- [ ] **Step 5: Verify migration integrity**

Run: `cd backend && ENV_FILE=.env.dev npm run prisma:migrate:deploy`

Expected: new migration applies or reports already applied without error.

- [ ] **Step 6: Start the real app and perform visual QA**

Run the formal backend and frontend through the existing development commands, open `/admin/merchants`, and inspect:

- collapsed group card;
- expanded outer frame with merchant and child shop cards;
- upper-right type labels and lower-right billing fields;
- overdue red name in operations admin only;
- dark/light themes;
- desktop two-column and narrow single-column layouts;
- trial, payment, suspension, release, and dissolution dialogs.

Capture screenshots as evidence. Do not treat a successful build or screenshot alone as acceptance; exercise the real API interactions and confirm card refresh.

- [ ] **Step 7: Recheck working-tree ownership**

Run: `git status --short` and `git diff --name-only HEAD^`.

Expected: task commits contain only the files listed in this plan; pre-existing roadshow, calendar, share, generated-asset, output, and temporary changes remain unmodified.

- [ ] **Step 8: Commit documentation only**

```bash
git add README.md docs/backoffice-real-data.md
git commit -m "docs: document merchant SaaS billing admin"
```
