import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig, { resolveLegacyAuthProxyTarget } from "../../vite.config";
import { isStaticDemoMode } from "./staticDemo";
import {
  isFrontendAuthBypassEnabled,
  requiresFormalFrontendLogin
} from "../pages/auth/LoginPage";

describe("frontend production safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables the passwordless frontend bypass in production", () => {
    const productionEnv = {
      PROD: true,
      VITE_NEEDO_FRONTEND_AUTH_BYPASS: "true"
    } as Parameters<typeof isFrontendAuthBypassEnabled>[0] & { PROD: boolean };

    expect(isFrontendAuthBypassEnabled(productionEnv)).toBe(false);
  });

  it("requires formal login for every frontend portal in production", () => {
    const resolveFormalLogin = requiresFormalFrontendLogin as (
      portal: "user",
      redirectPath: string | null,
      isProduction: boolean
    ) => boolean;

    expect(resolveFormalLogin("user", null, true)).toBe(true);
  });

  it("does not install the static demo runtime in a normal production build", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");

    expect(isStaticDemoMode()).toBe(false);
  });

  it("does not create a legacy auth proxy for the production target", () => {
    expect(
      resolveLegacyAuthProxyTarget({
        NEEDO_BUILD_TARGET: "production",
        VITE_LEGACY_AUTH_PROXY_TARGET: "https://legacy.example.com"
      })
    ).toBeNull();
  });

  it("rejects unsafe flags in a normal production build", () => {
    vi.stubEnv("NEEDO_BUILD_TARGET", "production");
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");
    const createConfig = viteConfig as unknown as (config: {
      command: "build";
      mode: string;
    }) => unknown;

    expect(() => createConfig({ command: "build", mode: "production" })).toThrow(
      "VITE_NEEDO_STATIC_DEMO"
    );
  });
});
