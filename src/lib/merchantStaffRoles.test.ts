import { describe, expect, it } from "vitest";
import {
  getMerchantStaffEmploymentLabel,
  toMerchantStaffEmploymentType
} from "./merchantStaffRoles";

describe("merchant staff formal employment types", () => {
  it("maps the API employment contract without inventing a fallback", () => {
    expect(toMerchantStaffEmploymentType("full_time")).toBe("fullTime");
    expect(toMerchantStaffEmploymentType("temporary")).toBe("partTime");
    expect(toMerchantStaffEmploymentType("independent")).toBe("independent");
    expect(toMerchantStaffEmploymentType("unknown")).toBeNull();
  });

  it("labels every persisted employment type", () => {
    expect(getMerchantStaffEmploymentLabel("fullTime")).toBe("正社员");
    expect(getMerchantStaffEmploymentLabel("partTime")).toBe("临时工");
    expect(getMerchantStaffEmploymentLabel("independent")).toBe("独立技师");
  });
});
