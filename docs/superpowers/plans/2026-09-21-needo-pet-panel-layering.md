# NeeDo Pet Panel Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the NeeDo pet fully visible and interactive in front of its operation panel on desktop and mobile.

**Architecture:** Preserve the existing `NeedoPet` DOM, placement calculations, panel dimensions, and scrolling. Establish an explicit local stacking order inside `.needo-pet-layer`: the operation panel sits below the pet button, while the existing notification badge remains above both.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Vite 7, iPhone Mirroring.

## Global Constraints

- Do not move or resize the pet.
- Do not change panel placement, dimensions, content, or scrolling.
- Reuse the existing `NeedoPet` component and CSS classes; do not create another panel system.
- Preserve the transparent-animation atomic-swap fix for idle, running, enter, exit, death, and revive clips.
- Do not commit, push, deploy, or modify remote state without explicit authorization.

---

### Task 1: Put the pet above the operation panel

**Files:**
- Modify: `src/components/ui/NeedoPet.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `.needo-pet-button`, `.needo-pet-panel`, and `.needo-pet-count` elements inside `.needo-pet-layer`.
- Produces: explicit stacking order where `.needo-pet-button` is above `.needo-pet-panel`; `.needo-pet-count` retains its existing `z-index: 4`.

- [x] **Step 1: Write the failing stacking-order test**

Add this test to `src/components/ui/NeedoPet.test.tsx`, reusing the existing `styles` string loaded from `src/styles.css`:

```tsx
it("keeps the pet button above its operation panel", () => {
  expect(styles).toMatch(/\.needo-pet-button\s*{[^}]*z-index:\s*2;/s);
  expect(styles).toMatch(/\.needo-pet-panel\s*{[^}]*z-index:\s*1;/s);
});
```

- [x] **Step 2: Run the focused test and confirm the intended failure**

Run:

```bash
npm test -- src/components/ui/NeedoPet.test.tsx
```

Expected: FAIL only because `.needo-pet-button` and `.needo-pet-panel` do not yet declare the required stacking order.

- [x] **Step 3: Add the minimal CSS stacking order**

In the existing rules in `src/styles.css`, add only these declarations:

```css
.needo-pet-button {
  z-index: 2;
}

.needo-pet-panel {
  z-index: 1;
}
```

Do not change positioning, transforms, pointer events, panel sizing, or scrolling.

- [x] **Step 4: Run focused regression tests**

Run:

```bash
npm test -- src/components/ui/NeedoPet.test.tsx src/state/needoPetAssets.test.ts
```

Expected: 2 test files pass with 0 failed tests, including animation atomic-swap and panel stacking assertions.

- [x] **Step 5: Run repository verification**

Run:

```bash
npm run lint
npm run build -- --mode formal
git diff --check
```

Expected: TypeScript check exits 0, formal Vite build exits 0, and diff check prints no errors. A normal-mode build is not used because the current terminal exposes forbidden legacy authorization variables and the repository safety gate correctly rejects them.

- [ ] **Step 6: Verify on iPhone Mirroring after staging deployment**

The current iPhone Mirroring session points to `staging.needo.life`, so it reproduces the pre-deployment defect but cannot verify local `main`. Run this step after the change is deployed to staging.

On the existing NeeDo settings screen:

1. Enable the pet if needed.
2. Tap the pet to open the operation panel.
3. Confirm the entire pet is painted above the panel.
4. Tap/drag the pet and confirm it remains interactive.
5. Scroll or tap a visible panel control outside the pet hitbox and confirm the panel remains interactive.
6. Trigger `拜拜 → 出现` once and confirm no fallback/active double image appears.

Expected: pet pixels are never covered by the panel; both pet and panel remain usable; no large clipped duplicate frame appears.
