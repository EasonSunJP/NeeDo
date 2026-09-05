import { describe, expect, it } from "vitest";
import { readPositiveIntegerSearchParam } from "./adminSearchParams";

describe("readPositiveIntegerSearchParam", () => {
  it("accepts only safe positive integer identifiers", () => {
    expect(readPositiveIntegerSearchParam(new URLSearchParams("detailId=31"), "detailId"))
      .toBe(31);
    for (const value of ["", "0", "-1", "1.5", "abc", "9007199254740992"]) {
      expect(readPositiveIntegerSearchParam(
        new URLSearchParams(value ? `detailId=${value}` : ""),
        "detailId"
      )).toBeNull();
    }
  });
});
