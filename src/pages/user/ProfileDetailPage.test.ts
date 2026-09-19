import { describe, expect, it } from "vitest";
import profileDetailSource from "./ProfileDetailPage.tsx?raw";

describe("ProfileDetailPage technician routes", () => {
  it("reuses the lazy social route wrapper instead of statically importing the social profile", () => {
    expect(profileDetailSource).not.toContain(
      'from "../../features/social/pages/SocialProfilePage"'
    );
    expect(profileDetailSource).toContain(
      'from "../../features/social/route-pages"'
    );
    expect(profileDetailSource).toContain("<SocialAccountProfilePage />");
  });

  it("renders the formal technician information page instead of the social profile", () => {
    const technicianRouteSource = profileDetailSource.slice(
      profileDetailSource.indexOf('if (entityType === "technician")'),
      profileDetailSource.indexOf("const apiId")
    );

    expect(technicianRouteSource).toContain("TechnicianApiProfilePage");
    expect(technicianRouteSource).not.toContain("SocialProfilePage");
    expect(profileDetailSource).toContain("coreReadApi.getTechnicianDetail");
    expect(profileDetailSource).toContain("TechnicianProfileInfoView");
  });

  it("does not reuse a public persistent cache for relationship-scoped customer profiles", () => {
    const customerPageSource = profileDetailSource.slice(
      profileDetailSource.indexOf("function CustomerApiProfilePage"),
      profileDetailSource.indexOf("function ShopApiProfilePage")
    );

    expect(customerPageSource).not.toContain("core:customer-profile:");
    expect(customerPageSource).toContain("coreReadApi.getCustomerProfile(id)");
  });
});
