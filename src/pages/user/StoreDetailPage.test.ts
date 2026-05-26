import { describe, expect, it } from "vitest";
import pageSource from "./StoreDetailPage.tsx?raw";

describe("StoreDetailPage routed booking defaults", () => {
  it("keeps technician and schedule query defaults when opening checkout", () => {
    expect(pageSource).toContain("useSearchParams");
    expect(pageSource).toContain('searchParams.get("technician")');
    expect(pageSource).toContain("routedBookingTechnician");
    expect(pageSource).toContain("buildStoreCheckoutRoute");
    expect(pageSource).toContain("指名");
  });

  it("uses collapsible service menu and technician picker without the booking summary strip", () => {
    expect(pageSource).not.toContain("已选预约");
    expect(pageSource).toContain("serviceMenuCollapsed");
    expect(pageSource).toContain("technicianListCollapsed");
    expect(pageSource).toContain("StoreTechnicianSelectableCard");
    expect(pageSource).toContain("grid-cols-2");
    expect(pageSource).toContain('aria-label={active ? "已选技师" : "待选技师"}');
  });

  it("selects service packages through an icon control instead of a booking CTA", () => {
    expect(pageSource).toContain("selectedMenuCardId");
    expect(pageSource).toContain('selectLabel={active ? "已选服务套餐" : "选择服务套餐"}');
    expect(pageSource).toContain("onSelect={() => setSelectedMenuCardId(item.sourceServiceId)}");
    expect(pageSource).not.toContain('cardUi?.cta ?? "预约"');
  });

  it("uses the shared icon metric action for favorite and share controls", () => {
    expect(pageSource).toContain("IconMetricAction");
    expect(pageSource).not.toContain("function TopMetricAction");
  });

  it("keeps the fixed store header compact and out of page vertical rhythm spacing", () => {
    expect(pageSource).toContain('contentClassName="pb-40 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]"');
    expect(pageSource).toContain('<div className="mt-2">{tabSwitcher}</div>');
    expect(pageSource).toContain('<div className="space-y-3">{content}</div>');
    expect(pageSource).not.toContain('contentClassName="space-y-3 pb-40');
    expect(pageSource).not.toContain("pointer-events-none fixed inset-x-0 top-0 z-30");
    expect(pageSource).not.toContain("scale-110 object-cover opacity-[0.68] blur-[1px]");
  });

  it("keeps store booking capsule CTAs compact instead of relying on h-14 overrides", () => {
    expect(pageSource).toContain('const storeBookingCtaButtonClassName = "h-[52px] min-w-[176px] justify-center gap-2 px-7 text-center text-sm";');
    expect(pageSource).toContain('const storeBottomActionRowClassName = "mx-auto flex w-full max-w-[888px] items-center gap-3 px-4 pb-2";');
    expect(pageSource).toContain('const storeBottomSecondaryButtonClassName = "h-[52px] shrink-0 gap-2 px-5 shadow-[0_12px_26px_rgba(0,0,0,0.20)] backdrop-blur-xl";');
    expect(pageSource).toContain('const storeBottomPrimaryButtonClassName = "h-[52px] flex-1 gap-2 px-5 text-sm shadow-[0_12px_30px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]";');
    expect(pageSource).not.toContain("min-h-14 min-w-[188px]");
    expect(pageSource).not.toContain('className="h-14 shrink-0');
    expect(pageSource).not.toContain('className="h-14 flex-1');
    expect(pageSource).not.toContain("px-4 pb-3");
  });
});
