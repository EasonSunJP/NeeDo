import { describe, expect, it } from "vitest";
import authProviderSource from "./AuthProvider.tsx?raw";

describe("AuthProvider legacy login bridge", () => {
  it("uses the legacy login me payload without forcing a follow-up /auth/me request", () => {
    expect(authProviderSource).toContain("const loginPayload = await authApi.login");
    expect(authProviderSource).toContain('completeAuthenticatedSession(portal, "password", loginPayload.me)');
  });

  it("persists the completed session before handing off to a portal entry page", () => {
    expect(authProviderSource).toContain("readStoredAuthSession");
    expect(authProviderSource).toContain("JSON.stringify(nextSession)");
  });

  it("ignores older stored sessions so a previous user-only legacy session cannot block portal switching", () => {
    expect(authProviderSource).toContain("session.authVersion === 4");
  });
});
