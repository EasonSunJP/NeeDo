import { describe, expect, it } from "vitest";
import {
  resolveSearchOrigin,
  shouldAutoRequestSearchOrigin,
} from "./searchOrigin";

describe("search origin policy", () => {
  it("prefers the selected homepage service location over current device coordinates", () => {
    expect(
      resolveSearchOrigin({
        selectedServiceLocation: {
          coordinates: { lat: 35.6555, lng: 139.7367 },
        },
        deviceLocation: {
          promptStatus: "granted",
          coordinates: { lat: 35.6762, lng: 139.6503 },
        },
      }),
    ).toEqual({
      latitude: 35.6555,
      longitude: 139.7367,
      source: "service_location",
    });
  });

  it("uses already-authorized device coordinates when the selected service location has none", () => {
    expect(
      resolveSearchOrigin({
        selectedServiceLocation: {},
        deviceLocation: {
          promptStatus: "granted",
          coordinates: { lat: 35.6762, lng: 139.6503 },
        },
      }),
    ).toEqual({ latitude: 35.6762, longitude: 139.6503, source: "device" });
  });

  it("returns null and does not automatically reopen a denied prompt", () => {
    const deviceLocation = { promptStatus: "denied" as const };

    expect(
      resolveSearchOrigin({ selectedServiceLocation: {}, deviceLocation }),
    ).toBeNull();
    expect(shouldAutoRequestSearchOrigin(deviceLocation)).toBe(false);
    expect(shouldAutoRequestSearchOrigin({ promptStatus: "unrequested" })).toBe(
      true,
    );
  });
});
