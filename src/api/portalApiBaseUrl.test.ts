import { describe, expect, it } from "vitest";
import { resolvePortalApiBaseUrl } from "./portalApiBaseUrl";

describe("portal API base URL", () => {
  it.each([
    ["operations-admin", "/ops-api/v1"],
    ["merchant-admin", "/merchant-api/v1"],
    ["user", "/api/v1"],
    ["merchant", "/api/v1"],
    ["technician", "/api/v1"],
    ["affiliate", "/api/v1"],
    ["affiliate-admin", "/api/v1"]
  ] as const)("routes %s through %s", (scope, expected) => {
    expect(resolvePortalApiBaseUrl(scope, {})).toBe(expected);
  });

  it("honors service-specific URL overrides without trailing slashes", () => {
    expect(
      resolvePortalApiBaseUrl("operations-admin", {
        VITE_OPS_API_BASE_URL: "https://ops.example.com/api/v1/"
      })
    ).toBe("https://ops.example.com/api/v1");
    expect(
      resolvePortalApiBaseUrl("merchant-admin", {
        VITE_MERCHANT_API_BASE_URL: "https://merchant.example.com/api/v1/"
      })
    ).toBe("https://merchant.example.com/api/v1");
  });
});
