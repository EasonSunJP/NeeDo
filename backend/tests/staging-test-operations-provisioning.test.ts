import {
  buildContinuousAvailabilityRanges,
  buildContinuousScheduleSlotRanges,
  deriveServiceStartIntervalMinutes,
  parseStagingTestOperationsConfig,
  planAvailabilityReconciliation
} from "../src/staging/staging-test-operations-provisioning";

describe("StagingTest operations provisioning gate", () => {
  const valid = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_TEST_OPERATIONS_PROVISIONING: "true",
    STAGING_TEST_SCHEDULE_START_DATE: "2026-09-20"
  };

  it("binds the period to at least three complete calendar months", () => {
    expect(parseStagingTestOperationsConfig(valid)).toEqual({
      startDate: "2026-09-20",
      endDate: "2026-12-20"
    });
  });

  it("uses the last valid target-month day when the three-month anchor does not exist", () => {
    expect(parseStagingTestOperationsConfig({
      ...valid,
      STAGING_TEST_SCHEDULE_START_DATE: "2026-11-30"
    })).toEqual({ startDate: "2026-11-30", endDate: "2027-02-28" });
  });

  it("creates one half-open three-month availability window per technician", () => {
    expect(buildContinuousAvailabilityRanges({
      startsAt: new Date("2026-09-20T15:00:00.000Z"),
      endsAt: new Date("2026-12-20T15:00:00.000Z"),
      technicianProfileIds: [8, 9]
    })).toEqual([
      {
        technicianProfileId: 8,
        startsAt: new Date("2026-09-20T15:00:00.000Z"),
        endsAt: new Date("2026-12-20T15:00:00.000Z")
      },
      {
        technicianProfileId: 9,
        startsAt: new Date("2026-09-20T15:00:00.000Z"),
        endsAt: new Date("2026-12-20T15:00:00.000Z")
      }
    ]);
  });

  it("uses the configured service duration when no separate start interval is supplied", () => {
    const ranges = buildContinuousScheduleSlotRanges({
      startsAt: new Date("2026-09-20T15:00:00.000Z"),
      endsAt: new Date("2026-09-21T15:00:00.000Z"),
      durationMinutes: 60
    });

    expect(ranges).toHaveLength(24);
    expect(ranges[0]).toEqual({
      startsAt: new Date("2026-09-20T15:00:00.000Z"),
      endsAt: new Date("2026-09-20T16:00:00.000Z")
    });
    expect(ranges.at(-1)).toEqual({
      startsAt: new Date("2026-09-21T14:00:00.000Z"),
      endsAt: new Date("2026-09-21T15:00:00.000Z")
    });
    expect(ranges.every((range, index) => index === 0 || range.startsAt.getTime() - ranges[index - 1].startsAt.getTime() === 60 * 60_000)).toBe(true);
  });

  it("derives a shared start interval from the actual service durations", () => {
    expect(deriveServiceStartIntervalMinutes([60, 90, 45, 20, 15, 10])).toBe(5);
    expect(buildContinuousScheduleSlotRanges({
      startsAt: new Date("2026-09-20T15:00:00.000Z"),
      endsAt: new Date("2026-09-20T17:00:00.000Z"),
      durationMinutes: 45,
      startIntervalMinutes: 5
    })).toHaveLength(16);
  });

  it.each([
    ["NODE_ENV", "development"],
    ["DEPLOY_ENV", "production"],
    ["ALLOW_STAGING_TEST_OPERATIONS_PROVISIONING", "false"]
  ])("rejects an unsafe %s boundary", (key, value) => {
    expect(() => parseStagingTestOperationsConfig({ ...valid, [key]: value })).toThrow();
  });

  it("keeps one active desired availability while retiring duplicates", () => {
    const startsAt = new Date("2026-09-19T15:00:00.000Z");
    const endsAt = new Date("2026-09-20T15:00:00.000Z");

    expect(planAvailabilityReconciliation([
      { id: 20, technicianProfileId: 8, startsAt, endsAt, isActive: false },
      { id: 21, technicianProfileId: 8, startsAt, endsAt, isActive: true },
      { id: 22, technicianProfileId: 8, startsAt, endsAt, isActive: true },
      {
        id: 23,
        technicianProfileId: 9,
        startsAt: new Date("2026-09-20T15:00:00.000Z"),
        endsAt: new Date("2026-09-21T15:00:00.000Z"),
        isActive: false
      }
    ])).toEqual({
      existingKeys: new Set([
        "8:2026-09-19T15:00:00.000Z:2026-09-20T15:00:00.000Z",
        "9:2026-09-20T15:00:00.000Z:2026-09-21T15:00:00.000Z"
      ]),
      inactiveIds: [23],
      duplicateIds: [20, 22],
      obsoleteIds: []
    });
  });

  it("retires daily windows when replacing them with one continuous window", () => {
    const firstDayStart = new Date("2026-09-20T15:00:00.000Z");
    const firstDayEnd = new Date("2026-09-21T15:00:00.000Z");
    const secondDayEnd = new Date("2026-09-22T15:00:00.000Z");
    const periodEnd = new Date("2026-12-20T15:00:00.000Z");

    expect(planAvailabilityReconciliation([
      { id: 20, technicianProfileId: 8, startsAt: firstDayStart, endsAt: firstDayEnd, isActive: true },
      { id: 21, technicianProfileId: 8, startsAt: firstDayEnd, endsAt: secondDayEnd, isActive: true }
    ], [{ technicianProfileId: 8, startsAt: firstDayStart, endsAt: periodEnd }])).toEqual({
      existingKeys: new Set(),
      inactiveIds: [],
      duplicateIds: [],
      obsoleteIds: [20, 21]
    });
  });
});
