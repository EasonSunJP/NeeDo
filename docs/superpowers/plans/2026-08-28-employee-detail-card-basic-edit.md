# Employee Detail Card Basic Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the merchant people page's legacy numeric technician drawer with a shop-scoped, NeeDoID-based employee detail card whose profile and affiliation edits persist through the formal API.

**Architecture:** Extend the existing `TechnicianShopAffiliation` contract instead of composing the old `/merchant-admin/technicians/:id` response in the browser. The backend resolves the canonical technician `S` public identifier, checks the authenticated shop affiliation, updates the global technician profile or the current-shop affiliation through separate audited operations, and returns one safe employee DTO. The merchant frontend owns a focused API adapter and employee card component; the operations technician review panel remains unchanged.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest/jsdom, Express, Zod, Prisma/MySQL, Jest/Supertest, existing NeeDo admin tokens and i18n.

## Global Constraints

- This is only design microstep 2: employee-card basic structure and real profile/affiliation editing.
- Do not implement schedule projection, payroll policy, payroll settlement, or the compact audit timeline in this plan.
- Do not add disabled future tabs, local browser business persistence, mock data, fake success states, or a second technician record.
- Merchant reads and writes derive `shopId` only from the authenticated shop identity.
- Public UI identity is the canonical `s##########` NeeDoID; numeric profile, user, account, and affiliation IDs are never rendered.
- Email, phone, avatar, account state, profile verification state, and NeeDoID are read-only in this microstep.
- Profile writes and affiliation writes remain separate operations; relationship changes continue to use the locked exclusivity checks from the affiliation repository.
- Every new request uses JWT, dedicated RBAC, strict Zod validation, OpenAPI, audit, and the standard `{ code, message, data }` envelope.
- Visible copy must resolve through the existing Chinese, Traditional Chinese, Japanese, English, and Korean translation table.
- Preserve the React/TSX/Vite stack, the customer drawer, the operations technician review panel, existing theme tokens, and unrelated dirty work.

---

### Task 1: Add the formal employee profile detail and update contract

**Files:**

- Modify: `backend/src/services/technician-shop-affiliation.service.ts`
- Modify: `backend/src/repositories/technician-shop-affiliation.repository.ts`
- Modify: `backend/src/validators/technician-shop-affiliation.validator.ts`
- Modify: `backend/src/controllers/technician-shop-affiliation.controller.ts`
- Modify: `backend/src/routes/technician-shop-affiliation.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/technician-shop-affiliation.repository.test.ts`
- Test: `backend/tests/technician-shop-affiliation.service.test.ts`
- Test: `backend/tests/technician-shop-affiliation-api.test.ts`
- Test: `backend/tests/backoffice-profile-detail-openapi.test.ts`

**Interfaces:**

- Consumes: canonical `S` public identifier resolution, authenticated shop scope, `TechnicianShopAffiliationRepositoryPort`, and `merchant-admin:employee-affiliation:read/write`.
- Produces:

```ts
export interface MerchantEmployeePayload {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  profileStatus: string;
  verifiedAt: string | null;
  profile: {
    bio: string | null;
    city: string;
    serviceArea: string | null;
    yearsExperience: number;
    updatedAt: string;
  };
  account: {
    isActive: boolean;
    lastLoginAt: string | null;
  };
  affiliation: {
    id: number;
    relationshipType: "exclusive" | "partner";
    workStatus: "active" | "on_leave" | "suspended" | "ended";
    startsAt: string;
    endsAt: string | null;
    shop: { id: number; publicId: string; name: string };
  };
}

export interface EmployeeProfileUpdateInput {
  displayName?: string;
  bio?: string | null;
  city?: string;
  serviceArea?: string | null;
  yearsExperience?: number;
}

PATCH /api/v1/merchant-admin/employees/{needoId}/profile
```

- [ ] **Step 1: Write failing repository tests for mapped profile/account fields and scoped updates**

Add assertions that `findCurrentShopEmployee(16, 86)` maps the five profile fields and two account fields, and that `updateCurrentShopEmployeeProfile` updates only a technician attached to shop `16`. The repository port method is:

```ts
updateCurrentShopEmployeeProfile(input: {
  shopId: number;
  technicianIdentityId: number;
  actorUserId: number;
  profile: EmployeeProfileUpdateInput;
}): Promise<MerchantEmployeePayload | null>;
```

The negative test must return `null` without calling `technicianProfile.update` when no current affiliation exists.

- [ ] **Step 2: Run repository RED**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.repository.test.ts
```

Expected: FAIL because profile/account fields and `updateCurrentShopEmployeeProfile` do not exist.

- [ ] **Step 3: Implement the repository mapping and scoped transaction**

Extend the employee select with `bio`, `city`, `serviceArea`, `yearsExperience`, `updatedAt`, `user.isActive`, and `user.lastLoginAt`. Implement `updateCurrentShopEmployeeProfile` as a Prisma transaction that resolves an active current-shop affiliation for the supplied technician identity, locks the technician profile row, updates only the supplied profile fields plus no account fields, and rereads through the canonical employee select. Return `null` when the identity, current affiliation, or profile does not belong to the authenticated shop.

- [ ] **Step 4: Run repository GREEN**

Run the command from Step 2.

Expected: all repository tests PASS.

- [ ] **Step 5: Write failing service and HTTP tests**

Add tests proving:

```ts
await service.updateCurrentShopEmployeeProfile(
  actorForShop(16),
  context,
  "s0000000047",
  {
    displayName: "斋藤 健太",
    bio: "整体与放松护理",
    city: "东京都涩谷区",
    serviceArea: "涩谷区、新宿区",
    yearsExperience: 9
  }
);
```

- canonical `S` resolution is used;
- a wrong shop returns the existing safe employee 404;
- read-only merchant preview cannot write;
- audit action is `merchant_admin.employee_profile.update` with only `shopId` and `changedFields` in metadata;
- empty PATCH, unknown keys, blank name/city, overlong strings, and experience outside `0..80` return 400;
- the route requires the dedicated affiliation write permission;
- successful PATCH returns the refreshed employee DTO.

- [ ] **Step 6: Run service/API RED**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts
```

Expected: FAIL because the update service, validator, controller action, and PATCH route do not exist.

- [ ] **Step 7: Implement strict validation, service, controller, and route**

Define this strict Zod contract:

```ts
export const merchantEmployeeProfileBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(5000).nullable().optional(),
    city: z.string().trim().min(1).max(100).optional(),
    serviceArea: z.string().trim().max(255).nullable().optional(),
    yearsExperience: z.coerce.number().int().min(0).max(80).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one employee profile field is required"
  });
```

The service resolves the public identifier exactly once, derives the current shop from the authenticated identity, rejects read-only preview, calls the repository, maps `null` to the safe 404, and records only sorted changed field names. The controller parses params/body and the route registers PATCH with authenticate, write permission, and request validation.

- [ ] **Step 8: Run service/API GREEN**

Run the command from Step 6.

Expected: all service and API tests PASS.

- [ ] **Step 9: Write and run OpenAPI RED**

Add assertions for `MerchantEmployeeProfile`, `MerchantEmployeeAccount`, the expanded `MerchantEmployee`, strict `MerchantEmployeeProfileInput`, and the PATCH path including 400/401/403/404 responses.

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/backoffice-profile-detail-openapi.test.ts
```

Expected: FAIL because the expanded schemas and PATCH path are absent.

- [ ] **Step 10: Implement OpenAPI and run GREEN**

Document every new field, the `0..80` experience range, nullable bio/service area, canonical NeeDoID path, standard envelope, security, and safe error responses. Run the command from Step 9 and expect PASS.

- [ ] **Step 11: Commit Task 1**

```bash
git add backend/src/services/technician-shop-affiliation.service.ts backend/src/repositories/technician-shop-affiliation.repository.ts backend/src/validators/technician-shop-affiliation.validator.ts backend/src/controllers/technician-shop-affiliation.controller.ts backend/src/routes/technician-shop-affiliation.routes.ts backend/src/api/openapi.ts backend/tests/technician-shop-affiliation.repository.test.ts backend/tests/technician-shop-affiliation.service.test.ts backend/tests/technician-shop-affiliation-api.test.ts backend/tests/backoffice-profile-detail-openapi.test.ts
git commit -m "feat: add merchant employee profile editing"
```

---

### Task 2: Add the focused merchant employee frontend API adapter

**Files:**

- Create: `src/features/merchant-admin/employeeApi.ts`
- Create: `src/features/merchant-admin/employeeApi.test.ts`

**Interfaces:**

- Consumes: `httpClient.request` and the backend DTO from Task 1.
- Produces:

```ts
export type MerchantEmployee = MerchantEmployeePayloadShape;
export type MerchantEmployeeProfileUpdate = EmployeeProfileUpdateShape;
export type MerchantEmployeeAffiliationUpdate = EmployeeAffiliationUpdateShape;

export const merchantEmployeeApi = {
  list(query: MerchantEmployeeListQuery): Promise<PaginatedMerchantEmployees>,
  detail(needoId: string): Promise<MerchantEmployee>,
  updateProfile(needoId: string, input: MerchantEmployeeProfileUpdate): Promise<MerchantEmployee>,
  updateAffiliation(needoId: string, input: MerchantEmployeeAffiliationUpdate): Promise<MerchantEmployee>
};
```

- [ ] **Step 1: Write the failing adapter test**

Mock `httpClient.request` and assert the exact calls:

```ts
merchantEmployeeApi.list({ page: 1, pageSize: 20, keyword: "斋藤" });
// /merchant-admin/employees with query

merchantEmployeeApi.detail("s0000000086");
// GET /merchant-admin/employees/s0000000086

merchantEmployeeApi.updateProfile("s0000000086", { city: "东京都" });
// PATCH /merchant-admin/employees/s0000000086/profile

merchantEmployeeApi.updateAffiliation("s0000000086", input);
// PUT /merchant-admin/employees/s0000000086/affiliation
```

- [ ] **Step 2: Run adapter RED**

Run:

```bash
npm test -- --run src/features/merchant-admin/employeeApi.test.ts
```

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement the typed adapter**

Use `encodeURIComponent(needoId)` for path segments, the existing `page/pageSize` pagination shape, and no client-supplied shop identifier. Do not import legacy `BackofficeTechnicianPayload` types.

- [ ] **Step 4: Run adapter GREEN**

Run the command from Step 2.

Expected: the adapter test PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/merchant-admin/employeeApi.ts src/features/merchant-admin/employeeApi.test.ts
git commit -m "feat: add merchant employee api adapter"
```

---

### Task 3: Build the real employee identity and edit card

**Files:**

- Create: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Create: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**

- Consumes: `MerchantEmployee`, `Button`, `Badge`, existing admin/client color tokens, and current language.
- Produces:

```ts
export interface EmployeeDetailCardProps {
  employee: MerchantEmployee;
  saving: "profile" | "affiliation" | null;
  error: string;
  onSaveProfile(input: MerchantEmployeeProfileUpdate): Promise<void>;
  onSaveAffiliation(input: MerchantEmployeeAffiliationUpdate): Promise<void>;
}

export function EmployeeDetailCard(props: EmployeeDetailCardProps): JSX.Element;
```

- [ ] **Step 1: Write failing render and interaction tests**

Using `createRoot` and `act`, prove that the card:

- renders avatar, display name, canonical NeeDoID, work status, relationship type, current shop, email, phone, profile verification, and account state;
- never renders `技师档案 #`, `账号 #`, `User ID`, numeric profile ID, numeric user ID, or affiliation ID;
- shows only two fully functional sections in this microstep: `基础信息` and `从属关系`;
- enters profile edit in place, submits trimmed profile values to `onSaveProfile`, and restores the server snapshot on cancel;
- edits relationship/work status through `onSaveAffiliation` while retaining the current start date;
- keeps form values and displays the supplied error when a save rejects;
- disables save while the matching operation is running.

- [ ] **Step 2: Run component RED**

Run:

```bash
npm test -- --run src/components/merchant-admin/EmployeeDetailCard.test.tsx
```

Expected: FAIL because the card does not exist.

- [ ] **Step 3: Implement the card using the approved visual system**

Use one compact identity header with the avatar on the left and an `S` NeeDoID rail directly below the name. The rail is the signature element: it uses the existing moss/ink palette, a copy action with an accessible label, and no numeric internal identifier. Keep surrounding surfaces quiet: one identity header, one compact contact strip, and two functional section cards. Profile and affiliation forms replace their read view in place; cancel restores `employee`, and successful persistence is controlled by the parent reload rather than an optimistic local success state.

Add exact translation entries for all new visible labels, including relationship/work status labels and `员工详细信息卡`, in every supported language. Reuse existing translation entries whenever an exact key already exists.

- [ ] **Step 4: Run component and translation GREEN**

Run:

```bash
npm test -- --run src/components/merchant-admin/EmployeeDetailCard.test.tsx src/i18n/translations.test.ts
```

Expected: both files PASS with no React warnings.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/merchant-admin/EmployeeDetailCard.tsx src/components/merchant-admin/EmployeeDetailCard.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: build employee detail card"
```

---

### Task 4: Cut the merchant people page over to NeeDoID employees

**Files:**

- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

**Interfaces:**

- Consumes: `merchantEmployeeApi`, `EmployeeDetailCard`, and the existing request coordinator/mutation sequence.
- Produces: the merchant staff list and detail drawer use only `/merchant-admin/employees` and canonical NeeDoID; the customer lane remains on its existing formal API.

- [ ] **Step 1: Rewrite the page test to express the new contract and run RED**

Assert that the staff lane:

```ts
merchantEmployeeApi.list({ page, pageSize, keyword });
merchantEmployeeApi.detail(employee.needoId);
merchantEmployeeApi.updateProfile(employee.needoId, input);
merchantEmployeeApi.updateAffiliation(employee.needoId, input);
```

The source must contain `EmployeeDetailCard` and drawer title `员工详细信息卡`. It must not contain merchant calls to `backofficeRealDataApi.technicians`, `backofficeRealDataApi.technician`, `updateTechnician`, `approveTechnician`, or `deleteTechnician`, and must not render `FormalTechnicianDetailPanel` in this page.

Run:

```bash
npm test -- --run src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: FAIL against the legacy numeric technician lane.

- [ ] **Step 2: Implement list/detail cutover and real mutations**

Use `selectedEmployeeNeedoId: string | null`. Keep request cancellation/invalidation semantics. On profile or affiliation save, run the mutation, reread the employee detail, then refresh the server-paginated list. Preserve draft input and surface a localized error when the mutation fails. Ending an affiliation is not included in this microstep's card controls; the existing API remains available for a later reviewed offboarding flow.

Change the list columns to employee name, NeeDoID, relationship type, work status, email/phone, and profile verification state. Remove merchant-side profile approval and global profile deletion controls because they are not shop employee operations.

- [ ] **Step 3: Run page GREEN and focused frontend regression**

Run:

```bash
npm test -- --run src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/components/merchant-admin/EmployeeDetailCard.test.tsx src/features/merchant-admin/employeeApi.test.ts src/components/admin/FormalProfileDetailPanels.test.tsx
```

Expected: all focused tests PASS, including the unchanged operations detail panel.

- [ ] **Step 4: Commit Task 4**

```bash
git add src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
git commit -m "feat: cut merchant staff over to employee cards"
```

---

### Task 5: Verify formal persistence, visual behavior, and document the cutover

**Files:**

- Modify: `docs/employee-affiliation.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: the merged backend/frontend contracts from Tasks 1-4.
- Produces: reproducible test and browser acceptance evidence for the employee-card basic-edit microstep.

- [ ] **Step 1: Run backend focused verification**

```bash
npm --prefix backend test -- --runTestsByPath tests/technician-shop-affiliation.repository.test.ts tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts tests/technician-shop-affiliation-permissions.test.ts tests/backoffice-profile-detail-openapi.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run frontend focused and production verification**

```bash
npm test -- --run src/features/merchant-admin/employeeApi.test.ts src/components/merchant-admin/EmployeeDetailCard.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/components/admin/FormalProfileDetailPanels.test.tsx src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

Expected: every command exits 0 and the production bundle audit reports no formal mock/business-storage violation.

- [ ] **Step 3: Verify the local formal database without mutation**

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:technician-shop-affiliation-cutover
```

Expected: schema up to date and cutover `ready=true` with zero pending operations or issues.

- [ ] **Step 4: Run formal browser acceptance**

Start or reuse the formal frontend/backend, authenticate as a real merchant shop identity, and open `/store-admin.html#/merchant-admin/people?module=staff`. Verify:

1. the list request is `/api/v1/merchant-admin/employees` and the selected card request uses the visible `s##########` NeeDoID;
2. the drawer title is `员工详细信息卡`;
3. the card shows avatar, name, work status, relationship type, shop, email, phone, verification, and account state;
4. no internal profile/account/affiliation ID appears in the DOM;
5. profile edit persists after a full reload;
6. work-status or relationship changes persist after a full reload and exclusivity conflicts display a safe localized message;
7. a second shop cannot open a non-affiliated employee;
8. the drawer remains usable at desktop width and a 390px viewport, with visible focus states and no horizontal clipping.

- [ ] **Step 5: Update documentation**

Record the new PATCH endpoint, read-only account/contact boundary, merchant UI cutover, removal of global approval/delete controls, tests, browser evidence, and rollback boundary. State that schedule privacy, payroll connections, settlement cycles, manual payout completion, and compact timeline remain separate accepted microsteps.

- [ ] **Step 6: Commit Task 5**

```bash
git add docs/employee-affiliation.md README.md
git commit -m "docs: record employee card cutover"
```

## Acceptance Gate

Do not start schedule projection until all conditions below are true:

- merchant staff list/detail reads only the new employee endpoints;
- canonical NeeDoID is visible and numeric internal identifiers are absent from the merchant card;
- profile and affiliation edits survive full reload;
- cross-shop reads return the same safe 404;
- read-only merchant preview and missing write permission cannot mutate;
- operations technician review/detail behavior remains unchanged;
- backend and frontend focused tests, lint, builds, database status, and cutover checker pass;
- formal browser acceptance passes at desktop and 390px width;
- no mock, local business persistence, future empty tab, schedule projection, payroll policy, or payout behavior was added.
