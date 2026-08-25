# Remove Special Black and Round Shared Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `special-black` product theme completely, migrate legacy stored values to `cool-black-gray`, and give all remaining shared floating headers a four-corner 28px radius.

**Architecture:** Keep legacy compatibility only at the theme normalization boundary. Remove every special-black rendering branch and asset so all six remaining themes use the shared page and navigation components, then update `FloatingHomeHeader` as the single radius contract with the two CPS overrides aligned to it.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 3.4, Vitest 4, Vite 7.

## Global Constraints

- Preserve React / TSX / Vite, all routes, business logic, APIs, database state, i18n behavior, and the six remaining themes.
- Migrate `special-black`, `special-dark`, and `特殊黑` to `cool-black-gray` when reading legacy preferences.
- Use exactly `28px` on all four corners of shared floating top headers.
- Preserve the existing uncommitted formal-data changes in `src/pages/user/HomePage.tsx:1124-1169`.
- Do not stage or commit the implementation while user-owned changes overlap `HomePage.tsx`; hand off a verified working-tree diff instead.
- Add no mock, demo, placeholder, fake API, `TODO`, `FIXME`, or `not implemented` marker.
- Move the tracked special-black icon directory out of the workspace to a unique temporary directory before reporting it deleted; Git history remains the authoritative recovery path.

---

### Task 1: Remove special black from the theme contract and migrate legacy preferences

**Files:**
- Modify: `src/theme/ClientThemeProvider.test.ts`
- Modify: `src/theme/ClientThemeProvider.tsx`

**Interfaces:**
- Consumes: stored `needo.client.theme` strings.
- Produces: six-value `ClientTheme`; legacy special-black aliases normalize to `cool-black-gray`.

- [ ] **Step 1: Rewrite the old special-black persistence test for migration**

Replace the existing `keeps the stored special black theme` test with:

```ts
it.each(["special-black", "special-dark", "特殊黑"])(
  "migrates the removed %s theme to cool black gray",
  (storedTheme) => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": storedTheme,
        "needo.client.theme.mode": "manual"
      }),
      matches: false
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "cool-black-gray",
      preferenceMode: "manual"
    });
    expect(isNightClientTheme(storedTheme)).toBe(true);
    expect(getClientThemeClassName(storedTheme)).toBe("client-theme-cool-black-gray");
  }
);
```

Change the selectable order assertion to:

```ts
expect(clientThemes.map((theme) => theme.id)).toEqual([
  "vital-mono",
  "cool-black-gray",
  "light-green",
  "dark-green",
  "neon-pink",
  "black-gold"
]);
```

Replace the test that exposes special black with:

```ts
it("does not expose the removed special black theme", () => {
  expect(clientThemes.map((theme) => theme.id)).not.toContain("special-black");
});
```

- [ ] **Step 2: Run the provider test and verify RED**

Run:

```bash
npm test -- src/theme/ClientThemeProvider.test.ts
```

Expected: FAIL because special black is still a selectable theme and legacy aliases still normalize to it.

- [ ] **Step 3: Implement the six-theme contract**

In `src/theme/ClientThemeProvider.tsx`:

- remove `"special-black"` from `ClientTheme`;
- remove the `clientPwaThemeColors["special-black"]` entry;
- remove the special-black definition from `clientThemes`;
- keep the old aliases only in `normalizeTheme`, mapped as follows:

```ts
if (theme === "special-black" || theme === "special-dark" || theme === "特殊黑") {
  return "cool-black-gray";
}
```

The resulting selectable theme order must be:

```ts
[
  "vital-mono",
  "cool-black-gray",
  "light-green",
  "dark-green",
  "neon-pink",
  "black-gold"
]
```

- [ ] **Step 4: Run the provider test and verify GREEN**

Run:

```bash
npm test -- src/theme/ClientThemeProvider.test.ts
```

Expected: PASS with zero failures.

---

### Task 2: Delete the special-black UI implementation and assets

**Files:**
- Create: `src/theme/SpecialBlackRemoval.test.ts`
- Modify: `src/components/mobile/CategoryIcon.tsx`
- Modify: `src/components/mobile/CategoryIcon.test.ts`
- Modify: `src/components/mobile/FloatingHomeHeader.test.ts`
- Modify: `src/components/mobile/MobileShell.tsx`
- Modify: `src/components/mobile/MobileShell.test.ts`
- Modify: `src/components/mobile/OfferInfoCard.tsx`
- Delete: `src/components/mobile/SpecialBlackIcon.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/HomePage.test.ts`
- Modify: `src/styles.css`
- Delete: `public/icons/special-black/` (50 tracked files)

**Interfaces:**
- Consumes: the six-theme contract from Task 1.
- Produces: shared home/navigation rendering with no special-black branch or dedicated asset dependency.

- [ ] **Step 1: Add a failing removal contract test**

Create `src/theme/SpecialBlackRemoval.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const productFiles = [
  "src/components/mobile/CategoryIcon.tsx",
  "src/components/mobile/FloatingHomeHeader.test.ts",
  "src/components/mobile/MobileShell.tsx",
  "src/components/mobile/MobileShell.test.ts",
  "src/components/mobile/OfferInfoCard.tsx",
  "src/features/settings/UnifiedSettingsPages.tsx",
  "src/features/settings/UnifiedSettingsPages.test.ts",
  "src/i18n/translations.ts",
  "src/pages/user/HomePage.tsx",
  "src/pages/user/HomePage.test.ts",
  "src/styles.css"
];

describe("special-black product removal", () => {
  it.each(productFiles)("removes special-black UI references from %s", (relativePath) => {
    const source = readFileSync(`${projectRoot}${relativePath}`, "utf8");
    expect(source).not.toMatch(/special-black|specialBlack|SpecialBlack|特殊黑/);
  });

  it("removes the dedicated component and icon directory", () => {
    expect(existsSync(`${projectRoot}src/components/mobile/SpecialBlackIcon.tsx`)).toBe(false);
    expect(existsSync(`${projectRoot}public/icons/special-black`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the removal test and verify RED**

Run:

```bash
npm test -- src/theme/SpecialBlackRemoval.test.ts
```

Expected: FAIL for the current product references, component, styles, documentation, and icon directory.

- [ ] **Step 3: Remove theme-specific leaf mappings**

Make these exact removals:

- delete `specialBlackPalette` and its `categoryPalettes` entry from `CategoryIcon.tsx`;
- remove the special-black palette assertions and `#5f8dff` assertion from `CategoryIcon.test.ts`;
- delete both `"special-black"` style-map entries from `OfferInfoCard.tsx`;
- remove the two special-black-only tests from `FloatingHomeHeader.test.ts` and rename the remaining framed-header test so it describes the shared contract without a special-black exception;
- delete both `case "special-black"` branches from `UnifiedSettingsPages.tsx`;
- change the theme description to:

```tsx
description={t("三端统一切换活力黑白 / 冷酷黑灰 / 白绿 / 黑绿 / 霓虹粉紫 / 黑金主题，由同一套 token 与组件承载。")}
```

- replace the settings special-black test with:

```ts
it("does not render the removed special black UI branch", () => {
  expect(source).not.toContain('case "special-black":');
  expect(source).not.toContain("夜间 / 特殊黑");
});
```

- delete these four obsolete translation entries: `特殊黑`, the special-black visual description, the seven-theme description containing `特殊黑`, and `夜间 / 特殊黑`. Keep the already-present six-theme translation entry at line 8314.

- [ ] **Step 4: Remove the dedicated mobile shell**

In `MobileShell.tsx`:

- delete the `SpecialBlackIcon` import;
- delete `getSpecialBlackNavIconName` and `getSpecialBlackNavLabel`;
- remove `special-black` from `darkLiquidGlassNavThemes`;
- delete `isSpecialBlack`;
- delete the now-unused `visibleItems` and `featuredItemNotificationCount` calculations if the shared navigation branch does not consume them;
- render the existing shared edge masks whenever `displayedNavItems.length > 0`;
- delete the entire special-black `<nav>` branch and keep the existing shared bottom-nav branch as the only navigation renderer.

Replace `MobileShell.test.ts` special-black assertions with this contract:

```ts
it("uses only the shared bottom navigation implementation", () => {
  expect(mobileShellSource).not.toContain('theme === "special-black"');
  expect(mobileShellSource).not.toContain("SpecialBlackFlatIcon");
  expect(mobileShellSource).not.toContain("special-black-bottom-nav");
  expect(mobileShellSource).toContain("client-liquid-glass-nav");
});
```

- [ ] **Step 5: Remove the dedicated home page branch while preserving existing data work**

In `HomePage.tsx`:

- delete the `SpecialBlackIcon` import;
- remove only the `"special-black"` key from `quickActionIconClassNames`;
- delete `getSpecialBlackQuickActionIconName`;
- delete `SpecialBlackReminderDialog` and `SpecialBlackAppointmentOverviewButton`;
- delete the contiguous helper/component group from `formatCompactMetric` through `SpecialBlackHeroSlide`;
- delete `specialBlackProjectItems` and the complete `if (theme === "special-black")` return branch;
- keep the existing shared `FloatingHomeHeader` return and the unrelated `allowLegacyCoreReadData` changes at lines 1124-1169.

Replace the `HomePage special black layout` describe block with:

```ts
describe("HomePage shared theme layout", () => {
  it("has no dedicated special-black page branch", () => {
    expect(homePageSource).not.toContain('theme === "special-black"');
    expect(homePageSource).not.toContain("SpecialBlack");
    expect(homePageSource).not.toContain("special-black-home");
    expect(homePageSource).toContain("<FloatingHomeHeader");
  });
});
```

- [ ] **Step 6: Delete special-black-only styles and files**

In `src/styles.css`, delete:

- the special-black root background and scrollbar rules near lines 107-121;
- `.client-theme-special-black .needo-login-logo`;
- the complete contiguous special-black theme and dedicated home/nav block from `.client-theme-special-black {` through `.client-theme-special-black .special-black-recommendation-card`.

Delete `src/components/mobile/SpecialBlackIcon.tsx` with `apply_patch`.

Move the exact tracked asset directory to a unique temporary directory, using two separate commands and the returned path from the first command:

```bash
mktemp -d /private/tmp/needo-special-black-icons.XXXXXX
mv public/icons/special-black <returned-temp-directory>/special-black
```

- [ ] **Step 7: Run the removal and affected component tests**

Run:

```bash
npm test -- src/theme/SpecialBlackRemoval.test.ts src/components/mobile/CategoryIcon.test.ts src/components/mobile/MobileShell.test.ts src/features/settings/UnifiedSettingsPages.test.ts src/pages/user/HomePage.test.ts
```

Expected: PASS with zero special-black UI references in the enumerated product files and no dedicated component/asset directory.

---

### Task 3: Round every remaining shared floating header

**Files:**
- Modify: `src/components/mobile/FloatingHomeHeader.test.ts`
- Modify: `src/components/mobile/FloatingHomeHeader.tsx`
- Modify: `src/pages/mobile/BusinessCpsPage.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `FloatingHomeHeader`, `floatingHeaderGlassPanelClassName`, `.business-cps-segmented-tabs`.
- Produces: a shared four-corner 28px header radius without TypeScript API changes.

- [ ] **Step 1: Add the failing radius contract**

Import the CPS source in `FloatingHomeHeader.test.ts`:

```ts
import businessCpsSource from "../../pages/mobile/BusinessCpsPage.tsx?raw";
```

Add:

```ts
it("rounds every remaining floating top header to 28px on all four corners", () => {
  expect(source).toContain("client-floating-header-glass-frame !rounded-[28px]");
  expect(source).toContain("safe-header-top rounded-[28px] border");
  expect(source).not.toContain("rounded-t-none");
  expect(source).not.toContain("rounded-b-[28px]");
  expect(businessCpsSource).toContain("client-floating-header-glass-frame rounded-[28px]");

  const cpsTabsStart = styles.indexOf(".business-cps-segmented-tabs {");
  const cpsTabsEnd = styles.indexOf("@media (min-width: 768px)", cpsTabsStart);
  const cpsTabsRule = styles.slice(cpsTabsStart, cpsTabsEnd);
  expect(cpsTabsRule).toContain("border-radius: 28px;");
  expect(cpsTabsRule).not.toContain("border-radius: 0 0 28px 28px;");
});
```

- [ ] **Step 2: Run the radius test and verify RED**

Run:

```bash
npm test -- src/components/mobile/FloatingHomeHeader.test.ts
```

Expected: FAIL because the current shared and CPS headers keep square top corners.

- [ ] **Step 3: Implement the minimal radius substitutions**

Use these exact after-state values:

```ts
export const floatingHeaderGlassPanelClassName =
  `${floatingHeaderLiquidGlassClassName} client-floating-header-glass-frame !rounded-[28px] !border-transparent !px-0 !pb-0 !shadow-none`;
```

```tsx
"safe-header-top rounded-[28px] border px-4 pb-3 backdrop-blur-2xl backdrop-saturate-150"
```

```tsx
panelClassName="business-cps-header-panel client-floating-header-glass-frame rounded-[28px] border-transparent px-4 pb-4 shadow-none"
```

```css
.business-cps-segmented-tabs {
  border-radius: 28px;
}
```

- [ ] **Step 4: Run the radius test and verify GREEN**

Run:

```bash
npm test -- src/components/mobile/FloatingHomeHeader.test.ts
```

Expected: PASS with zero failures.

---

### Task 4: Update active theme documentation and verify residue

**Files:**
- Modify: `README.md`
- Modify: `docs/CLIENT_UI_THEME_COLOR_PARAMETERS.md`

**Interfaces:**
- Consumes: the six-theme product contract.
- Produces: documentation that lists only active themes and records legacy migration.

- [ ] **Step 1: Update the documentation**

Remove the `special-black` theme bullet from README.

In `docs/CLIENT_UI_THEME_COLOR_PARAMETERS.md`:

- delete the special-black row from the theme table;
- delete the complete `## 8. 特殊黑` section;
- renumber `霓虹粉紫版` from section 9 to section 8;
- keep the active-theme document free of retired special-black names; runtime migration remains documented by the provider test and design specification.

- [ ] **Step 2: Run the scoped residue scan**

Run:

```bash
rg -n "special-black|specialBlack|SpecialBlack|特殊黑" src README.md docs/CLIENT_UI_THEME_COLOR_PARAMETERS.md --glob '!src/theme/ClientThemeProvider.tsx' --glob '!src/theme/ClientThemeProvider.test.ts' --glob '!src/theme/SpecialBlackRemoval.test.ts'
```

Expected: no output. The only permitted old strings are in normalization and migration tests.

---

### Task 5: Full verification and six-theme visual QA

**Files:**
- Verify only; do not change unrelated files.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: test/build/browser evidence and a scoped handoff.

- [ ] **Step 1: Run prohibited-marker scan**

Run:

```bash
rg -n "TODO|FIXME|not implemented" src/theme/ClientThemeProvider.tsx src/theme/SpecialBlackRemoval.test.ts src/components/mobile/CategoryIcon.tsx src/components/mobile/FloatingHomeHeader.tsx src/components/mobile/MobileShell.tsx src/components/mobile/OfferInfoCard.tsx src/features/settings/UnifiedSettingsPages.tsx src/pages/user/HomePage.tsx
```

Expected: no output.

- [ ] **Step 2: Run frontend verification**

Run separately:

```bash
npm run lint
npm test
npm run build
```

Expected: every command exits `0`; Vitest reports zero failed tests and Vite completes the production build.

- [ ] **Step 3: Start or reuse the frontend**

Run:

```bash
npm run dev:frontend
```

Use an iPhone 14 Pro Max-sized viewport on:

- `http://127.0.0.1:5180/user.html#/me/settings/theme`
- `http://127.0.0.1:5180/user.html#/`
- `http://127.0.0.1:5180/user.html#/messages`
- `http://127.0.0.1:5180/user.html#/contacts`

- [ ] **Step 4: Verify all six themes and migration**

Check `vital-mono`, `cool-black-gray`, `light-green`, `dark-green`, `neon-pink`, and `black-gold`:

- each appears in settings and can be selected;
- refresh preserves the selection;
- no special-black option or dedicated navigation appears;
- home, messages, and contacts headers have matching 28px curves on all four corners;
- safe-area spacing, controls, search fields, and scrolling remain unchanged.

Set `needo.client.theme` to `special-black` with manual mode, refresh, and confirm the active class and saved selection become `client-theme-cool-black-gray`.

- [ ] **Step 5: Review the scoped diff without staging**

Run:

```bash
git diff -- src/theme/ClientThemeProvider.tsx src/theme/ClientThemeProvider.test.ts src/theme/SpecialBlackRemoval.test.ts src/components/mobile/CategoryIcon.tsx src/components/mobile/CategoryIcon.test.ts src/components/mobile/FloatingHomeHeader.tsx src/components/mobile/FloatingHomeHeader.test.ts src/components/mobile/MobileShell.tsx src/components/mobile/MobileShell.test.ts src/components/mobile/OfferInfoCard.tsx src/components/mobile/SpecialBlackIcon.tsx src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts src/i18n/translations.ts src/pages/user/HomePage.tsx src/pages/user/HomePage.test.ts src/pages/mobile/BusinessCpsPage.tsx src/styles.css README.md docs/CLIENT_UI_THEME_COLOR_PARAMETERS.md public/icons/special-black
```

Expected: requested theme removal, migration, documentation, tests, and radius changes only. Confirm the pre-existing `allowLegacyCoreReadData` diff in `HomePage.tsx` remains intact and is not claimed as part of this work.

- [ ] **Step 6: Handoff without an implementation commit**

Do not stage or commit these files because `HomePage.tsx` contains pre-existing user-owned changes. Report the exact modified/deleted files, verification commands, browser results, and the recoverable temporary asset path.
