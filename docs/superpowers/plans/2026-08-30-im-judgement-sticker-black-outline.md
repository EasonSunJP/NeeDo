# IM Judgement Sticker Black Outline Implementation Plan

> **For agentic workers:** Execute this single task inline with a strict RED -> GREEN test cycle.

**Goal:** Give all eight IM judgement word stickers a consistent, approximately 2px black outline without changing their fill colors, shadows, dimensions, labels, or rendering paths.

**Architecture:** Keep the existing dedicated SVG-per-value model and update only each SVG text outline. Protect the visual contract by asserting the raw SVG source attributes in the existing judgement-sticker component test.

**Tech Stack:** React, TypeScript, Vite raw SVG imports, Vitest, inline SVG text styling

## Global Constraints

- Apply the same black outline to `OK`, `NO`, `Pending`, `+1`, `Done`, `Cool`, `Good`, and `Thanks`.
- Use `stroke="#000000"`, `stroke-width="2"`, `paint-order="stroke fill"`, and `stroke-linejoin="round"`.
- Preserve every existing fill color, filter/shadow, viewBox, font family, font size, font style, and label.
- Do not alter message/reaction data, component rendering logic, ordinary emoji, or surrounding UI containers.

---

### Task 1: Standardize judgement sticker outlines

**Files:**
- Modify: `src/features/im/JudgementReactionIcon.test.tsx`
- Modify: `src/assets/im/judgement-reactions/ok.svg`
- Modify: `src/assets/im/judgement-reactions/no.svg`
- Modify: `src/assets/im/judgement-reactions/pending.svg`
- Modify: `src/assets/im/judgement-reactions/plus-one.svg`
- Modify: `src/assets/im/judgement-reactions/done.svg`
- Modify: `src/assets/im/judgement-reactions/cool.svg`
- Modify: `src/assets/im/judgement-reactions/good.svg`
- Modify: `src/assets/im/judgement-reactions/thanks.svg`

**Interfaces:**
- Consumes: the existing `judgementSvgSources` raw-SVG map in `JudgementReactionIcon.test.tsx`.
- Produces: eight word-sticker SVGs with the same black 2px rounded outline contract.

- [ ] **Step 1: Write the failing visual-contract test**

Add assertions inside the existing word-sticker test so every raw SVG contains:

```ts
expect(svg).toContain('stroke="#000000"');
expect(svg).toContain('stroke-width="2"');
expect(svg).toContain('paint-order="stroke fill"');
expect(svg).toContain('stroke-linejoin="round"');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/features/im/JudgementReactionIcon.test.tsx`

Expected: FAIL because the current SVGs use color-specific `0.65` strokes.

- [ ] **Step 3: Apply the minimal SVG change**

On the `<text>` element in every judgement SVG, replace only the existing stroke attributes with:

```svg
stroke="#000000" stroke-width="2" paint-order="stroke fill" stroke-linejoin="round"
```

- [ ] **Step 4: Run focused and IM regression verification**

Run:

```bash
npm test -- --run src/features/im/JudgementReactionIcon.test.tsx
npm test -- --run src/features/im
npm run lint
npm run verify:production-build
git diff --check
```

Expected: all commands exit `0`; no judgement value changes its label or rendering type.

