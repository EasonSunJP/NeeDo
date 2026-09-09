# Compact Technician Service Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the oversized blank area below short technician service information while preserving the overlapping cover and top-right management actions.

**Architecture:** Keep the approved showcase composition and its formal data contract unchanged. Move the cover wrapper from absolute positioning into the first grid column with a negative top margin, so the cover participates in row sizing and the body height follows the larger of the real text content or the visible cover height.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest server rendering, Vite

## Global Constraints

- Work only in the local isolated branch and worktree.
- Do not alter upload behavior, API contracts, database schema, pricing, or management actions.
- Do not operate port 5180 or any remote environment.
- Preserve the existing responsive cover range and the approved top-right up, down, and edit buttons.

---

### Task 1: Make the showcase body content-sized

**Files:**
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Modify: `src/shared/service-card/UnifiedServiceInfoCard.tsx`

**Interfaces:**
- Consumes: `UnifiedServiceInfoCardData` and the existing `variant="showcase"` prop.
- Produces: unchanged public component props; adds only a body-grid test hook.

- [x] **Step 1: Write the failing regression test**

Assert that showcase markup identifies the body grid, removes the fixed `min-h-[160px]`, and gives the cover an in-flow negative top margin with a width reduced by the existing left inset.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/shared/service-card/UnifiedServiceInfoCard.test.tsx`

Expected: FAIL because the current card still uses fixed minimum height and absolute cover positioning.

- [x] **Step 3: Implement the minimal layout change**

Change the showcase body to:

```tsx
<div
  className="grid grid-cols-[clamp(126px,34%,208px)_minmax(0,1fr)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,#0d2028)]"
  data-testid="unified-service-showcase-body-grid"
>
  <div className="relative min-w-0 self-start">
    <div className="-mt-10 ml-4 aspect-square w-[calc(100%-1rem)] ...">
      {/* existing cover content */}
    </div>
  </div>
  {/* existing formal service facts */}
</div>
```

- [x] **Step 4: Run focused and affected tests**

Run the focused service-card test, then the affected technician-profile and upload suites. Expected: PASS with no contract or management-action regression.

- [x] **Step 5: Validate rendering and commit**

Check 320 px, 440 px, and 720 px widths on a non-5180 temporary port; then run lint and build. Commit the test, implementation, and this plan together once all checks pass.
