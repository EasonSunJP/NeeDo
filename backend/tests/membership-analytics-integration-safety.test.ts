import {
  assertMembershipAnalyticsIntegrationSchema,
  membershipAnalyticsIntegrationRequiredColumns,
  membershipAnalyticsIntegrationRequiredIndexes,
  requireMembershipAnalyticsIntegrationAuthority
} from "./membership-analytics-integration-safety";

describe("membership analytics MySQL integration safety", () => {
  it.each([
    "mysql://needo:secret@127.0.0.1:3307/needo_test",
    "mysql://needo:secret@localhost:3307/needo_test",
    "mysql://needo:secret@[::1]:3307/needo_test"
  ])("accepts only explicit formal loopback needo_test authority: %s", (databaseUrl) => {
    expect(requireMembershipAnalyticsIntegrationAuthority({
      enabled: "true",
      envFile: "/tmp/formal-membership.env",
      parsed: { DATABASE_URL: databaseUrl, NODE_ENV: "test", DEPLOY_ENV: "local" },
      runtime: {}
    })).toBe(databaseUrl);
  });

  it.each([
    [{ enabled: undefined, envFile: "/tmp/formal.env", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "explicit opt-in"],
    [{ enabled: "true", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "FORMAL_BACKEND_ENV_FILE"],
    [{ enabled: "true", envFile: "/tmp/formal.env", parsed: {}, runtime: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "must define DATABASE_URL"],
    [{ enabled: "true", envFile: "/tmp/formal.env", parsed: { DATABASE_URL: "mysql://x@db.internal/needo_test" } }, "loopback needo_test"],
    [{ enabled: "true", envFile: "/tmp/formal.env", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_dev" } }, "loopback needo_test"],
    [{ enabled: "true", envFile: "/tmp/formal.env", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test", NODE_ENV: "production" } }, "non-production"],
    [{ enabled: "true", envFile: "/tmp/formal.env", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" }, runtime: { DEPLOY_ENV: "prod" } }, "non-production"]
  ])("rejects unsafe authority %#", (input, message) => {
    expect(() => requireMembershipAnalyticsIntegrationAuthority(input)).toThrow(message);
  });

  it("preflights every lifecycle query/fixture column and required Task2A index", () => {
    const columns = membershipAnalyticsIntegrationRequiredColumns.map((column) => {
      const [tableName, columnName] = column.split(".");
      return { tableName: tableName!, columnName: columnName! };
    });
    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns,
      [...membershipAnalyticsIntegrationRequiredIndexes],
      ["20260901103000_membership_acquisition_sources"]
    )).not.toThrow();

    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns.filter((column) => column.columnName !== "reason_code"),
      [...membershipAnalyticsIntegrationRequiredIndexes],
      ["20260901103000_membership_acquisition_sources"]
    )).toThrow("shop_membership_card_status_events.reason_code");
    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns,
      membershipAnalyticsIntegrationRequiredIndexes.filter((index) => !index.includes("event_key")),
      ["20260901103000_membership_acquisition_sources"]
    )).toThrow("shop_membership_card_status_events_event_key");
    expect(() => assertMembershipAnalyticsIntegrationSchema(columns, [
      ...membershipAnalyticsIntegrationRequiredIndexes
    ], [])).toThrow("20260901103000_membership_acquisition_sources");
  });
});
