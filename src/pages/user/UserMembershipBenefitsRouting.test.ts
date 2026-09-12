import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import centerSource from "./UserCenterPage.tsx?raw";

describe("user membership benefits routing", () => {
  it("routes the personal-center entry to a dedicated protected fullscreen page", () => {
    expect(centerSource).toContain("<CurrentMembershipBenefits");
    expect(appSource).toContain('path="/me/benefits"');
    expect(appSource).toContain("<CurrentMembershipBenefitsPage />");
  });
});
