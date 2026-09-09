# Technician Application Queue and Special Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant technician-application queue reflect formal application states and render shared technician special tags as theme-aware borderless icon stamps.

**Architecture:** Keep state filtering in the repository so pagination and totals stay correct, then render status-specific affordances in the existing React review page. Keep both technician profile surfaces synchronized by changing their existing shared `TechnicianReviewTagSummaryView` and scoping CSS changes to `.social-profile-review-stamps`.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind utility classes, CSS custom properties, Express, Prisma, Jest.

## Global Constraints

- Work only on the local `codex/technician-application-tag-alignment` branch until merge.
- Do not operate port 5180.
- Do not push or modify staging/production.
- Do not add mocks, placeholders, migrations, or new API routes.
- Preserve explicit historical-status queries and full-detail navigation.

---

### Task 1: Correct the server-authoritative default queue

**Files:**
- Modify: `backend/tests/technician-application-review.repository.test.ts`
- Modify: `backend/src/repositories/technician-application-review.repository.ts`

**Interfaces:**
- Consumes: `TechnicianApplicationReviewListQuery.status?: string`.
- Produces: `listForShop()` whose missing-status predicate is `{ in: ["submitted", "under_review", "approved", "rejected"] }`.

- [ ] **Step 1: Write the failing repository test**

Add an assertion that the first `findMany` and `count` calls receive the same default `where.status` and that it excludes `draft` and `withdrawn`:

```ts
expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    status: { in: ["submitted", "under_review", "approved", "rejected"] }
  })
}));
```

- [ ] **Step 2: Verify the test fails for the old five-status predicate**

Run: `npm test -- tests/technician-application-review.repository.test.ts`

Expected: FAIL because `withdrawn` is still present.

- [ ] **Step 3: Implement the minimal repository change**

```ts
status: query.status ?? { in: ["submitted", "under_review", "approved", "rejected"] },
```

- [ ] **Step 4: Verify repository behavior**

Run: `npm test -- tests/technician-application-review.repository.test.ts tests/merchant-technician-application-api.test.ts`

Expected: both suites pass.

### Task 2: Render empty and terminal application-card states

**Files:**
- Modify: `src/features/identity-applications/ReviewPages.tsx`
- Modify: `src/features/identity-applications/ReviewPages.test.ts`
- Create: `src/features/identity-applications/ReviewPages.interaction.test.tsx`

**Interfaces:**
- Consumes: `TechnicianReview.status` and `identityApplicationsApi.getTechnicianReview(id)`.
- Produces: one fully clickable card with `data-application-status`, an exact `暂无申请` empty state, `>` for reviewable states, `✓` for approved, and `×` for rejected.

- [ ] **Step 1: Write failing render and interaction tests**

Render `TechnicianApplicationsReviewPage` with API responses for an empty list and for all four visible states. Assert exact empty copy, status-specific accessible labels, and that clicking approved/rejected cards requests their detail IDs.

```tsx
expect(container.textContent).toContain("暂无申请");
expect(container.querySelector('[aria-label="审核已通过"]')?.textContent).toBe("✓");
expect(container.querySelector('[aria-label="审核已拒绝"]')?.textContent).toBe("×");
```

- [ ] **Step 2: Verify the tests fail against the current generic arrow**

Run: `npm test -- src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/ReviewPages.interaction.test.tsx`

Expected: FAIL because terminal icons and the exact empty copy are absent.

- [ ] **Step 3: Implement a small status-affordance helper and preserve button navigation**

```tsx
function TechnicianApplicationCardStatus({ status }: { status: TechnicianReview["status"] }) {
  if (status === "approved") return <span aria-label="审核已通过">✓</span>;
  if (status === "rejected") return <span aria-label="审核已拒绝">×</span>;
  return <span aria-label="查看申请详情">›</span>;
}
```

Use the helper inside the existing outer `<button>` and replace the empty copy with `t("暂无申请")`.

- [ ] **Step 4: Verify page behavior**

Run: `npm test -- src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/ReviewPages.interaction.test.tsx src/pages/mobile/MerchantPortalPage.test.tsx`

Expected: all selected suites pass.

### Task 3: Align shared special tags with the UI theme

**Files:**
- Modify: `src/shared/technician-profile/TechnicianProfileInfoView.tsx`
- Modify: `src/shared/technician-profile/TechnicianProfileInfoView.test.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: canonical four-tag fallback order and `getServiceReviewStampVisual()`.
- Produces: the same `TechnicianReviewTagSummaryView` with a borderless group and profile-scoped `.service-review-stamp` overrides.

- [ ] **Step 1: Write failing structure and CSS tests**

Assert the special-tag section no longer uses `panelClassName`, keeps four icons/counts, and has profile-scoped CSS that disables the card surface:

```ts
expect(specialSectionTag).not.toContain("border");
expect(styles).toContain(".social-profile-review-stamps .service-review-stamp::before");
expect(styles).toContain("content: none;");
```

- [ ] **Step 2: Verify the old framed presentation fails**

Run: `npm test -- src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx`

Expected: FAIL because the group and items still render framed surfaces.

- [ ] **Step 3: Implement the shared borderless profile presentation**

Remove `panelClassName` from the special-tag section only. Under `.social-profile-review-stamps`, set item border/background/shadow to none, disable pseudo-elements, size the icon wrapper, position the count badge relative to the icon area, and color label/badge surfaces through current `--client-*` tokens mixed with the existing tone accent.

- [ ] **Step 4: Verify shared-profile and order-review isolation**

Run: `npm test -- src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/shared/order-detail/ServiceSessionUi.test.tsx`

Expected: shared profile suites pass and the order-review stamp suite retains its framed selection UI.

### Task 4: Validate, commit, merge, and revalidate

**Files:**
- Verify all files listed above plus the two design documents.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: one local feature commit merged into local `main`, with the owned worktree and branch removed after post-merge validation.

- [ ] **Step 1: Run feature validation**

Run frontend related tests, `npm run lint`, and `npm run build`. Run backend related tests, `npm run lint`, and `npm run build`.

- [ ] **Step 2: Review the diff and forbidden patterns**

Confirm no new mock/fake/placeholder, no migration, no hard-coded endpoint/port, and no unrelated file modification.

- [ ] **Step 3: Commit on the feature branch**

```bash
git add docs/superpowers/specs/2026-09-09-technician-application-and-special-tags-design.md docs/superpowers/plans/2026-09-09-technician-application-and-special-tags.md backend/src/repositories/technician-application-review.repository.ts backend/tests/technician-application-review.repository.test.ts src/features/identity-applications/ReviewPages.tsx src/features/identity-applications/ReviewPages.test.ts src/features/identity-applications/ReviewPages.interaction.test.tsx src/shared/technician-profile/TechnicianProfileInfoView.tsx src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/styles.css
git commit -m "fix: align technician application and tag states"
```

- [ ] **Step 4: Merge locally and repeat validation on main**

Merge `codex/technician-application-tag-alignment` into local `main` without pulling or pushing. Repeat the same related tests, lint, and builds from `main`.

- [ ] **Step 5: Clean only the owned branch and worktree**

After proving the merge contains the feature commit and the worktree is clean, remove `.worktrees/technician-application-tag-alignment`, prune registrations, and delete the merged local branch.
