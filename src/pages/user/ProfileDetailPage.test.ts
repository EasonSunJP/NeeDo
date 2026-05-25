import { describe, expect, it } from "vitest";
import profileDetailSource from "./ProfileDetailPage.tsx?raw";

describe("ProfileDetailPage technician API profile", () => {
  it("lands numeric technician profiles on a dynamic-style page", () => {
    expect(profileDetailSource).toContain('title="技师动态"');
    expect(profileDetailSource).toContain("公开动态");
    expect(profileDetailSource).toContain("query.data.services.map");
  });
});
