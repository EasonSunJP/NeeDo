# Admin Profile and Pending Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operations sidebar's hardcoded administrator identity and counts with the signed-in User's formal profile plus permission-scoped, expandable pending-order and merchant-review summaries.

**Architecture:** Extend the existing `/auth/me` self projection with the user's customer-profile display name and identity display names, preserve those fields through the frontend auth contract and persisted session, then render a focused `AdminOperatorSummary` that calls the existing paginated order and merchant-application APIs. The formal operations identity types are `platform` and `platform_admin`; keep detail ownership in the existing order and merchant-review pages by restoring their state from optional query parameters.

**Tech Stack:** React 18, TypeScript, React Router, existing NeeDo i18n/auth/http clients, Express, Prisma, Zod, Jest/Supertest, Vitest/Testing Library.

## Global Constraints

- Work only in `codex/admin-profile-pending-review`; keep the change isolated from the unfinished membership and shop-application branches.
- Do not add a new database table, migration, aggregate dashboard endpoint, mock array, demo fallback, generated avatar, or `FieldJob` implementation.
- Treat `session.roles`, `session.permissions`, and the active operations identity as authorization facts; display labels never grant access.
- Every new user-visible string must use the existing five-language i18n path.
- Keep summary reads paginated at five items, read counts from API `total`, and do not persist business summary data in the auth envelope or local storage.
- Preserve independent loading, empty, error, retry, permission, and stale-response handling for orders and reviews.
- Make one task-sized commit after each task passes its focused tests.

---

### Task 1: Project the signed-in user's formal display names through `/auth/me`

**Files:**

- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/auth.repository.test.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/openapi.test.ts`

- [ ] **Step 1: Add failing repository/service contract fixtures**

Extend the `AuthUserRecord` fixture builders used by `auth.repository.test.ts` and `auth.test.ts` with the two formal sources:

```ts
customerProfile: {
  displayName: "运营者用户端姓名",
  deletedAt: null
},
identities: [{
  ...operationsIdentity,
  displayName: "东京运营组"
}]
```

Assert the final `/auth/me` body includes:

```ts
expect(response.body.data).toMatchObject({
  profileDisplayName: "运营者用户端姓名",
  currentIdentity: { displayName: "东京运营组" }
});
```

Add separate service/API cases proving `profileDisplayName` is `null` when the profile is absent or `deletedAt` is non-null, and proving one user's response cannot use another fixture's profile.

- [ ] **Step 2: Run the focused backend tests and confirm RED**

Run:

```bash
cd backend && npm test -- tests/auth.repository.test.ts tests/auth.test.ts
```

Expected: FAIL because `AuthUserRecord`, `AuthIdentityPayload`, and `/auth/me` do not yet expose the new fields.

- [ ] **Step 3: Add the minimal Prisma self projection**

Add `customerProfile` to `authUserInclude` without changing the schema:

```ts
customerProfile: {
  select: {
    displayName: true,
    deletedAt: true
  }
},
```

Extend `AuthUserRecord` with:

```ts
customerProfile?: {
  displayName: string;
  deletedAt: Date | null;
} | null;
```

The existing identity include already supplies `UserIdentity.displayName`; no second query is permitted.

- [ ] **Step 4: Extend the auth payload and mapping**

Add `displayName` to `AuthIdentityPayload` and `profileDisplayName` to `AuthMePayload`:

```ts
export interface AuthIdentityPayload {
  id: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  publicId: string | null;
  displayName: string | null;
}

export interface AuthMePayload {
  // existing fields
  profileDisplayName: string | null;
}
```

Map them in `buildMePayload`:

```ts
displayName: identity.displayName,
```

```ts
profileDisplayName:
  user.customerProfile?.deletedAt === null
    ? user.customerProfile.displayName
    : null,
```

Do not fall back to another user's profile, technician profile, role, or seed value.

- [ ] **Step 5: Update the OpenAPI auth schema**

Add `profileDisplayName` to the `/auth/me` required fields with a nullable string schema, and add nullable `displayName` to both current and listed identity schemas:

```ts
profileDisplayName: { oneOf: [{ type: "string" }, { type: "null" }] },
displayName: { oneOf: [{ type: "string" }, { type: "null" }] },
```

Update `openapi.test.ts` to assert both properties and their required-key membership.

- [ ] **Step 6: Run the focused backend tests and confirm GREEN**

Run:

```bash
cd backend && npm test -- tests/auth.repository.test.ts tests/auth.test.ts tests/openapi.test.ts
```

Expected: PASS with profile present, absent, soft-deleted, and identity-display-name cases covered.

- [ ] **Step 7: Commit the backend auth contract**

```bash
git add backend/src/repositories/auth.repository.ts backend/src/services/auth.service.ts backend/src/api/openapi.ts backend/tests/auth.repository.test.ts backend/tests/auth.test.ts backend/tests/openapi.test.ts
git commit -m "feat: project admin profile through auth me"
```

---

### Task 2: Preserve the profile fields in the frontend auth contract and session

**Files:**

- Modify: `src/auth/rbac.ts`
- Modify: `src/auth/authContract.ts`
- Modify: `src/auth/authEnvelope.ts`
- Modify: `src/auth/authContract.compliance.test.ts`
- Modify: `src/auth/authEnvelope.test.ts`
- Modify: `src/auth/rbac.test.ts`
- Modify: `src/auth/AuthProvider.test.ts`
- Modify: `src/api/auth.test.ts`
- Modify: `src/auth/portalAuthorization.test.ts`
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`

- [ ] **Step 1: Add failing strict-contract tests**

Update the canonical auth payload fixtures with:

```ts
profileDisplayName: "运营者用户端姓名",
currentIdentity: {
  ...currentIdentity,
  displayName: "东京运营组"
},
identities: [{
  ...identity,
  displayName: "东京运营组"
}]
```

Add assertions that:

```ts
expect(requireFormalAuthMePayload(me).profileDisplayName).toBe("运营者用户端姓名");
expect(buildAuthSessionFromMe(me, "admin", "password")).toMatchObject({
  profileDisplayName: "运营者用户端姓名",
  currentIdentity: { displayName: "东京运营组" }
});
```

Also assert strict validation rejects missing, numeric, or unknown-shaped versions of the new required fields and that serialize/parse of a committed auth envelope preserves them.

- [ ] **Step 2: Run the focused frontend auth tests and confirm RED**

Run:

```bash
npm test -- src/api/auth.test.ts src/auth/authContract.compliance.test.ts src/auth/authEnvelope.test.ts src/auth/rbac.test.ts src/auth/AuthProvider.test.ts src/auth/portalAuthorization.test.ts src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: FAIL because the required-key lists, validators, session type, and session builder do not yet know the new fields.

- [ ] **Step 3: Extend the frontend payload and session types**

In `rbac.ts`, add:

```ts
export type AuthIdentityPayload = {
  // existing fields
  displayName: string | null;
};

export type AuthMePayload = {
  // existing fields
  profileDisplayName: string | null;
};

export type AuthSession = {
  // existing fields
  profileDisplayName: string | null;
};
```

Then copy the value in `buildAuthSessionFromMe`:

```ts
profileDisplayName: me.profileDisplayName,
```

- [ ] **Step 4: Extend exact-key validation and persistence**

Add `profileDisplayName` to the auth-me and session required-key arrays. Update identity validation to require nullable `displayName`, and update the auth-me/session predicates with:

```ts
isNullableString(value.profileDisplayName)
```

Do not bump the envelope version unless the existing tests prove older committed envelopes cannot be upgraded through the normal `/auth/me` refresh path. If a bump is required, implement the repository's existing explicit version migration pattern and add a legacy-envelope test in the same step.

- [ ] **Step 5: Run the focused frontend auth tests and confirm GREEN**

Run:

```bash
npm test -- src/api/auth.test.ts src/auth/authContract.compliance.test.ts src/auth/authEnvelope.test.ts src/auth/rbac.test.ts src/auth/AuthProvider.test.ts src/auth/portalAuthorization.test.ts src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: PASS; strict auth validation and committed-session round trips retain both display-name sources.

- [ ] **Step 6: Commit the frontend auth contract**

```bash
git add src/auth/rbac.ts src/auth/authContract.ts src/auth/authEnvelope.ts src/api/auth.test.ts src/auth/authContract.compliance.test.ts src/auth/authEnvelope.test.ts src/auth/rbac.test.ts src/auth/AuthProvider.test.ts src/auth/portalAuthorization.test.ts src/features/settings/UnifiedSettingsPages.test.ts
git commit -m "feat: retain formal profile in admin session"
```

---

### Task 3: Refresh the formal session after user-side name or avatar changes

**Files:**

- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.interaction.test.tsx`

- [ ] **Step 1: Add failing interaction cases**

Cover all three save outcomes:

```ts
it.each([
  ["display name only", { displayName: "新姓名", avatarUrl: oldAvatar }, 1],
  ["avatar only", { displayName: oldName, avatarUrl: "data:image/png;base64,new" }, 1],
  ["unchanged", { displayName: oldName, avatarUrl: oldAvatar }, 0]
])("refreshes the session for %s", async (_label, updated, calls) => {
  profileApi.updateMine.mockResolvedValue(updated);
  // submit the existing editor
  expect(refreshSession).toHaveBeenCalledTimes(calls);
});
```

- [ ] **Step 2: Run the focused interaction test and confirm RED**

Run:

```bash
npm test -- src/pages/user/UserCenterPage.interaction.test.tsx
```

Expected: the display-name-only case FAILS because current code refreshes only for avatar changes.

- [ ] **Step 3: Expand the refresh condition**

Compute both comparisons before replacing local profile state:

```ts
const profileChanged =
  updated.displayName !== formalData.profile.displayName ||
  updated.avatarUrl !== formalData.profile.avatarUrl;

onFormalProfileUpdated(updated);
if (profileChanged) {
  await refreshSession();
}
```

Keep the profile write on the existing formal API and do not add an admin-specific cache or write endpoint.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
npm test -- src/pages/user/UserCenterPage.interaction.test.tsx
```

Expected: PASS for name-only, avatar-only, combined, and unchanged saves.

- [ ] **Step 5: Commit the refresh behavior**

```bash
git add src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.interaction.test.tsx
git commit -m "fix: refresh session after profile edits"
```

---

### Task 4: Add pure summary models and complete the merchant-review client type

**Files:**

- Create: `src/components/admin/adminOperatorSummaryModel.ts`
- Create: `src/components/admin/adminOperatorSummaryModel.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/api.test.ts`

- [ ] **Step 1: Add failing tests for identity resolution and review merging**

Write table-driven tests for the exact fallback order:

```ts
expect(resolveAdminDisplayName({
  profileDisplayName: "  用户端姓名  ",
  username: "admin_user",
  email: "admin@example.com"
})).toBe("用户端姓名");

expect(resolveAdminDisplayName({
  profileDisplayName: " ",
  username: "admin_user",
  email: "admin@example.com"
})).toBe("admin_user");
```

Cover role resolution from the active operations identity and fallback copy supplied by the caller:

```ts
expect(resolveAdminRoleLabel(session, "运营后台成员")).toBe("东京运营组");
```

Cover review-page merging with duplicates, nullable `submittedAt`, `createdAt`, descending order, five-item truncation, and total addition:

```ts
expect(mergePendingMerchantReviews(submittedPage, underReviewPage)).toEqual({
  total: submittedPage.total + underReviewPage.total,
  list: expectedNewestFive
});
```

Do not deduplicate totals; application states are mutually exclusive. Deduplicate the displayed list by `applicationId` defensively before sorting.

- [ ] **Step 2: Add a failing API serialization/type test**

Update the merchant-review API fixture to contain:

```ts
submittedAt: "2026-09-06T01:00:00.000Z",
createdAt: "2026-09-05T01:00:00.000Z"
```

Assert both values are preserved from `listMerchantReviews` and `getMerchantReview`.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
npm test -- src/components/admin/adminOperatorSummaryModel.test.ts src/features/identity-applications/api.test.ts
```

Expected: FAIL because the model does not exist and the frontend `MerchantReview` type omits the timestamps.

- [ ] **Step 4: Implement the pure model**

Export focused functions without React or network calls:

```ts
export function resolveAdminDisplayName(
  session: Pick<AuthSession, "profileDisplayName" | "username" | "email">
): string {
  return session.profileDisplayName?.trim() || session.username.trim() || session.email;
}

export function resolveAdminRoleLabel(
  session: Pick<AuthSession, "activeIdentityId" | "currentIdentity" | "identities">,
  fallback: string
): string {
  const isOperationsIdentity = (type: string) =>
    type === "platform" || type === "platform_admin";
  const active = session.identities.find((identity) =>
    identity.id === session.activeIdentityId && isOperationsIdentity(identity.type)
  ) ?? (isOperationsIdentity(session.currentIdentity.type) ? session.currentIdentity : null);
  return active?.displayName?.trim() || fallback;
}
```

Use a timestamp helper that falls back from `submittedAt` to `createdAt`, then returns `0` only for malformed server data so sorting remains total and deterministic.

- [ ] **Step 5: Complete the merchant-review client contract**

Add to `MerchantReview`:

```ts
submittedAt: string | null;
createdAt: string;
```

No backend change is required here: the formal service record already contains both fields and Express serializes them as ISO strings.

- [ ] **Step 6: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/components/admin/adminOperatorSummaryModel.test.ts src/features/identity-applications/api.test.ts
```

Expected: PASS with deterministic newest-five selection and exact display-name fallbacks.

- [ ] **Step 7: Commit the model and API type**

```bash
git add src/components/admin/adminOperatorSummaryModel.ts src/components/admin/adminOperatorSummaryModel.test.ts src/features/identity-applications/api.ts src/features/identity-applications/api.test.ts
git commit -m "feat: model formal admin pending summaries"
```

---

### Task 5: Render the permission-scoped expandable operations summary

**Files:**

- Create: `src/components/admin/AdminOperatorSummary.tsx`
- Create: `src/components/admin/AdminOperatorSummary.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/components/admin/AdminAccountMenu.tsx`
- Create: `src/components/admin/AdminAccountMenu.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

- [ ] **Step 1: Add failing render and interaction tests**

Mock only the existing API clients, not business data inside production code. Cover:

```ts
expect(screen.getByText("运营者用户端姓名")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /待处理.*2/ })).toHaveAttribute("aria-expanded", "false");
expect(backofficeRealDataApi.orders).toHaveBeenCalledWith("backoffice", {
  page: 1,
  pageSize: 5,
  status: "pending"
});
expect(identityApplicationsApi.listMerchantReviews).toHaveBeenCalledTimes(2);
```

Also cover:

- no order permission means no order card and no order request;
- no merchant-review permission means no review card and no review request;
- `session.portal !== "admin"` or active identity not `platform`/`platform_admin` renders no summary;
- loading, zero items, independent failures, independent retry, and 403 permission-change presentation;
- mutual exclusion of expanded panels;
- stale promise resolution after session id/portal change does not overwrite the new account;
- avatar `src` uses `session.avatarUrl`; missing/error image shows the resolved name's initial;
- order links contain `status=pending&orderId=...` and review links contain `status=pending&applicationId=...`;
- each list is capped at five and uses `aria-controls`, `aria-live`, keyboard-focusable links, and an alert role for errors.

Add a source assertion to `AdminLayout.test.ts` proving the hardcoded artifacts are absent:

```ts
for (const removed of [
  "David Stainberry",
  "/images/generated/profiles/profile-03.jpg",
  ">36<",
  ">19<"
]) {
  expect(source).not.toContain(removed);
}
expect(source).toContain("<AdminOperatorSummary");
```

- [ ] **Step 2: Run the focused component tests and confirm RED**

Run:

```bash
npm test -- src/components/admin/AdminOperatorSummary.test.tsx src/components/admin/AdminLayout.test.ts src/components/admin/AdminAccountMenu.test.tsx src/i18n/translations.test.ts
```

Expected: FAIL because the focused component and five-language strings do not exist, and `AdminLayout` is still hardcoded.

- [ ] **Step 3: Implement independent summary resource state**

In `AdminOperatorSummary.tsx`, use one state object per resource:

```ts
type SummaryState<T> =
  | { status: "loading"; total: null; list: T[] }
  | { status: "success"; total: number; list: T[] }
  | { status: "error"; total: null; list: T[]; message: string };
```

Call only permission-authorized clients:

```ts
backofficeRealDataApi.orders("backoffice", {
  page: 1,
  pageSize: 5,
  status: "pending"
});

Promise.all([
  identityApplicationsApi.listMerchantReviews({ page: 1, pageSize: 5, status: "submitted" }),
  identityApplicationsApi.listMerchantReviews({ page: 1, pageSize: 5, status: "under_review" })
]);
```

Use an incrementing request generation or `AbortController` supported by the existing client. Reset state and invalidate earlier requests whenever `session.id`, `session.activeIdentityId`, or `session.portal` changes.

- [ ] **Step 4: Implement accessible identity and expansion UI**

Resolve name/role through the pure model. Track one value:

```ts
const [expanded, setExpanded] = useState<"orders" | "reviews" | null>(null);
```

Each metric trigger must be a `button` with `aria-expanded`, `aria-controls`, and an accessible label containing the current count or loading state. The linked panel reuses already loaded data, has `aria-live="polite"`, and exposes one localized retry button on error.

Render dates with the active admin language and Tokyo time:

```ts
new Intl.DateTimeFormat(locale, {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tokyo"
}).format(new Date(value));
```

For the avatar, use a local `imageFailed` flag. On a missing URL or `onError`, render a text initial; do not swap to another image URL.

- [ ] **Step 5: Integrate it without refactoring navigation**

In `AdminLayout`, read the existing auth context once:

```ts
const { hasPermission, session } = useAuth();
```

Replace the entire hardcoded `.admin-profile` section with:

```tsx
<AdminOperatorSummary
  hasPermission={hasPermission}
  language={language}
  session={session}
/>
```

Pass the same resolved name and role into `AdminAccountMenu`. Remove `fallbackEmail` and its `admin@example.com` default; when the portal session is not current, the account menu must not invent an account. Preserve logout and password-notice behavior.

- [ ] **Step 6: Add five-language UI strings**

Add translations for at least:

```text
运营后台成员
待处理
审核
待确认订单
待审核店铺申请
加载中
加载失败，重试
暂无待确认订单
暂无待审核店铺申请
查看全部
订单编号
申请编号
```

Extend `translations.test.ts` to assert each new source string has non-empty `zh`, `zh-Hant`, `ja`, `en`, and `ko` values.

- [ ] **Step 7: Run the focused component tests and confirm GREEN**

Run:

```bash
npm test -- src/components/admin/AdminOperatorSummary.test.tsx src/components/admin/AdminLayout.test.ts src/components/admin/AdminAccountMenu.test.tsx src/i18n/translations.test.ts
```

Expected: PASS with no hardcoded profile/count artifacts, no unauthorized requests, and mutually exclusive accessible panels.

- [ ] **Step 8: Commit the sidebar integration**

```bash
git add src/components/admin/AdminOperatorSummary.tsx src/components/admin/AdminOperatorSummary.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/components/admin/AdminAccountMenu.tsx src/components/admin/AdminAccountMenu.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: expand formal admin pending summaries"
```

---

### Task 6: Restore pending-order filters and details from deep links

**Files:**

- Modify: `src/pages/admin/OrdersAdminPage.tsx`
- Modify: `src/pages/admin/OrdersAdminPage.test.ts`
- Create: `src/pages/admin/OrdersAdminPage.deep-link.test.tsx`

- [ ] **Step 1: Add failing route-state tests**

Render under a memory router with:

```text
/admin/orders?status=pending&orderId=42
```

Assert:

```ts
expect(backofficeRealDataApi.orders).toHaveBeenCalledWith("backoffice", {
  page: 1,
  pageSize: 20,
  status: "pending"
});
expect(backofficeRealDataApi.orderDetail).toHaveBeenCalledWith(42);
```

Also cover invalid status, zero/negative/non-integer `orderId`, closing the drawer, selecting another row, and changing the status filter. Invalid values must safely normalize to the base list without a detail request.

- [ ] **Step 2: Run the deep-link test and confirm RED**

Run:

```bash
npm test -- src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/OrdersAdminPage.deep-link.test.tsx
```

Expected: FAIL because the page does not read or synchronize query parameters.

- [ ] **Step 3: Add strict query parsers and URL synchronization**

Use `useSearchParams` and pure local helpers:

```ts
function parseStatusFilter(value: string | null): StatusFilter {
  return statusFilters.some((item) => item.value === value)
    ? value as StatusFilter
    : "all";
}

function parsePositiveId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
```

Initialize and react to browser navigation from `searchParams`. When the user changes a filter, opens a row, or closes the drawer, update only `status` and `orderId` while preserving unrelated existing query parameters such as `module`.

Avoid an effect loop: compare the normalized next query string before calling `setSearchParams`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/OrdersAdminPage.deep-link.test.tsx
```

Expected: PASS for direct load, back/forward navigation, invalid input, and UI-originated URL changes.

- [ ] **Step 5: Commit order deep-link support**

```bash
git add src/pages/admin/OrdersAdminPage.tsx src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/OrdersAdminPage.deep-link.test.tsx
git commit -m "feat: restore admin order deep links"
```

---

### Task 7: Add the pending-union merchant-review deep link

**Files:**

- Modify: `src/features/identity-applications/ReviewPages.tsx`
- Modify: `src/features/identity-applications/ReviewPages.test.ts`
- Create: `src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx`

- [ ] **Step 1: Add failing union-list and detail tests**

Render the merchant review page at:

```text
/admin/merchant-applications?status=pending&applicationId=73
```

Assert the page calls:

```ts
expect(identityApplicationsApi.listMerchantReviews).toHaveBeenNthCalledWith(1, {
  page: 1,
  pageSize: 20,
  status: "submitted"
});
expect(identityApplicationsApi.listMerchantReviews).toHaveBeenNthCalledWith(2, {
  page: 1,
  pageSize: 20,
  status: "under_review"
});
expect(identityApplicationsApi.getMerchantReview).toHaveBeenCalledWith(73);
```

Cover merged newest-first output, empty union, one-side failure, invalid `applicationId`, returning from detail, browser back/forward, and the existing unfiltered route. The review page must not reinterpret other statuses as the pending union.

- [ ] **Step 2: Run the focused review-page tests and confirm RED**

Run:

```bash
npm test -- src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx
```

Expected: FAIL because the review page ignores query parameters and currently issues only one unfiltered list request.

- [ ] **Step 3: Implement the optional pending union**

Read `status` and `applicationId` with `useSearchParams`. For `status=pending`, issue both formal list calls concurrently and merge their lists with the shared sort helper. Use `pageSize: 20` for the full page, and display the combined total independently from the currently loaded rows.

For any supported concrete status, call the single existing API with that status. For an absent or invalid status, preserve today's unfiltered behavior.

Keep approval/rejection writes unchanged. After a mutation, reload the active query view, close the detail, and remove only `applicationId` from the URL.

- [ ] **Step 4: Synchronize selection with the URL**

When `applicationId` becomes a valid positive id, fetch the formal detail. When it is removed, clear `selected`, rejection text, and stale detail errors. When a list item opens, set `applicationId`; when “返回申请列表” is clicked, remove it. Guard old detail responses with a request generation so browser navigation cannot show the wrong application.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx
```

Expected: PASS for pending union, direct detail, mutation refresh, and route restoration.

- [ ] **Step 6: Commit merchant-review deep-link support**

```bash
git add src/features/identity-applications/ReviewPages.tsx src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx
git commit -m "feat: restore pending merchant review links"
```

---

### Task 8: Verify the complete microstep and perform browser acceptance

**Files:**

- Modify only if verification exposes a defect in files already listed above.
- Record evidence in the implementation handoff; do not add screenshots or generated runtime artifacts to git.

- [ ] **Step 1: Run the complete focused frontend suite**

Run:

```bash
npm test -- src/api/auth.test.ts src/auth/authContract.compliance.test.ts src/auth/authEnvelope.test.ts src/auth/rbac.test.ts src/auth/AuthProvider.test.ts src/auth/portalAuthorization.test.ts src/features/settings/UnifiedSettingsPages.test.ts src/pages/user/UserCenterPage.interaction.test.tsx src/components/admin/adminOperatorSummaryModel.test.ts src/components/admin/AdminOperatorSummary.test.tsx src/components/admin/AdminLayout.test.ts src/components/admin/AdminAccountMenu.test.tsx src/features/identity-applications/api.test.ts src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/OrdersAdminPage.deep-link.test.tsx src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx src/i18n/translations.test.ts
```

Expected: all selected Vitest files PASS.

- [ ] **Step 2: Run backend verification**

Run:

```bash
cd backend && npm test -- tests/auth.repository.test.ts tests/auth.test.ts tests/openapi.test.ts
cd backend && npm run lint
cd backend && npm run build
```

Expected: focused Jest tests, backend ESLint, and backend TypeScript build PASS.

- [ ] **Step 3: Run frontend static and localization checks**

Run:

```bash
npm run lint
npm run i18n:audit
npm run build
```

Expected: frontend TypeScript, i18n audit, and production build PASS.

- [ ] **Step 4: Prove the formal local runtime before browser QA**

Start the formal backend and frontend using the repository's documented commands. Before accepting the UI, record:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
```

For each listener PID, verify its cwd points to this worktree and record the served branch/commit. A different port or another worktree is not acceptance evidence.

- [ ] **Step 5: Perform authenticated browser acceptance**

With real non-production data and at least two operations accounts:

1. Confirm each account shows its own user-side display name, avatar, and operations identity label.
2. Edit one account's user-side display name and avatar, refresh the session, and confirm the operations sidebar updates.
3. Compare both counts to the exact formal API totals.
4. Expand each panel, verify at most five records, mutual exclusion, empty/error/retry behavior, keyboard focus, no horizontal/sidebar overflow, and no console errors.
5. Open an order and a merchant application from the summary; refresh each deep URL and confirm its filter/detail restores.
6. Log in with an operations account missing each individual read permission; confirm the corresponding card is absent and the network log contains no unauthorized request.

- [ ] **Step 6: Scan for forbidden regressions**

Run:

```bash
rg -n "David Stainberry|profile-03\.jpg|admin@example\.com|>36<|>19<|TODO|FIXME|not implemented" src/components/admin src/pages/admin/OrdersAdminPage.tsx src/features/identity-applications/ReviewPages.tsx backend/src/repositories/auth.repository.ts backend/src/services/auth.service.ts
```

Expected: no newly introduced forbidden fallback or placeholder matches. Existing unrelated `not implemented` text outside the scoped files is not part of this microstep.

- [ ] **Step 7: Review the branch diff and commit verification fixes only if needed**

Run:

```bash
git status --short
git diff --check
git diff --stat main...HEAD
git log --oneline main..HEAD
```

If verification required scoped fixes, stage only the exact previously scoped paths that changed, then commit. The complete allowed staging command is:

```bash
git add backend/src/repositories/auth.repository.ts backend/src/services/auth.service.ts backend/src/api/openapi.ts backend/tests/auth.repository.test.ts backend/tests/auth.test.ts backend/tests/openapi.test.ts src/auth/rbac.ts src/auth/authContract.ts src/auth/authEnvelope.ts src/api/auth.test.ts src/auth/authContract.compliance.test.ts src/auth/authEnvelope.test.ts src/auth/rbac.test.ts src/auth/AuthProvider.test.ts src/auth/portalAuthorization.test.ts src/features/settings/UnifiedSettingsPages.test.ts src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/components/admin/adminOperatorSummaryModel.ts src/components/admin/adminOperatorSummaryModel.test.ts src/features/identity-applications/api.ts src/features/identity-applications/api.test.ts src/components/admin/AdminOperatorSummary.tsx src/components/admin/AdminOperatorSummary.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/components/admin/AdminAccountMenu.tsx src/components/admin/AdminAccountMenu.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts src/pages/admin/OrdersAdminPage.tsx src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/OrdersAdminPage.deep-link.test.tsx src/features/identity-applications/ReviewPages.tsx src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/MerchantApplicationsReviewPage.deep-link.test.tsx
git commit -m "fix: close admin summary acceptance gaps"
```

Expected: clean worktree, no whitespace errors, task-sized commits, and no unrelated files.

- [ ] **Step 8: Report integration gates separately**

Report these as distinct facts:

- implementation commits created;
- focused tests/lint/build results;
- authenticated local browser evidence;
- local merge into `main` status;
- remote push status;
- staging deployment status;
- staging authenticated acceptance status.

Do not merge, push, deploy, or write staging data unless the user explicitly authorizes those later gates.
