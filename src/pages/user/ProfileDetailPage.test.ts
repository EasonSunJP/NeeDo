import { describe, expect, it } from "vitest";
import profileDetailSource from "./ProfileDetailPage.tsx?raw";

describe("ProfileDetailPage technician routes", () => {
  it("lets technician cards open the unified social profile page", () => {
    expect(profileDetailSource).toContain('entityType === "technician"');
    expect(profileDetailSource).toContain("return <SocialProfilePage />");
    expect(profileDetailSource).not.toContain("TechnicianApiProfilePage");
    expect(profileDetailSource).not.toContain('title="技师动态"');
    expect(profileDetailSource).not.toContain("公开动态");
  });
});
