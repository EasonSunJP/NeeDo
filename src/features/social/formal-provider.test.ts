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
    expect(source).toContain("if (!session || isRestoring) return;");
  });

  it("loads a selected account only after its profile page asks for it and deduplicates concurrent requests", () => {
    expect(source).toContain("ensureAccountProfile:");
    expect(source).toContain("accountProfileRequestsRef");
    expect(source).toContain("realtimeApi.getSocialActivityStatus(userId)");
    expect(source).toContain("realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: userId })");
    expect(source).toContain("accountProfileRequestsRef.current.set(userId, request)");
    expect(source).toContain("accountProfileRequestsRef.current.delete(userId)");
  });
});
