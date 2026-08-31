import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthEnvelopeLockAdapter } from "./authEnvelope";
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
  const publicId = `${portal === "technician" ? "s" : portal === "merchant" ? "b" : "u"}0000000009`;
  return {
    authVersion: 7,
    id: 9,
    needoId: "u0000000009",
    primaryPublicId: "u0000000009",
    activeIdentityId: 90,
    activePublicId: publicId,
    username: `${portal}-user`,
    email: `${portal}@needo.local`,
    emailVerifiedAt: "2026-08-27T00:00:00.000Z",
    hasPassword: true,
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
      publicId,
      type: portal === "user" ? "customer" : portal,
      scopeId: 9,
      scopeType: `${portal}_profile`
    },
    identities: [
      {
        id: 90,
        publicId,
        type: portal === "user" ? "customer" : portal,
        scopeId: 9,
        scopeType: `${portal}_profile`
      }
    ],
    identityAvailability: [
      {
        kind:
          portal === "business"
            ? "affiliate"
            : portal === "merchant" || portal === "technician"
              ? portal
              : "customer",
        state: "active",
        identityId: 90,
        applicationId: null,
        rejectionReason: null
      }
    ]
  };
}

describe("remembered portal authorization", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createStorage()
    });
    setAuthEnvelopeLockAdapter({
      request: async (_name, _options, callback) => callback()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores refresh tokens and sessions per frontend identity", async () => {
    const userSession = createSession("user");
    const technicianSession = createSession("technician");

    await rememberPortalAuthorization(userSession, "user-refresh-token");
    await rememberPortalAuthorization(technicianSession, "technician-refresh-token");

    expect(readRememberedPortalRefreshToken("user")).toBe("user-refresh-token");
    expect(readRememberedPortalRefreshToken("technician")).toBe("technician-refresh-token");
    expect(readRememberedPortalSession("user")?.portal).toBe("user");
    expect(readRememberedPortalSession("technician")?.portal).toBe("technician");
    expect(hasRememberedPortalAuthorization("user")).toBe(true);
    expect(hasRememberedPortalAuthorization("technician")).toBe(true);
  });

  it("does not treat a session without a refresh token as restorable authorization", async () => {
    await rememberPortalAuthorization(createSession("merchant"), null);

    expect(readRememberedPortalSession("merchant")).toBeNull();
    expect(readRememberedPortalRefreshToken("merchant")).toBeNull();
    expect(hasRememberedPortalAuthorization("merchant")).toBe(false);
  });

  it("can forget one portal without clearing the others", async () => {
    await rememberPortalAuthorization(createSession("user"), "user-refresh-token");
    await rememberPortalAuthorization(createSession("merchant"), "merchant-refresh-token");

    await forgetRememberedPortalAuthorization("merchant");

    expect(hasRememberedPortalAuthorization("user")).toBe(true);
    expect(hasRememberedPortalAuthorization("merchant")).toBe(false);

    await forgetAllRememberedPortalAuthorizations();

    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });
});
