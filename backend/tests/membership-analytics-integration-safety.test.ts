import {
  assertMembershipAnalyticsIntegrationSchema,
  membershipAnalyticsIntegrationRequiredColumns,
  membershipAnalyticsIntegrationRequiredIndexes,
  requireMembershipAnalyticsIntegrationAuthority,
  type SchemaIndexColumn
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
    const requiredIndexes = membershipAnalyticsIntegrationRequiredIndexes;
    const columns = membershipAnalyticsIntegrationRequiredColumns.map((column) => {
      const [tableName, columnName] = column.split(".");
      return { tableName: tableName!, columnName: columnName! };
    });
    const toAvailableIndexes = (
      required: typeof membershipAnalyticsIntegrationRequiredIndexes
    ): SchemaIndexColumn[] => required.flatMap((index) =>
      index.columns.map((columnName, offset) => ({
        tableName: index.tableName,
        indexName: index.indexName,
        columnName,
        seqInIndex: offset + 1,
        nonUnique: index.unique ? 0 : 1
      }))
    );
    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns,
      toAvailableIndexes(requiredIndexes),
      ["20260901103000_membership_acquisition_sources"]
    )).not.toThrow();

    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns.filter((column) => column.columnName !== "reason_code"),
      toAvailableIndexes(requiredIndexes),
      ["20260901103000_membership_acquisition_sources"]
    )).toThrow("shop_membership_card_status_events.reason_code");
    expect(() => assertMembershipAnalyticsIntegrationSchema(
      columns,
      requiredIndexes
        .filter((index) => !index.indexName.includes("event_key"))
        .flatMap((index) => index.columns.map((columnName, offset) => ({
          tableName: index.tableName,
          indexName: index.indexName,
          columnName,
          seqInIndex: offset + 1,
          nonUnique: index.unique ? 0 : 1
        }))),
      ["20260901103000_membership_acquisition_sources"]
    )).toThrow("shop_membership_card_status_events_event_key");
    const indexes = toAvailableIndexes(requiredIndexes);
    expect(() => assertMembershipAnalyticsIntegrationSchema(columns, indexes, []))
      .toThrow("20260901103000_membership_acquisition_sources");

    expect(membershipAnalyticsIntegrationRequiredColumns).toEqual(expect.arrayContaining([
      "customer_profiles.city",
      "shop_membership_cards.frozen_at"
    ]));
    expect(requiredIndexes).toEqual(expect.arrayContaining([
      {
        tableName: "shop_membership_cards",
        indexName: "shop_membership_cards_status_expiry_idx",
        columns: ["status", "expires_at", "deleted_at"],
        unique: false
      },
      {
        tableName: "shop_membership_card_status_events",
        indexName: "shop_membership_card_status_events_status_time_idx",
        columns: ["to_status", "occurred_at", "id", "deleted_at"],
        unique: false
      }
    ]));

    for (const [label, corrupt] of [
      ["table", (rows: typeof indexes) => rows.map((row) => row.indexName === "shop_membership_card_status_events_event_key" ? { ...row, tableName: "shop_membership_cards" } : row)],
      ["order", (rows: typeof indexes) => rows.map((row) => row.indexName === "shop_membership_card_status_events_card_time_idx" && row.seqInIndex === 1 ? { ...row, seqInIndex: 2 } : row)],
      ["column", (rows: typeof indexes) => rows.map((row) => row.indexName === "shop_membership_cards_status_expiry_idx" && row.seqInIndex === 2 ? { ...row, columnName: "issued_at" } : row)],
      ["uniqueness", (rows: typeof indexes) => rows.map((row) => row.indexName === "shop_membership_card_status_events_event_key" ? { ...row, nonUnique: 1 } : row)]
    ] as const) {
      expect(() => assertMembershipAnalyticsIntegrationSchema(
        columns,
        corrupt(indexes),
        ["20260901103000_membership_acquisition_sources"]
      )).toThrow(label);
    }
  });
});
