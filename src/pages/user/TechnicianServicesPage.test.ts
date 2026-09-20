import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import pageSource from "./TechnicianServicesPage.tsx?raw";

describe("TechnicianServicesPage fullscreen service selection", () => {
  it("uses the shared glass detail header without the main navigation", () => {
    expect(pageSource).toContain("MobileFullscreenHeader");
    expect(pageSource).toContain("MobileFullscreenPage");
    expect(pageSource).toContain('title="服务内容"');
    expect(pageSource).toContain("onBack={() => navigate(-1)}");
    expect(pageSource).toContain("onClose={closePage}");
    expect(pageSource).not.toContain("SocialProfileTopBar");
    expect(pageSource).not.toContain("SocialProfileHeader");
    expect(pageSource).not.toContain("navItemsForSocialScope");
    expect(pageSource).not.toContain("<PageScaffold");
  });

  it("links directly to the technician activity profile", () => {
    expect(pageSource).toContain('scope = "user"');
    expect(pageSource).toContain("coreReadApi.getTechnicianDetail");
    expect(pageSource).toContain("socialPaths.accountProfile(scope");
    expect(pageSource).toContain("socialAccountUserId");
    expect(pageSource).toContain("socialIdentityId");
    expect(pageSource).not.toContain("getScopedTechnicianDynamicPath");
    expect(pageSource).not.toContain("getTechnicianServiceFallbackPath");
  });

  it("supports multi-select cards, detail navigation, and one floating booking action", () => {
    expect(pageSource).toContain("selectedServiceIds");
    expect(pageSource).toContain("toggleServiceSelection");
    expect(pageSource).toContain('aria-pressed={selected}');
    expect(pageSource).toContain('{selected ? <AppIcon className="h-5 w-5" name="check" /> : null}');
    expect(pageSource).toContain("detailTo={getTechnicianServiceDetailPath(service.id, scope)}");
    expect(pageSource).toContain("MobileBottomActionBar");
    expect(pageSource).toContain("预约已选服务");
    expect(pageSource).toContain("buildTechnicianServiceCheckoutRoute");
    expect(pageSource).toContain("serviceIds: selectedServiceIds");
    expect(pageSource).toContain('date: searchParams.get("date")');
    expect(pageSource).toContain('time: searchParams.get("time")');
    expect(pageSource).not.toContain("预约这个服务");
  });

  it("registers same-portal technician service list routes", () => {
    expect(appSource).toContain('path="/stores/:shopId/technicians/:technicianId/services" element={protect("user", <TechnicianServicesPage scope="user" />)}');
    expect(appSource).toContain('path="/merchant/stores/:shopId/technicians/:technicianId/services" element={protect("merchant", <TechnicianServicesPage scope="merchant" />)}');
    expect(appSource).toContain('path="/technician/stores/:shopId/technicians/:technicianId/services" element={protect("technician", <TechnicianServicesPage scope="technician" />)}');
    expect(appSource).toContain('path="/technician-services/:id" element={protect("user", <TechnicianServiceDetailPage />)}');
  });
});
