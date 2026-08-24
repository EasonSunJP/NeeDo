import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

describe("formal IM legacy-store gate", () => {
  it("hydrates the browser mock store only for explicit static bypass sessions", () => {
    expect(source).toContain("isStaticDemoMode() && isFrontendBypassSession(session)");
    expect(source).toContain("if (!legacyEnabled)");
    expect(source).toContain("formalImMutationUnavailable");
  });
});
