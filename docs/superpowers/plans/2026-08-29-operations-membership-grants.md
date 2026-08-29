# Operations Membership Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized platform operators assign a user membership level as complimentary forever, for a number of days, or for a number of calendar months, with persistence and audit.

**Architecture:** Store explicit grant provenance and duration on CustomerProfile, calculate the authoritative expiry in the service layer, and expose a dedicated permission-protected membership endpoint. The operations user card owns the editor; the merchant user card is read-only.

**Tech Stack:** Prisma/MySQL, Express, Zod, Jest/Supertest, React 19, TypeScript, Vitest, OpenAPI.

## Global Constraints

- Membership assignment never triggers payment or automatic renewal.
- Existing users remain `SELF_SERVICE` after migration.
- Only `backoffice:customers:write` can assign memberships.
- Calendar-month expiry is calculated by backend service logic.
- Every assignment writes `backoffice.customer.membership.assign` audit metadata.
- No internal operator or profile IDs are displayed in the UI.

---

### Task 1: Membership grant schema and deterministic expiry calculation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829180000_customer_membership_grants/migration.sql`
- Modify: `backend/src/services/backoffice.service.ts`
- Create: `backend/tests/customer-membership-grant.service.test.ts`

**Interfaces:**
- Produces `CustomerMembershipGrantMode`, `CustomerMembershipDurationUnit`, `calculateMembershipExpiry(startsAt, unit, value)` and repository input fields.

- [ ] **Step 1: Write failing expiry tests**

Cover forever, 30 days, one month from January 31 in a leap year, invalid zero, and invalid missing duration:

```ts
expect(calculateMembershipExpiry(new Date("2028-01-31T00:00:00.000Z"), "month", 1)?.toISOString())
  .toBe("2028-02-29T00:00:00.000Z");
```

- [ ] **Step 2: Run service test and verify RED**

Run: `npm test -- customer-membership-grant.service.test.ts`

- [ ] **Step 3: Add schema fields and migration**

Add enum-backed columns, indexes on expiry and grant mode, and a nullable relation to the granting `User`. The migration uses defaults for existing rows and does not rewrite existing membership levels.

- [ ] **Step 4: Implement expiry calculation**

For months, construct the first day of the target month, clamp the original day to the target month’s last UTC date, and preserve UTC time components. Forever returns `null`; day adds exact UTC natural days.

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run: `npm run prisma:generate`

Run: `npm test -- customer-membership-grant.service.test.ts`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260829180000_customer_membership_grants/migration.sql backend/src/services/backoffice.service.ts backend/tests/customer-membership-grant.service.test.ts
git commit -m "feat: model complimentary membership grants"
```

### Task 2: Permission-protected membership assignment API

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-api.test.ts`
- Modify: `backend/tests/backoffice-profile-detail-openapi.test.ts`

**Interfaces:**
- `PUT /api/v1/backoffice/customers/:id/membership`.
- Request fields: `membershipLevel`, `grantMode`, `durationUnit`, `durationValue`, `startsAt`.
- Response fields include level, mode, duration, start, expiry, and granting operator display name.

- [ ] **Step 1: Write failing validation, permission, persistence, and audit tests**

Test complimentary forever, days, months, invalid combinations, 401, 403, 404, and audit metadata.

- [ ] **Step 2: Run focused backend tests and verify RED**

Run: `npm test -- backoffice-api.test.ts backoffice-profile-detail-openapi.test.ts`

- [ ] **Step 3: Add strict Zod contract**

Use `superRefine` so `forever` requires `null` duration and day/month require an integer from 1 to 1200. Parse `startsAt` as an offset datetime.

- [ ] **Step 4: Add repository, service, controller, route, and audit**

The service calculates expiry and calls the repository once. After persistence it records:

```ts
{
  membershipLevel,
  grantMode: "operator_complimentary",
  durationUnit,
  durationValue,
  startsAt: startsAt.toISOString(),
  expiresAt: expiresAt?.toISOString() ?? null
}
```

- [ ] **Step 5: Document OpenAPI and verify GREEN**

Run the focused backend tests and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/backoffice.validator.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/api/openapi.ts backend/tests/backoffice-api.test.ts backend/tests/backoffice-profile-detail-openapi.test.ts
git commit -m "feat: add audited membership grant API"
```

### Task 3: Operations membership tab editor and merchant read-only view

**Files:**
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`
- Modify: `src/pages/admin/UsersPage.tsx`
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Create: `src/components/admin/CustomerMembershipEditor.tsx`
- Create: `src/components/admin/CustomerMembershipEditor.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- `backofficeRealDataApi.assignCustomerMembership(id, input)`.
- `CustomerMembershipEditor` emits a validated `BackofficeCustomerMembershipGrantInput`.

- [ ] **Step 1: Write failing API and UI tests**

Assert the operation editor submits forever/day/month payloads, hides the quantity input for forever, requires quantity for day/month, and preserves draft after a rejected request. Assert merchant rendering contains no membership edit button.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/api/backofficeRealData.test.ts src/components/admin/CustomerMembershipEditor.test.tsx src/components/admin/FormalProfileDetailPanels.test.tsx src/i18n/translations.test.ts`

- [ ] **Step 3: Extend frontend contracts and editor**

Add membership grant fields to customer list/detail payloads and implement a select-based editor with exact options `永久免费`, `免费若干天`, and `免费若干个月`. Submit ISO start time and numeric duration only when required.

- [ ] **Step 4: Connect operation mutation sequence**

Remove `membershipLevel` from the base-profile draft. Pass `membershipEditorContent` only in `CustomerProfilesWorkspace`. After success, refresh detail, list, and page 1 of the user timeline.

- [ ] **Step 5: Rename operations customer-profile navigation and docs**

Change visible `客户资料` to `用户资料`, document the formal grant endpoint, and add exact translations for all new copy.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the same focused frontend tests and expect PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts src/pages/admin/UsersPage.tsx src/components/admin/FormalProfileDetailPanels.tsx src/components/admin/CustomerMembershipEditor.tsx src/components/admin/CustomerMembershipEditor.test.tsx src/components/admin/AdminLayout.tsx src/i18n/translations.ts src/i18n/translations.test.ts docs/backoffice-real-data.md
git commit -m "feat: edit complimentary memberships in operations"
```

### Task 4: Full verification and browser acceptance

**Files:**
- Modify only if verification reveals a defect in the files already owned by Tasks 1–3.

**Interfaces:**
- Produces a release-ready branch based on the latest main.

- [ ] **Step 1: Run frontend unit tests**

Run: `npm test`

Expected: all suites pass.

- [ ] **Step 2: Run backend unit and integration tests**

Run: `npm test` from `backend/`.

Expected: all suites pass, with only documented skipped integration cases.

- [ ] **Step 3: Run lint and formal builds**

Run: `npm run lint`, `npm run verify:production-build`, backend `npm run lint`, backend `npm run build`.

Expected: all commands exit 0.

- [ ] **Step 4: Run browser acceptance**

Verify merchant and operations pages with authenticated local services:

- merchant navigation has separate employee and user sections;
- employee six tabs preserve edits;
- timeline page size changes trigger network requests;
- month calendar is seven columns and multiple week rows;
- user header shows NeeDoID and no internal IDs;
- membership assignment persists after reload and appears in user activity;
- merchant membership tab is read-only;
- 390 px viewport keeps tabs horizontally scrollable and calendar legible.

- [ ] **Step 5: Review diff and commit any verification fixes**

```bash
git diff --check
git status --short
git add <only-files-fixed-during-verification>
git commit -m "fix: complete employee and user management acceptance"
```

