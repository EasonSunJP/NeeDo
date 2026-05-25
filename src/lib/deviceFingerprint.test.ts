import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { Agent, GetResult } from "@fingerprintjs/fingerprintjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCachedDeviceFingerprint, getDeviceFingerprint, getStoredDeviceFingerprint } from "./deviceFingerprint";

vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn()
  }
}));

function createStorage() {
  const values = new Map<string, string>();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    get length() {
      return values.size;
    }
  } satisfies Storage;
}

function stubWindow(localStorage: Storage) {
  vi.stubGlobal("window", {
    localStorage
  });
}

function createFingerprintAgent(visitorId: string) {
  const result = {
    visitorId,
    confidence: { score: 1 },
    components: {} as GetResult["components"],
    version: "test"
  } satisfies GetResult;
  const get = vi.fn<Agent["get"]>(async () => result);

  return {
    agent: { get } satisfies Agent,
    get
  };
}

afterEach(() => {
  clearCachedDeviceFingerprint();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("deviceFingerprint", () => {
  it("uses FingerprintJS visitorId as the device fingerprint and persists it", async () => {
    const storage = createStorage();
    const { agent, get } = createFingerprintAgent("visitor-from-fingerprintjs");
    vi.mocked(FingerprintJS.load).mockResolvedValue(agent);
    stubWindow(storage);

    await expect(getDeviceFingerprint()).resolves.toBe("visitor-from-fingerprintjs");

    expect(FingerprintJS.load).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("needo.device.fingerprint", "visitor-from-fingerprintjs");
    expect(getStoredDeviceFingerprint()).toBe("visitor-from-fingerprintjs");
  });

  it("does not create a random fallback when FingerprintJS cannot resolve", async () => {
    const storage = createStorage();
    vi.mocked(FingerprintJS.load).mockRejectedValue(new Error("blocked"));
    stubWindow(storage);

    await expect(getDeviceFingerprint()).resolves.toBeNull();

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(getStoredDeviceFingerprint()).toBeNull();
  });
});
