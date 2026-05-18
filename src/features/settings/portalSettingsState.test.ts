import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPortalSettingsState, persistPortalSettingsState, type TechnicianPortalSettingsState } from "./portalSettingsState";

function makeTechnicianSettings(overrides: Partial<TechnicianPortalSettingsState> = {}): TechnicianPortalSettingsState {
  return {
    message: true,
    system: true,
    booking: true,
    marketing: false,
    sound: true,
    autoAccept: false,
    shareLocation: true,
    breakReminder: true,
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portal settings persistence", () => {
  it("writes technician settings to localStorage when storage is available", () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    const getItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { setItem, removeItem, getItem }
    });

    const value = makeTechnicianSettings({ shareLocation: false });
    persistPortalSettingsState("technician", value);

    expect(setItem).toHaveBeenCalledWith("needo.settings.portal.technician.v1", JSON.stringify(value));
  });

  it("swallows storage write failures so the page does not crash", () => {
    const setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    const removeItem = vi.fn();
    const getItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { setItem, removeItem, getItem }
    });

    expect(() => persistPortalSettingsState("technician", makeTechnicianSettings({ shareLocation: false }))).not.toThrow();
  });

  it("ignores storage removal failures in restricted browser contexts", () => {
    const setItem = vi.fn();
    const removeItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    const getItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { setItem, removeItem, getItem }
    });

    expect(() => clearPortalSettingsState("technician")).not.toThrow();
  });
});
