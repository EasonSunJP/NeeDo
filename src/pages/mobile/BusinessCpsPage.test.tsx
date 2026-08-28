import { describe, expect, it } from "vitest";
import source from "./BusinessCpsPage.tsx?raw";

describe("BusinessCpsPage affiliate name", () => {
  it("uses the translated Affiliate product name instead of the legacy spelling", () => {
    expect(source).toContain('title="联盟营销"');
    expect(source).not.toContain('title="NeeDoAfirieito"');
  });
});
