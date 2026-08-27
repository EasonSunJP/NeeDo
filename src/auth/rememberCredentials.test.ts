// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import * as rememberedCredentialsModule from "./rememberCredentials";

describe("legacy remembered credentials cleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exposes only purge cleanup and removes every legacy credential key without touching unrelated storage", () => {
    window.localStorage.setItem(
      "needo.auth.remember-credentials.admin.admin",
      JSON.stringify({ account: "admin@example.com", enabled: true, password: "plain-admin-password" })
    );
    window.localStorage.setItem(
      "needo.auth.remember-credentials.admin.merchant-admin",
      JSON.stringify({ account: "merchant@example.com", enabled: true, password: "plain-merchant-password" })
    );
    window.localStorage.setItem("needo.auth.remember-credentials.retired-scope", "legacy-secret");
    window.localStorage.setItem("needo.auth.portal", "admin");
    window.localStorage.setItem("needo.admin.theme", "classic-white-black");

    const rememberedCredentials = rememberedCredentialsModule as unknown as Record<string, unknown>;
    const purge = rememberedCredentials.purgeLegacyRememberedCredentials;

    expect(purge).toBeTypeOf("function");
    expect(rememberedCredentials.readRememberedCredentials).toBeUndefined();
    expect(rememberedCredentials.writeRememberedCredentials).toBeUndefined();

    if (typeof purge !== "function") {
      return;
    }

    purge();

    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("needo.auth.remember-credentials."))).toEqual([]);
    expect(window.localStorage.getItem("needo.auth.portal")).toBe("admin");
    expect(window.localStorage.getItem("needo.admin.theme")).toBe("classic-white-black");
  });
});
