# Carousel Published Preview Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operations editor show the current published `USER_HOME` carousel when no draft exists and prove the user homepage reads the same published release.

**Architecture:** Keep the existing publication/version backend. Add a read-only release preview to the shared editor, derive the clone source from `sceneState.published`, and add contract/flow tests comparing the backoffice and public projections.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Express, Prisma, Jest

## Global Constraints

- Do not create a second carousel store or static fallback.
- The published release is immutable; edit controls render only for a draft.
- Creating a new draft clones the current published release through the existing rollback/version endpoint and requires a reason.
- Preserve five locales: `ja`, `en`, `ko`, `zh-TW`, `zh-CN`.
- Preserve existing RBAC and publication audit events.

---

### Task 1: Lock the no-draft display contract

**Files:**
- Modify: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `src/features/content-publication/i18n.ts`
- Test: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`

**Interfaces:**
- Consumes: `BackofficeCarouselScene.published: CarouselRelease | null`
- Produces: UI contract `data-testid="published-carousel-preview"` and translated `publishedPreview` label

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the published release when the scene has no draft", async () => {
  api.getBackofficeCarouselScene.mockResolvedValue({
    scene: "USER_HOME",
    draft: null,
    scheduled: null,
    published: release({ status: "published", version: 4, title: "正式轮播" })
  });
  api.getCarouselHistory.mockResolvedValue(page([]));

  renderEditor();

  expect(await screen.findByTestId("published-carousel-preview")).toHaveTextContent("正式轮播");
  expect(screen.queryByRole("textbox", { name: /title/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: FAIL because `published-carousel-preview` is not rendered.

- [ ] **Step 3: Add exact five-language copy**

```ts
publishedPreview: {
  "zh-CN": "当前已发布内容",
  "zh-TW": "目前已發布內容",
  ja: "現在公開中の内容",
  en: "Currently published content",
  ko: "현재 게시된 콘텐츠"
}
```

- [ ] **Step 4: Run the focused test and keep it failing only on the missing component**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: FAIL only because the preview component is not yet implemented.

- [ ] **Step 5: Commit the contract test**

```bash
git add src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/i18n.ts
git commit -m "test: lock published carousel preview contract"
```

### Task 2: Render a read-only published release

**Files:**
- Create: `src/features/content-publication/CarouselReleasePreview.tsx`
- Create: `src/features/content-publication/CarouselReleasePreview.test.tsx`
- Modify: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Test: `src/features/content-publication/CarouselReleasePreview.test.tsx`

**Interfaces:**
- Consumes: `release: CarouselRelease`, `locale: ContentLocaleCode`
- Produces: `CarouselReleasePreview({ release, locale }): JSX.Element`

- [ ] **Step 1: Write the component test**

```tsx
it("projects the selected locale without edit controls", () => {
  render(<CarouselReleasePreview locale="zh-CN" release={publishedRelease} />);
  expect(screen.getByText("正式轮播")).toBeVisible();
  expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", publishedRelease.slides[0].defaultImageUrl);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `npm test -- src/features/content-publication/CarouselReleasePreview.test.tsx`

Expected: FAIL because `CarouselReleasePreview` does not exist.

- [ ] **Step 3: Implement the focused preview component**

```tsx
export function CarouselReleasePreview({ release, locale }: {
  release: CarouselRelease;
  locale: ContentLocaleCode;
}) {
  return (
    <section data-testid="published-carousel-preview">
      {release.slides.filter((slide) => slide.isEnabled).map((slide) => {
        const copy = slide.translations[locale];
        return <article key={slide.id}>
          <img alt={copy.imageAltText} src={copy.imageUrl || slide.defaultImageUrl} />
          <strong>{copy.title}</strong>
          {copy.caption ? <p>{copy.caption}</p> : null}
        </article>;
      })}
    </section>
  );
}
```

In the `!draft` branch, render `CarouselReleasePreview` above the clone controls when `state.sceneState?.published` exists.

- [ ] **Step 4: Run both editor tests**

Run: `npm test -- src/features/content-publication/CarouselReleasePreview.test.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the preview**

```bash
git add src/features/content-publication/CarouselReleasePreview.tsx src/features/content-publication/CarouselReleasePreview.test.tsx src/features/content-publication/LocalizedCarouselEditor.tsx
git commit -m "feat: show published carousel without a draft"
```

### Task 3: Lock published-release cloning and public parity

**Files:**
- Modify: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `backend/tests/localized-carousel-publication-flow-script.test.ts`
- Modify: `backend/scripts/check-localized-carousel-publication-flow.ts`
- Test: `backend/tests/localized-carousel-publication-flow-script.test.ts`

**Interfaces:**
- Consumes: existing `rollbackCarousel(scene, sourceReleaseId, body)` and public `GET /api/v1/content/carousels/user-home`
- Produces: proof that source release ID equals `sceneState.published.releaseId` and public/backoffice slide projections match

- [ ] **Step 1: Add the clone-source frontend test**

```tsx
await user.type(screen.getByRole("textbox", { name: /reason/i }), "prepare v5");
await user.click(screen.getByRole("button", { name: /create new draft/i }));
expect(api.rollbackCarousel).toHaveBeenCalledWith("user-home", 404, expect.objectContaining({
  reason: "prepare v5"
}));
```

- [ ] **Step 2: Run it and verify it fails if history order selects a different release**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: FAIL when history order differs from the active published release.

- [ ] **Step 3: Select the clone source from scene state**

```ts
const source = sceneState.published ?? history.list.find((release) => release.status === "published");
setDraftSourceReleaseId(source ? String(source.releaseId) : "");
```

Extend the flow check to fetch both endpoints and compare `releaseVersion`, slide order, target, title, caption, image alt and image URL for the same locale.

- [ ] **Step 4: Run frontend and backend flow tests**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Run: `cd backend && npm test -- localized-carousel-publication-flow-script.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit parity enforcement**

```bash
git add src/features/content-publication/LocalizedCarouselEditor.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx backend/scripts/check-localized-carousel-publication-flow.ts backend/tests/localized-carousel-publication-flow-script.test.ts
git commit -m "test: enforce carousel publication parity"
```

### Task 4: Verify the formal browser workflow

**Files:**
- Modify only if a discovered defect requires it; otherwise no source change

**Interfaces:**
- Consumes: standard frontend/backend listeners and authenticated operations account
- Produces: acceptance evidence for view, clone, publish and user-home refresh

- [ ] **Step 1: Run the full focused gates**

Run: `npm test -- src/features/content-publication src/pages/user/HomePage.test.ts`

Run: `cd backend && npm test -- carousel-publication.service.test.ts carousel-publication.repository.test.ts localized-carousel-publication-flow-script.test.ts`

Expected: PASS.

- [ ] **Step 2: Run builds**

Run: `cd backend && npm run build`

Run: `npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 3: Prove listener ownership**

Run: `lsof -nP -iTCP:5180 -sTCP:LISTEN && lsof -nP -iTCP:3000 -sTCP:LISTEN`

Expected: frontend/backend PIDs belong to this repository checkout.

- [ ] **Step 4: Replay browser acceptance**

Verify `/admin/carousel` shows the current five published slides with no draft, clone a draft from the published version, verify the user homepage does not change before publish, publish the draft, then verify the user homepage receives the new version. Inspect console and horizontal overflow.

- [ ] **Step 5: Confirm acceptance did not create workspace changes**

Run: `git status -sb`

Expected: no uncommitted files created by browser acceptance. If a defect is found, stop this task and return to the earlier task that owns the affected file before committing.
