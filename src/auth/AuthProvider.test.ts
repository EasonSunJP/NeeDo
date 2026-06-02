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

  it("refreshes the memory-only access token when a stored session is restored", () => {
    expect(authProviderSource).toContain("getAccessToken");
    expect(authProviderSource).toContain("const shouldRefreshAccessToken = Boolean(getStoredRefreshToken()) && !getAccessToken();");
    expect(authProviderSource).toContain("if (session && !shouldRefreshAccessToken)");
    expect(authProviderSource).toContain("const restorePortal = session?.portal ?? readStoredPortal();");
  });

  it("keeps an optional auth hook for UI chrome that may render during recovery", () => {
    expect(authProviderSource).toContain("export function useOptionalAuth()");
    expect(authProviderSource).toContain("const context = useOptionalAuth();");
  });

  it("ignores older stored sessions so a previous user-only legacy session cannot block portal switching", () => {
    expect(authProviderSource).toContain("session.authVersion === 4");
  });

  it("switches the backend identity when a portal has a matching formal identity", () => {
    expect(authProviderSource).toContain("findIdentityForPortal(session.identities, portal)");
    expect(authProviderSource).toContain("authApi.switchIdentity(portalIdentity.id)");
    expect(authProviderSource).toContain("buildAuthSessionFromMe(switched.me, portal, session.loginMethod)");
  });

  it("remembers each frontend portal authorization and restores it before asking for login again", () => {
    expect(authProviderSource).toContain("rememberPortalAuthorization(nextSession, getStoredRefreshToken())");
    expect(authProviderSource).toContain("restoreRememberedPortalSession(portal)");
    expect(authProviderSource).toContain("forgetRememberedPortalAuthorization(portal)");
    expect(authProviderSource).toContain("hasRememberedPortalAuthorization");
  });
});
