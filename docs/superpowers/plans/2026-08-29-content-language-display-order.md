# Content Language Display Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every shared five-language content editor in the order 日本語, English, 한국어, 繁體中文, 简体中文 without changing persisted locale values or default source-language behavior.

**Architecture:** Keep `contentEditorLocales` as the only frontend source of truth for localized-content tab order. Update order-sensitive tests to select tabs by their accessible label, so future order changes do not accidentally redirect edits to another locale.

**Tech Stack:** React 19, TypeScript, Vitest, jsdom, Vite.

## Global Constraints

- Visible order is exactly `ja`, `en`, `ko`, `zh-TW`, `zh-CN`.
- Backend locale enums, API validation, database values, publication history, and source-language provenance remain unchanged.
- Existing selected-language state and new-draft default source locale remain unchanged.
- No page-local sorting and no new mock or placeholder implementation.

---

### Task 1: Reorder the shared localized-content tabs

**Files:**
- Modify: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `src/features/content-publication/AnnouncementEditor.test.tsx`
- Modify: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Modify: `docs/affiliate-marketplace-mobile-ui.md`

**Interfaces:**
- Consumes: `ContentLocaleCode` and `contentEditorLocaleLabels` from the existing content-publication module.
- Produces: `contentEditorLocales: readonly ["ja", "en", "ko", "zh-TW", "zh-CN"]`, consumed by both localized carousel and Affiliate announcement editors.

- [ ] **Step 1: Write the failing order test and make locale interactions label-based**

Change the rendered-order assertion in `LocalizedCarouselEditor.test.tsx` to:

```ts
expect(
  Array.from(container.querySelectorAll('[role="tab"]')).map(
    (node) => node.textContent,
  ),
).toEqual(["日本語", "English", "한국어", "繁體中文", "简体中文"]);
```

Add this helper beside the existing `button()` test helper and use it instead of numeric tab indices whenever a test intends to edit a named locale:

```ts
function localeTab(label: string) {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing locale tab: ${label}`);
  return match;
}
```

For example, replace English and Japanese index clicks with:

```ts
await click(localeTab("English"));
await click(localeTab("日本語"));
```

Add the same small `localeTab()` helper to `AnnouncementEditor.test.tsx` and replace its numeric English-tab click with `await click(localeTab("English"));`.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm test -- --run src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/AnnouncementEditor.test.tsx
```

Expected: FAIL only because the rendered locale labels are still `简体中文, 繁體中文, English, 日本語, 한국어` instead of the required order.

- [ ] **Step 3: Implement the minimal shared order change**

Change only the shared array in `LocalizedCarouselEditor.tsx`:

```ts
export const contentEditorLocales = [
  "ja",
  "en",
  "ko",
  "zh-TW",
  "zh-CN",
] as const;
```

Do not change `initialState.selectedLocale`, `AnnouncementEditor`'s initial `locale`, backend `CONTENT_LOCALES`, or any stored translation data.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
npm test -- --run src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/AnnouncementEditor.test.tsx src/i18n/translations.test.ts
```

Expected: all selected files and tests pass with zero failures.

- [ ] **Step 5: Run frontend quality gates**

Run each command and require exit code `0`:

```bash
npm run lint
npm test -- --run
npm run verify:production-build
```

Expected: TypeScript lint passes, all frontend tests pass, and the formal production build/bundle audit passes. Existing explicitly documented non-blocking Vite chunk warnings may remain.

- [ ] **Step 6: Verify both operations routes in the browser**

Open these authenticated routes:

```text
http://127.0.0.1:5183/pf-admin.html#/admin/carousel
http://127.0.0.1:5183/pf-admin.html#/admin/afirieito/announcements/carousel
```

For each route, verify the visible tab order is `日本語, English, 한국어, 繁體中文, 简体中文` and read browser warning/error logs. Do not create drafts, publish, disable, roll back, or alter stored content.

- [ ] **Step 7: Record verification and commit**

Append the focused/full/browser results to `docs/affiliate-marketplace-mobile-ui.md`, then run:

```bash
git diff --check
git add src/features/content-publication/LocalizedCarouselEditor.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/AnnouncementEditor.test.tsx docs/affiliate-marketplace-mobile-ui.md docs/superpowers/plans/2026-08-29-content-language-display-order.md
git commit -m "fix: align content language display order"
```

Expected: one focused commit with no backend, schema, stored-content, or unrelated-page changes.
