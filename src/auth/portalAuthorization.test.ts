import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetAllRememberedPortalAuthorizations,
  forgetRememberedPortalAuthorization,
  hasRememberedPortalAuthorization,
  readRememberedPortalRefreshToken,
  readRememberedPortalSession,
  rememberPortalAuthorization
} from "./portalAuthorization";
import type { AuthSession } from "./rbac";

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

function createSession(portal: AuthSession["portal"]): AuthSession {
  return {
    authVersion: 4,
    id: 9,
    username: `${portal}-user`,
    email: `${portal}@needo.local`,
    avatarUrl: null,
    portal,
    allowedPortals: [portal],
    loginMethod: "password",
    loggedInAt: "2026-06-02T00:00:00.000Z",
    linkedCustomerId: portal === "user" ? "cus-9" : "",
    linkedTechnicianId: portal === "technician" ? "tech-9" : "",
    linkedStoreId: portal === "merchant" ? "store-9" : "",
    roles: [portal === "user" ? "customer" : portal],
    permissions: [`page:${portal}-app`],
    menus: [`menu:${portal}-app`],
    currentIdentity: {
      id: 90,
      type: portal === "user" ? "customer" : portal,
      scopeId: 9,
      scopeType: `${portal}_profile`
    },
    identities: [
      {
        id: 90,
        type: portal === "user" ? "customer" : portal,
        scopeId: 9,
        scopeType: `${portal}_profile`
      }
    ]
  };
}

describe("remembered portal authorization", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createStorage()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores refresh tokens and sessions per frontend identity", () => {
    const userSession = createSession("user");
    const technicianSession = createSession("technician");

    rememberPortalAuthorization(userSession, "user-refresh-token");
    rememberPortalAuthorization(technicianSession, "technician-refresh-token");

    expect(readRememberedPortalRefreshToken("user")).toBe("user-refresh-token");
    expect(readRememberedPortalRefreshToken("technician")).toBe("technician-refresh-token");
    expect(readRememberedPortalSession("user")?.portal).toBe("user");
    expect(readRememberedPortalSession("technician")?.portal).toBe("technician");
    expect(hasRememberedPortalAuthorization("user")).toBe(true);
    expect(hasRememberedPortalAuthorization("technician")).toBe(true);
  });

  it("does not treat a session without a refresh token as restorable authorization", () => {
    rememberPortalAuthorization(createSession("merchant"), null);

    expect(readRememberedPortalSession("merchant")?.portal).toBe("merchant");
    expect(readRememberedPortalRefreshToken("merchant")).toBeNull();
    expect(hasRememberedPortalAuthorization("merchant")).toBe(false);
  });

  it("can forget one portal without clearing the others", () => {
    rememberPortalAuthorization(createSession("user"), "user-refresh-token");
    rememberPortalAuthorization(createSession("merchant"), "merchant-refresh-token");

    forgetRememberedPortalAuthorization("merchant");

    expect(hasRememberedPortalAuthorization("user")).toBe(true);
    expect(hasRememberedPortalAuthorization("merchant")).toBe(false);

    forgetAllRememberedPortalAuthorizations();

    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });
});
