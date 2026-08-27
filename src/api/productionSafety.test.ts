import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig, {
  resolveLegacyAuthProxyTarget
} from "../../vite.config";
import authProviderSource from "../auth/AuthProvider.tsx?raw";
import httpClientSource from "./httpClient.ts?raw";
import loginPageSource from "../pages/auth/LoginPage.tsx?raw";
import mainSource from "../main.tsx?raw";
import packageJsonSource from "../../package.json?raw";
import rbacSource from "../auth/rbac.ts?raw";
import viteConfigSource from "../../vite.config.ts?raw";

describe("frontend production safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has no static demo or passwordless frontend runtime", () => {
    const productionSources = [
      authProviderSource,
      httpClientSource,
      loginPageSource,
      mainSource,
      rbacSource,
      viteConfigSource
    ].join("\n");

    expect(productionSources).not.toMatch(/staticDemo|STATIC_DEMO/);
    expect(productionSources).not.toMatch(/frontend-bypass|FRONTEND_AUTH_BYPASS/);
  });

  it("does not create a legacy auth proxy for the production target", () => {
    expect(
      resolveLegacyAuthProxyTarget({
        NEEDO_BUILD_TARGET: "production",
        VITE_LEGACY_AUTH_PROXY_TARGET: "https://legacy.example.com"
      })
    ).toBeNull();
  });

  it("exposes only formal development and build scripts", () => {
    const packageJson = JSON.parse(packageJsonSource) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:static"]).toBeUndefined();
    expect(packageJson.scripts["build:static"]).toBeUndefined();
    expect(packageJson.scripts["dev:legacy"]).toBeUndefined();
    expect(packageJson.scripts["dev:backend"]).toBeUndefined();
    expect(packageJson.scripts["dev:all"]).toBeUndefined();
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
