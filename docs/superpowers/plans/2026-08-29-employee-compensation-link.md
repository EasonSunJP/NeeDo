# Employee Compensation Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the merchant employee detail card to the existing formal shop-scoped compensation and payroll data so salary, commission, and the latest payslip are editable and measurable through the employee's public NeeDoID.

**Architecture:** Add employee-facing compensation routes that derive the shop from the authenticated identity, resolve the current shop affiliation by canonical technician NeeDoID, and reuse the existing versioned compensation engine. A bounded payroll summary reads the latest persisted payslip and its formal order-finance sources. The React employee drawer consumes this contract through a focused panel with server-backed read, edit, preview, cancel, retry, and finance-page navigation states.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma/MySQL, Jest/Supertest, Vitest.

## Global Constraints

- Execute only Step 12 microstep 4, “薪酬连接”; do not implement payout recording or timeline redesign in this plan.
- Never accept `shopId` or `technicianProfileId` from the employee-card client; scope derives from the active JWT shop identity and the path uses canonical technician NeeDoID.
- Reuse `TechnicianCompensationProfile`, `ShopFinanceRuleSet`, `Payslip`, `PayslipLine`, `OrderFinancial`, and the existing compensation engine; add no mock data, duplicate payroll engine, or schema.
- Preserve the legacy internal-ID compensation routes for the existing finance workspace until it is migrated in a later microstep.
- All writes require existing compensation RBAC, Zod validation, versioned persistence, and audit; cross-shop or ended affiliations return the controlled affiliation-not-found response.
- Employee-card UI must keep the merchant blue/black palette and must not imply automatic bank transfer.

---

### Task 1: Employee-scoped compensation API and payroll summary

**Files:**
- Modify: `backend/src/validators/compensation-profile.validator.ts`
- Modify: `backend/src/services/compensation-profile.service.ts`
- Modify: `backend/src/repositories/compensation-profile.repository.ts`
- Modify: `backend/src/controllers/compensation-profile.controller.ts`
- Modify: `backend/src/routes/compensation-profile.routes.ts`
- Modify: `backend/src/openapi.ts`
- Test: `backend/tests/employee-compensation-profile.test.ts`
- Test: `backend/tests/compensation-profile.repository.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: canonical technician NeeDoID, authenticated `shop` scope, existing `CompensationProfileBody` and `CompensationProfilePreviewBody`.
- Produces: `EmployeeCompensationResult`, containing the effective compensation profile plus a bounded latest-payslip summary; employee GET/PUT/preview routes under `/merchant-admin/employees/:needoId/compensation-profile`.

- [ ] **Step 1: Write failing service/API tests**

Cover the following observable behavior:

```typescript
expect(await get("/merchant-admin/employees/s0000000047/compensation-profile"))
  .toMatchObject({
    employee: { needoId: "s0000000047" },
    profile: { sourceType: "technician_override", commissionRatePercent: 20 },
    payrollSummary: {
      completedOrderCount: 2,
      workedMinutes: 120,
      serviceIncomeJpy: 20_000,
      netPayJpy: 234_000,
      paidAmountJpy: 100_000,
      unpaidAmountJpy: 134_000
    }
  });
```

Also assert that another-shop or ended affiliation returns 404 without invoking profile update, PUT writes `merchant_admin.compensation_profile.update`, and preview uses the current effective employee rule.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/employee-compensation-profile.test.ts
```

Expected: FAIL because the employee compensation route and repository methods do not exist.

- [ ] **Step 3: Add validation and service contracts**

Add a canonical employee param schema and the result types:

```typescript
export const employeeCompensationProfileParamSchema = z.object({
  needoId: z.string().trim().regex(/^s\d{10}$/)
});

export interface EmployeePayrollSummaryPayload {
  payslipId: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: PayslipStatus | null;
  disputeStatus: PayslipDisputeStatus | null;
  completedOrderCount: number;
  workedMinutes: number;
  serviceIncomeJpy: number;
  basePayJpy: number;
  commissionJpy: number;
  bonusJpy: number;
  allowanceJpy: number;
  deductionJpy: number;
  platformFeeShareDeductionJpy: number;
  netPayJpy: number;
  paidAmountJpy: number;
  unpaidAmountJpy: number;
  payoutRecordCount: number;
}

export interface EmployeeCompensationResult {
  employee: { needoId: string };
  profile: CompensationProfilePayload;
  payrollSummary: EmployeePayrollSummaryPayload;
}
```

The repository resolves `{ affiliationId, technicianProfileId }` only for the current active affiliation and reads at most the latest non-deleted payslip for that exact shop/technician pair. It derives order count, service income, and worked minutes only from formal order IDs referenced by that payslip.

- [ ] **Step 4: Implement employee routes with derived scope**

Expose:

```text
GET  /api/v1/merchant-admin/employees/:needoId/compensation-profile
PUT  /api/v1/merchant-admin/employees/:needoId/compensation-profile
POST /api/v1/merchant-admin/employees/:needoId/compensation-profile/preview
```

The Service obtains the shop ID from `actor.currentIdentityScopeId`, resolves the active affiliation through the repository, reuses `getProfileOrFallback`, `replaceActiveProfile`, and `CompensationEngine.calculate`, and records employee-affiliation-scoped audit metadata without returning internal IDs to the UI result.

- [ ] **Step 5: Add repository tests and OpenAPI coverage**

Repository tests assert the Prisma where clauses include exact `shopId`, canonical `PublicIdentifier.kind=S`, active identity, active affiliation, non-deleted rows, and latest payslip ordering. OpenAPI tests assert all three employee paths and their RBAC security definitions are present.

- [ ] **Step 6: Run backend tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/employee-compensation-profile.test.ts tests/compensation-profile.repository.test.ts tests/finance-center-api.test.ts tests/openapi.test.ts
```

Expected: all selected suites pass and existing legacy compensation routes remain green.

- [ ] **Step 7: Commit the backend slice**

```bash
git add backend/src backend/tests
git commit -m "feat: expose employee compensation summaries"
```

### Task 2: Typed employee compensation client and panel

**Files:**
- Create: `src/api/employeeCompensation.ts`
- Create: `src/components/merchant-admin/EmployeeCompensationPanel.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Test: `src/api/employeeCompensation.test.ts`
- Test: `src/components/merchant-admin/EmployeeCompensationPanel.test.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`

**Interfaces:**
- Consumes: Task 1 employee GET/PUT/preview routes.
- Produces: `employeeCompensationApi`, `EmployeeCompensationResult`, and a controlled `EmployeeCompensationPanel` that owns no server data.

- [ ] **Step 1: Write failing adapter and panel tests**

Assert the adapter encodes NeeDoID and never serializes `shopId` or `technicianProfileId`. Assert the panel shows source, wage mode, salary/hourly/daily/fixed fields, commission, guarantee, NDP bearer/share, latest-period net/paid/unpaid figures, and a `前往财务结算` link carrying `employee=<NeeDoID>`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/api/employeeCompensation.test.ts src/components/merchant-admin/EmployeeCompensationPanel.test.tsx
```

Expected: FAIL because the adapter and component do not exist.

- [ ] **Step 3: Implement the typed adapter**

The adapter exposes:

```typescript
get(needoId: string): Promise<EmployeeCompensationResult>;
update(needoId: string, body: TechnicianCompensationProfileInput): Promise<EmployeeCompensationResult>;
preview(needoId: string, body: CompensationProfilePreviewInput): Promise<CompensationProfilePreviewResult>;
```

- [ ] **Step 4: Implement the controlled compensation panel**

Use the existing `Button`, `Badge`, merchant color tokens, rounded cards, and responsive grids. View mode displays all persisted rule fields and latest formal payroll metrics. Edit mode replaces those fields in place; cancel restores the last server snapshot; save leaves rejected input in place. Preview uses editable service amount and worked minutes and labels the result as an estimate. The panel text explicitly states that actual payment is manually registered in 财务结算 and no transfer is initiated.

- [ ] **Step 5: Mount the panel in the employee card**

Place `EmployeeCompensationPanel` before the settlement-cycle editor and pass only controlled data/callbacks. Keep the existing profile, affiliation, schedule, and cycle panels unchanged.

- [ ] **Step 6: Run frontend tests and verify GREEN**

Run:

```bash
npm test -- src/api/employeeCompensation.test.ts src/components/merchant-admin/EmployeeCompensationPanel.test.tsx src/components/merchant-admin/EmployeeDetailCard.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit the frontend panel**

```bash
git add src/api src/components/merchant-admin
git commit -m "feat: add employee compensation panel"
```

### Task 3: Employee drawer orchestration, i18n, and documentation

**Files:**
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `README.md`
- Modify: `docs/backoffice-real-data.md`
- Modify: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

**Interfaces:**
- Consumes: Task 2 controlled panel contract and request coordinator.
- Produces: race-safe employee compensation load/update/preview states bound to the selected NeeDoID.

- [ ] **Step 1: Write failing orchestration tests**

Assert the page creates a dedicated formal detail request coordinator, loads compensation only after the employee detail is current, invalidates it on close/switch, refreshes the formal result after save, and maps token/RBAC/server errors through existing localized detail error helpers.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: FAIL because compensation orchestration is not wired.

- [ ] **Step 3: Implement race-safe orchestration**

Add independent loading, error, saving, and preview states. Activate/dispose/invalidate the compensation coordinator alongside the existing detail and payroll-cycle coordinators. On successful update, replace the current server snapshot; on failure, retain the panel draft and show the localized error.

- [ ] **Step 4: Complete user-visible localization and docs**

Add Chinese, Japanese, English, Korean, and Traditional Chinese translations for new source/mode/status/help copy using the existing translation mechanism. Document the three routes, RBAC, audit actions, summary definitions, lack of schema changes, manual-payment boundary, and the employee-card integration.

- [ ] **Step 5: Run focused regression**

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/components/merchant-admin/EmployeeDetailCard.test.tsx src/components/merchant-admin/EmployeeCompensationPanel.test.tsx src/api/employeeCompensation.test.ts
npm --prefix backend test -- --runInBand tests/employee-compensation-profile.test.ts tests/compensation-profile.repository.test.ts tests/finance-center-api.test.ts tests/openapi.test.ts
```

Expected: all selected frontend and backend suites pass.

- [ ] **Step 6: Run quality gates**

Run:

```bash
npm run lint
npm run verify:production-build
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: TypeScript, production build, backend lint, and backend build pass; no new warning is introduced.

- [ ] **Step 7: Browser acceptance**

With the formal backend, MySQL, Redis, and local frontend healthy, log in as a merchant, open an employee card, verify salary/commission view and edit, refresh persistence, confirm latest payroll figures match the finance page, verify the finance link keeps the employee filter, and inspect desktop plus 390px width. Confirm another-shop NeeDoID cannot be loaded and no internal shop/technician IDs appear in the employee compensation network path.

- [ ] **Step 8: Commit the integration and documentation**

```bash
git add src/pages/merchant-admin src/i18n README.md docs
git commit -m "feat: connect employee payroll compensation"
```

