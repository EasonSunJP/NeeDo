import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createPortalApiProxyConfig,
  createLegacyAuthProxyConfig,
  createNeedoApiProxyConfig,
  rewritePortalEntryRequest,
  resolveNeedoManualChunk,
  resolveLegacyAuthProxyTarget,
  resolveNeedoApiProxyTarget
} from "./vite.config";

describe("Needo API proxy config", () => {
  it("proxies operations and merchant API prefixes to different listeners", () => {
    const proxy = createPortalApiProxyConfig(
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002"
    );

    expect(proxy["/ops-api/v1"]).toMatchObject({ target: "http://127.0.0.1:3001" });
    expect(proxy["/merchant-api/v1"]).toMatchObject({ target: "http://127.0.0.1:3002" });
    expect(proxy["/ops-api/v1"].rewrite?.("/ops-api/v1/health")).toBe("/api/v1/health");
    expect(proxy["/merchant-api/v1"].rewrite?.("/merchant-api/v1/health")).toBe(
      "/api/v1/health"
    );
  });

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

  it("adds dev and preview proxies for formal API and media requests", () => {
    expect(createNeedoApiProxyConfig("http://127.0.0.1:3000")).toEqual({
      "/api/v1": {
        changeOrigin: true,
        secure: false,
        target: "http://127.0.0.1:3000"
      },
      "/media": {
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

describe("Needo production chunks", () => {
  it("keeps identity-application translations outside the base i18n budget", () => {
    expect(resolveNeedoManualChunk("/workspace/src/features/identity-applications/i18n.ts"))
      .toBe("identity-applications-i18n");
    expect(resolveNeedoManualChunk("/workspace/src/i18n/translations.ts")).toBe("i18n");
  });

  it("keeps service-search translations outside the base i18n budget", () => {
    expect(resolveNeedoManualChunk("/workspace/src/features/service-search/i18n.ts"))
      .toBe("service-search-i18n");
    expect(resolveNeedoManualChunk("/workspace/src/i18n/translations.ts")).toBe("i18n");
  });

  it("keeps pricing-mode translations outside the base i18n budget", () => {
    expect(resolveNeedoManualChunk("/workspace/src/features/pricing-mode/i18n.ts"))
      .toBe("pricing-mode-i18n");
    expect(resolveNeedoManualChunk("/workspace/src/i18n/translations.ts")).toBe("i18n");
  });
});

describe("NeeDo portal entry fallback", () => {
  it("loads the admin bootstrap from the origin root after a nested route rewrite", () => {
    const adminEntry = readFileSync(new URL("./pf-admin.html", import.meta.url), "utf8");

    expect(adminEntry).toContain('<script type="module" src="/portal-entry.js"></script>');
  });

  it("does not rewrite JavaScript requests for an admin route to an HTML entry", () => {
    const request = {
      headers: {
        accept: "*/*",
        "sec-fetch-dest": "script"
      },
      url: "/admin"
    };
    let nextCalled = false;

    rewritePortalEntryRequest(request, {}, () => {
      nextCalled = true;
    });

    expect(request.url).toBe("/admin");
    expect(nextCalled).toBe(true);
  });

  it("keeps rewriting real document navigation to the matching portal entry", () => {
    const request = {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "sec-fetch-dest": "document"
      },
      url: "/admin/technicians?status=active"
    };

    rewritePortalEntryRequest(request, {}, () => undefined);

    expect(request.url).toBe("/pf-admin.html?status=active");
  });
});
