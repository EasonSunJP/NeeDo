import {
  administrativeRegionListQuerySchema,
  verifiedServiceLocationSchema
} from "../src/validators/administrative-region.validator";

describe("administrative region validators", () => {
  it("accepts the supported Japan hierarchy queries", () => {
    expect(administrativeRegionListQuerySchema.parse({ country: "JP" })).toEqual({
      country: "JP",
      locale: "ja"
    });
    expect(administrativeRegionListQuerySchema.parse({ country: "JP", parent: "13" })).toEqual({
      country: "JP",
      parent: "13",
      locale: "ja"
    });
  });

  it("rejects unsupported countries, malformed codes, and unknown query fields", () => {
    expect(administrativeRegionListQuerySchema.safeParse({ country: "US" }).success).toBe(false);
    expect(
      administrativeRegionListQuerySchema.safeParse({ country: "JP", parent: "Tokyo" }).success
    ).toBe(false);
    expect(
      administrativeRegionListQuerySchema.safeParse({ country: "JP", unexpected: "value" }).success
    ).toBe(false);
  });

  it("requires a strict, complete verified service-location scope", () => {
    expect(
      verifiedServiceLocationSchema.parse({
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104"
      })
    ).toEqual({
      serviceCountryCode: "JP",
      serviceAdmin1Code: "13",
      serviceAdmin2Code: "13104"
    });
    expect(
      verifiedServiceLocationSchema.safeParse({
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13"
      }).success
    ).toBe(false);
    expect(
      verifiedServiceLocationSchema.safeParse({
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104",
        admin2RegionId: 99
      }).success
    ).toBe(false);
  });
});
