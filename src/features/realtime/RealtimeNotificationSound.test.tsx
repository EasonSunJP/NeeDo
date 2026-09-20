// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isRestoring: false,
    session: { activeIdentityId: 70, id: 7, portal: "user" }
  },
  location: { pathname: "/" },
  onEvent: undefined as ((event: { id: string; payload: unknown; recipientUserId?: number; type: string }) => void) | undefined,
  preferenceListener: undefined as ((value: { sound: boolean }) => void) | undefined,
  realtimeUnsubscribe: vi.fn(),
  settingsUnsubscribe: vi.fn(),
  subscribePortalSettingsState: vi.fn(),
  subscribeRealtimeEvents: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => mocks.auth
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => mocks.location
}));

vi.mock("./api", () => ({
  subscribeRealtimeEvents: mocks.subscribeRealtimeEvents
}));

vi.mock("../settings/portalSettingsState", () => ({
  getStoredPortalSettingsState: () => ({ sound: true }),
  subscribePortalSettingsState: mocks.subscribePortalSettingsState
}));

import {
  RealtimeNotificationSound,
  createBrowserNotificationSound
} from "./RealtimeNotificationSoundProvider";

let container: HTMLDivElement;
let root: Root;
let rootUnmounted: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  mocks.onEvent = undefined;
  mocks.location.pathname = "/";
  mocks.preferenceListener = undefined;
  mocks.realtimeUnsubscribe.mockReset();
  mocks.settingsUnsubscribe.mockReset();
  mocks.subscribeRealtimeEvents.mockReset().mockImplementation((options: { onEvent: typeof mocks.onEvent }) => {
    mocks.onEvent = options.onEvent;
    return mocks.realtimeUnsubscribe;
  });
  mocks.subscribePortalSettingsState.mockReset().mockImplementation((
    _portal: string,
    listener: typeof mocks.preferenceListener
  ) => {
    mocks.preferenceListener = listener;
    return mocks.settingsUnsubscribe;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rootUnmounted = false;
});

afterEach(async () => {
  if (!rootUnmounted) {
    await act(async () => root.unmount());
  }
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser notification sound", () => {
  it("does not subscribe to protected realtime events on a login route", async () => {
    mocks.location.pathname = "/login/user";
    await act(async () => root.render(<RealtimeNotificationSound />));

    expect(mocks.subscribeRealtimeEvents).not.toHaveBeenCalled();
  });

  it("silently unlocks, resets and plays the same audio element", async () => {
    const audio = {
      currentTime: 4,
      muted: false,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      preload: ""
    };
    const sound = createBrowserNotificationSound(audio);

    await sound.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.muted).toBe(false);
    expect(audio.currentTime).toBe(0);

    await sound.play();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(0);
  });

  it("swallows browser playback rejection", async () => {
    const audio = {
      currentTime: 0,
      muted: false,
      pause: vi.fn(),
      play: vi.fn(async () => {
        throw new Error("blocked");
      }),
      preload: ""
    };
    const sound = createBrowserNotificationSound(audio);

    await expect(sound.unlock()).resolves.toBeUndefined();
    await expect(sound.play()).resolves.toBeUndefined();
  });
});

describe("RealtimeNotificationSound", () => {
  it("reuses the shared subscription and plays one coalesced incoming sound", async () => {
    const play = vi.fn(async () => undefined);
    vi.stubGlobal("Audio", function AudioMock() {
      return {
      currentTime: 0,
      muted: false,
      pause: vi.fn(),
      play,
      preload: ""
      };
    });
    await act(async () => root.render(<RealtimeNotificationSound />));

    await act(async () => {
      mocks.onEvent?.({
        id: "evt-message",
        payload: { senderUserId: 8 },
        recipientUserId: 7,
        type: "message.created"
      });
      mocks.onEvent?.({
        id: "evt-order",
        payload: { actorUserId: 8, payload: { toStatus: "cancelled" }, recipientUserId: 7 },
        recipientUserId: 7,
        type: "notification.order_status"
      });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mocks.subscribeRealtimeEvents).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("reacts to the existing portal sound preference without reconnecting SSE", async () => {
    const play = vi.fn(async () => undefined);
    vi.stubGlobal("Audio", function AudioMock() {
      return {
      currentTime: 0,
      muted: false,
      pause: vi.fn(),
      play,
      preload: ""
      };
    });
    await act(async () => root.render(<RealtimeNotificationSound />));
    await act(async () => mocks.preferenceListener?.({ sound: false }));
    await act(async () => {
      mocks.onEvent?.({
        id: "evt-muted",
        payload: { senderUserId: 8 },
        recipientUserId: 7,
        type: "message.created"
      });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(play).not.toHaveBeenCalled();
    expect(mocks.subscribeRealtimeEvents).toHaveBeenCalledTimes(1);
  });

  it("cleans up realtime, settings and audio resources on unmount", async () => {
    const pause = vi.fn();
    vi.stubGlobal("Audio", function AudioMock() {
      return {
      currentTime: 0,
      muted: false,
      pause,
      play: vi.fn(async () => undefined),
      preload: ""
      };
    });
    await act(async () => root.render(<RealtimeNotificationSound />));

    await act(async () => root.unmount());
    rootUnmounted = true;

    expect(mocks.realtimeUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.settingsUnsubscribe).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
