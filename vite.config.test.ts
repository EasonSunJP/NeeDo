import { describe, expect, it } from "vitest";
import {
  createLegacyAuthProxyConfig,
  createNeedoApiProxyConfig,
  resolveLegacyAuthProxyTarget,
  resolveNeedoApiProxyTarget
} from "./vite.config";

describe("Needo API proxy config", () => {
  it("defaults local dev API traffic to the formal backend port", () => {
    expect(resolveNeedoApiProxyTarget({})).toBe("http://127.0.0.1:3000");
  });

  it("accepts the same API base URL used by the frontend and strips the API prefix for proxying", () => {
    expect(
      resolveNeedoApiProxyTarget({
        VITE_API_BASE_URL: "http://127.0.0.1:3000/api/v1/"
      })
    ).toBe("http://127.0.0.1:3000");
  });

  it("keeps the default proxy target when the frontend API base is same-origin", () => {
    expect(
      resolveNeedoApiProxyTarget({
        VITE_API_BASE_URL: "/api/v1"
      })
    ).toBe("http://127.0.0.1:3000");
  });

  it("adds a dev and preview proxy for formal /api/v1 backend requests", () => {
    expect(createNeedoApiProxyConfig("http://127.0.0.1:3000")).toEqual({
      "/api/v1": {
        changeOrigin: true,
        secure: false,
        target: "http://127.0.0.1:3000"
      }
    });
  });

  it("keeps legacy auth proxy disabled unless a target is configured", () => {
    expect(resolveLegacyAuthProxyTarget({})).toBeNull();
    expect(createLegacyAuthProxyConfig(null)).toEqual({});
  });

  it("adds a local same-origin proxy for Apifox legacy auth endpoints", () => {
    const target = resolveLegacyAuthProxyTarget({
      VITE_LEGACY_AUTH_PROXY_TARGET: "https://t.dackou.com/"
    });
    const proxy = createLegacyAuthProxyConfig(target);

    expect(target).toBe("https://t.dackou.com");
    expect(proxy["/legacy-auth"]).toMatchObject({
      changeOrigin: true,
      secure: false,
      target: "https://t.dackou.com"
    });
    expect(proxy["/legacy-auth"].rewrite?.("/legacy-auth/captcha?token=abc")).toBe("/captcha?token=abc");
  });
});
