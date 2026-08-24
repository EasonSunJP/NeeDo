import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8");

describe("formal social provider gate", () => {
  it("mounts the local demo provider only for an explicit static bypass session", () => {
    expect(source).toContain("function LegacySocialProvider");
    expect(source).toContain("isStaticDemoMode() && isFrontendBypassSession(session)");
    expect(source).toContain("<FormalSocialCompatibilityProvider>");
  });

  it("returns empty read models and rejects legacy mutations in formal mode", () => {
    expect(source).toContain("formalSocialUnavailableState");
    expect(source).toContain("formalSocialMutationUnavailable");
    expect(source).toContain('throw new Error("error.feature_unavailable")');
  });
});
