# Test-Only Backend Portal Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate the temporary backend-entry section from formal identity switching and open all three backend portals in secure new browser tabs.

**Architecture:** A self-contained `TestOnlyBackendPortalEntries` component owns the temporary entry configuration, presentation, and external-link semantics. `UnifiedSettingsPortalPage` retains only one import and one render call, so removing the temporary feature later does not disturb formal identity switching.

**Tech Stack:** React 19, TypeScript 5.9 strict mode, Vite 7, Vitest 4, jsdom, Tailwind CSS, React Router 7.

## Global Constraints

- Keep the backend entries visible in all existing local and test environments; do not add an environment flag.
- Keep the existing three target URLs unchanged.
- Use semantic links with `target="_blank"` and `rel="noopener noreferrer"`.
- Do not navigate, refresh, or change the active identity in the original frontend tab.
- Do not change backend authentication, authorization, routes, or portal implementations.
- Preserve the existing frontend-identity switching and identity-application behavior.
- Do not touch the pre-existing uncommitted `UserCenterPage.tsx` or `UserCenterPage.interaction.test.tsx` changes.

---

### Task 1: Build the isolated test-only backend-entry component

**Files:**
- Create: `src/features/settings/TestOnlyBackendPortalEntries.test.tsx`
- Create: `src/features/settings/TestOnlyBackendPortalEntries.tsx`

**Interfaces:**
- Consumes: `SettingsSection`, `SettingsArrow`, `InfoTooltipTrigger`, and `cn` from existing shared UI modules.
- Produces: `TestOnlyBackendPortalEntries({ t }: { t: (source: string) => string }): JSX.Element`.

- [ ] **Step 1: Write the failing component test**

Create `src/features/settings/TestOnlyBackendPortalEntries.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TestOnlyBackendPortalEntries } from "./TestOnlyBackendPortalEntries";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  container = null;
  root = null;
});

describe("TestOnlyBackendPortalEntries", () => {
  it("isolates the three temporary backend links and opens them in secure new tabs", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TestOnlyBackendPortalEntries, { t: (source: string) => source }));
    });

    const links = Array.from(container.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/store-admin.html#/login/merchant-admin",
      "/pf-admin.html#/login/admin",
      "/afirieito-admin.html#/NDA-admin"
    ]);
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(
      links.every((link) => {
        const rel = new Set((link.getAttribute("rel") ?? "").split(/\s+/));
        return rel.has("noopener") && rel.has("noreferrer");
      })
    ).toBe(true);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "进入后台：商户后台",
      "进入后台：运营后台",
      "进入后台：NDA管理后台"
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm test -- src/features/settings/TestOnlyBackendPortalEntries.test.tsx
```

Expected: FAIL because `./TestOnlyBackendPortalEntries` does not exist yet.

- [ ] **Step 3: Implement the minimal isolated component**

Create `src/features/settings/TestOnlyBackendPortalEntries.tsx`:

```tsx
import { SettingsArrow, SettingsSection } from "../../components/client-ui/SettingsDirectory";
import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import { cn } from "../../lib/utils";

const testOnlyBackendPortalEntries = [
  {
    id: "merchant-admin",
    title: "商户后台",
    subtitle: "店铺订单、排班、员工、财务与门店设置",
    href: "/store-admin.html#/login/merchant-admin"
  },
  {
    id: "operations-admin",
    title: "运营后台",
    subtitle: "平台运营、店铺、技师、订单、财务与全局规则",
    href: "/pf-admin.html#/login/admin"
  },
  {
    id: "afirieito-admin",
    title: "NDA管理后台",
    subtitle: "推广计划、归因、分佣、风险与增长数据管理",
    href: "/afirieito-admin.html#/NDA-admin"
  }
] as const;

function TestOnlyBackendPortalLink({
  entry,
  t
}: {
  entry: (typeof testOnlyBackendPortalEntries)[number];
  t: (source: string) => string;
}) {
  const actionLabel = `${t("进入后台")}：${t(entry.title)}`;

  return (
    <div className="group relative flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left">
      <a
        aria-label={actionLabel}
        className={cn(
          "absolute inset-x-1 inset-y-1.5 z-10 rounded-[18px] transition",
          "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]",
          "focus:outline-none focus-visible:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
        )}
        href={entry.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="sr-only">{actionLabel}</span>
      </a>
      <div className="pointer-events-none relative z-20 min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-black text-[color:var(--client-text)]">{t(entry.title)}</span>
          <span className="pointer-events-auto relative z-30">
            <InfoTooltipTrigger
              className="h-4 w-4 text-[10px]"
              content={t(entry.subtitle)}
              label={t("查看后台入口说明")}
              panelClassName="font-medium"
              panelMode="tooltip"
            />
          </span>
        </div>
      </div>
      <SettingsArrow className="pointer-events-none relative z-20" />
    </div>
  );
}

export function TestOnlyBackendPortalEntries({ t }: { t: (source: string) => string }) {
  return (
    <SettingsSection
      description={t("后台入口独立进入，不会改变当前前台身份。")}
      panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]"
      title={t("后台入口")}
    >
      {testOnlyBackendPortalEntries.map((entry) => (
        <TestOnlyBackendPortalLink entry={entry} key={entry.id} t={t} />
      ))}
    </SettingsSection>
  );
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
npm test -- src/features/settings/TestOnlyBackendPortalEntries.test.tsx
```

Expected: PASS with 1 test and 0 failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/settings/TestOnlyBackendPortalEntries.tsx src/features/settings/TestOnlyBackendPortalEntries.test.tsx
git commit -m "feat: isolate test-only backend portal entries"
```

---

### Task 2: Replace the inline backend-entry implementation

**Files:**
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts:420-455`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx:1-170`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx:1935-2082`

**Interfaces:**
- Consumes: `TestOnlyBackendPortalEntries({ t })` from Task 1.
- Produces: `UnifiedSettingsPortalPage` with one removable test-only component boundary and unchanged formal identity behavior.

- [ ] **Step 1: Add the failing integration-boundary test**

Add this test inside the existing `describe("UnifiedSettingsPortalPage", ...)` block in `src/features/settings/UnifiedSettingsPages.test.ts`:

```ts
it("keeps temporary backend entries behind one removable component boundary", () => {
  expect(source).toContain('import { TestOnlyBackendPortalEntries } from "./TestOnlyBackendPortalEntries";');
  expect(portalPageSource).toContain("<TestOnlyBackendPortalEntries t={t} />");
  expect(source).not.toContain("const backendSettingsPortalEntries");
  expect(portalPageSource).not.toContain("window.location.assign");
  expect(portalPageSource).not.toContain("openBackendPortal");
});
```

- [ ] **Step 2: Run the integration test to verify RED**

Run:

```bash
npm test -- src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: FAIL because the main settings page still owns the inline configuration and `window.location.assign()` behavior.

- [ ] **Step 3: Integrate the isolated component**

In `src/features/settings/UnifiedSettingsPages.tsx`:

1. Add this import with the other settings feature imports:

```ts
import { TestOnlyBackendPortalEntries } from "./TestOnlyBackendPortalEntries";
```

2. Delete the complete `backendSettingsPortalEntries` constant.

3. Delete this function from `UnifiedSettingsPortalPage`:

```ts
const openBackendPortal = (href: string) => {
  window.location.assign(href);
};
```

4. Replace the complete inline backend `SettingsSection` with:

```tsx
<TestOnlyBackendPortalEntries t={t} />
```

Do not change `SettingsPortalActionRow`; formal frontend identities continue to use it.

- [ ] **Step 4: Run both focused tests to verify GREEN**

Run:

```bash
npm test -- src/features/settings/TestOnlyBackendPortalEntries.test.tsx src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts
git commit -m "fix: open test backend portals in new tabs"
```

---

### Task 3: Full verification and browser acceptance

**Files:**
- Verify only: all files changed in Tasks 1 and 2.

**Interfaces:**
- Consumes: the completed isolated component and settings-page integration.
- Produces: fresh automated and visible acceptance evidence.

- [ ] **Step 1: Inspect scope and whitespace**

Run:

```bash
git status --short
git diff --check HEAD~2..HEAD
git diff --stat HEAD~2..HEAD
```

Expected: only the new test-only component, its test, and the two settings files are part of the two implementation commits; pre-existing user-center files remain uncommitted and untouched.

- [ ] **Step 2: Run the full frontend test suite**

Run:

```bash
npm test
```

Expected: all Vitest files pass with 0 failures.

- [ ] **Step 3: Run TypeScript lint**

Run:

```bash
npm run lint
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the formal production build**

Run:

```bash
npm run build -- --mode formal
```

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 5: Perform local browser acceptance**

Start or reuse the formal local frontend, then open the identity-switch route for an authenticated test identity. At the screenshot-equivalent mobile viewport and at desktop width, verify:

1. The “后台入口” section still contains 商户后台、运营后台、NDA管理后台.
2. Each click creates a new tab with the unchanged target URL.
3. The original tab remains on the identity-switch page with the same active frontend identity.
4. Each info icon still opens its explanation without navigating.
5. Keyboard focus and Enter activate each backend link.
6. No console error or warning is introduced by the new component.

- [ ] **Step 6: Re-run focused tests after browser acceptance**

Run:

```bash
npm test -- src/features/settings/TestOnlyBackendPortalEntries.test.tsx src/features/settings/UnifiedSettingsPages.test.ts
```

Expected: PASS with 0 failures after all acceptance activity.
