import {
  analyticsRankingRequiredColumns,
  analyticsRankingRequiredIndexes,
  assertAnalyticsRankingIntegrationSchema,
  requireAnalyticsRankingIntegrationAuthority,
  type RankingSchemaIndexColumn
} from "./analytics-ranking-integration-safety";

describe("analytics ranking MySQL integration safety", () => {
  it("accepts only an explicit parsed loopback needo_test authority", () => {
    const url = "mysql://needo:secret@127.0.0.1:3307/needo_test";
    expect(requireAnalyticsRankingIntegrationAuthority({ enabled: "true", envFile: "/tmp/ranking.env",
      parsed: { DATABASE_URL: url, NODE_ENV: "test" }, runtime: {} })).toBe(url);
  });

  it.each([
    [{ enabled: undefined, envFile: "/tmp/x", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "opt-in"],
    [{ enabled: "true", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "FORMAL_BACKEND_ENV_FILE"],
    [{ enabled: "true", envFile: "/tmp/x", parsed: {}, runtime: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test" } }, "must define DATABASE_URL"],
    [{ enabled: "true", envFile: "/tmp/x", parsed: { DATABASE_URL: "mysql://x@db/needo_test" } }, "loopback needo_test"],
    [{ enabled: "true", envFile: "/tmp/x", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_prod" } }, "loopback needo_test"],
    [{ enabled: "true", envFile: "/tmp/x", parsed: { DATABASE_URL: "mysql://x@127.0.0.1/needo_test", DEPLOY_ENV: "productiontest" } }, "non-production"]
  ])("rejects unsafe authority %#", (input, message) => {
    expect(() => requireAnalyticsRankingIntegrationAuthority(input)).toThrow(message);
  });

  it("preflights exact columns, migration, index table/order and uniqueness", () => {
    const columns = analyticsRankingRequiredColumns.map((column) => {
      const [tableName, columnName] = column.split(".");
      return { tableName: tableName!, columnName: columnName! };
    });
    const indexes: RankingSchemaIndexColumn[] = analyticsRankingRequiredIndexes.flatMap((index) =>
      index.columns.map((columnName, offset) => ({ tableName: index.tableName,
        indexName: index.indexName, columnName, seqInIndex: offset + 1, nonUnique: index.unique ? 0 : 1 }))
    );
    const migration = ["20260902100000_analytics_ranking_identity_permission"];
    expect(() => assertAnalyticsRankingIntegrationSchema(columns, indexes, migration)).not.toThrow();
    expect(() => assertAnalyticsRankingIntegrationSchema(columns.slice(1), indexes, migration)).toThrow("booking_orders.id");
    expect(() => assertAnalyticsRankingIntegrationSchema(columns, indexes, [])).toThrow("20260902100000");
    const wrongOrder = indexes.map((row) => row.indexName === "booking_orders_ranking_window_idx" && row.seqInIndex === 1
      ? { ...row, seqInIndex: 2 } : row);
    expect(() => assertAnalyticsRankingIntegrationSchema(columns, wrongOrder, migration)).toThrow("order");
    const wrongUnique = indexes.map((row) => row.indexName === "technician_services_public_id_key"
      ? { ...row, nonUnique: 1 } : row);
    expect(() => assertAnalyticsRankingIntegrationSchema(columns, wrongUnique, migration)).toThrow("uniqueness");
  });
});
