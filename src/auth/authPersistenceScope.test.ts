// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthEnvelopeLockName,
  getAuthEnvelopeStorageKey,
  resolveAuthPersistenceScope,
  type AuthPersistenceScope
} from "./authPersistenceScope";

describe("auth persistence scope", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.resetModules();
  });

  it.each([
    ["/", "#/", "user"],
    ["/user.html", "#/", "user"],
    ["/merchant.html", "#/merchant", "merchant"],
    ["/technician.html", "#/technician", "technician"],
    ["/afirieito.html", "#/afirieito", "affiliate"],
    ["/pf-admin.html", "#/admin", "operations-admin"],
    ["/store-admin.html", "#/merchant-admin", "merchant-admin"],
    ["/afirieito-admin.html", "#/NDA-admin", "affiliate-admin"],
    ["/admin", "", "operations-admin"],
    ["/merchant-admin/dashboard", "", "merchant-admin"],
    ["/", "#/login/admin", "operations-admin"],
    ["/", "#/login/merchant-admin", "merchant-admin"],
    ["/", "#/login/afirieito-admin", "affiliate-admin"],
    ["/", "#/business", "affiliate"]
  ] as const)(
    "resolves %s %s to the %s credential boundary",
    (pathname, hash, expected) => {
      expect(resolveAuthPersistenceScope({ pathname, hash })).toBe(expected);
    }
  );

  it("gives every portal a distinct envelope and lock", () => {
    const scopes: AuthPersistenceScope[] = [
      "user",
      "merchant",
      "technician",
      "affiliate",
      "operations-admin",
      "merchant-admin",
      "affiliate-admin"
    ];

    expect(new Set(scopes.map(getAuthEnvelopeStorageKey)).size).toBe(scopes.length);
    expect(new Set(scopes.map(getAuthEnvelopeLockName)).size).toBe(scopes.length);
  });

  it("binds the persisted auth envelope to the loaded portal surface", async () => {
    window.history.replaceState({}, "", "/pf-admin.html#/admin");
    vi.resetModules();

    const { persistedAuthEnvelopeStorageKey } = await import("./authEnvelope");

    expect(persistedAuthEnvelopeStorageKey).toBe(
      getAuthEnvelopeStorageKey("operations-admin")
    );
  });
});
