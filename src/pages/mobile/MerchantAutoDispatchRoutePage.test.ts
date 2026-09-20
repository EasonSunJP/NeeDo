import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import pageSource from "./MerchantAutoDispatchRoutePage.tsx?raw";
import portalSource from "./MerchantPortalPage.tsx?raw";
import orderSource from "./MerchantOrderRoutePages.tsx?raw";

describe("formal merchant dispatch surfaces", () => {
  it("uses the formal rule API and exposes an editable preferred employee list", () => {
    expect(pageSource).toContain("shopAutoDispatchApi.read");
    expect(pageSource).toContain("shopAutoDispatchApi.update");
    expect(pageSource).toContain("优先员工列表");
    expect(pageSource).toContain("手动派单");
    expect(pageSource).not.toContain("localStorage");
    expect(appSource).toContain('lazy(() => import("./pages/mobile/MerchantAutoDispatchRoutePage")');
    expect(appSource).toContain("<Suspense fallback={null}><MerchantAutoDispatchRoutePage /></Suspense>");
  });

  it("keeps the dashboard status as a navigation entry and shows dispatch only for unassigned orders", () => {
    expect(portalSource).toContain("<AutoDispatchEntryButton />");
    expect(portalSource).toContain('lazy(() => import("../../features/dispatch-center/AutoDispatchEntryButton")');
    expect(portalSource).toContain("if (order.technicianProfileId) return null");
    expect(portalSource.match(/<UnassignedDispatchButton/gu)).toHaveLength(3);
    expect(orderSource).toContain("bookingApi.assignOrderTechnician");
    expect(orderSource).toContain("Boolean(order?.technicianProfileId)");
    expect(orderSource).toContain("MobileBottomActionBar");
  });
});
