# Formal Checkout Approved UI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved production checkout presentation and scroll-driven arrow progress navigation while retaining the current formal service, availability, authentication, and booking APIs.

**Architecture:** Keep `FormalCheckoutPage` as the API-owning container, extract the approved SVG progress navigation and its deterministic viewport calculation into a focused module, and port the approved historical page structure into the success state. The page reads only `CoreServiceDetail` and `BookingScheduleSlot` values; unsupported historical selectors remain absent instead of being backed by legacy state.

**Tech Stack:** React 19, TypeScript strict mode, React Router, Tailwind utility classes, Vitest, Vite, formal `/api/v1` clients.

## Global Constraints

- Visual authority is commit `a06b28bf`, old `src/pages/user/CheckoutPage.tsx`.
- Data authority remains `coreReadApi.getServiceDetail`, `bookingApi.listAvailability`, and `bookingApi.createBooking`.
- Do not import `src/data/mock`, legacy entity stores, schedule stores, or user order stores.
- Do not invent age, availability, payment methods, ratings, review counts, acceptance rates, locations, or service fields.
- The six header steps are rounded right-pointing SVG arrows and illuminate cumulatively through the current viewport-center section.
- Preserve the formal login redirect, empty availability state, conflict reload, submission lock, and successful order-detail navigation.
- Support 390px and 440px mobile widths without horizontal overflow.
- Do not add schema changes, migrations, backend routes, dependencies, or unrelated refactors.
- Stage only the files named by each task because the shared worktree contains unrelated changes.

---

## File Structure

- Create `src/pages/user/formal-checkout/CheckoutProgressNav.tsx`: progress step types, exact SVG paths, active-step calculation, icons, and accessible navigation rendering.
- Create `src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx`: deterministic threshold/path tests and rendered cumulative-state tests.
- Modify `src/pages/user/FormalCheckoutPage.tsx`: refs/listeners, approved success-state layout, formal data rendering, and fixed action footer.
- Modify `src/pages/user/FormalCheckoutPage.test.ts`: API-boundary and approved-structure regression checks.
- Create `docs/verification/2026-09-02-formal-checkout-ui.md`: current-runtime identity and browser acceptance evidence after implementation.

---

### Task 1: Approved SVG Progress Navigation

**Files:**
- Create: `src/pages/user/formal-checkout/CheckoutProgressNav.tsx`
- Create: `src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx`

**Interfaces:**
- Consumes: `cn` from the existing UI utilities.
- Produces: `checkoutProgressSteps`, `resolveActiveCheckoutStep(input)`, and `<CheckoutProgressNav activeIndex containerRef fulfillmentMode onSelect />`.

- [ ] **Step 1: Write the failing calculation and rendering tests**

Create `src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutProgressNav, checkoutProgressPath, resolveActiveCheckoutStep } from "./CheckoutProgressNav";

describe("formal checkout progress navigation", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the approved rounded arrow paths", () => {
    expect(checkoutProgressPath(true)).toBe("M18 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H18C10 64 4 58 4 50V18C4 10 10 4 18 4Z");
    expect(checkoutProgressPath(false)).toBe("M20 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H20C14 64 9 61 6 56L0 34L6 12C9 7 14 4 20 4Z");
  });

  it("selects the last section that reaches the content viewport midpoint", () => {
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [210, 560, 910], viewportHeight: 900 })).toBe(0);
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [80, 520, 910], viewportHeight: 900 })).toBe(1);
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [20, 200, 500, 539, 900], viewportHeight: 900 })).toBe(3);
  });

  it("renders current and completed arrows as active while exposing one current step", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <CheckoutProgressNav
          activeIndex={2}
          containerRef={{ current: null }}
          fulfillmentMode="store"
          onSelect={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(6);
    expect(buttons.filter((button) => button.dataset.active === "true")).toHaveLength(3);
    expect(buttons[2]?.getAttribute("aria-current")).toBe("step");
    expect(buttons[3]?.getAttribute("aria-current")).toBeNull();
    expect(container.textContent).toContain("到店服务");
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run:

```bash
npx vitest run src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
```

Expected: FAIL because `./CheckoutProgressNav` does not exist.

- [ ] **Step 3: Implement the progress module with the historical SVG paths**

Create `src/pages/user/formal-checkout/CheckoutProgressNav.tsx` with these exact exported contracts and behavior:

```tsx
import type { RefObject } from "react";
import { cn } from "../../../lib/utils";
import type { FulfillmentMode } from "../../../types/domain";

export type CheckoutProgressKey = "package" | "fulfillment" | "time" | "location" | "technician" | "remark";
type CheckoutProgressIcon = "package" | "mode" | "time" | "location" | "technician" | "remark";

export type ActiveCheckoutStepInput = {
  progressBottom: number;
  sectionTops: readonly number[];
  viewportHeight: number;
};

const baseSteps: ReadonlyArray<{ key: CheckoutProgressKey; icon: CheckoutProgressIcon; label: string }> = [
  { key: "package", icon: "package", label: "套餐" },
  { key: "fulfillment", icon: "mode", label: "到店服务" },
  { key: "time", icon: "time", label: "时间" },
  { key: "location", icon: "location", label: "地址" },
  { key: "technician", icon: "technician", label: "技师" },
  { key: "remark", icon: "remark", label: "备注" }
];

function CheckoutProgressGlyph({ icon }: { icon: CheckoutProgressIcon }) {
  return (
    <svg aria-hidden="true" className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24">
      {icon === "package" ? <><path d="M12 3.7 19 7.5v9L12 20.3 5 16.5v-9L12 3.7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /><path d="M5 7.5 12 11l7-3.5M12 11v9.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></> : null}
      {icon === "mode" ? <><path d="M4.8 7.2h9.7c1.4 0 2.6 1.2 2.6 2.6v4.5c0 1.4-1.2 2.6-2.6 2.6H9.9l-3.3 2.6v-2.6H4.8c-1.4 0-2.6-1.2-2.6-2.6V9.8c0-1.4 1.2-2.6 2.6-2.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /><path d="M17.2 5.3h2a2.6 2.6 0 0 1 2.6 2.6v4.4a2.6 2.6 0 0 1-2.6 2.6h-.8v2.1l-2.5-2.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></> : null}
      {icon === "time" ? <><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.8v4.5l3.1 1.9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></> : null}
      {icon === "location" ? <><path d="M12 20s5.9-4.5 5.9-9.8a5.9 5.9 0 1 0-11.8 0C6.1 15.5 12 20 12 20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><circle cx="12" cy="10.3" r="2.2" stroke="currentColor" strokeWidth="1.8" /></> : null}
      {icon === "technician" ? <><circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" /><path d="M6.8 19.2c.7-3 2.8-4.7 5.2-4.7s4.5 1.7 5.2 4.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></> : null}
      {icon === "remark" ? <><path d="M7 6.2h10A1.8 1.8 0 0 1 18.8 8v7.4A1.8 1.8 0 0 1 17 17.2h-4l-3.2 2.6v-2.6H7A1.8 1.8 0 0 1 5.2 15.4V8A1.8 1.8 0 0 1 7 6.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /><path d="M8.8 10.2h6.4M8.8 13h4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></> : null}
    </svg>
  );
}

export function checkoutProgressSteps(fulfillmentMode: FulfillmentMode) {
  return baseSteps.map((step) => step.key === "fulfillment"
    ? { ...step, label: fulfillmentMode === "store" ? "到店服务" : "上门服务" }
    : step);
}

export function checkoutProgressPath(first: boolean) {
  return first
    ? "M18 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H18C10 64 4 58 4 50V18C4 10 10 4 18 4Z"
    : "M20 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H20C14 64 9 61 6 56L0 34L6 12C9 7 14 4 20 4Z";
}

export function resolveActiveCheckoutStep({ progressBottom, sectionTops, viewportHeight }: ActiveCheckoutStepInput) {
  const threshold = progressBottom + Math.max(0, (viewportHeight - progressBottom) / 2);
  return sectionTops.reduce((activeIndex, top, index) => top <= threshold ? index : activeIndex, 0);
}

export function CheckoutProgressNav({
  activeIndex,
  containerRef,
  fulfillmentMode,
  onSelect
}: {
  activeIndex: number;
  containerRef: RefObject<HTMLDivElement | null>;
  fulfillmentMode: FulfillmentMode;
  onSelect: (index: number, key: CheckoutProgressKey) => void;
}) {
  const steps = checkoutProgressSteps(fulfillmentMode);

  return (
    <div className="px-1" ref={containerRef}>
      <nav aria-label="预约确认项目">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const active = index <= activeIndex;
          return (
            <button
              aria-current={index === activeIndex ? "step" : undefined}
              aria-label={`查看${step.label}`}
              className="relative min-w-0 flex-1"
              data-active={active}
              key={step.key}
              onClick={() => onSelect(index, step.key)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-[56px] w-full"
                preserveAspectRatio="none"
                style={{ color: active ? "var(--client-primary)" : "color-mix(in srgb, var(--client-surface) 88%, rgba(25,29,36,0.98))" }}
                viewBox="0 0 156 68"
              >
                <path d={checkoutProgressPath(index === 0)} fill="currentColor" />
              </svg>
              <span className={cn(
                "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pb-0.5",
                active ? "text-[#090806]" : "text-white/90"
              )}>
                <CheckoutProgressGlyph icon={step.icon} />
                <span className="max-w-full truncate px-0.5 text-[10px] font-black leading-none tracking-[0.02em]">{step.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run the progress tests**

Run:

```bash
npx vitest run src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit only the progress module and test**

```bash
git add -- src/pages/user/formal-checkout/CheckoutProgressNav.tsx src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: restore checkout progress arrows"
```

Expected staged files: exactly the two files listed above.

---

### Task 2: Viewport-Center Progress Tracking

**Files:**
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`

**Interfaces:**
- Consumes: `resolveActiveCheckoutStep`, `CheckoutProgressNav`, and `CheckoutProgressKey` from Task 1.
- Produces: six stable section refs, cumulative scroll state, and click-to-section navigation.

- [ ] **Step 1: Add failing page-wiring assertions**

Append this test to `src/pages/user/FormalCheckoutPage.test.ts`:

```ts
it("tracks six approved sections through the viewport center", () => {
  expect(formalSource).toContain("progressBarRef");
  expect(formalSource).toContain("sectionRefs");
  expect(formalSource).toContain("resolveActiveCheckoutStep");
  expect(formalSource).toContain('window.addEventListener("scroll"');
  expect(formalSource).toContain('window.addEventListener("resize"');
  expect(formalSource).toContain('section.scrollIntoView({ behavior, block: "start" })');
  expect(formalSource.match(/sectionRefs\.current\[[0-5]\]/g)).toHaveLength(6);
  expect(formalSource).toContain("<CheckoutProgressNav");
  expect(formalSource).toContain("activeIndex={activeProgressStep}");
});
```

- [ ] **Step 2: Run the page test and verify failure**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts
```

Expected: FAIL in “tracks six approved sections through the viewport center”.

- [ ] **Step 3: Wire refs, scroll calculation, reduced-motion behavior, and fixed header**

Update `src/pages/user/FormalCheckoutPage.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckoutProgressNav,
  resolveActiveCheckoutStep,
  type CheckoutProgressKey
} from "./formal-checkout/CheckoutProgressNav";

// Inside FormalCheckoutPage, beside existing state:
const progressBarRef = useRef<HTMLDivElement | null>(null);
const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
const [activeProgressStep, setActiveProgressStep] = useState(0);

useEffect(() => {
  const updateProgressByScroll = () => {
    const progressBottom = progressBarRef.current?.getBoundingClientRect().bottom ?? 138;
    const sectionTops = sectionRefs.current.map((section) => section?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
    const nextStep = resolveActiveCheckoutStep({ progressBottom, sectionTops, viewportHeight: window.innerHeight });
    setActiveProgressStep((current) => current === nextStep ? current : nextStep);
  };
  const frameId = window.requestAnimationFrame(updateProgressByScroll);
  window.addEventListener("scroll", updateProgressByScroll, { passive: true });
  window.addEventListener("resize", updateProgressByScroll);
  return () => {
    window.cancelAnimationFrame(frameId);
    window.removeEventListener("scroll", updateProgressByScroll);
    window.removeEventListener("resize", updateProgressByScroll);
  };
}, [loadStatus]);

const jumpToSection = (index: number, key: CheckoutProgressKey) => {
  const section = sectionRefs.current[index];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  section?.scrollIntoView({ behavior, block: "start" });
  if (key === "remark") window.setTimeout(() => remarkInputRef.current?.focus(), reduceMotion ? 0 : 320);
};
```

Replace the header invocation with:

```tsx
<PageScaffold
  contentClassName="space-y-4 pb-40 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]"
  navItems={[]}
>
  <AppTopBar
    closeLabel="关闭确认预约"
    fixed
    footer={(
      <CheckoutProgressNav
        activeIndex={activeProgressStep}
        containerRef={progressBarRef}
        fulfillmentMode={fulfillmentMode}
        onSelect={jumpToSection}
      />
    )}
    footerClassName="mt-3"
    info="请逐项确认正式服务、时间、地址及担当信息后再提交。"
    onBack={() => navigate(-1)}
    onClose={() => navigate("/", { replace: true })}
    title="确认预约"
  />
```

Wrap the six success-state sections with these exact refs and scroll offsets, in order:

```tsx
<div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[0] = node)}>{/* 套餐 */}</div>
<div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[1] = node)}>{/* 服务方式 */}</div>
<div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[2] = node)}>{/* 时间 */}</div>
<div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[3] = node)}>{/* 地址 */}</div>
<div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[4] = node)}>{/* 技师 */}</div>
<div className="scroll-mt-[170px] space-y-2 pt-1" ref={(node) => void (sectionRefs.current[5] = node)}>{/* 备注 */}</div>
```

Add `ref={remarkInputRef}` to the existing formal note textarea.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit only the page wiring and regression test**

```bash
git add -- src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: track checkout confirmation progress"
```

Expected staged files: exactly `FormalCheckoutPage.tsx` and `FormalCheckoutPage.test.ts`.

---

### Task 3: Restore the Approved Formal Checkout Body

**Files:**
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`

**Interfaces:**
- Consumes: current `service`, `displayService`, `slots`, `selectedSlot`, `fulfillmentMode`, `address`, `note`, and `service.technician` formal values.
- Produces: approved package, fulfillment, time, address, technician, remark, notice, cancellation, and NDP presentation without unsupported selectors.

- [ ] **Step 1: Add failing approved-structure and formal-field assertions**

Append to the existing “keeps the production confirmation structure” test:

```ts
expect(formalSource).toContain("Google Maps");
expect(formalSource).toContain("门店位置预览");
expect(formalSource).toContain("复制地址");
expect(formalSource).toContain("预约时间");
expect(formalSource).toContain("接单率");
expect(formalSource).toContain("service.technician.acceptanceRatePercent");
expect(formalSource).toContain("service.technician.reviewSummary.reviewCount");
expect(formalSource).toContain("service.technician.reviewSummary.ratingAverage");
expect(formalSource).not.toContain("acceptRate: 98");
```

Add a separate test:

```ts
it("renders the approved detailed body without reviving unsupported stores", () => {
  for (const copy of ["套餐", "服务方式", "预约时间", "地址", "技师", "特殊需求", "注意事项", "取消政策", "NDP（NeeDoPoint）"]) {
    expect(formalSource).toContain(copy);
  }
  expect(formalSource).not.toContain("entityStore");
  expect(formalSource).not.toContain("shiftPlanningStore");
  expect(formalSource).not.toContain("userOrderStore");
  expect(formalSource).not.toContain("../../data/mock");
});
```

- [ ] **Step 2: Run the regression test and verify the missing approved details**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts
```

Expected: FAIL on the new map, time-card, and technician field assertions.

- [ ] **Step 3: Add formal display helpers used by the approved layout**

Add these helpers near the existing date functions in `FormalCheckoutPage.tsx`:

```tsx
function formatTokyoDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric"
  }).format(date);
}

function formatTokyoTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function finiteRating(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsEmbedUrl(query: string) {
  return `https://www.google.com/maps?output=embed&q=${encodeURIComponent(query)}`;
}
```

Inside the component, derive only formal display values:

```tsx
const packageDetail = displayService?.packages[0] ?? null;
const locationAddress = fulfillmentMode === "store" ? service?.shop.address.trim() ?? "" : address.trim();
const locationTitle = fulfillmentMode === "store" ? service?.shop.name ?? "" : "上门服务地址";
const locationQuery = [locationTitle, locationAddress].filter(Boolean).join(" ");
const technicianSkills = service?.technician
  ? [service.technician.primaryService?.name, ...service.technician.reviewSummary.highlights].filter((value): value is string => Boolean(value?.trim())).slice(0, 3)
  : [];
```

Remove `mapCoreTechnicianToTechnician`, `SocialProfileMiniCard`, and the `displayTechnician` memo from `FormalCheckoutPage.tsx`; the approved card must read the raw formal technician fields so its acceptance rate cannot fall back to a presentation constant.

- [ ] **Step 4: Replace the simplified success-state body with the approved hierarchy**

For each of the six ref wrappers from Task 2, port the matching markup and utility classes from `a06b28bf:src/pages/user/CheckoutPage.tsx`, preserving these formal bindings:

```tsx
// Package card
<img alt={service.name} src={getGeneratedImageThumbnailUrl(displayService.cover)} />
{displayService.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
<p>{service.name}</p>
<p>{service.description}</p>
<strong>{yen(Number(service.priceAmount))}</strong>
<span>{service.durationMinutes} 分钟</span>
<span>{service.city}</span>
{packageDetail?.includes.slice(0, 4).map((item) => <span key={item}>{item}</span>)}

// Fulfillment card: preserve the existing support/disabled logic and formal address field.
{(["store", "home"] as const).map((mode) => {
  const disabled = !supportsBothModes && fulfillmentMode !== mode;
  return <button disabled={disabled} key={mode} onClick={() => setFulfillmentMode(mode)} type="button">{mode === "store" ? "到店服务" : "上门服务"}</button>;
})}
{fulfillmentMode === "store"
  ? <div><p>{service.shop.name}</p><p>{service.shop.city} · {service.shop.address}</p></div>
  : <textarea aria-label="上门地址" onChange={(event) => setAddress(event.target.value)} value={address} />}

// Time card: keep slots as the only choices.
<p>预约时间</p>
<p>{selectedSlot ? formatTokyoDate(selectedSlot.startsAt) : "暂时没有可预约时段"}</p>
<p>{selectedSlot ? formatTokyoTime(selectedSlot.startsAt) : "--:--"}</p>
<p>{people}</p>
{slots.map((slot) => <button key={slot.id} onClick={() => setSelectedSlotId(slot.id)} type="button">{formatSlotDateTime(slot.startsAt)}</button>)}

// Address card and map preview.
{locationQuery ? (
  <div className="relative overflow-hidden rounded-[22px]">
    <iframe aria-hidden="true" className="pointer-events-none h-[136px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={googleMapsEmbedUrl(locationQuery)} title="Google 地图缩略图" />
    <div><span>Google Maps</span><span>{fulfillmentMode === "store" ? "门店位置预览" : "上门地址预览"}</span></div>
  </div>
) : null}
<p>{locationAddress || "请填写上门地址"}</p>
<p>{locationTitle}</p>
{locationQuery ? <a href={googleMapsSearchUrl(locationQuery)} rel="noreferrer" target="_blank">Google 地图</a> : null}
<button disabled={!locationAddress} onClick={() => void navigator.clipboard.writeText(locationAddress)} type="button">复制地址</button>

// Technician card: never use the legacy mapped acceptRate.
{service.technician ? (
  <div>
    {service.technician.avatarUrl ? (
      <img alt={service.technician.displayName} src={service.technician.avatarUrl} />
    ) : (
      <span aria-hidden="true">{service.technician.displayName.trim().charAt(0)}</span>
    )}
    <p>{service.technician.displayName}</p>
    <p>{service.technician.city}</p>
    <p>★ {finiteRating(service.technician.reviewSummary.ratingAverage).toFixed(1)} · {service.technician.reviewSummary.reviewCount} 评价</p>
    <p>{technicianSkills.join(" / ")}</p>
    <p>{service.technician.acceptanceRatePercent}% 接单率</p>
  </div>
) : (
  <div><p>由店铺安排技师</p><p>确认接单后将在预约详情中显示正式担当信息。</p></div>
)}

// Remark and consolidated policy card.
<textarea id="formal-checkout-note" maxLength={500} onChange={(event) => setNote(event.target.value)} ref={remarkInputRef} value={note} />
<div>
  <h2>注意事项</h2>
  <p>预约前请确认服务时间、地址与付款方式；服务内容以本页正式数据及店铺最终确认结果为准。</p>
  <h3>取消政策</h3>
  <p>提交后可在预约详情查看当前状态；取消条件以正式订单状态与店铺规则为准。</p>
  <h3>NDP（NeeDoPoint）</h3>
  <p>本次订单的 NDP 使用与结算结果，以服务完成后的正式结算记录为准。</p>
</div>
```

Use the exact historical card classes (`rounded-[28px]`, bordered translucent client surfaces, `shadow-[0_14px_28px_rgba(0,0,0,0.06)]`, compact green tags, and historical typography) rather than the simplified `SurfacePanel` grid. Do not add package, seat, shop, or technician choices that the formal response does not supply.

- [ ] **Step 5: Run page and progress tests**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the approved formal body**

```bash
git add -- src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: restore approved formal checkout layout"
```

Expected staged files: exactly the two files listed above.

---

### Task 4: Fixed Action Footer and Formal Submission Regression

**Files:**
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`

**Interfaces:**
- Consumes: current `paymentMethod`, `selectedSlot`, `submitting`, `submitError`, `submitBooking`, and `service.priceAmount` values.
- Produces: approved two-row fixed footer with formal payment selection and unchanged booking submission behavior.

- [ ] **Step 1: Add failing footer and submission assertions**

Append to `FormalCheckoutPage.test.ts`:

```ts
it("keeps the approved action footer attached to the formal booking submission", () => {
  expect(formalSource).toContain("应付金额");
  expect(formalSource).toContain("联系");
  expect(formalSource).toContain("确定预约");
  expect(formalSource).toContain("safe-nav-bottom");
  expect(formalSource).toContain("pointer-events-none fixed inset-x-0 bottom-0");
  expect(formalSource).toContain("paymentMethod");
  expect(formalSource).toContain("void submitBooking()");
  expect(formalSource).toContain("disabled={!selectedSlot || submitting}");
});
```

- [ ] **Step 2: Run the page test and verify failure on the approved footer shell**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts
```

Expected: FAIL because the current footer does not use the approved safe-area shell classes.

- [ ] **Step 3: Port the approved fixed footer shell without changing submission data**

Replace the current fixed footer wrapper with:

```tsx
<footer className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-14">
  <div className="pointer-events-auto space-y-3">
    <div className="grid grid-cols-[minmax(0,1fr),auto] items-end gap-3">
      <div className="min-w-0">
        <p className="text-xs font-black text-[color:color-mix(in_srgb,var(--client-text)_72%,var(--client-muted)_28%)]">应付金额</p>
        <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(Number(service.priceAmount))}</strong>
      </div>
      <div className="flex max-w-[54vw] flex-wrap justify-end gap-2">
        {(["onsite", "bank_transfer"] as const).map((method) => (
          <button
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-black backdrop-blur",
              paymentMethod === method
                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                : "border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-[color:var(--client-text)]"
            )}
            key={method}
            onClick={() => setPaymentMethod(method)}
            type="button"
          >
            {method === "onsite" ? "到店后支付" : "银行转账"}
          </button>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
      <SecondaryButton className="w-full" onClick={() => navigate(`/stores/${service.shop.id}`)}>联系</SecondaryButton>
      <PrimaryButton className="w-full" disabled={!selectedSlot || submitting} onClick={() => void submitBooking()}>
        {submitting ? "创建预约中" : isAuthenticated ? "确定预约" : "登录后确定预约"}
      </PrimaryButton>
    </div>
  </div>
</footer>
```

Keep the existing `submitBooking` implementation unchanged, including `scheduleSlotId`, fulfillment validation, auth redirect, API call, conflict message, and order navigation.

- [ ] **Step 4: Run focused tests and production checks**

Run:

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
npm run lint
npm run verify:production-build
```

Expected: focused tests PASS, TypeScript exits 0, formal production build exits 0, and the production bundle audit exits 0.

- [ ] **Step 5: Commit the footer regression**

```bash
git add -- src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: preserve formal checkout submission footer"
```

Expected staged files: exactly the two files listed above.

---

### Task 5: Standard-Runtime Browser Acceptance

**Files:**
- Create: `docs/verification/2026-09-02-formal-checkout-ui.md`

**Interfaces:**
- Consumes: merged implementation from Tasks 1–4, the standard frontend/backend runtime, and an authenticated user session.
- Produces: reproducible process, route, viewport, interaction, console, network, and overflow evidence.

- [ ] **Step 1: Prove standard listener ownership before opening the page**

Run:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -a -p <backend-pid> -d cwd
lsof -a -p <frontend-pid> -d cwd
git branch --show-current
git rev-parse HEAD
curl --max-time 5 -s http://127.0.0.1:3000/health
curl --max-time 5 -s http://127.0.0.1:3000/ready
```

Expected: backend cwd is `/Users/eason/Documents/New project/backend`, frontend cwd is `/Users/eason/Documents/New project`, branch is `main`, health/ready succeed, and no alternate worktree serves the tested page. If 5180 is not the configured frontend port, record the actual standard port and prove its listener the same way.

- [ ] **Step 2: Verify authenticated formal requests and the initial arrow state at 390px**

Open the numeric formal service route through the normal user flow, authenticate as a customer, and set the browser viewport to 390px width. Confirm:

```text
GET /api/v1/services/:id                         200
GET /api/v1/booking/availability?...serviceId=  200
```

Expected UI: approved package card and service mode are visible; six rounded right arrows fit one row; only “套餐” is current on initial load; no horizontal overflow.

- [ ] **Step 3: Verify cumulative viewport-center illumination**

Scroll in short batches until each target section passes the content viewport midpoint:

```text
时间 centered   -> 套餐 / 到店服务 / 时间 are green
地址 centered   -> first four arrows are green
技师 centered   -> first five arrows are green
备注 centered   -> all six arrows are green
```

Click “时间” and “备注” arrows and verify smooth navigation lands below the fixed header; verify the notes field receives focus after clicking “备注”. Repeat at 440px width.

- [ ] **Step 4: Verify approved body, submission guard, console, network, and overflow**

Confirm the service card, service mode card, time card, map/address card, technician card or formal shop-assignment state, note card, consolidated notice/cancellation/NDP card, and fixed payment footer match the approved hierarchy. Confirm the displayed technician rating, review count, and acceptance rate match the formal service response. Confirm the submit button is disabled without a slot and locks during submission.

Run in the browser console at the page top and bottom:

```js
({
  body: document.body.scrollWidth,
  documentElement: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
  overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > window.innerWidth
})
```

Expected: `overflow` is `false`; no new console error; no failed formal service or availability request; no request to a legacy/mock endpoint.

- [ ] **Step 5: Record evidence and commit the verification report**

Create `docs/verification/2026-09-02-formal-checkout-ui.md` containing the exact commit, listener PIDs/cwds, tested URL/service ID, account role, response statuses, 390px and 440px results, arrow states at four scroll positions, console result, overflow object, and any unverified item stated explicitly.

```bash
git add -- docs/verification/2026-09-02-formal-checkout-ui.md
git diff --cached --check
git diff --cached --name-only
git commit -m "test: verify approved formal checkout UI"
```

Expected staged file: exactly the verification report.

---

### Task 6: Final Scope and Repository Audit

**Files:**
- Inspect only: files changed by Tasks 1–5.

**Interfaces:**
- Consumes: all task commits and verification evidence.
- Produces: a precise local delivery statement; no push or deployment.

- [ ] **Step 1: Run final focused and production verification**

```bash
npx vitest run src/pages/user/FormalCheckoutPage.test.ts src/pages/user/formal-checkout/CheckoutProgressNav.test.tsx
npm run lint
npm run verify:production-build
git diff --check
```

Expected: tests PASS, lint/build/audit exit 0, and no whitespace errors in task files.

- [ ] **Step 2: Audit the formal boundary and task commit list**

```bash
rg -n "data/mock|entityStore|shiftPlanningStore|userOrderStore|addUserOrder" src/pages/user/FormalCheckoutPage.tsx src/pages/user/formal-checkout
git log --oneline --decorate -8
git status --short
```

Expected: the boundary scan prints no match; task commits are present; unrelated pre-existing dirty files remain unstaged and are reported separately.

- [ ] **Step 3: Report delivery state without overclaiming**

Report separately:

```text
Implementation: complete/incomplete
Focused tests: pass/fail
Production build: pass/fail
Authenticated browser acceptance: pass/fail/blocked
Local commits: exact hashes
Remote push: not performed
Deployment: not performed
```

Do not claim remote or production completion from local commits or local browser evidence.
