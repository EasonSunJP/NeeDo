import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleAccountApi, type GoogleAccountConnectionStatus } from "./googleAccountApi";
import {
  fetchGoogleCalendarApi,
  type GoogleCalendarApiExportResponse,
  type GoogleCalendarConnectionStatus
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

  it("serves account binding status without calling the local helper API", async () => {
    const status = await fetchGoogleAccountApi<GoogleAccountConnectionStatus>("/api/google-account/status?actorId=needo:user:demo");

    expect(fetch).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      actorId: "needo:user:demo",
      configured: false,
      connected: false,
      ok: true
    });
  });

  it("serves calendar status and export results without calling the local helper API", async () => {
    const status = await fetchGoogleCalendarApi<GoogleCalendarConnectionStatus>("/api/google-calendar/status?actorId=needo:merchant:store-1");
    const exported = await fetchGoogleCalendarApi<GoogleCalendarApiExportResponse>("/api/google-calendar/export", {
      body: JSON.stringify({ events: [{ id: "event-1" }] }),
      method: "POST"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      actorId: "needo:merchant:store-1",
      configured: false,
      connected: false,
      ok: true
    });
    expect(exported).toMatchObject({
      count: 1,
      ok: true
    });
  });
});
