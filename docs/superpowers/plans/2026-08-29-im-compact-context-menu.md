# IM Compact Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the formal IM message action menu and keep the quick-reaction row on the edge closest to the selected message.

**Architecture:** Keep the single existing `ImMessageActionSheet` component and its viewport-aware placement calculation. Build named reaction and action sections once, then order them from the existing `placement` state; compact the existing controls without changing callbacks, permissions, or backend data.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, JSDOM, Vite.

## Global Constraints

- The menu prefers the message's upper side and flips below only when upper space is insufficient.
- Above placement renders quick reactions last; below placement renders quick reactions first.
- The action grid uses five columns and no separate full-width close row.
- Touch targets remain at least 44px and all existing formal message actions remain available.
- Do not add a second menu, mock data, fake API, or backend mutation.

---

### Task 1: Compact and reorder the formal message action sheet

**Files:**
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/components.tsx:2000-2250`
- Verify: `src/features/im/pages.test.ts`

**Interfaces:**
- Consumes: `menuPosition.placement: "above" | "below"`, `actions: ImMessageActionSheetItem[]`, `expanded: boolean`, and the existing reaction/action callbacks.
- Produces: DOM sections marked with `data-im-message-action-section="reactions"` and `data-im-message-action-section="actions"`; compact action items marked with `data-im-message-action-item="true"`.

- [ ] **Step 1: Write the failing layout and compactness assertions**

Extend the existing JSDOM render so it supplies one action and verifies the section order in both placements:

```tsx
actions: [{
  key: "reply",
  label: "回复",
  icon: "reply",
  onClick: vi.fn()
}],
```

Add these assertions after the first above placement calculation:

```tsx
const reactions = menu?.querySelector<HTMLElement>(
  '[data-im-message-action-section="reactions"]'
);
const actionGrid = menu?.querySelector<HTMLElement>(
  '[data-im-message-action-section="actions"]'
);
const actionItem = menu?.querySelector<HTMLElement>(
  '[data-im-message-action-item="true"]'
);

expect(actionGrid?.compareDocumentPosition(reactions!))
  .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
expect(actionItem?.className).toContain("py-2");
expect(actionItem?.querySelector("span")?.className).toContain("h-8");
expect([...menu!.querySelectorAll("button")].some(
  (button) => button.textContent?.trim() === "收起"
)).toBe(false);
```

After moving the anchor below the top edge and dispatching resize, re-query the sections and assert:

```tsx
expect(reactions?.compareDocumentPosition(actionGrid!))
  .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx
```

Expected: FAIL because the section data attributes do not exist, the action button still uses `py-3` and `h-10`, and the standalone `收起` button is still rendered.

- [ ] **Step 3: Implement the minimal adaptive compact layout**

In `ImMessageActionButton`, add `data-im-message-action-item="true"` and use compact tokens:

```tsx
<button
  className={cn(
    "focus-ring min-h-11 min-w-0 rounded-[14px] px-1 py-2 text-center transition",
    "bg-[color:color-mix(in_srgb,var(--client-surface)_78%,var(--client-bg)_22%)] text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_13%,var(--client-surface)_87%)]",
    danger && (isNight ? "text-[#ff8e80]" : "text-[#ef4f3f]"),
    item.disabled && "cursor-not-allowed bg-[color:color-mix(in_srgb,var(--client-line)_24%,transparent)] text-[color:color-mix(in_srgb,var(--client-muted)_55%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--client-line)_24%,transparent)]"
  )}
  data-im-message-action-item="true"
  disabled={item.disabled}
  onClick={item.onClick}
  type="button"
>
  <span className={cn(
    "mx-auto grid h-8 w-8 place-items-center rounded-xl bg-[color:color-mix(in_srgb,var(--client-line)_30%,transparent)]",
    item.disabled && "bg-[color:color-mix(in_srgb,var(--client-line)_18%,transparent)]"
  )}>
    <ImIcon name={item.icon === "pin" ? "top" : item.icon} />
  </span>
  <span className="mt-1 block truncate text-[11px] font-black leading-4">
    {item.label}
  </span>
</button>
```

Change the compact `ImReactionButton` token from `h-12 min-w-12 text-[24px]` to `h-11 min-w-11 text-[22px]`, preserving a 44px target.

Inside `ImMessageActionSheet`, create one `reactionSection` and one `actionSection` with stable markers:

```tsx
const quickReactionRow = (
  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-0.5 px-1 py-1.5">
    {imQuickReactions.map((emoji) => (
      <ImReactionButton emoji={emoji} key={emoji} onClick={() => onReact(emoji)} />
    ))}
    <button
      aria-label={expanded ? "收起默认表情" : "展开默认表情"}
      className={cn(
        "focus-ring grid h-11 place-items-center rounded-full transition",
        "bg-[color:color-mix(in_srgb,var(--client-line)_30%,transparent)] text-[color:var(--client-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
      )}
      onClick={() => onExpandedChange(!expanded)}
      type="button"
    >
      <ImIcon name="more" />
    </button>
  </div>
);

const expandedReactionCatalog = expanded ? (
  <div className="space-y-2 px-1 pb-2 pt-1">
    <section>
      <p className="mb-1 text-[11px] font-black text-[color:var(--client-muted)]">默认表情</p>
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
        {imDefaultReactions.map((emoji) => (
          <ImReactionButton compact emoji={emoji} key={`default-${emoji}`} onClick={() => onReact(emoji)} />
        ))}
      </div>
    </section>
  </div>
) : null;

const reactionSection = (
  <section
    className={menuPosition.placement === "above" ? "pt-1" : "pb-1"}
    data-im-message-action-section="reactions"
  >
    {menuPosition.placement === "above" ? expandedReactionCatalog : quickReactionRow}
    {menuPosition.placement === "above" ? quickReactionRow : expandedReactionCatalog}
  </section>
);

const actionSection = actions.length > 0 ? (
  <div
    className="grid grid-cols-5 gap-1.5"
    data-im-message-action-section="actions"
  >
    {actions.map((item) => (
      <ImMessageActionButton isNight={isNight} item={item} key={item.key} />
    ))}
  </div>
) : null;

const listActionSection = listActions.length > 0 ? (
  <div className={cn("mt-2 overflow-hidden rounded-[16px]", listShellClass)}>
    {listActions.map((item) => (
      <button
        className={cn(
          "focus-ring flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-black transition",
          "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]",
          item.tone === "danger" && (isNight ? "text-[#ff8e80]" : "text-[#ef4f3f]"),
          item.disabled && "cursor-not-allowed text-[color:color-mix(in_srgb,var(--client-muted)_55%,transparent)] hover:bg-transparent"
        )}
        disabled={item.disabled}
        key={item.key}
        onClick={item.onClick}
        type="button"
      >
        <ImIcon className="h-4.5 w-4.5 shrink-0" name={item.icon} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </button>
    ))}
  </div>
) : null;
```

Group expanded default reactions with the quick-reaction section. Render sections in the existing scroll container as:

```tsx
{menuPosition.placement === "below" ? reactionSection : null}
{actionSection}
{listActionSection}
{menuPosition.placement === "above" ? reactionSection : null}
```

Remove the standalone `收起` button. Change the scroll container to `p-2`, the sheet radius to `20px`, list spacing to compact values, and the positioner width to:

```tsx
width: "min(520px, calc(100vw - 32px))"
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts
```

Expected: both test files PASS with no React warnings.

- [ ] **Step 5: Run static and production verification**

Run:

```bash
npm run lint
npm run verify:production-build
```

Expected: lint exits 0; TypeScript/Vite production build and bundle audit report PASS.

- [ ] **Step 6: Verify in the signed-in 5180 conversation**

Reload `http://127.0.0.1:5180/#/messages/2561`, open a menu on a message in the lower half, and verify the action grid precedes the reaction row and the menu is above the message. Then open a menu on a message near the top and verify the reaction row precedes the action grid and the menu is below the message. Confirm the standalone `收起` row is absent and the ellipsis still expands/collapses the emoji catalog.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/features/im/components.tsx src/features/im/components.action-menu.test.tsx
git commit -m "fix: compact IM message action menu"
```
