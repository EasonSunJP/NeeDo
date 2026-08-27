# Merchant Admin Timeout Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop unrelated local worktrees from interrupting the active Vite server, and make the merchant dashboard and people lists recover once from transient read failures without displaying raw error keys or false empty states.

**Architecture:** Add an explicit Vite dev-watcher boundary for nested worktrees. Reuse the existing bounded `loadCoreReadWithTransientRetry` helper at the two merchant read entry points, keep the dashboard cache as one shared Promise per retry sequence, and centralize merchant-read error localization in a small pure helper. Keep API contracts, RBAC, the 10-second HTTP timeout, and all write paths unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing `backofficeRealDataApi`, existing i18n dictionary, formal Express `/api/v1` backend.

## Global Constraints

- Work only on the approved merchant-read and Vite watcher scope.
- Do not raise `fallbackApiRequestTimeoutMs` or change `fetchWithTimeout`.
- Do not retry create, update, approve, delete, finance, audit, or other mutation requests.
- Do not add mock data, offline data, placeholder APIs, or client-side authorization bypasses.
- Preserve the existing dashboard cache key and in-flight Promise sharing semantics.
- Keep all new user-facing text in the existing i18n system.
- Observe every red test before writing the corresponding production change.
- Commit each task separately so every step is independently reviewable and reversible.

---

## Task 1: Isolate the Vite development watcher from Git worktrees

**Files:**

- Modify: `src/api/productionSafety.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add a failing serve-config regression test**

Extend the existing worktree test in `src/api/productionSafety.test.ts` so it checks the Vite server watcher independently from Vitest discovery:

```ts
it("keeps isolated git worktrees outside the root test suite and dev watcher", () => {
  const createConfig = viteConfig as unknown as (config: {
    command: "serve";
    mode: string;
  }) => {
    server?: { watch?: { ignored?: string[] } };
    test?: { exclude?: string[] };
  };
  const config = createConfig({ command: "serve", mode: "test" });

  expect(config.test?.exclude).toEqual(
    expect.arrayContaining([".worktrees/**", "worktrees/**"])
  );
  expect(config.server?.watch?.ignored).toEqual(
    expect.arrayContaining(["**/.worktrees/**", "**/worktrees/**"])
  );
});
```

- [ ] **Step 2: Run the test and confirm the intended failure**

Run:

```bash
npm test -- src/api/productionSafety.test.ts
```

Expected: FAIL because `config.server.watch` is currently absent. The existing `test.exclude` assertion must remain green.

- [ ] **Step 3: Add the minimal Vite watcher exclusion**

Update only the `server` block in `vite.config.ts`:

```ts
server: {
  port: 5180,
  proxy: apiProxy,
  watch: {
    ignored: ["**/.worktrees/**", "**/worktrees/**"]
  }
},
```

Do not add this setting to `preview`, because preview does not run the source watcher.

- [ ] **Step 4: Re-run the regression test**

Run:

```bash
npm test -- src/api/productionSafety.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated change**

```bash
git add vite.config.ts src/api/productionSafety.test.ts
git commit -m "fix: isolate Vite watcher from worktrees"
```

---

## Task 2: Centralize localized merchant-read error descriptions

**Files:**

- Create: `src/features/merchant-admin/merchantReadError.ts`
- Create: `src/features/merchant-admin/merchantReadError.test.ts`

- [ ] **Step 1: Add failing pure-function tests**

Create `src/features/merchant-admin/merchantReadError.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { describeMerchantReadError } from "./merchantReadError";

describe("describeMerchantReadError", () => {
  it.each([
    [new ApiClientError("error.auth.unauthorized", 401, 401), "Your session has expired. Sign in again"],
    [new ApiClientError("error.forbidden", 403, 403), "The current identity cannot view this shop's operating data"],
    [new ApiClientError("error.network.timeout", 408, 408), "The network request timed out. Try again later."],
    [new ApiClientError("error.internal", 500, 500), "The shop data service is temporarily unavailable. Try again later"]
  ])("maps a formal API error without exposing its raw key", (error, expected) => {
    expect(describeMerchantReadError(error, "en")).toBe(expected);
  });

  it("maps an unreachable browser network to the localized generic recovery message", () => {
    expect(describeMerchantReadError(new TypeError("Failed to fetch"), "ja")).toBe(
      "店舗経営データの読み込みに失敗しました。ネットワークを確認してもう一度お試しください"
    );
  });

  it("recognizes a timeout error key even when it is not wrapped", () => {
    expect(describeMerchantReadError(new Error("error.network.timeout"), "zh")).toBe(
      "网络响应超时，请稍后重试。"
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run:

```bash
npm test -- src/features/merchant-admin/merchantReadError.test.ts
```

Expected: FAIL because `merchantReadError.ts` does not exist.

- [ ] **Step 3: Implement the smallest localized mapper**

Create `src/features/merchant-admin/merchantReadError.ts`:

```ts
import { ApiClientError } from "../../api/httpClient";
import { translateText, type Language } from "../../i18n/translations";

const timeoutErrorMessage = "error.network.timeout";

export function describeMerchantReadError(error: unknown, language: Language) {
  let message = "本店经营数据加载失败，请检查网络后重试";

  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      message = "登录状态已失效，请重新登录";
    } else if (error.status === 403) {
      message = "当前身份没有查看本店经营数据的权限";
    } else if (error.status === 408 || error.message === timeoutErrorMessage) {
      message = "网络响应超时，请稍后重试。";
    } else if (error.status >= 500) {
      message = "本店经营数据服务暂时不可用，请稍后重试";
    }
  } else if (error instanceof Error && error.message === timeoutErrorMessage) {
    message = "网络响应超时，请稍后重试。";
  }

  return translateText(message, language);
}
```

`TypeError` and other browser network failures intentionally use the generic connection/retry copy. Do not return `error.message` to the UI.

- [ ] **Step 4: Run the helper test**

Run:

```bash
npm test -- src/features/merchant-admin/merchantReadError.test.ts
```

Expected: PASS for all supported languages and error classes.

- [ ] **Step 5: Commit the helper**

```bash
git add src/features/merchant-admin/merchantReadError.ts src/features/merchant-admin/merchantReadError.test.ts
git commit -m "feat: localize merchant read failures"
```

---

## Task 3: Give the shared merchant dashboard one bounded read retry

**Files:**

- Modify: `src/features/merchant-admin/dashboardResource.test.ts`
- Modify: `src/features/merchant-admin/dashboardResource.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`

- [ ] **Step 1: Add retry behavior tests to the dashboard resource**

Import `ApiClientError` in `dashboardResource.test.ts`, then add:

```ts
it("shares one bounded retry sequence after a transient timeout", async () => {
  mocked.dashboard
    .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
    .mockResolvedValueOnce({ shops: [{ id: 1 }] });

  const first = loadMerchantAdminDashboard("merchant:1:shop:1");
  const second = loadMerchantAdminDashboard("merchant:1:shop:1");

  expect(first).toBe(second);
  await expect(Promise.all([first, second])).resolves.toEqual([
    { shops: [{ id: 1 }] },
    { shops: [{ id: 1 }] }
  ]);
  expect(mocked.dashboard).toHaveBeenCalledTimes(2);
});

it("does not retry a deterministic dashboard rejection", async () => {
  const error = new ApiClientError("error.forbidden", 403, 403);
  mocked.dashboard.mockRejectedValue(error);

  await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).rejects.toBe(error);
  expect(mocked.dashboard).toHaveBeenCalledTimes(1);
});
```

The first test may take about 300ms because it verifies the production delay rather than weakening the resource for tests.

- [ ] **Step 2: Update the dashboard page source contract before implementation**

Replace the existing `"has loading, permission failure, retry, and empty order states"` test in `MerchantAdminDashboardPage.test.ts` with a contract that expects the shared mapper and current language instead of page-local status parsing:

```ts
it("has loading, localized failure, retry, and empty order states", () => {
  expect(source).toContain("正在加载本店真实数据");
  expect(source).toContain("useOptionalI18n");
  expect(source).toContain("describeMerchantReadError(error, language)");
  expect(source).toContain("重新加载本店数据");
  expect(source).toContain("本店当前没有真实订单");
  expect(source).not.toContain("function describeMerchantDashboardError");
  expect(source).not.toContain("error.message");
});
```

Keep the other real-data and financial-value tests unchanged.

- [ ] **Step 3: Run both tests and confirm they fail for the missing wiring**

Run:

```bash
npm test -- src/features/merchant-admin/dashboardResource.test.ts src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts
```

Expected: FAIL because the formal dashboard call is not retried and the page still owns `describeMerchantDashboardError`.

- [ ] **Step 4: Wrap the dashboard API call without moving the cache boundary**

In `dashboardResource.ts`, import the existing helper:

```ts
import { loadCoreReadWithTransientRetry } from "../core-read/transientRetry";
```

Replace only the request creation expression:

```ts
const request = loadCoreReadWithTransientRetry(
  () => backofficeRealDataApi.dashboard("merchant-admin")
)
  .then((payload) => {
    if (dashboardCache.get(scopeKey) === entry) {
      dashboardCache.set(scopeKey, {
        expiresAt: Date.now() + resolvedPayloadMaxAgeMs,
        payload
      });
    }

    return payload;
  })
  .catch((error: unknown) => {
    if (dashboardCache.get(scopeKey) === entry) {
      dashboardCache.delete(scopeKey);
    }

    throw error;
  });
```

The retry helper must remain inside the single cached Promise. Do not wrap `loadMerchantAdminDashboard` from outside, or concurrent callers could create separate retries.

- [ ] **Step 5: Replace the dashboard-local mapper with the shared i18n helper**

In `MerchantAdminDashboardPage.tsx`:

```ts
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
import { useOptionalI18n } from "../../i18n/I18nProvider";
```

Remove the `ApiClientError` import and the local `describeMerchantDashboardError`. At the top of `MerchantAdminDashboardContent` add:

```ts
const { language } = useOptionalI18n();
const loadError = error ? describeMerchantReadError(error, language) : "";
```

Keep the existing `loading`, `error`, and `success` state branches and explicit `reload` button unchanged.

- [ ] **Step 6: Re-run dashboard tests**

Run:

```bash
npm test -- src/features/core-read/transientRetry.test.ts src/features/merchant-admin/dashboardResource.test.ts src/features/merchant-admin/merchantReadError.test.ts src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts
```

Expected: PASS. Existing cache-sharing, cache-expiry, scope-isolation, and explicit-retry tests must remain green.

- [ ] **Step 7: Commit the dashboard change**

```bash
git add src/features/merchant-admin/dashboardResource.ts src/features/merchant-admin/dashboardResource.test.ts src/pages/merchant-admin/MerchantAdminDashboardPage.tsx src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts
git commit -m "fix: retry transient merchant dashboard reads"
```

---

## Task 4: Protect merchant people reads and make error/empty states exclusive

**Files:**

- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`

- [ ] **Step 1: Add failing source-contract assertions**

Add a focused test to `MerchantAdminPeoplePage.test.ts`:

```ts
it("retries only formal list reads and never renders an empty success state after an error", () => {
  expect(source).toContain("loadCoreReadWithTransientRetry");
  expect(source).toMatch(
    /loadCoreReadWithTransientRetry\(\s*\(\) => backofficeRealDataApi\.technicians\("merchant-admin", query\)\s*\)/
  );
  expect(source).toMatch(
    /loadCoreReadWithTransientRetry\(\s*\(\) => backofficeRealDataApi\.customers\("merchant-admin", query\)\s*\)/
  );
  expect(source).toContain("describeMerchantReadError(loadError, languageRef.current)");
  expect(source).toContain('!loading && !error && module === "staff"');
  expect(source).toContain('!loading && !error && module === "customers"');
  expect(source).not.toContain(
    "setError(loadError instanceof Error ? loadError.message : String(loadError))"
  );
});
```

Retain the existing assertions proving update, approve, and delete mutations call their audited endpoints directly. Do not wrap those calls with the retry helper.

- [ ] **Step 2: Run the people-page test and confirm the expected failure**

Run:

```bash
npm test -- src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
```

Expected: FAIL because list calls are direct, raw error messages are stored, and empty states ignore `error`.

- [ ] **Step 3: Add the two approved read-only wrappers**

Import:

```ts
import { loadCoreReadWithTransientRetry } from "../../features/core-read/transientRetry";
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
```

Change only the two list reads inside `load`:

```ts
if (module === "staff") {
  const result = await loadCoreReadWithTransientRetry(
    () => backofficeRealDataApi.technicians("merchant-admin", query)
  );
  setTechnicians(result.list);
  setCustomers([]);
  setTotal(result.total);
} else {
  const result = await loadCoreReadWithTransientRetry(
    () => backofficeRealDataApi.customers("merchant-admin", query)
  );
  setCustomers(result.list);
  setTechnicians([]);
  setTotal(result.total);
}
```

Do not wrap `technician`, `customer`, `updateTechnician`, `approveTechnician`, or `deleteTechnician` in this task.

- [ ] **Step 4: Localize final list failures and suppress false empty states**

Replace the list-load catch assignment with:

```ts
setError(describeMerchantReadError(loadError, languageRef.current));
```

Change the opening condition of the staff success branch from:

```tsx
{!loading && module === "staff" ? (
```

to:

```tsx
{!loading && !error && module === "staff" ? (
```

Change the opening condition of the customer success branch from:

```tsx
{!loading && module === "customers" ? (
```

to:

```tsx
{!loading && !error && module === "customers" ? (
```

This ensures initial empty arrays are not presented as server-confirmed empty data after a failed request.

- [ ] **Step 5: Run the people and shared retry/error tests**

Run:

```bash
npm test -- src/features/core-read/transientRetry.test.ts src/features/merchant-admin/merchantReadError.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/formalDetailMutationPages.test.ts
```

Expected: PASS. The mutation-sequence regression test must prove audited writes are unchanged.

- [ ] **Step 6: Commit the people-page change**

```bash
git add src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
git commit -m "fix: recover merchant people reads"
```

---

## Task 5: Verify production safety and accept the real LifeDance merchant flow

**Files:**

- Verify only: `vite.config.ts`
- Verify only: `src/api/httpClient.ts`
- Verify only: `src/features/core-read/transientRetry.ts`
- Verify only: merchant dashboard and people files changed above

- [ ] **Step 1: Run the complete focused regression set**

Run:

```bash
npm test -- src/api/productionSafety.test.ts src/features/core-read/transientRetry.test.ts src/features/merchant-admin/merchantReadError.test.ts src/features/merchant-admin/dashboardResource.test.ts src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/formalDetailMutationPages.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete frontend verification suite**

Run:

```bash
npm test
npm run lint
npm run build -- --mode formal
```

Expected: all tests pass, TypeScript emits no diagnostics, and the formal production build completes. If an unrelated pre-existing failure appears, record its exact command and output; do not broaden this change to repair unrelated modules.

- [ ] **Step 3: Reconfirm the timeout boundary and retry scope from source**

Run:

```bash
rg -n "fallbackApiRequestTimeoutMs|loadCoreReadWithTransientRetry|approveTechnician|deleteTechnician|updateTechnician" src/api/httpClient.ts src/features/merchant-admin src/pages/merchant-admin/MerchantAdminPeoplePage.tsx
```

Expected:

- `fallbackApiRequestTimeoutMs` remains `10_000`.
- Retry wrapping exists only on dashboard, technicians list, and customers list reads in the approved scope.
- Approve, delete, and update calls remain direct and are not automatically retried.

- [ ] **Step 4: Integrate the verified branch before runtime acceptance**

Use the repository's branch-finishing workflow. Merge only after the branch is clean and all checks above pass. Preserve unrelated local changes and do not reset the main worktree.

- [ ] **Step 5: Restart only the formal local frontend/backend runtime**

Restart the existing formal development screen so Vite reads the new `server.watch.ignored` configuration. Do not restart or delete the separate MySQL or Redis screens.

Then verify:

```bash
curl -sS http://127.0.0.1:3000/api/v1/health
curl -sS http://127.0.0.1:3000/api/v1/ready
curl -I -sS http://127.0.0.1:5180/store-admin.html
```

Expected: backend health and readiness return success; merchant entry returns HTTP 200.

- [ ] **Step 6: Verify worktree changes no longer trigger the active Vite server**

Capture the Vite screen output, create and then remove one harmless probe file under an existing ignored `.worktrees` path, and capture the output again. Expected: no full-page reload, dependency cache clear, or HTML/`tsconfig.json` reaction is logged for the ignored path. Do not edit another task's tracked source file.

- [ ] **Step 7: Perform browser acceptance with the real local LifeDance merchant identity**

Using the ignored local test-account source without printing credentials:

1. Sign in through the formal `/api/v1/auth/login` path.
2. Switch to the LifeDance merchant identity through the formal identity API.
3. Open `/merchant-admin` and confirm the real shop dashboard succeeds.
4. Open `/merchant-admin/people?module=staff` and confirm four persisted technicians are shown for the current local dataset.
5. Use the explicit refresh actions on both pages and confirm they remain successful.
6. Confirm neither `error.network.timeout` nor an error banner plus a false empty state appears.
7. Sign out through the formal logout API.

Do not accept API-only success as browser acceptance; record both the observed UI state and the supporting network status.

- [ ] **Step 8: Record final repository and runtime evidence**

Run:

```bash
git status --short --branch
git log -5 --oneline
```

Final report must distinguish:

- local code implemented and merged,
- tests/lint/formal build actually run,
- current local health/readiness,
- browser-observed LifeDance dashboard and technician count,
- deployment/push status (do not claim either unless separately performed).
