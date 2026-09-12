import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPortalSettingsState,
  persistPortalSettingsState,
  summarizePortalSettingsState,
  type TechnicianPortalSettingsState,
  type UserPortalSettingsState
} from "./portalSettingsState";

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

function settings(values: Partial<UserPortalSettingsState>): UserPortalSettingsState {
  return {
    message: true,
    system: true,
    booking: true,
    marketing: true,
    sound: true,
    ...values
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

describe("summarizePortalSettingsState", () => {
  it("uses notification-specific summaries instead of the store closed status", () => {
    expect(summarizePortalSettingsState(settings({}))).toBe("全部通知已开启");
    expect(summarizePortalSettingsState(settings({ message: false, system: false, booking: false, marketing: false, sound: false }))).toBe("全部通知已关闭");
    expect(summarizePortalSettingsState(settings({ marketing: false }))).toBe("部分通知已开启");
  });
});
