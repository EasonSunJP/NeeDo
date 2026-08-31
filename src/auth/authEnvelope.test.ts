// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "./rbac";
import {
  createAnonymousAuthEnvelope,
  createCommittedAuthEnvelope,
  persistedAuthEnvelopeStorageKey,
  readPersistedAuthEnvelope,
  writePersistedAuthEnvelope
} from "./authEnvelope";

function session(portal: AuthSession["portal"] = "user"): AuthSession {
  const identity = {
    id: portal === "merchant" ? 17 : 11,
    publicId: portal === "merchant" ? "o0000000017" : "u0000000007",
    scopeId: portal === "merchant" ? 91 : 41,
    scopeType: portal === "merchant" ? "merchant_account" : "customer_profile",
    type: portal === "merchant" ? "merchant_organization" : "customer"
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
  });

  it("ignores every distributed legacy auth key and reads only a strict V8 envelope", () => {
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
    expect(writePersistedAuthEnvelope(envelope)).toBe(true);
    expect(readPersistedAuthEnvelope()).toEqual(envelope);
  });

  it("performs one atomic setItem and leaves the previous committed envelope byte-identical on failure", () => {
    const previous = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh-r1",
      session: session()
    });
    expect(writePersistedAuthEnvelope(previous)).toBe(true);
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

    expect(writePersistedAuthEnvelope(next)).toBe(false);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
    expect(readPersistedAuthEnvelope()).toEqual(previous);
  });

  it("refuses to replace a durable tombstone from a stale committed authority", () => {
    const previous = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh-r1",
      session: session()
    });
    expect(writePersistedAuthEnvelope(previous)).toBe(true);
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: previous.authInstanceId,
      credentialVersion: 9
    });
    expect(writePersistedAuthEnvelope(tombstone)).toBe(true);

    const staleCommit = createCommittedAuthEnvelope({
      authInstanceId: previous.authInstanceId,
      credentialVersion: 9,
      refreshToken: "stale-refresh-r2",
      session: session()
    });
    expect(writePersistedAuthEnvelope(staleCommit, { expectedCurrent: previous })).toBe(false);
    expect(readPersistedAuthEnvelope()).toEqual(tombstone);
  });

  it("never persists an access token and rejects unknown envelope fields", () => {
    const envelope = createCommittedAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 8,
      refreshToken: "refresh",
      session: session()
    });
    expect(writePersistedAuthEnvelope(envelope)).toBe(true);
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).not.toContain(
      "accessToken"
    );

    window.localStorage.setItem(
      persistedAuthEnvelopeStorageKey,
      JSON.stringify({ ...envelope, accessToken: "must-not-be-authority" })
    );
    expect(readPersistedAuthEnvelope()).toBeNull();
  });

  it("accepts only a complete anonymous tombstone and rejects malformed committed sessions", () => {
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000008",
      credentialVersion: 9
    });
    expect(writePersistedAuthEnvelope(tombstone)).toBe(true);
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
});
