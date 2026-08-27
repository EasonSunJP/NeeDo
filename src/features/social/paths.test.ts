import { describe, expect, it } from "vitest";
import { socialPaths } from "./paths";

describe("social account profile paths", () => {
  it("builds the scoped friend activity routes", () => {
    expect(socialPaths.accountProfile("user", 237)).toBe("/moments/users/237");
    expect(socialPaths.accountProfile("merchant", 237)).toBe("/merchant/moments/users/237");
    expect(socialPaths.accountProfile("technician", 237)).toBe("/technician/moments/users/237");
  });
});
