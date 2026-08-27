import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "../api/auth";
import {
  fetchGoogleAccountApi,
  type GoogleAccountConnectionStatus,
} from "./googleAccountApi";
import {
  fetchGoogleCalendarApi,
  type GoogleCalendarApiExportResponse,
  type GoogleCalendarConnectionStatus,
} from "./googleCalendarApi";

describe("Google helper APIs in static demo mode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps legacy account binding explicitly unavailable instead of reporting fake success", async () => {
    const status = await fetchGoogleAccountApi<GoogleAccountConnectionStatus>(
      "/api/google-account/status?actorId=needo:user:demo",
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(status).toEqual(
      expect.objectContaining({
        actorId: "needo:user:demo",
        configured: false,
        connected: false,
        ok: true,
      }),
    );
    expect(status.profile).toBeNull();
    expect(status.message).toBe("static_demo.google_unconfigured");
  });

  it("rejects formal Google authentication instead of accepting the static empty fallback", async () => {
    await expect(authApi.initializeGoogleLogin()).rejects.toThrow(
      "error.auth.google_api_unavailable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves calendar status and export results without calling the local helper API", async () => {
    const status = await fetchGoogleCalendarApi<GoogleCalendarConnectionStatus>(
      "/api/google-calendar/status?actorId=needo:merchant:store-1",
    );
    const exported =
      await fetchGoogleCalendarApi<GoogleCalendarApiExportResponse>(
        "/api/google-calendar/export",
        {
          body: JSON.stringify({ events: [{ id: "event-1" }] }),
          method: "POST",
        },
      );

    expect(fetch).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      actorId: "needo:merchant:store-1",
      configured: false,
      connected: false,
      ok: true,
    });
    expect(exported).toMatchObject({
      count: 1,
      ok: true,
    });
  });
});
