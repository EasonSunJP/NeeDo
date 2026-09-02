import { describe, expect, it } from "vitest";
import profileDetailSource from "./ProfileDetailPage.tsx?raw";

describe("ProfileDetailPage technician routes", () => {
  it("selects the formal card only for the explicit technician card view", () => {
    expect(profileDetailSource).toContain('entityType === "technician"');
    expect(profileDetailSource).toContain('searchParams.get("view") === "card"');
    expect(profileDetailSource).toContain("<TechnicianInfoCardRoutePage id={apiId} />");
    expect(profileDetailSource).toContain("return <SocialProfilePage />");
    expect(profileDetailSource).not.toContain("TechnicianApiProfilePage");
    expect(profileDetailSource).not.toContain('title="技师动态"');
    expect(profileDetailSource).not.toContain("公开动态");
  });
});
