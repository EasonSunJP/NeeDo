import { describe, expect, it } from "vitest";
import {
  isTravelEstimateAddressComplete,
  normalizeCheckoutHomeAddress
} from "./checkoutHomeAddress";

const completeAddress = {
  countryCode: "JP" as const,
  postalCode: "106-0045",
  prefecture: "東京都",
  city: "港区",
  addressLine1: "麻布十番2-1-3",
  addressLine2: "",
  building: ""
};

describe("checkout home address", () => {
  it("enables travel estimation without optional address details or a building", () => {
    expect(isTravelEstimateAddressComplete(completeAddress, "JP-13", "13103")).toBe(true);
  });

  it.each([
    ["postalCode", ""],
    ["postalCode", "106-045"],
    ["prefecture", ""],
    ["city", ""],
    ["addressLine1", ""]
  ] as const)("keeps travel estimation disabled when %s is incomplete", (field, value) => {
    expect(isTravelEstimateAddressComplete({ ...completeAddress, [field]: value }, "JP-13", "13103")).toBe(false);
  });

  it("requires the selected prefecture and municipality codes", () => {
    expect(isTravelEstimateAddressComplete(completeAddress, "", "13103")).toBe(false);
    expect(isTravelEstimateAddressComplete(completeAddress, "JP-13", "")).toBe(false);
  });

  it("normalizes required fields and omits blank optional address lines", () => {
    expect(normalizeCheckoutHomeAddress({
      ...completeAddress,
      postalCode: "１０６－００４５",
      addressLine1: "  麻布十番2-1-3  ",
      addressLine2: "  ",
      building: "  NeeDo  301  "
    })).toEqual({
      countryCode: "JP",
      postalCode: "106-0045",
      prefecture: "東京都",
      city: "港区",
      addressLine1: "麻布十番2-1-3",
      building: "NeeDo 301"
    });
  });
});
