export type ClientPerformanceProfile = "full" | "reduced";

export type ClientPerformanceSignals = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  prefersReducedMotion: boolean;
  userAgent: string;
};

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
};

function readAndroidMajorVersion(userAgent: string) {
  const match = userAgent.match(/Android\s+(\d+)/i);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

export function resolveClientPerformanceProfile(signals: ClientPerformanceSignals): ClientPerformanceProfile {
  const androidMajor = readAndroidMajorVersion(signals.userAgent);

  if (androidMajor === null) {
    return "full";
  }

  const legacyAndroid = androidMajor <= 9;
  const constrainedMemory = typeof signals.deviceMemory === "number" && signals.deviceMemory <= 4;
  const constrainedCpu = typeof signals.hardwareConcurrency === "number" && signals.hardwareConcurrency <= 4;

  return legacyAndroid || constrainedMemory || constrainedCpu || signals.prefersReducedMotion
    ? "reduced"
    : "full";
}

export function getClientPerformanceProfile(): ClientPerformanceProfile {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "full";
  }

  const deviceNavigator = navigator as NavigatorWithDeviceMemory;
  return resolveClientPerformanceProfile({
    deviceMemory: deviceNavigator.deviceMemory,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
    prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    userAgent: deviceNavigator.userAgent
  });
}

export function syncClientPerformanceProfile() {
  const profile = getClientPerformanceProfile();

  if (typeof document !== "undefined") {
    document.documentElement.dataset.needoPerformanceProfile = profile;
    if (document.body) {
      document.body.dataset.needoPerformanceProfile = profile;
    }
  }

  return profile;
}

export function isReducedClientPerformanceProfile() {
  if (typeof document !== "undefined") {
    const profile = document.documentElement.dataset.needoPerformanceProfile;
    if (profile === "full" || profile === "reduced") {
      return profile === "reduced";
    }
  }

  return getClientPerformanceProfile() === "reduced";
}
