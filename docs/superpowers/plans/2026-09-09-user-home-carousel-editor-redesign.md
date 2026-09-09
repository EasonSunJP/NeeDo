# User Home Carousel Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized operations user-home carousel editor with a compact, homepage-faithful five-language replacement workflow while preserving formal publication history and audit behavior.

**Architecture:** Keep `LocalizedCarouselEditor` as the state and API owner. Add a presentational `UserHomeCarouselWorkspace` that reuses `FeatureCarousel`, controls the selected slide, renders the current-versus-draft comparison, and owns only the image lightbox. Enable it only for the `user-home` scene; the affiliate editor keeps its existing layout.

**Tech Stack:** React 19, TypeScript strict mode, Tailwind CSS, Vitest, jsdom, existing NeeDo content-publication API

## Global Constraints

- Do not change Prisma, migrations, controller, service, repository, RBAC, audit, or public carousel API contracts.
- Do not add mock, localStorage, placeholder, fake API, or a second carousel state authority.
- Reuse `src/components/client-ui/FeatureCarousel.tsx` for the top preview.
- Saving, immediate publishing, and scheduled publishing remain whole-release five-language actions.
- Preserve independent per-language edits and explicit copy-current-language-to-all behavior.
- Keep history, disable, and rollback operations available but collapsed by default.
- Do not modify unrelated dirty scheduling and technician affiliation files.

---

### Task 1: Lock the compact preview and selection contract

**Files:**
- Create: `src/features/content-publication/UserHomeCarouselWorkspace.test.tsx`
- Create: `src/features/content-publication/UserHomeCarouselWorkspace.tsx`
- Test: `src/features/content-publication/UserHomeCarouselWorkspace.test.tsx`

**Interfaces:**
- Consumes: `published: CarouselRelease | null`, `draft: CarouselRelease | null`, `locale: ContentLocaleCode`, `selectedIndex: number`, `onSelectedIndexChange(index: number): void`, `children: ReactNode`
- Produces: `UserHomeCarouselWorkspace` and `formatCarouselPublishedAt(value, language)`

- [ ] **Step 1: Write failing tests for shared preview, click-to-pause, locale tabs, published timestamp, positional comparison, and image dialog**

The tests render one published and one draft release, then assert:

```tsx
expect(container.querySelector('[data-testid="feature-carousel"]')).not.toBeNull();
expect(container.querySelector('[data-testid="user-home-carousel-workspace"]')).not.toBeNull();
expect(localeTabs()).toEqual(["日本語", "English", "한국어", "繁體中文", "简体中文"]);
expect(container.textContent).toContain("上次发布");
expect(container.textContent).toContain("2026");
expect(container.querySelector('[data-testid="carousel-replacement-arrow"]')).not.toBeNull();
```

Click the second preview slide and assert `onSelectedIndexChange(1)` plus the paused marker `data-auto-rotate="paused"`. Click the current thumbnail and assert an accessible `role="dialog"` containing the full image.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/content-publication/UserHomeCarouselWorkspace.test.tsx`

Expected: FAIL because `UserHomeCarouselWorkspace.tsx` does not exist.

- [ ] **Step 3: Implement the minimal presentational workspace**

Build `FeatureCarouselSlide[]` from `draft ?? published`, pass controlled `activeIndex`, set `autoRotateMs` to `null` after the first slide click, and use `onSlideClick` to select. Render five tab buttons, a current published summary, the replacement arrow, a draft summary/slot, and an accessible image dialog. Match current and draft slides by `sortOrder`, not release-local slide ID.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/features/content-publication/UserHomeCarouselWorkspace.test.tsx`

Expected: PASS.

### Task 2: Wire the compact workflow to the formal editor

**Files:**
- Modify: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Modify: `src/features/content-publication/i18n.ts`
- Test: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`

**Interfaces:**
- Consumes: `UserHomeCarouselWorkspace`, existing `saveDraft`, `copyLocale`, image upload, target search, slide mutation, publish, schedule, disable, and rollback functions
- Produces: the compact `user-home` layout without changing `affiliate-home-notice`

- [ ] **Step 1: Add failing editor integration tests**

Assert that `scene="user-home"` renders the compact workspace, exactly one top `FeatureCarousel`, global action labels, editable replacement fields, and no expanded version panel. Assert that `scene="affiliate-home-notice"` does not render the user-home workspace.

- [ ] **Step 2: Run the editor test and verify RED**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: FAIL because the existing form still renders the oversized image-first layout and expanded version operations.

- [ ] **Step 3: Integrate the new workspace only for `user-home`**

Add `selectedSlideIndex`, map selection back to the draft slide at that position, and pass existing editor controls into the workspace replacement slot. Keep existing draft creation, formal uploads, target selection, save, immediate publish, and scheduled publish callbacks. Wrap `versionOperations` in a translated `<details>` region for `user-home`; preserve the existing affiliate layout.

- [ ] **Step 4: Add exact five-language UI copy**

Add translations for `lastPublishedAt`, `currentPublishedContent`, `replacementContent`, `replacesBelow`, `clickToEnlarge`, `publicationActions`, and `historyAndRollback` in `zh-CN`, `zh-TW`, `ja`, `en`, and `ko` inside `src/features/content-publication/i18n.ts`.

- [ ] **Step 5: Run the editor tests and verify GREEN**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/UserHomeCarouselWorkspace.test.tsx`

Expected: PASS.

### Task 3: Prove shared carousel compatibility and page density

**Files:**
- Modify: `src/components/client-ui/FeatureCarousel.test.tsx`
- Modify: `src/components/client-ui/FeatureCarousel.tsx` only if the test exposes a missing accessible/observable contract
- Test: `src/components/client-ui/FeatureCarousel.test.tsx`
- Test: `src/features/content-publication/PublishedCarousel.test.tsx`

**Interfaces:**
- Consumes: existing controlled `activeIndex`, `onActiveIndexChange`, `onSlideClick`, and `autoRotateMs`
- Produces: stable `data-testid="feature-carousel"` and `data-auto-rotate` observability without visual behavior changes

- [ ] **Step 1: Add a failing controlled-selection regression test**

Render `FeatureCarousel` with `activeIndex={1}`, `autoRotateMs={null}`, and `onSlideClick`, then assert the second slide is active and clicking it invokes the callback without creating a navigation link.

- [ ] **Step 2: Run the carousel test and verify RED if observability is missing**

Run: `npm test -- src/components/client-ui/FeatureCarousel.test.tsx`

Expected: FAIL only on the new stable test id or paused-state marker.

- [ ] **Step 3: Add the minimal non-breaking attributes**

Add `data-testid="feature-carousel"` and `data-auto-rotate={autoRotateMs ? "running" : "paused"}` to the outer `FeatureCarousel` section. Do not change public homepage navigation or rotation behavior.

- [ ] **Step 4: Run shared carousel and published projection tests**

Run: `npm test -- src/components/client-ui/FeatureCarousel.test.tsx src/features/content-publication/PublishedCarousel.test.tsx src/features/content-publication/CarouselReleasePreview.test.tsx`

Expected: PASS.

### Task 4: Verify the microstep and document evidence

**Files:**
- Modify: `docs/localized-carousel-publication.md`
- Test: all focused frontend tests and the production frontend build

**Interfaces:**
- Consumes: completed compact workspace and existing formal publication contracts
- Produces: current documentation and local verification evidence

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/features/content-publication/UserHomeCarouselWorkspace.test.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx src/components/client-ui/FeatureCarousel.test.tsx src/features/content-publication/PublishedCarousel.test.tsx src/features/content-publication/CarouselReleasePreview.test.tsx`

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 2: Run typecheck and build**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Perform local browser acceptance**

Verify the listener PID/cwd/branch, open `pf-admin.html#/admin/carousel` with an authenticated operations session, and inspect at 1440x900. Confirm the top preview, five locale buttons, current card with last publication time, replacement arrow, new-content card, global publication controls, thumbnail lightbox, and collapsed history. Confirm no horizontal overflow, console error, or failed carousel/media request.

- [ ] **Step 4: Update documentation**

Document that the user-home operations editor uses `FeatureCarousel`, whole-release five-language save/publish, compact current-to-replacement comparison, and collapsed retained history. Record local-only verification separately from staging or deployment.

