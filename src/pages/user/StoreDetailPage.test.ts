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
});
