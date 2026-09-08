// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePublicPlatformSettings, platformSettingsApi } from "./api";
import { PlatformSettingsProvider, usePlatformSettings } from "./PlatformSettingsProvider";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

const validSettings = {
  version: 3,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  loginMethods: { password: true as const, google: true },
  loginLogo: null,
  requestButton: null,
  paymentMethods: ["cash", "ndp"] as const
};

describe("public platform settings", () => {
  let root: Root | undefined;
  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    vi.restoreAllMocks();
  });

  it("strictly parses the active public projection", () => {
    expect(parsePublicPlatformSettings(validSettings)).toEqual(validSettings);
    expect(() => parsePublicPlatformSettings({ ...validSettings, secret: "must-not-leak" })).toThrow("error.api");
  });

  it("fails closed for public capabilities when loading fails", async () => {
    vi.spyOn(platformSettingsApi, "getPublic").mockRejectedValueOnce(new Error("offline"));
    const values: ReturnType<typeof usePlatformSettings>[] = [];
    function Probe() {
      values.push(usePlatformSettings());
      return null;
    }
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(PlatformSettingsProvider, null, createElement(Probe)));
    });
    expect(values.at(-1)).toMatchObject({
      status: "error",
      settings: {
        siteEnabled: true,
        selfRegistrationEnabled: false,
        loginMethods: { password: true, google: false },
        paymentMethods: []
      }
    });
  });
});
