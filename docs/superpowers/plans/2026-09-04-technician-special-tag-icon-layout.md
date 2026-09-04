# Technician Special Tag Icon Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four technician special-tag icons with the approved silhouettes and make all four compact cards fit one mobile row without overlap.

**Architecture:** Keep `serviceReviewTagCatalog.ts` as the shared semantic-to-asset mapping, keep the four SVGs as presentation-only assets, and keep `service-review-stamp` as the shared visual primitive. Change only display labels, assets, and responsive CSS; formal counts and selection behavior remain untouched.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tailwind utility classes, shared CSS, SVG.

## Global Constraints

- This is one frontend visual microstep; do not change API, database, RBAC, routing, review persistence, or count aggregation.
- Do not add mock data, placeholder logic, dependencies, or new visible copy outside the four approved labels.
- Preserve the existing purple, blue, yellow, and orange tones and the current selected-state behavior.
- Preserve unrelated dirty worktree files.
- Acceptance requires tests, build, and mobile browser inspection; tests and build alone are insufficient.

---

### Task 1: Lock the icon mapping, short labels, and compact layout contract

**Files:**
- Modify: `src/shared/order-detail/serviceReviewTagCatalog.test.ts`
- Modify: `src/features/social/profileReviewPresentation.test.ts`
- Modify: `src/shared/technician-profile/TechnicianProfileInfoView.test.tsx`

**Interfaces:**
- Consumes: `serviceReviewSpecialTags`, `serviceReviewStampVisuals`, `splitMaxReviewStampLabel`, and `TechnicianProfileInfoView`.
- Produces: regression coverage for the exact four labels, SVG mapping, four-column gap, icon markup, and compact CSS values.
- Produces: compatibility coverage proving legacy special-tag names remain excluded from custom-tag presentation.

- [ ] **Step 1: Change the catalog test to require the approved names and asset mapping**

```ts
import { describe, expect, it } from "vitest";
import {
  serviceReviewSpecialTags,
  serviceReviewStampVisuals,
  splitMaxReviewStampLabel
} from "./serviceReviewTagCatalog";

describe("serviceReviewSpecialTags", () => {
  it("keeps the four approved technician MAX tags and icon tones in order", () => {
    expect(serviceReviewSpecialTags).toEqual([
      { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
      { label: "服务max", count: 0, kind: "stamp", tone: "service" },
      { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
      { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
    ]);
    expect(serviceReviewStampVisuals).toEqual([
      { iconSrc: "/images/generated/ui/review-stamp-appeal.svg", tone: "appeal" },
      { iconSrc: "/images/generated/ui/review-stamp-service.svg", tone: "service" },
      { iconSrc: "/images/generated/ui/review-stamp-empathy.svg", tone: "empathy" },
      { iconSrc: "/images/generated/ui/review-stamp-energy.svg", tone: "energy" }
    ]);
  });
});

describe("splitMaxReviewStampLabel", () => {
  it("splits the lowercase max suffix for stacked stamp display", () => {
    expect(splitMaxReviewStampLabel("魅力max")).toEqual({ title: "魅力", marker: "max" });
  });
});
```

- [ ] **Step 2: Add markup and CSS regression coverage for the formal profile view**

```tsx
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("TechnicianProfileInfoView special tags", () => {
  it("renders the approved four icons in one compact four-column row", () => {
    const markup = renderView();

    expect(markup).toContain('class="social-profile-review-stamps mt-2 grid grid-cols-4 gap-1 px-0.5 pt-1.5"');
    expect(markup).toContain("review-stamp-appeal.svg");
    expect(markup).toContain("review-stamp-service.svg");
    expect(markup).toContain("review-stamp-empathy.svg");
    expect(markup).toContain("review-stamp-energy.svg");
    expect(styles).toContain("aspect-ratio: auto;");
    expect(styles).toContain("min-height: 72px;");
    expect(styles).toContain("width: 32px;");
    expect(styles).toContain("right: -2px;");
    expect(styles).toContain("padding: 3px 5px;");
  });
});
```

- [ ] **Step 3: Run both tests and confirm the expected RED state**

Run:

```bash
npm test -- src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/technician-profile/TechnicianProfileInfoView.test.tsx
```

Expected: FAIL because the catalog still uses the long uppercase labels, the list still uses `gap-2 pt-2`, and compact CSS values are absent.

---

### Task 2: Implement approved SVG silhouettes and compact responsive styling

**Files:**
- Modify: `src/shared/order-detail/serviceReviewTagCatalog.ts`
- Modify: `src/features/social/profileReviewPresentation.test.ts`
- Modify: `src/shared/technician-profile/TechnicianProfileInfoView.tsx`
- Modify: `src/styles.css`
- Modify: `public/images/generated/ui/review-stamp-appeal.svg`
- Modify: `public/images/generated/ui/review-stamp-service.svg`
- Modify: `public/images/generated/ui/review-stamp-empathy.svg`
- Modify: `public/images/generated/ui/review-stamp-energy.svg`

**Interfaces:**
- Consumes: the existing `ServiceReviewStampTone`, `getServiceReviewStampVisual`, `service-review-stamp--*` tone classes, and formal `count` values.
- Produces: short display labels, case-insensitive stacked `max` rendering, four transparent theme-colored SVGs, and a compact shared card layout.
- Produces: an expanded `serviceReviewSpecialLabelSet` containing the new display labels and existing legacy aliases, without rewriting stored review data.

- [ ] **Step 1: Replace the catalog labels and support the lowercase marker**

Use the approved catalog values:

```ts
export const serviceReviewSpecialTags = [
  { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
  { label: "服务max", count: 0, kind: "stamp", tone: "service" },
  { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
  { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
] satisfies Required<Pick<ServiceReviewTagOption, "label" | "count" | "kind" | "tone">>[];

export const serviceReviewSpecialTagAliases = [
  "魅力值", "魅力值MAX", "魅力MAX",
  "服务精神", "服务精神MAX", "服务MAX",
  "情绪价值", "情绪价值MAX", "情绪MAX",
  "元气", "元气MAX"
] as const;

export const serviceReviewSpecialLabelSet = new Set([
  ...serviceReviewSpecialTags.map((tag) => tag.label),
  ...serviceReviewSpecialTagAliases
]);

export function splitMaxReviewStampLabel(label: string) {
  const markerMatch = label.match(/max$/i);
  if (!markerMatch || markerMatch.index === undefined || markerMatch.index === 0) {
    return { title: label, marker: "" };
  }
  return { title: label.slice(0, markerMatch.index), marker: "max" };
}
```

- [ ] **Step 2: Tighten the shared list utility classes**

Change the list root to:

```tsx
<div
  aria-label="评价特殊标签"
  className="social-profile-review-stamps mt-2 grid grid-cols-4 gap-1 px-0.5 pt-1.5"
  role="list"
>
```

Keep the existing `role`, `aria-label`, image `alt`, count, and tone classes unchanged.

- [ ] **Step 3: Redraw the four transparent SVG assets**

Each asset keeps `width="256" height="256" viewBox="0 0 256 256" fill="none"` and contains only vector elements:

```text
review-stamp-appeal.svg  = centered head, shoulders, and three sparkle diamonds; purple #B884FF/#E7D8FF
review-stamp-service.svg = centered heart above two cupped hands; blue #67BEFF/#D9F4FF
review-stamp-empathy.svg = rounded speech bubble with lower-left tail and centered heart; yellow #F7C84A/#FFF1B3
review-stamp-energy.svg  = smiling circular sun with eight rounded rays; orange #FF844E/#FFD7B2
```

Do not embed raster `<image>` elements, white rectangles, checkerboard backgrounds, words, or extra symbols.

- [ ] **Step 4: Apply the compact shared CSS values**

Set the base and profile-specific values to the following contract:

```css
.service-review-stamp {
  min-height: 86px;
  aspect-ratio: auto;
  grid-template-rows: 42px minmax(0, 1fr);
  border-radius: 16px;
  padding: 7px 4px 8px;
}

.service-review-stamp__count {
  top: -6px;
  right: -2px;
  font-size: 10px;
  padding: 3px 5px;
}

.social-profile-review-stamps .service-review-stamp {
  min-height: 72px;
  aspect-ratio: auto;
  grid-template-rows: 32px minmax(0, 1fr);
  border-radius: 13px;
  padding: 5px 2px 6px;
}

.social-profile-review-stamps .service-review-stamp__icon,
.social-profile-review-stamps .service-review-stamp__icon img {
  width: 32px;
  height: 32px;
}

.social-profile-review-stamps .service-review-stamp__label {
  font-size: 9px;
}

.social-profile-review-stamps .service-review-stamp__label span:last-child {
  font-size: 15px;
}

.social-profile-review-stamps .service-review-stamp__count {
  top: -6px;
  right: -2px;
  font-size: 9px;
  padding: 3px 5px;
}
```

At `max-width: 420px`, keep `aspect-ratio: auto`, reduce the base stamp without overriding the profile stamp above 72px, and retain 32px profile icons. This prevents the media query from reintroducing the width constraint.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/technician-profile/TechnicianProfileInfoView.test.tsx
```

Expected: both test files pass.

- [ ] **Step 6: Run the relevant profile-card regression tests**

Run:

```bash
npm test -- src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx
```

Expected: both test files pass and the existing information-card ordering and formal-data behavior remain unchanged.

- [ ] **Step 7: Run frontend lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit with code 0.

- [ ] **Step 8: Perform mobile browser acceptance**

Start the standard frontend with `npm run dev:frontend` on the configured port `5180`. At 320px and 390px viewport widths, open the screen that renders `TechnicianProfileInfoView` and verify:

```text
4 list items on one row
0 horizontal document overflow
0 pairwise card bounding-box intersections
0 icon, label, or count-badge intersections with neighboring cards
purple/blue/yellow/orange icon order matches appeal/service/empathy/energy
browser console contains no new error or warning from the changed component
```

Capture a screenshot under `/tmp` for visual inspection, then stop only the frontend process started for this task.

- [ ] **Step 9: Commit only this microstep**

```bash
git add \
  src/features/social/profileReviewPresentation.test.ts \
  src/shared/order-detail/serviceReviewTagCatalog.test.ts \
  src/shared/technician-profile/TechnicianProfileInfoView.test.tsx \
  src/shared/order-detail/serviceReviewTagCatalog.ts \
  src/shared/technician-profile/TechnicianProfileInfoView.tsx \
  src/styles.css \
  public/images/generated/ui/review-stamp-appeal.svg \
  public/images/generated/ui/review-stamp-service.svg \
  public/images/generated/ui/review-stamp-empathy.svg \
  public/images/generated/ui/review-stamp-energy.svg \
  docs/superpowers/plans/2026-09-04-technician-special-tag-icon-layout.md
git commit -m "fix(ui): compact technician special tags"
```

Expected: commit contains only the files above and preserves all unrelated worktree changes.
