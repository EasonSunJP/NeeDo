import { describe, expect, it } from "vitest";
import { formatCompactCount } from "./formatCompactCount";

describe("formatCompactCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1001, "1k"],
    [1999, "1.9k"],
    [2000, "2k"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCompactCount(value)).toBe(expected);
  });
});
