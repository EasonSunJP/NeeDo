import { describe, expect, it } from "vitest";
import { getMerchantStaffDetailPath } from "./merchantStaffRoute";

describe("getMerchantStaffDetailPath", () => {
  it("builds staff detail routes only from public technician NeeDo ids", () => {
    expect(getMerchantStaffDetailPath("s5148317836")).toBe("/merchant/staff/s5148317836");
    expect(getMerchantStaffDetailPath("  s6259428947  ")).toBe("/merchant/staff/s6259428947");
  });

  it("does not reinterpret missing or internal technician ids as public routes", () => {
    expect(getMerchantStaffDetailPath(undefined)).toBeUndefined();
    expect(getMerchantStaffDetailPath(null)).toBeUndefined();
    expect(getMerchantStaffDetailPath("31")).toBeUndefined();
    expect(getMerchantStaffDetailPath("technician:31")).toBeUndefined();
  });
});
