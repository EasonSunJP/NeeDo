export const googleCalendarIconSrc = "/icons/google-calendar-2026.png";

export type GoogleCalendarScope = "user" | "technician" | "merchant";

export type GoogleCalendarConnectionStatus = {
  ok: boolean;
  actorId: string;
  configured: boolean;
  connected: boolean;
  message: string;
  redirectUri?: string;
  scopes?: string[];
};

export type GoogleCalendarAuthUrlResponse = GoogleCalendarConnectionStatus & {
  authUrl: string;
};

export type GoogleCalendarApiExportResponse = {
  ok: boolean;
  count: number;
  message?: string;
};

export type GoogleCalendarApiImportResponse<EventShape> = {
  ok: boolean;
  count: number;
  message?: string;
  events: EventShape[];
};

export type GoogleCalendarSyncActionResult = {
  count: number;
  message: string;
  status?: GoogleCalendarConnectionStatus;
};

function getGoogleCalendarApiCandidates(path: string) {
  if (typeof window === "undefined") {
    return [path];
  }

  const candidates = [path];
  const { protocol, hostname } = window.location;
  const hosts = Array.from(new Set([hostname, "localhost", "127.0.0.1"].filter(Boolean)));

  hosts.forEach((host) => {
    candidates.push(`${protocol}//${host}:4176${path}`);
  });

  return Array.from(new Set(candidates));
}

export async function fetchGoogleCalendarApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown = null;

  for (const url of getGoogleCalendarApiCandidates(path)) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {})
        }
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (!contentType.includes("application/json")) {
        lastError = new Error(`${url} did not return JSON`);
        continue;
      }

      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || `Google Calendar API returned ${response.status}`);
      }

      return payload as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Google Calendar API is unavailable");
}

export function getGoogleCalendarActorId(
  scope: GoogleCalendarScope,
  customer?: { id?: string },
  technician?: { id?: string },
  store?: { id?: string }
) {
  const id = scope === "merchant" ? store?.id : scope === "technician" ? technician?.id : customer?.id;

  return `needo:${scope}:${id ?? "demo"}`;
}
