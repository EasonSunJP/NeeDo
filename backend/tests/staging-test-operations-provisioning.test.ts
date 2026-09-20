import {
  buildContinuousAvailabilityRanges,
  parseStagingTestOperationsConfig,
  planAvailabilityReconciliation
} from "../src/staging/staging-test-operations-provisioning";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("accepts an explicit exclusive end date through January", () => {
    expect(parseStagingTestOperationsConfig({
      ...valid,
      STAGING_TEST_SCHEDULE_END_DATE: "2027-02-01"
    })).toEqual({ startDate: "2026-09-20", endDate: "2027-02-01" });
  });

  it("rejects an explicit end date that is not after the start", () => {
    expect(() => parseStagingTestOperationsConfig({
      ...valid,
      STAGING_TEST_SCHEDULE_END_DATE: "2026-09-20"
    })).toThrow("STAGING_TEST_SCHEDULE_PERIOD_INVALID");
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

  it("uses continuous availability and only materializes the selected booking", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/staging/staging-test-operations-provisioning.ts"),
      "utf8"
    );

    expect(source).toContain("dynamicAvailability: true");
    expect(source).not.toContain("scheduleSlot.createMany");
  });
});
