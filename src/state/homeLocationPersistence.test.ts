/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("manual home service area persistence", () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it("keeps a newly selected area across config normalization and a fresh runtime", async () => {
    const layout = await import("./homeLayoutStore");
    const location = { id: "manual-service-area-池袋", label: "池袋", city: "东京", area: "池袋" };
    layout.updateHomeLayoutConfig({ locations: [...layout.getDefaultHomeLayoutConfig().locations, location], selectedLocationId: location.id });
    (await import("./homeLocationStore")).selectHomeLocationManually(location.id);
    vi.resetModules();
    const reloaded = await import("./homeLayoutStore");
    reloaded.updateHomeLayoutConfig({});
    const stored = JSON.parse(localStorage.getItem("needo.home.layout.v1")!);
    expect(stored.selectedLocationId).toBe(location.id);
    expect(stored.locations).toContainEqual(expect.objectContaining(location));
  });

  it("does not replace a saved manual choice with device location when reopening", async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    localStorage.setItem("needo.home.location.preference.v1", JSON.stringify({ promptStatus: "granted", source: "manual", selectedLocationId: "manual-area", updatedAt: 1 }));
    const { syncHomeDeviceLocationForAppOpen } = await import("./homeLocationStore");
    // Do not await a geolocation request: an automatic request itself is the regression.
    void syncHomeDeviceLocationForAppOpen([], "default-area");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("upgrades legacy service modules with their formal fulfillment mode", async () => {
    const initial = await import("./homeLayoutStore");
    const legacyConfig = initial.getDefaultHomeLayoutConfig();
    legacyConfig.serviceModules = legacyConfig.serviceModules.map((moduleConfig) => ({
      ...moduleConfig,
      targetTo: moduleConfig.targetTo.replace("&mode=home", ""),
    }));
    localStorage.setItem("needo.home.layout.v1", JSON.stringify(legacyConfig));

    vi.resetModules();
    const reloaded = await import("./homeLayoutStore");
    reloaded.updateHomeLayoutConfig({});
    const stored = JSON.parse(localStorage.getItem("needo.home.layout.v1")!);

    expect(stored.serviceModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "home-module-massage",
          serviceMode: "home",
          targetTo: expect.stringContaining("mode=home"),
        }),
        expect.objectContaining({
          id: "home-module-cleaning",
          serviceMode: "home",
          targetTo: expect.stringContaining("mode=home"),
        }),
      ]),
    );
  });
});
