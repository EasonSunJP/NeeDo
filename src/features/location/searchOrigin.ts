import type { Coordinates } from "../../lib/location";
import type { HomeLocationPreferenceState } from "../../state/homeLocationStore";

export type SearchOrigin = {
  latitude: number;
  longitude: number;
  source: "service_location" | "device";
};

type SearchOriginInput = {
  selectedServiceLocation?: { coordinates?: Coordinates } | null;
  deviceLocation: Pick<
    HomeLocationPreferenceState,
    "promptStatus" | "coordinates"
  >;
};

function toSearchOrigin(
  coordinates: Coordinates | undefined,
  source: SearchOrigin["source"],
): SearchOrigin | null {
  if (
    !coordinates ||
    !Number.isFinite(coordinates.lat) ||
    !Number.isFinite(coordinates.lng) ||
    coordinates.lat < -90 ||
    coordinates.lat > 90 ||
    coordinates.lng < -180 ||
    coordinates.lng > 180
  ) {
    return null;
  }

  return { latitude: coordinates.lat, longitude: coordinates.lng, source };
}

export function resolveSearchOrigin({
  selectedServiceLocation,
  deviceLocation,
}: SearchOriginInput): SearchOrigin | null {
  const serviceOrigin = toSearchOrigin(
    selectedServiceLocation?.coordinates,
    "service_location",
  );
  if (serviceOrigin) {
    return serviceOrigin;
  }

  return deviceLocation.promptStatus === "granted"
    ? toSearchOrigin(deviceLocation.coordinates, "device")
    : null;
}

export function shouldAutoRequestSearchOrigin(
  deviceLocation: Pick<HomeLocationPreferenceState, "promptStatus">,
): boolean {
  return deviceLocation.promptStatus === "unrequested";
}
