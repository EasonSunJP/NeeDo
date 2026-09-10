// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "./rbac";
import {
  createAnonymousAuthEnvelope,
  createCommittedAuthEnvelope,
  persistedAuthEnvelopeStorageKey,
  readPersistedAuthEnvelope,
  readPersistedAuthEnvelopeSnapshot,
  setAuthEnvelopeLockAdapter,
  type AuthEnvelopeLockAdapter,
  writePersistedAuthEnvelope
} from "./authEnvelope";

const immediateLockAdapter: AuthEnvelopeLockAdapter = {
  request: async (_name, _options, callback) => callback()
};

function session(portal: AuthSession["portal"] = "user"): AuthSession {
  const identity = {
    id: portal === "merchant" ? 17 : 11,
    publicId: portal === "merchant" ? "o0000000017" : "u0000000007",
    scopeId: portal === "merchant" ? 91 : 41,
    scopeType: portal === "merchant" ? "merchant_account" : "customer_profile",
    type: portal === "merchant" ? "merchant_organization" : "customer",
    displayName: portal === "merchant" ? "店铺负责人" : "用户"
  };
  return {
    authVersion: 7,
    id: 7,
    needoId: "u0000000007",
    primaryPublicId: "u0000000007",
    activeIdentityId: identity.id,
    activePublicId: identity.publicId,
    username: "Envelope User",
    email: "envelope@example.com",
    emailVerifiedAt: "2026-08-27T00:00:00.000Z",
    hasPassword: true,
    avatarUrl: null,
    profileDisplayName: "Envelope User",
    portal,
    allowedPortals: [portal],
    loginMethod: "password",
    loggedInAt: "2026-08-31T00:00:00.000Z",
    linkedCustomerId: portal === "user" ? "cus-41" : "",
    linkedTechnicianId: "",
    linkedStoreId: portal === "merchant" ? "store-91" : "",
    roles: [portal === "merchant" ? "merchant_owner" : "customer"],
    permissions: [portal === "merchant" ? "merchant-admin:dashboard:read" : "page:client-app"],
    menus: [portal === "merchant" ? "menu:merchant-app" : "menu:client-app"],
    currentIdentity: identity,
    identities: [identity],
    identityAvailability: [
      {
        kind: portal === "merchant" ? "merchant" : "customer",
        state: "active",
        identityId: identity.id,
        applicationId: null,
        rejectionReason: null
      }
    ]
  };
}

describe("PersistedAuthEnvelopeV8", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAuthEnvelopeLockAdapter(immediateLockAdapter);
  });

  it("parses and preserves the formal profile and identity display names", () => {
    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000108",
      credentialVersion: 108,
      refreshToken: "profile-refresh",
      session: session()
    });
    const withProfile = {
      ...envelope,
      session: {
        ...envelope.session,
        profileDisplayName: "运营者用户端姓名",
        currentIdentity: {
          ...envelope.session.currentIdentity,
          displayName: "东京运营组"
        },
        identities: envelope.session.identities.map((identity) => ({
          ...identity,
          displayName: "东京运营组"
        }))
      }
    };
    window.localStorage.setItem(persistedAuthEnvelopeStorageKey, JSON.stringify(withProfile));

    expect(readPersistedAuthEnvelope()?.session).toMatchObject({
      profileDisplayName: "运营者用户端姓名",
      currentIdentity: { displayName: "东京运营组" }
    });
  });

  it("upgrades an existing V8 session without profile display fields", () => {
    const legacyEnvelope: {
      session: Record<string, unknown> & {
        currentIdentity: Record<string, unknown>;
        identities: Array<Record<string, unknown>>;
      };
    } & Record<string, unknown> = JSON.parse(JSON.stringify(createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000109",
      credentialVersion: 109,
      refreshToken: "legacy-profile-refresh",
      session: session()
    })));
    delete legacyEnvelope.session.profileDisplayName;
    delete legacyEnvelope.session.currentIdentity.displayName;
    legacyEnvelope.session.identities.forEach((identity) => {
      delete identity.displayName;
    });
    window.localStorage.setItem(
      persistedAuthEnvelopeStorageKey,
      JSON.stringify(legacyEnvelope)
    );

    expect(readPersistedAuthEnvelope()?.session).toMatchObject({
      profileDisplayName: null,
      currentIdentity: { displayName: null },
      identities: [expect.objectContaining({ displayName: null })]
    });
  });

  it("ignores every distributed legacy auth key and reads only a strict V8 envelope", async () => {
    window.localStorage.setItem("needo.auth.refresh-token", "legacy-refresh");
    window.sessionStorage.setItem("needo.auth.session", JSON.stringify(session("merchant")));
    window.localStorage.setItem(
      "needo.auth.portal-refresh-token.merchant.v1",
      "legacy-merchant-refresh"
    );

    expect(readPersistedAuthEnvelope()).toBeNull();

    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "v8-refresh",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(envelope, { expectedRaw: null })).toBe(true);
    expect(readPersistedAuthEnvelope()).toEqual(envelope);
  });

  it("persists a coherent limited-compliance session without weakening strict parsing", async () => {
    const limited = {
      ...session(),
      complianceRequirements: ["phone_binding_required" as const],
      compliancePolicyVersionPublicId: "policy-v2",
      complianceEffectiveAt: "2026-09-01T10:00:00.000Z",
      compliancePermittedNextRoutes: ["/api/v1/auth/me"]
    };
    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000009",
      credentialVersion: 9,
      refreshToken: "limited-refresh",
      session: limited
    });
    expect(await writePersistedAuthEnvelope(envelope, { expectedRaw: null })).toBe(true);
    expect(readPersistedAuthEnvelope()?.session).toMatchObject({
      complianceRequirements: ["phone_binding_required"],
      compliancePolicyVersionPublicId: "policy-v2"
    });
  });

  it("performs one atomic setItem and leaves the previous committed envelope byte-identical on failure", async () => {
    const previous = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh-r1",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(previous, { expectedRaw: null })).toBe(true);
    const previousRaw = window.localStorage.getItem(persistedAuthEnvelopeStorageKey);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const next = createCommittedAuthEnvelope({
      ...previous,
      credentialVersion: 9,
      refreshToken: "refresh-r2",
      session: { ...session("merchant"), merchantShopPublicId: "shop0000000012" }
    });

    expect(await writePersistedAuthEnvelope(next, { expectedRaw: previousRaw })).toBe(false);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
    expect(readPersistedAuthEnvelope()).toEqual(previous);
  });

  it("refuses to replace a durable tombstone from a stale committed authority", async () => {
    const previous = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh-r1",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(previous, { expectedRaw: null })).toBe(true);
    const previousRaw = readPersistedAuthEnvelopeSnapshot()?.raw ?? null;
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: previous.authInstanceId,
      credentialVersion: 9
    });
    expect(
      await writePersistedAuthEnvelope(tombstone, {
        terminalAuthInstanceId: previous.authInstanceId
      })
    ).toBe(true);

    const staleCommit = createCommittedAuthEnvelope({
      authInstanceId: previous.authInstanceId,
      credentialVersion: 9,
      refreshToken: "stale-refresh-r2",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(staleCommit, { expectedRaw: previousRaw })).toBe(false);
    expect(readPersistedAuthEnvelope()).toEqual(tombstone);
  });

  it("never persists an access token and rejects unknown envelope fields", async () => {
    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(envelope, { expectedRaw: null })).toBe(true);
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).not.toContain(
      "accessToken"
    );

    window.localStorage.setItem(
      persistedAuthEnvelopeStorageKey,
      JSON.stringify({ ...envelope, accessToken: "must-not-be-authority" })
    );
    expect(readPersistedAuthEnvelope()).toBeNull();
  });

  it("accepts only a complete anonymous tombstone and rejects malformed committed sessions", async () => {
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 9
    });
    expect(await writePersistedAuthEnvelope(tombstone, { expectedRaw: null })).toBe(true);
    expect(readPersistedAuthEnvelope()).toEqual(tombstone);

    const malformed = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 10,
      refreshToken: "refresh",
      session: session()
    });
    window.localStorage.setItem(
      persistedAuthEnvelopeStorageKey,
      JSON.stringify({
        ...malformed,
        session: { ...malformed.session, permissions: ["platform:superuser"], extra: true }
      })
    );
    expect(readPersistedAuthEnvelope()).toBeNull();
  });

  it("fails closed when no Web Locks adapter is available", async () => {
    setAuthEnvelopeLockAdapter(null);
    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh",
      session: session()
    });

    await expect(
      writePersistedAuthEnvelope(envelope, { expectedRaw: null })
    ).resolves.toBe(false);
    expect(readPersistedAuthEnvelope()).toBeNull();
  });

  it.each(["commit-first", "logout-first"] as const)(
    "serializes same-instance commit/logout interleaving with terminal state winning (%s)",
    async (order) => {
      const base = createCommittedAuthEnvelope({
        authInstanceId: "00000000-0000-4000-8000-000000000008",
        credentialVersion: 8,
        refreshToken: "refresh-r1",
        session: session()
      });
      expect(await writePersistedAuthEnvelope(base, { expectedRaw: null })).toBe(true);
      const baseRaw = readPersistedAuthEnvelopeSnapshot()?.raw ?? null;
      const pending: Array<() => Promise<void>> = [];
      setAuthEnvelopeLockAdapter({
        request: (_name, _options, callback) =>
          new Promise((resolve, reject) => {
            pending.push(async () => {
              try {
                resolve(await callback());
              } catch (error) {
                reject(error);
              }
            });
          })
      });
      const next = createCommittedAuthEnvelope({
        ...base,
        credentialVersion: 9,
        refreshToken: "refresh-r2"
      });
      const tombstone = createAnonymousAuthEnvelope({
        authInstanceId: base.authInstanceId,
        credentialVersion: 9
      });
      const committed = writePersistedAuthEnvelope(next, { expectedRaw: baseRaw });
      const loggedOut = writePersistedAuthEnvelope(tombstone, {
        terminalAuthInstanceId: base.authInstanceId
      });

      const indices = order === "commit-first" ? [0, 1] : [1, 0];
      await pending[indices[0]]?.();
      await pending[indices[1]]?.();
      await Promise.all([committed, loggedOut]);

      expect(readPersistedAuthEnvelope()).toMatchObject({
        state: "anonymous",
        authInstanceId: base.authInstanceId
      });
    }
  );

  it("does not let an old logout overwrite a different auth instance", async () => {
    const newer = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000009",
      credentialVersion: 9,
      refreshToken: "new-login-refresh",
      session: session()
    });
    expect(await writePersistedAuthEnvelope(newer, { expectedRaw: null })).toBe(true);
    const oldTombstone = createAnonymousAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 10
    });

    expect(
      await writePersistedAuthEnvelope(oldTombstone, {
        terminalAuthInstanceId: oldTombstone.authInstanceId
      })
    ).toBe(false);
    expect(readPersistedAuthEnvelope()).toEqual(newer);
  });
});
