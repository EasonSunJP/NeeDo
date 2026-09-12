import type { FulfillmentMode } from "../types/domain";

const fulfillmentModesByServiceMode = {
  store: ["store"],
  home: ["home"],
  home_visit: ["home"],
  onsite: ["home"],
  both: ["store", "home"],
  flexible: ["store", "home"]
} as const satisfies Record<string, readonly FulfillmentMode[]>;

export function serviceFulfillmentModes(serviceMode: string): readonly FulfillmentMode[] {
  return Object.hasOwn(fulfillmentModesByServiceMode, serviceMode)
    ? fulfillmentModesByServiceMode[serviceMode as keyof typeof fulfillmentModesByServiceMode]
    : ["store"];
}

export function resolveServiceFulfillmentMode(
  serviceMode: string,
  requestedMode: FulfillmentMode | null = null
): FulfillmentMode {
  if (!Object.hasOwn(fulfillmentModesByServiceMode, serviceMode)) {
    return requestedMode ?? "store";
  }
  const modes = serviceFulfillmentModes(serviceMode);
  return requestedMode && modes.includes(requestedMode) ? requestedMode : modes[0];
}
