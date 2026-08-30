# IM Judgement Reaction Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sent judgement-reaction wordmarks readable beneath message bubbles without enlarging ordinary emoji or either reaction picker.

**Architecture:** Add an explicit `summary` display mode to the existing judgement SVG renderer so the message summary can request a fixed `22px` height and unconstrained natural width. Keep the default renderer mode unchanged for compact picker/catalog usage, and select the new mode only inside `MessageBubble`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS utilities, Vitest, jsdom, Vite

## Global Constraints

- Modify only the shared IM frontend used by user, merchant, and technician portals.
- Keep the existing two-slot reaction policy, API, SSE, persistence, SVG assets, and recent-reaction behavior unchanged.
- Preserve ordinary emoji at the current `28px` button area and `18px` text size.
- Keep judgement icons in picker/catalog surfaces at their current compact size with visual height no greater than `26px`.
- Do not include unrelated dirty-worktree changes in this task's commit.

---

### Task 1: Preserve natural judgement-wordmark width in message summaries

**Files:**
- Modify: `src/features/im/JudgementReactionIcon.tsx:25-44`
- Modify: `src/features/im/components.tsx:2898-2922`
- Test: `src/features/im/components.action-menu.test.tsx:498-541`

**Interfaces:**
- Consumes: `JudgementReactionIcon`, `ImReactionValue`, and the existing `MessageBubble` reaction summaries.
- Produces: `ImReactionValue({ value, className, judgementDisplay? })`, where `judgementDisplay` is `"catalog" | "summary"` and defaults to `"catalog"`.

- [x] **Step 1: Write the failing regression assertions**

```tsx
const thanksImage = container.querySelector<HTMLImageElement>('button img[alt="Thanks"]');
expect(thanksImage).not.toBeNull();
const thanksImageClasses = thanksImage?.className.split(/\s+/) ?? [];
expect(thanksImageClasses).toContain("h-[22px]");
expect(thanksImageClasses).toContain("max-w-none");
expect(thanksImageClasses).not.toContain("max-w-full");

const ordinaryEmojiButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
  (button) => button.textContent?.trim() === "😂"
);
expect(
  ordinaryEmojiButton?.querySelector("span")?.className.split(/\s+/) ?? []
).not.toContain("h-[22px]");
```

- [x] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx
```

Expected: fail because the old image receives `max-w-full` and no exact `h-[22px]` class.

- [x] **Step 3: Add the explicit judgement display mode**

```tsx
type JudgementReactionDisplay = "catalog" | "summary";

export function JudgementReactionIcon({
  value,
  className,
  display = "catalog"
}: {
  value: JudgementReactionValue;
  className?: string;
  display?: JudgementReactionDisplay;
}) {
  return (
    <img
      alt={value}
      className={cn(
        "block",
        display === "summary"
          ? "h-[22px] w-auto max-w-none"
          : "h-auto max-h-[26px] max-w-full",
        className
      )}
      src={judgementIconUrl[value]}
    />
  );
}
```

Pass the mode only from the sent-reaction summary:

```tsx
<ImReactionValue judgementDisplay="summary" value={reaction.emoji} />
```

- [x] **Step 4: Run focused and neighboring IM tests**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/JudgementReactionIcon.test.tsx src/features/im/ReactionCatalog.test.tsx src/features/im/components.composer.test.tsx
```

Expected: 4 files and 27 tests pass.

- [x] **Step 5: Run static and production-build verification**

Run:

```bash
npm run lint
npm run verify:production-build
```

Expected: TypeScript exits `0`; Vite formal build and production-bundle audit pass.

- [x] **Step 6: Verify the real 5180 message summary visually**

Confirm the `Thanks` image renders at `22px` high and about `58px` wide, the reaction chip remains within a `390px` viewport with `documentScrollWidth === viewportWidth`, and the temporary test reaction is removed before completion.

- [x] **Step 7: Commit only the scoped implementation**

```bash
git add docs/superpowers/plans/2026-08-30-im-judgement-reaction-readability.md src/features/im/JudgementReactionIcon.tsx src/features/im/components.tsx src/features/im/components.action-menu.test.tsx
git commit -m "fix(im): enlarge sent judgement reactions"
```
