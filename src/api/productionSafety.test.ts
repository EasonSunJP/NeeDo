import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig, {
  resolveLegacyAuthProxyTarget,
  shouldIncludeStaticDemoRuntime
} from "../../vite.config";
import { isStaticDemoMode } from "./staticDemoMode";
import httpClientSource from "./httpClient.ts?raw";
import mainSource from "../main.tsx?raw";
import packageJsonSource from "../../package.json?raw";
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
    expect(httpClientSource).not.toMatch(/from\s+["']\.\/staticDemo["']/);
    expect(mainSource).not.toMatch(/from\s+["']\.\/api\/staticDemo["']/);
    expect(httpClientSource).toContain("resolveLoadedStaticDemoRequest");
  });

  it("does not create a legacy auth proxy for the production target", () => {
    expect(
      resolveLegacyAuthProxyTarget({
        NEEDO_BUILD_TARGET: "production",
        VITE_LEGACY_AUTH_PROXY_TARGET: "https://legacy.example.com"
      })
    ).toBeNull();
  });

  it("omits the static demo runtime from a production artifact", () => {
    expect(
      shouldIncludeStaticDemoRuntime(
        { NEEDO_BUILD_TARGET: "production" },
        "build",
        "production"
      )
    ).toBe(false);
    expect(
      shouldIncludeStaticDemoRuntime(
        { NEEDO_BUILD_TARGET: "static-demo" },
        "build",
        "production"
      )
    ).toBe(true);
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

  it("keeps isolated git worktrees outside the root Vitest suite", () => {
    const createConfig = viteConfig as unknown as (config: {
      command: "serve";
      mode: string;
    }) => { test?: { exclude?: string[] } };
    const config = createConfig({ command: "serve", mode: "test" });

    expect(config.test?.exclude).toEqual(
      expect.arrayContaining([".worktrees/**", "worktrees/**"])
    );
  });

  it("builds the formal release without loading a local production env file", () => {
    const packageJson = JSON.parse(packageJsonSource) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["verify:production-build"]).toContain(
      "npm run build -- --mode formal"
    );
  });
});
