import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import pageSource from "./TechnicianServicesPage.tsx?raw";

describe("TechnicianServicesPage social header", () => {
  it("keeps the top profile area aligned with the technician dynamic page", () => {
    expect(pageSource).toContain("SocialProfileTopBar");
    expect(pageSource).toContain("SocialProfileHeader");
    expect(pageSource).toContain("navItemsForSocialScope");
    expect(pageSource).toContain("buildTechnicianServiceSocialProfile");
    expect(pageSource).toContain('scope = "user"');
    expect(pageSource).toContain("getActorForScope(scope)");
    expect(pageSource).toContain("navItems={navItemsForSocialScope(scope)}");
    expect(pageSource).toContain("scope={scope}");
    expect(pageSource).toContain('getScopedProfileDetailPath(scope, "technician", technician.id)');
    expect(pageSource).toContain("getTechnicianServiceFallbackPath(scope)");
    expect(pageSource).toContain('scope === "user" ? (');
    expect(pageSource).toContain("profileKey({ entityType: \"technician\", id: technician.id })");
    expect(pageSource).toContain('title="服务内容"');
    expect(pageSource).toContain("查看技师动态");
    expect(pageSource).not.toContain('navItemsForSocialScope("user")');
    expect(pageSource).not.toContain('scope="user"');
    expect(pageSource).not.toContain("`/profiles/technician/${technician.id}`");
    expect(pageSource).not.toContain('<AppTopBar title="技师服务" />');
  });

  it("registers same-portal technician service list routes", () => {
    expect(appSource).toContain('path="/stores/:shopId/technicians/:technicianId/services" element={protect("user", <TechnicianServicesPage scope="user" />)}');
    expect(appSource).toContain('path="/merchant/stores/:shopId/technicians/:technicianId/services" element={protect("merchant", <TechnicianServicesPage scope="merchant" />)}');
    expect(appSource).toContain('path="/technician/stores/:shopId/technicians/:technicianId/services" element={protect("technician", <TechnicianServicesPage scope="technician" />)}');
  });
});
