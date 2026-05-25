import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

export const deviceFingerprintStorageKey = "needo.device.fingerprint";

let cachedDeviceFingerprint: string | null = null;
let deviceFingerprintRequest: Promise<string | null> | null = null;

function normalizeVisitorId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const visitorId = value.trim();

  return visitorId.length > 0 ? visitorId : null;
}

export function getStoredDeviceFingerprint() {
  const stored = normalizeVisitorId(readBrowserStorage(deviceFingerprintStorageKey, { silent: true }));

  if (stored) {
    cachedDeviceFingerprint = stored;
  }

  return stored;
}

export function clearCachedDeviceFingerprint() {
  cachedDeviceFingerprint = null;
  deviceFingerprintRequest = null;
}

export async function getDeviceFingerprint() {
  if (cachedDeviceFingerprint) {
    return cachedDeviceFingerprint;
  }

  const stored = getStoredDeviceFingerprint();

  if (stored) {
    return stored;
  }

  if (deviceFingerprintRequest) {
    return deviceFingerprintRequest;
  }

  deviceFingerprintRequest = (async () => {
    try {
      const agent = await FingerprintJS.load();
      const result = await agent.get();
      const visitorId = normalizeVisitorId(result.visitorId);

      if (!visitorId) {
        return null;
      }

      cachedDeviceFingerprint = visitorId;
      writeBrowserStorage(deviceFingerprintStorageKey, visitorId, { silent: true });

      return visitorId;
    } catch {
      return null;
    } finally {
      deviceFingerprintRequest = null;
    }
  })();

  return deviceFingerprintRequest;
}
