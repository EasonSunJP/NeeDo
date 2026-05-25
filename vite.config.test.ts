import { describe, expect, it } from "vitest";
import { createNeedoApiProxyConfig, resolveNeedoApiProxyTarget } from "./vite.config";

describe("Needo API proxy config", () => {
  it("defaults local dev API traffic to the formal backend port", () => {
    expect(resolveNeedoApiProxyTarget({})).toBe("http://127.0.0.1:3100");
  });

  it("accepts the same API base URL used by the frontend and strips the API prefix for proxying", () => {
    expect(
      resolveNeedoApiProxyTarget({
        VITE_API_BASE_URL: "http://127.0.0.1:3100/api/v1/"
      })
    ).toBe("http://127.0.0.1:3100");
  });

  it("adds a dev and preview proxy for formal /api/v1 backend requests", () => {
    expect(createNeedoApiProxyConfig("http://127.0.0.1:3100")).toEqual({
      "/api/v1": {
        changeOrigin: true,
        secure: false,
        target: "http://127.0.0.1:3100"
      }
    });
  });
});
