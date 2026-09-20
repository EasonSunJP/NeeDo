import {
  STAGING_TEST_CHIBA_SERVICES,
  buildNightlyServiceSlotRanges,
  buildNightlyShiftRanges,
  parseStagingTestChibaShopConfig
} from "../src/staging/staging-test-chiba-shop-provisioning";

describe("StagingTest Chiba shop provisioning gate", () => {
  const valid = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_TEST_CHIBA_PROVISIONING: "true",
    STAGING_TEST_CHIBA_SCHEDULE_START_DATE: "2026-09-21"
  };

  it("binds the fixture to akiratest and at least three calendar months", () => {
    expect(parseStagingTestChibaShopConfig(valid)).toEqual({
      ownerEmail: "akiratest@lifedance.com",
      startDate: "2026-09-21",
      endDate: "2026-12-21"
    });
  });

  it.each([
    ["NODE_ENV", "development"],
    ["DEPLOY_ENV", "production"],
    ["ALLOW_STAGING_TEST_CHIBA_PROVISIONING", "false"]
  ])("rejects an unsafe %s boundary", (key, value) => {
    expect(() => parseStagingTestChibaShopConfig({ ...valid, [key]: value })).toThrow();
  });

  it("creates one 17:00 to next-day 01:00 shop shift per technician per day", () => {
    const ranges = buildNightlyShiftRanges({
      startDate: "2026-09-21",
      endDate: "2026-09-23",
      technicianProfileIds: [7, 8]
    });

    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toEqual({
      technicianProfileId: 7,
      startsAt: new Date("2026-09-21T08:00:00.000Z"),
      endsAt: new Date("2026-09-21T16:00:00.000Z")
    });
    expect(ranges[1]).toEqual({
      technicianProfileId: 7,
      startsAt: new Date("2026-09-22T08:00:00.000Z"),
      endsAt: new Date("2026-09-22T16:00:00.000Z")
    });
  });

  it("creates 30-minute starts only when the service finishes by 01:00", () => {
    const ranges = buildNightlyServiceSlotRanges({
      startsAt: new Date("2026-09-21T08:00:00.000Z"),
      endsAt: new Date("2026-09-21T16:00:00.000Z"),
      durationMinutes: 60
    });

    expect(ranges).toHaveLength(15);
    expect(ranges[0]).toEqual({
      startsAt: new Date("2026-09-21T08:00:00.000Z"),
      endsAt: new Date("2026-09-21T09:00:00.000Z")
    });
    expect(ranges.at(-1)).toEqual({
      startsAt: new Date("2026-09-21T15:00:00.000Z"),
      endsAt: new Date("2026-09-21T16:00:00.000Z")
    });
  });

  it("defines exactly three massages, two options and one extension with Japanese tax-inclusive pricing", () => {
    expect(STAGING_TEST_CHIBA_SERVICES).toHaveLength(6);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "massage")).toHaveLength(3);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "option")).toHaveLength(2);
    expect(STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "extension")).toHaveLength(1);
    expect(STAGING_TEST_CHIBA_SERVICES.every((service) => service.currency === "JPY" && service.priceAmountJpy > 0)).toBe(true);
  });
});
