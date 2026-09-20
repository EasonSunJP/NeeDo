import { describe, expect, it } from "vitest";
import { resolveDeploymentVersion } from "./deploymentVersion";

describe("deployment version", () => {
  it("uses the normalized eight-character deployed source revision", () => {
    expect(resolveDeploymentVersion(" 69b06588 ")).toBe("69b06588");
    expect(resolveDeploymentVersion("ABCDEF12")).toBe("abcdef12");
  });

  it("uses an explicit development label without a valid deployed revision", () => {
    expect(resolveDeploymentVersion()).toBe("dev");
    expect(resolveDeploymentVersion("0.001")).toBe("dev");
    expect(resolveDeploymentVersion("69b06588deadbeef")).toBe("dev");
  });
});
