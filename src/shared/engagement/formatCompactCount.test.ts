import { describe, expect, it } from "vitest";
import { formatCompactCount } from "./formatCompactCount";

describe("formatCompactCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1999, "1k"],
    [2000, "2k"],
    [999999, "999k"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCompactCount(value)).toBe(expected);
  });
});
