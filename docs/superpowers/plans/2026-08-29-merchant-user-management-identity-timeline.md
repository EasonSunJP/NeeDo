# Merchant User Management, Identity, and Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split merchant employee and user navigation, replace customer-facing copy with user terminology, remove internal IDs from profile headers, and provide a unified paginated user timeline.

**Architecture:** Keep the backend CustomerProfile domain and scoped customer APIs, but expose one user-facing account identity headed by public NeeDoID. Add dedicated timeline endpoints for platform and merchant scopes and feed both employee and user cards through shared timeline components.

**Tech Stack:** React 19, TypeScript, Express, Zod, Prisma, Jest/Supertest, Vitest, OpenAPI.

## Global Constraints

- UI uses “用户”; backend CustomerProfile resource names remain stable.
- No internal User ID or CustomerProfile ID appears in user cards.
- Merchant timeline access remains restricted to users with a real booking relationship to the current shop.
- Timeline page sizes are 10, 30, 50, and 100.
- Reads do not write audit events.

---

### Task 1: Merchant navigation and visible terminology

**Files:**
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Produces modules `staff | users | reviews` and separate navigation sections `员工管理` and `用户管理`.

- [ ] **Step 1: Write failing navigation and copy tests**

Assert the navigation contains two section titles, the user item routes to `/merchant-admin/people?module=users`, and visible merchant people-page source no longer contains `客户正式档案`, `客户档案`, or a table title `客户`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/merchant-admin/MerchantAdminLayout.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/i18n/translations.test.ts`

- [ ] **Step 3: Implement navigation split and copy**

Use two nav sections:

```ts
{ key: "staff", title: "员工管理", items: [{ label: "员工列表", to: "/merchant-admin/people?module=staff", icon: "员" }] },
{ key: "users", title: "用户管理", items: [
  { label: "用户列表", to: "/merchant-admin/people?module=users", icon: "用" },
  { label: "评价中心", to: "/merchant-admin/people?module=reviews", icon: "评" }
] }
```

Change visible labels and empty states from customer to user while leaving API method names unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/components/merchant-admin/MerchantAdminLayout.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/i18n/translations.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/merchant-admin/MerchantAdminLayout.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/components/merchant-admin/MerchantAdminLayout.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: split merchant employee and user management"
```

### Task 2: Public NeeDoID account header and customer tabs

**Files:**
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Modify: `backend/tests/backoffice-profile-detail-repository.test.ts`
- Modify: `src/components/admin/FormalProfileDetailPanels.test.tsx`

**Interfaces:**
- Adds `needoId: string` to `BackofficeAccountPayload`.
- Customer tabs become `基础资料 | 会员等级 | 预约与消费 | 权限与账号 | 用户动态`.

- [ ] **Step 1: Write failing identity tests**

Assert repository detail responses contain `account.needoId`, customer header renders it, and rendered text excludes `用户档案 #`, `账号 #`, the numeric profile ID, and numeric user ID. Assert the base section title is exactly `基础资料`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/admin/FormalProfileDetailPanels.test.tsx`; backend: `npm test -- backoffice-profile-detail-repository.test.ts`

- [ ] **Step 3: Map the public identifier and restructure tabs**

Select and return `User.needoId` through `mapAccount`. Replace the header’s `accountId/profileId/entityLabel` props with `needoId` and `identityLabel`, rendering:

```tsx
<span>NeeDoID {needoId}</span>
<span>{identityLabel}</span>
<span>{accountActive ? t("账号启用") : t("账号停用")}</span>
```

Move membership data out of the base tab into its own tab; rename the final tab to `用户动态`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same focused tests and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/backoffice.service.ts backend/src/repositories/backoffice.repository.ts src/api/backofficeRealData.ts src/components/admin/FormalProfileDetailPanels.tsx backend/tests/backoffice-profile-detail-repository.test.ts src/components/admin/FormalProfileDetailPanels.test.tsx
git commit -m "feat: unify user profiles under public NeeDoID"
```

### Task 3: Formal paginated user timeline API and UI

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-api.test.ts`
- Modify: `backend/tests/backoffice-profile-detail-openapi.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/admin/UsersPage.tsx`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`

**Interfaces:**
- `BackofficeCustomerTimelinePayload = PaginatedApiPayload<BackofficeAuditEventPayload>`.
- `GET /backoffice/customers/:id/timeline` and `GET /merchant-admin/customers/:id/timeline`.

- [ ] **Step 1: Write failing route, scope, and client tests**

Test 401/403, platform pagination, merchant scope, page-size max 100, and absence of a new audit event after a read. Test API client paths for both scopes.

- [ ] **Step 2: Run tests and verify RED**

Run backend: `npm test -- backoffice-api.test.ts backoffice-profile-detail-openapi.test.ts`; frontend: `npm test -- src/api/backofficeRealData.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

- [ ] **Step 3: Implement paginated repository query and endpoints**

Extract the existing scoped audit predicate into `customerTimelineWhere(input, profileId, userId)`. Count and query with `skip/take`, returning `buildPaginatedResponse`. Controller parses `backofficeListQuerySchema`; service validates customer visibility before returning the page.

```ts
router.get(
  "/merchant-admin/customers/:id/timeline",
  authenticate(),
  authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantCustomers),
  validateRequest({ params: backofficeEntityIdParamSchema, query: backofficeListQuerySchema }),
  controller.merchantCustomerTimeline
);
```

- [ ] **Step 4: Connect shared visual pagination**

Both `MerchantAdminPeoplePage` and `UsersPage` maintain timeline page/page-size state, load page 1 on user selection, and pass the page plus `FormalTimelinePagination` callbacks to `FormalCustomerDetailPanel`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same focused commands and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/backoffice.validator.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/api/openapi.ts backend/tests/backoffice-api.test.ts backend/tests/backoffice-profile-detail-openapi.test.ts src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/admin/UsersPage.tsx src/components/admin/FormalProfileDetailPanels.tsx
git commit -m "feat: add scoped user activity timelines"
```
