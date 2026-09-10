import { describe, expect, it } from "vitest";
import { buildSocialLocationOptions } from "./composer-location";

describe("buildSocialLocationOptions", () => {
  it("deduplicates the author location and filters the shared formal location list", () => {
    expect(buildSocialLocationOptions("东京 / 新宿区 / 新宿", "新宿")).toEqual([
      "新宿",
      "东京 / 新宿区 / 新宿"
    ]);
  });

  it("puts a typed custom location first and limits the result", () => {
    expect(buildSocialLocationOptions(undefined, "东京 / 台东区 / 浅草")[0]).toBe(
      "东京 / 台东区 / 浅草"
    );
    expect(buildSocialLocationOptions(undefined, "")).toHaveLength(5);
  });
});
