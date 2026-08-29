import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8");

describe("formal social provider gate", () => {
  it("always mounts the formal provider", () => {
    expect(source).not.toContain("isStaticDemoMode");
    expect(source).not.toContain("isFrontendBypassSession");
    expect(source).toContain("<FormalSocialProvider>");
  });

  it("loads formal posts through the realtime API without formal localStorage business data", () => {
    expect(source).toContain("realtimeApi.listSocialPosts");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).toContain("mapFormalSocialPost");
    expect(source).not.toContain("formalSocialUnavailableState");
    expect(source).not.toContain("FormalSocialCompatibilityProvider");
  });

  it("waits for access-token restoration before loading protected social data", () => {
    expect(source).toContain("const { isRestoring, session } = useAuth();");
    expect(source).toContain("if (sessionUserId === null || isRestoring) return;");
  });

  it("does not reload social and notification data for an equivalent session object", () => {
    const loadSource = source.slice(
      source.indexOf("const loadFormalSocial = useCallback"),
      source.indexOf("const value = useMemo")
    );

    expect(loadSource).toContain("sessionUserId");
    expect(loadSource).not.toContain("session.");
    expect(loadSource).not.toContain("[isRestoring, session]");
  });

  it("loads a selected account only after its profile page asks for it and deduplicates concurrent requests", () => {
    expect(source).toContain("ensureAccountProfile:");
    expect(source).toContain("accountProfileRequestsRef");
    expect(source).toContain("realtimeApi.getSocialActivityStatus(userId)");
    expect(source).toContain("realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: userId })");
    expect(source).toContain("accountProfileRequestsRef.current.set(userId, request)");
    expect(source).toContain("accountProfileRequestsRef.current.delete(userId)");
  });

  it("keeps draft actions stable so composer autosave cannot trigger an update-depth loop", () => {
    expect(source).toContain("const saveDraft = useCallback(");
    expect(source).toContain("const clearDraft = useCallback(");
    expect(source).toMatch(/\n\s+saveDraft,\n\s+clearDraft,/u);
    expect(source).not.toContain("saveDraft: (draftKey, draft) => setState");
  });

  it("persists published post edits through the formal update API", () => {
    expect(source).toContain("const updatePost = async");
    expect(source).toContain("realtimeApi.updateSocialPost");
    expect(source).not.toContain("updatePost: formalSocialMutationUnavailable");
  });
});
