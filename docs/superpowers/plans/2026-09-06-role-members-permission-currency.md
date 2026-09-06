# Role Members And Permission Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real, paginated member list for every role and make the permission tree and role-assignment UI consume the complete current permission API instead of a truncated first page.

**Architecture:** Extend the existing paginated `GET /api/v1/users` contract with its documented `roleId` filter, preserving User Service and repository layering. The role page will lazily load each role's members from that formal endpoint. The existing database-backed `GET /api/v1/permissions/tree` remains the full active-permission source of truth; the frontend will render its actual nodes and flatten it for role assignment so permission counts above 100 are not truncated.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma, Jest/Supertest, Vitest.

## Global Constraints

- Work only in the isolated `codex/role-permission-management` worktree.
- Use formal `/api/v1` endpoints, Prisma data, JWT/RBAC, Zod and OpenAPI; add no mock, fallback or browser-local role data.
- Keep all lists paginated; `pageSize` stays capped at 100.
- Preserve existing role/permission mutation security and audit behavior.
- No schema or migration is required because existing `UserRole`, `Role`, and `Permission` data is authoritative.
- Add five-language UI copy through the existing inline User Management locale map.

---

### Task 1: Add the formal role member filter

**Files:**
- Modify: `backend/src/validators/user.validator.ts`
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/services/user.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/helpers/step06-fixture.ts`
- Modify: `backend/tests/user-api.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/users`, active `UserRole` rows, `user:list` permission.
- Produces: `GET /api/v1/users?roleId=<positive-int>&page=<n>&pageSize=<n>` returning the existing `PaginatedResponse<UserPayload>` shape.

- [ ] **Step 1: Write the failing API test**

Add a Supertest case that requests `roleId=1`, expects only the two active admin members, asserts pagination metadata, and confirms `roleId=0` is rejected with HTTP 400.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/user-api.test.ts`

Expected: FAIL because `roleId` is stripped from the validated query and the fixture repository returns all users.

- [ ] **Step 3: Implement the minimal formal filter**

Add `roleId` to Zod, service/repository input types, Prisma `buildListWhere` using active `userRoles.some`, the in-memory fixture filter, and the OpenAPI query parameter. Do not add a parallel endpoint.

- [ ] **Step 4: Run tests to verify green**

Run: `npm test -- --runInBand tests/user-api.test.ts tests/role-api.test.ts tests/permission-api.test.ts`

Expected: 3 suites pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/user.validator.ts backend/src/repositories/user.repository.ts backend/src/services/user.service.ts backend/src/api/openapi.ts backend/tests/helpers/step06-fixture.ts backend/tests/user-api.test.ts
git commit -m "feat(rbac): filter users by current role"
```

### Task 2: Show each role's current personnel list

**Files:**
- Create: `src/pages/admin/RoleMembersPanel.tsx`
- Create: `src/pages/admin/RoleMembersPanel.test.tsx`
- Modify: `src/api/userManagement.ts`
- Modify: `src/api/userManagement.test.ts`
- Modify: `src/pages/admin/UserManagementWorkspace.tsx`
- Modify: `src/pages/admin/UserManagementWorkspace.test.tsx`

**Interfaces:**
- Consumes: `userManagementApi.listUsers({ roleId, page, pageSize: 20 })` and existing `UserPayload.roleAssignments`.
- Produces: `RoleMembersPanel` with a visible personnel-list toggle, lazy loading, active/disabled state, scoped role assignments, empty/error state, and server pagination.

- [ ] **Step 1: Write failing adapter and component tests**

Assert the adapter forwards `roleId`. Render the roles workspace and assert every role has a localized personnel-list action; opening a role calls the formal user API with that role ID and renders only returned members and their role scope.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/api/userManagement.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/pages/admin/RoleMembersPanel.test.tsx`

Expected: FAIL because `roleId` and `RoleMembersPanel` do not exist.

- [ ] **Step 3: Implement the minimal role member UI**

Extend the adapter query type, create the focused panel, add five-language labels, place the personnel-list control beside each role status, and gate it with `user:list`. Fetch only when opened and keep each role's page state isolated.

- [ ] **Step 4: Run tests to verify green**

Run: `npm test -- src/api/userManagement.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/pages/admin/RoleMembersPanel.test.tsx`

Expected: all selected Vitest files pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/userManagement.ts src/api/userManagement.test.ts src/pages/admin/UserManagementWorkspace.tsx src/pages/admin/UserManagementWorkspace.test.tsx src/pages/admin/RoleMembersPanel.tsx src/pages/admin/RoleMembersPanel.test.tsx
git commit -m "feat(backoffice): list current members for each role"
```

### Task 3: Render and assign the complete current permission tree

**Files:**
- Create: `src/pages/admin/permissionTree.ts`
- Create: `src/pages/admin/permissionTree.test.ts`
- Modify: `src/pages/admin/UserManagementWorkspace.tsx`
- Modify: `src/pages/admin/UserManagementWorkspace.test.tsx`
- Modify: `backend/tests/permission-api.test.ts`
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Consumes: full active-permission response from `userManagementApi.getPermissionTree()`.
- Produces: `flattenPermissionTree(tree): PermissionPayload[]`, actual module/type/permission-node rendering, complete role assignment choices, and paginated permission table navigation.

- [ ] **Step 1: Write failing completeness tests**

Create a tree fixture with more than 100 permissions and assert flattening preserves every unique node in server order. In the workspace test, assert role assignment can select a permission beyond the old first-40 slice and the permission page renders actual codes, not counts only. Extend the API test to prove the tree returns all active repository rows independent of list pagination.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/pages/admin/permissionTree.test.ts src/pages/admin/UserManagementWorkspace.test.tsx`

Run: `npm test -- --runInBand tests/permission-api.test.ts`

Expected: frontend FAIL on the old 40/100 truncation and count-only tree; backend test establishes the existing API completeness contract.

- [ ] **Step 3: Implement complete tree usage**

Fetch the tree in both role and permission modes, flatten it for assignment, remove `slice(0, 40)`, render each module as an expandable section with type totals and actual permission names/codes, and add permission-list page navigation using the existing list API.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- src/pages/admin/permissionTree.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/api/userManagement.test.ts`

Run: `npm test -- --runInBand tests/permission-api.test.ts tests/role-api.test.ts tests/user-api.test.ts`

Expected: all selected frontend and backend suites pass.

- [ ] **Step 5: Run quality gates and document the audit**

Run: `npm run lint`

Run: `npm run i18n:quality`

Run: `npm run verify:production-build`

Run: `npm --prefix backend run lint`

Run: `npm --prefix backend run build`

Document that the API is database-backed and current, the previous UI truncation was corrected, the role member list is formal/paginated, and no schema/migration was added.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/permissionTree.ts src/pages/admin/permissionTree.test.ts src/pages/admin/UserManagementWorkspace.tsx src/pages/admin/UserManagementWorkspace.test.tsx backend/tests/permission-api.test.ts docs/backoffice-real-data.md docs/superpowers/plans/2026-09-06-role-members-permission-currency.md
git commit -m "fix(backoffice): show complete current permission tree"
```
