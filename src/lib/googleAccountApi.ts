export const googleAccountIconSrc = "/icons/google-g-logo-2026.png";

export type GoogleAccountScope = "user" | "technician" | "merchant" | "business" | "admin";

export type GoogleAccountProfile = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type GoogleAccountConnectionStatus = {
  ok: boolean;
  actorId: string;
  configured: boolean;
  connected: boolean;
  message: string;
  redirectUri?: string;
  scopes?: string[];
  profile?: GoogleAccountProfile | null;
};

export type GoogleAccountAuthUrlResponse = GoogleAccountConnectionStatus & {
  authUrl: string;
};

function getGoogleAccountApiCandidates(path: string) {
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

export async function fetchGoogleAccountApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown = null;

  for (const url of getGoogleAccountApiCandidates(path)) {
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
        throw new Error(payload?.message || `Google Account API returned ${response.status}`);
      }

      return payload as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Google Account API is unavailable");
}

export function getGoogleAccountActorId(
  scope: GoogleAccountScope,
  customer?: { id?: string },
  technician?: { id?: string },
  store?: { id?: string }
) {
  const id = scope === "merchant" ? store?.id : scope === "technician" ? technician?.id : customer?.id;

  return `needo:${scope}:${id ?? "demo"}`;
}
