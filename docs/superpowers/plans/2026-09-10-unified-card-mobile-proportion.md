# Unified Card Mobile Proportion Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the approved five-column metric rail and left-image/right-content card composition at phone and desktop widths.

**Architecture:** Correct responsive classes in the existing shared primitives and their two card composers. The DOM, formal data, engagement actions, and navigation behavior stay unchanged; only density scales at narrow widths.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, Vite.

## Global Constraints

- Work only on `codex/unified-card-mobile-reference` until verified and committed.
- Do not operate port 5180, push, deploy, or modify any remote environment.
- Do not add a second card component, variant, mock value, or data fallback.
- Preserve formal unavailable text and favorite/share interaction behavior.

---

### Task 1: Correct the single shared responsive composition

**Files:**
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Modify: `src/shared/profile-card/UnifiedEntityInfoCard.test.tsx`
- Modify: `src/shared/info-card-system/UnifiedInfoCardFrame.tsx`
- Modify: `src/shared/service-card/ServiceCardEngagementActions.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Modify: `src/shared/profile-card/UnifiedEntityInfoCard.tsx`

**Interfaces:**
- Preserve all existing component props and data types.
- Produce one five-column metrics rail and one two-column body at all supported widths.

- [ ] Add assertions requiring `grid-cols-5`, forbidding `grid-cols-2`, requiring the unprefixed image/content split, and forbidding the stacked `grid-cols-1` body.
- [ ] Run `npm test -- --run src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/profile-card/UnifiedEntityInfoCard.test.tsx` and verify the new assertions fail on the current narrow layout.
- [ ] Change the metric rail to five columns at the base breakpoint and add narrow responsive sizes for icons, actions, values, labels, spacing, and minimum height.
- [ ] Change both service and entity bodies to the unprefixed split grid and add narrow responsive sizes for images, details, overlays, tags, card radius, and detail arrow.
- [ ] Rerun the focused tests and the unified entrypoint audit until green.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Start Vite only on a verified free non-5180 port, capture phone and desktop screenshots, assert no horizontal overflow, then stop only that test server.
- [ ] Review `git diff --check`, commit the branch, merge it to local `main`, rerun focused tests on `main`, and safely remove only this merged worktree and branch.

