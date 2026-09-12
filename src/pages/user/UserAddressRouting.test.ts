import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import centerSource from "./UserCenterPage.tsx?raw";

describe("user address routing", () => {
  it("routes the personal-center address entry to the dedicated protected page", () => {
    expect(centerSource).toContain('to: "/me/addresses"');
    expect(centerSource).not.toContain('to: "/checkout/svc-clean-1"');
    expect(appSource).toContain('path="/me/addresses"');
    expect(appSource).toContain("<UserAddressesPage />");
  });
});
