import { describe, expect, it } from "vitest";
import pageSource from "./TechnicianServiceDetailPage.tsx?raw";

describe("TechnicianServiceDetailPage shared detail chrome", () => {
  it("uses the glass header fade and the shared booking action footer", () => {
    expect(pageSource).toContain('className="service-detail-header"');
    expect(pageSource).toContain("<ServiceDetailHeaderFade />");
    expect(pageSource).toContain("ServiceBookingActionBar");
    expect(pageSource).toContain("amountJpy={service.catalogPriceJpy}");
    expect(pageSource).toContain('contactTo="/messages"');
    expect(pageSource).toContain("confirmTo={buildTechnicianServiceCheckoutRoute(serviceId)}");
    expect(pageSource).not.toContain("MobileBottomActionBar");
  });

  it("loads the protected booking context directly instead of reusing a public cached payload", () => {
    expect(pageSource).toContain("bookingApi.getTechnicianServiceBookingContext(serviceId)");
    expect(pageSource).toContain("scope: null");
  });
});
