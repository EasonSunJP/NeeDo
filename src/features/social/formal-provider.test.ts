import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8");

describe("formal social provider gate", () => {
  it("mounts the local demo provider only for an explicit static bypass session", () => {
    expect(source).toContain("function LegacySocialProvider");
    expect(source).toContain("isStaticDemoMode() && isFrontendBypassSession(session)");
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
});
