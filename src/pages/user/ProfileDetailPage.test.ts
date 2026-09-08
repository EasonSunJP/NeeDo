import { describe, expect, it } from "vitest";
import profileDetailSource from "./ProfileDetailPage.tsx?raw";

describe("ProfileDetailPage technician routes", () => {
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
});
