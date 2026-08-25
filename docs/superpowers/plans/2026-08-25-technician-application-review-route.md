# Technician Application Review Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make operations admin “资料审核” open a real technician-application review view containing only user-submitted `pending_review` technician profiles.

**Architecture:** Reuse the existing `TechniciansPage` and formal `/api/v1/backoffice/technicians` contract. A `module=review` URL selects review mode, passes `status=pending_review` to the server-paginated API, and changes the page copy without creating a duplicate review page.

**Tech Stack:** React 19, TypeScript, React Router 7, Vitest, Vite, existing Express/Prisma `/api/v1/backoffice/technicians` API.

## Global Constraints

- Execute only this Step 12 micro-change; do not modify database schema or migrations.
- Do not add mock, demo, placeholder, fake API, or deferred implementation markers.
- Keep the existing React / TSX / Vite stack and the existing formal technician detail drawer.
- Keep all technician list and approval data on the existing real API and RBAC/audit flow.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Route technician document review to the formal pending-review view

**Files:**
- Create: `src/pages/admin/TechnicianReviewRoute.test.ts`
- Modify: `src/components/admin/AdminLayout.tsx:63`
- Modify: `src/pages/admin/TechniciansPage.tsx:1-135`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `backofficeRealDataApi.technicians("backoffice", { page, pageSize, status })`, `useSearchParams()`.
- Produces: `/admin/technicians?module=review`, which renders the existing technician detail/approval workflow and requests only `status=pending_review` records.

- [x] **Step 1: Write the failing regression test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("operations technician application review route", () => {
  it("routes document review to the formal pending technician workflow", () => {
    const layoutSource = read("../../components/admin/AdminLayout.tsx");
    const pageSource = read("./TechniciansPage.tsx");

    expect(layoutSource).toContain('/admin/technicians?module=review');
    expect(layoutSource).not.toContain('/admin/merchants?module=technician-review');
    expect(pageSource).toContain('searchParams.get("module") === "review"');
    expect(pageSource).toContain('status: isReviewMode ? "pending_review" : undefined');
    expect(pageSource).toContain('const reviewTechnicians = useMemo(() => technicians.filter((item) => item.status === "pending_review"), [technicians]);');
    expect(pageSource).toContain('title={isReviewMode ? "技师资料审核" : "技师管理"}');
    expect(pageSource).toContain("actions={isReviewMode ? <></> : undefined}");
    expect(pageSource).toContain("DataTable<BackofficeTechnicianPayload>");
    expect(pageSource).toContain('title: "申请人"');
    expect(pageSource).toContain('title: "创建时间"');
    expect(pageSource).toContain("暂无待审核的技师申请");
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/pages/admin/TechnicianReviewRoute.test.ts`

Expected: FAIL because the navigation still targets `/admin/merchants?module=technician-review` and `TechniciansPage` has no review mode.

- [x] **Step 3: Implement the minimal route and review-mode behavior**

Change the navigation target:

```tsx
{ label: "资料审核", to: "/admin/technicians?module=review", icon: "审", children: ["基本资料", "实名信息", "资质证书", "动态信息"] },
```

Read the route mode and scope the real API request:

```tsx
import { useSearchParams } from "react-router-dom";

const [searchParams] = useSearchParams();
const isReviewMode = searchParams.get("module") === "review";

backofficeRealDataApi.technicians("backoffice", {
  page: 1,
  pageSize: 100,
  status: isReviewMode ? "pending_review" : undefined
});
```

Render explicit review copy while retaining the same formal detail drawer:

```tsx
<ModuleShell
  title={isReviewMode ? "技师资料审核" : "技师管理"}
  description={isReviewMode
    ? "审核用户端提交的技师申请；这里只显示正式数据库中待审核的技师资料。"
    : "只展示数据库中的真实技师账号；待审核、店铺归属、资料更新和软删除均写入正式 API。"}
>
```

In review mode, derive `reviewTechnicians` by retaining only records whose returned status is `pending_review`, then render a `DataTable<BackofficeTechnicianPayload>` with applicant, email, city, application type, created time, and pending status columns. Disable generic footer actions and show `暂无待审核的技师申请` when the filtered API returns no rows. Add the new review title, description, and empty-state strings to `src/i18n/translations.ts` in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean.

- [x] **Step 4: Run focused and adjacent tests and verify GREEN**

Run: `npm test -- src/pages/admin/TechnicianReviewRoute.test.ts src/pages/admin/masterDataPages.test.ts`

Expected: both files PASS.

- [x] **Step 5: Verify static quality and production build**

Run: `npm run lint`

Expected: TypeScript exits 0.

Run: `npm run build -- --mode formal`

Expected: TypeScript and Vite production build exit 0.

- [x] **Step 6: Verify the local operations UI and formal workflow boundary**

The existing formal `5180` session was blocked at authentication by its pre-existing rate limit, so no security control was bypassed. In an isolated static acceptance server, navigate through “技师 → 资料审核” and verify the URL, visible “技师资料审核” heading, absence of “店铺与商家管理”, absence of generic “新建/导出” actions, and the dedicated pending-review empty state. Separately verify the formal user-registration → `pending_review` → backoffice list/detail/approve contract with the backend `auth.test.ts` and `master-data-api.test.ts` suites.
