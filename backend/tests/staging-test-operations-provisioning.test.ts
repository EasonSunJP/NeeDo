import { parseStagingTestOperationsConfig } from "../src/staging/staging-test-operations-provisioning";

describe("StagingTest operations provisioning gate", () => {
  const valid = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_TEST_OPERATIONS_PROVISIONING: "true",
    STAGING_TEST_SCHEDULE_START_DATE: "2026-09-20"
  };

  it("binds the period to today through the same calendar date next year", () => {
    expect(parseStagingTestOperationsConfig(valid)).toEqual({
      startDate: "2026-09-20",
      endDate: "2027-09-20"
    });
  });

  it("uses the last valid February day when the start date is leap day", () => {
    expect(parseStagingTestOperationsConfig({
      ...valid,
      STAGING_TEST_SCHEDULE_START_DATE: "2028-02-29"
    })).toEqual({ startDate: "2028-02-29", endDate: "2029-02-28" });
  });

  it.each([
    ["NODE_ENV", "development"],
    ["DEPLOY_ENV", "production"],
    ["ALLOW_STAGING_TEST_OPERATIONS_PROVISIONING", "false"]
  ])("rejects an unsafe %s boundary", (key, value) => {
    expect(() => parseStagingTestOperationsConfig({ ...valid, [key]: value })).toThrow();
  });
});
