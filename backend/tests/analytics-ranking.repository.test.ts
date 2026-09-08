import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  AnalyticsRankingIncompleteEvidenceError,
  MAX_ANALYTICS_RANKING_PAGE,
  type AnalyticsRankingInput
} from "../src/domain/analytics-ranking";
import { AnalyticsRankingRepository } from "../src/repositories/analytics-ranking.repository";

type SqlQuery = { sql?: string; strings?: readonly string[]; values?: unknown[] };
const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ? ") ?? "";
const evaluatedAt = new Date("2026-09-01T05:30:00.000Z");
const input: AnalyticsRankingInput = {
  kind: "service",
  metric: "gmv",
  window: resolveDashboardWindow({ period: "last7days" }, evaluatedAt),
  evaluatedAt,
  city: "东京",
  categoryId: 8,
  page: 1,
  pageSize: 10
};

const row = {
  rank: 1n,
  entityType: "service",
  entityPublicId: "00000000-0000-4000-8000-000000000001",
  entityNumericId: 21n,
  displayName: "肩颈护理",
  avatarUrl: null,
  categoryId: 8n,
  gmvJpy: 12300n,
  completedCount: 2n,
  testGmvJpy: 12300n,
  testCompletedCount: 2n,
  dataComposition: "test",
  registeredAt: new Date("2026-01-01T00:00:00.000Z")
};

const fixture = (responses: unknown[][]) => {
  const queryRaw = jest.fn<Promise<unknown[]>, [SqlQuery]>(async () => responses.shift() ?? []);
  return {
    repository: new AnalyticsRankingRepository({ $queryRaw: queryRaw } as unknown as PrismaClient),
    queryRaw
  };
};

describe("AnalyticsRankingRepository", () => {
  it("runs evidence, total and page reads in one repeatable-read snapshot", async () => {
    const responses: unknown[][] = [[{ anomalyCount: 0n }], [{ total: 1n }], [row]];
    const transactionRaw = jest.fn<Promise<unknown[]>, [SqlQuery]>(
      async () => responses.shift() ?? []
    );
    const rootRaw = jest.fn<Promise<unknown[]>, [SqlQuery]>();
    const transaction = jest.fn(
      async (operation: (client: { $queryRaw: typeof transactionRaw }) => Promise<unknown>) =>
        operation({ $queryRaw: transactionRaw })
    );
    const repository = new AnalyticsRankingRepository({
      $queryRaw: rootRaw,
      category: { findFirst: jest.fn() },
      $transaction: transaction
    } as unknown as PrismaClient);

    await expect(repository.listRankings(input)).resolves.toMatchObject({ total: 1 });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
    expect(transactionRaw).toHaveBeenCalledTimes(3);
    expect(rootRaw).not.toHaveBeenCalled();
  });

  it("maps canonical ranked rows and binds the formal window, city, category and metric", async () => {
    const test = fixture([[{ anomalyCount: 0n }], [{ total: 1n }], [row]]);
    await expect(test.repository.listRankings(input)).resolves.toEqual({
      list: [
        {
          rank: 1,
          entityType: "service",
          entityPublicId: row.entityPublicId,
          entityNumericId: 21,
          displayName: "肩颈护理",
          avatarUrl: null,
          categoryId: 8,
          gmvJpy: 12300,
          completedCount: 2,
          testGmvJpy: 12300,
          testCompletedCount: 2,
          dataComposition: "test",
          registeredAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      total: 1,
      page: 1,
      page_size: 10
    });
    expect(test.queryRaw).toHaveBeenCalledTimes(3);
    const sql = test.queryRaw.mock.calls.map(([query]) => queryText(query)).join("\n");
    for (const fragment of [
      "analytics_ranking_evidence_validation",
      "booking.payment_confirmed_at >=",
      "booking.payment_confirmed_at <",
      "candidate.payment_refunded_at",
      "order_service_events",
      "ledger_transactions",
      "audit_logs",
      "calculation_snapshot_json",
      "JOIN ranking_candidate_orders AS candidate_add_on",
      "ORDER BY add_on.proposed_at ASC, add_on.id ASC",
      "BINARY entity_type"
    ])
      expect(sql).toContain(fragment);
    const values = test.queryRaw.mock.calls.flatMap(([query]) => query.values ?? []);
    expect(values).toEqual(
      expect.arrayContaining([
        input.window.fromInclusive,
        input.window.toExclusive,
        evaluatedAt,
        "东京",
        8,
        "gmv",
        "payment_method_selected",
        "ndp_payment_applied",
        "receipt_confirmed",
        "booking_complete_settlement",
        "base_plus_accepted_add_ons_minus_discount",
        "$.acceptedAddOnIds"
      ])
    );
  });

  it("validates eligible identities while classifying test evidence separately", async () => {
    const test = fixture([[{ anomalyCount: 0n }], [{ total: 0n }]]);

    await expect(
      test.repository.listRankings({ ...input, kind: "customer", categoryId: null })
    ).resolves.toMatchObject({ total: 0, list: [] });

    const validationSql = queryText(test.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    expect(validationSql).toMatch(/FROM formal_order_evidence\s+WHERE entity_eligible = 1/u);
    expect(validationSql).toContain(
      "candidate.customer_is_test = TRUE OR candidate.technician_user_is_test = TRUE"
    );
    expect(validationSql).toContain(
      "WHEN candidate.customer_is_test = TRUE OR candidate.technician_user_is_test = TRUE"
    );
    expect(validationSql).toMatch(/THEN \?\s+ELSE \?\s+END/u);
    expect(test.queryRaw.mock.calls[0]?.[0].values).toEqual(
      expect.arrayContaining(["TEST_NDP", "NDP"])
    );
    expect(validationSql).not.toContain("candidate.customer_is_test = FALSE");
    expect(validationSql).not.toContain("candidate.technician_user_is_test = FALSE");

    const pageFixture = fixture([[{ anomalyCount: 0n }], [{ total: 1n }], [row]]);
    await pageFixture.repository.listRankings(input);
    const pageSql = queryText(pageFixture.queryRaw.mock.calls[2]?.[0] as SqlQuery);
    expect(pageSql).toContain("test_gmv_jpy AS testGmvJpy");
    expect(pageSql).toContain("test_completed_count AS testCompletedCount");
    expect(pageSql).toContain("data_composition AS dataComposition");
  });

  it("uses a non-reserved SQL name for the window-function ranking position", async () => {
    const test = fixture([[{ anomalyCount: 0n }], [{ total: 1n }], [row]]);

    await expect(test.repository.listRankings(input)).resolves.toMatchObject({ total: 1 });

    const sql = test.queryRaw.mock.calls.map(([query]) => queryText(query)).join("\n");
    expect(sql).toContain("AS ranking_position");
    expect(sql).toContain("ranking_position AS rankingPosition");
    expect(sql).not.toMatch(/\bAS rank\b/u);
  });

  it("fails closed before SQL for invalid pagination and accepts the exported maximum", async () => {
    const invalid = fixture([]);
    await expect(
      invalid.repository.listRankings({ ...input, page: MAX_ANALYTICS_RANKING_PAGE + 1 })
    ).rejects.toBeInstanceOf(AnalyticsRankingIncompleteEvidenceError);
    await expect(
      invalid.repository.listRankings({ ...input, page: Number.MAX_SAFE_INTEGER, pageSize: 10 })
    ).rejects.toBeInstanceOf(AnalyticsRankingIncompleteEvidenceError);
    expect(invalid.queryRaw).not.toHaveBeenCalled();

    const valid = fixture([[{ anomalyCount: 0 }], [{ total: 0 }]]);
    await expect(
      valid.repository.listRankings({ ...input, page: MAX_ANALYTICS_RANKING_PAGE })
    ).resolves.toMatchObject({ list: [], page: MAX_ANALYTICS_RANKING_PAGE });
  });

  it.each(
    [
      [[{ anomalyCount: 1 }], [{ total: 0 }], []],
      [[{ anomalyCount: 0 }], [{ total: "1.5" }], []],
      [[{ anomalyCount: 0 }], [{ total: 2 }], [row]],
      [[{ anomalyCount: 0 }], [{ total: 2 }], [row, row]],
      [[{ anomalyCount: 0 }], [{ total: 1 }], [{ ...row, gmvJpy: -1 }]],
      [[{ anomalyCount: 0 }], [{ total: 1 }], [{ ...row, testGmvJpy: 12301n }]],
      [[{ anomalyCount: 0 }], [{ total: 1 }], [{ ...row, testCompletedCount: 3n }]],
      [[{ anomalyCount: 0 }], [{ total: 1 }], [{ ...row, dataComposition: "formal" }]]
    ].map((responses) => [responses] as const)
  )(
    "rejects corrupt evidence, totals, duplicates and non-canonical aggregates",
    async (responses) => {
      const test = fixture(responses as unknown as unknown[][]);
      await expect(test.repository.listRankings(input)).rejects.toBeInstanceOf(
        AnalyticsRankingIncompleteEvidenceError
      );
    }
  );

  it("resolves only active non-deleted requested categories", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 8 });
    const repository = new AnalyticsRankingRepository({ category: { findFirst } } as never);
    await expect(repository.findActiveCategoryById(8)).resolves.toEqual({ id: 8 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 8, isActive: true, deletedAt: null },
      select: { id: true }
    });
  });

  it("requires direct NDP to have zero total selection events, not one malformed event", async () => {
    const test = fixture([[{ anomalyCount: 0 }], [{ total: 0 }]]);
    await test.repository.listRankings({ ...input, kind: "customer", categoryId: null });
    const sql = queryText(test.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    expect(sql).toContain("candidate.payment_selected_at = candidate.payment_confirmed_at");
    expect(sql).toContain("THEN candidate.session_ended_at");
    expect(sql).toContain("ELSE candidate.payment_selected_at");
    expect(sql).toMatch(
      /JSON_LENGTH\(event\.metadata\)[\s\S]*?= 0[\s\S]*?booking_order_id = candidate\.id[\s\S]*?= 0\)/u
    );
    expect(sql).not.toContain("IN (1, CASE WHEN candidate.payment_selected_at");
    const values = test.queryRaw.mock.calls[0]?.[0].values ?? [];
    expect(
      values.filter((value) => value === "payment_method_selected").length
    ).toBeGreaterThanOrEqual(4);
  });

  it("rejects offsetting negative add-on amounts and untrimmed persisted receipt fields", async () => {
    const test = fixture([[{ anomalyCount: 0 }], [{ total: 0 }]]);
    await test.repository.listRankings({ ...input, kind: "technician", categoryId: null });
    const sql = queryText(test.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    expect(sql).toContain("SUM(add_on.price_amount_jpy < 0) AS negative_amount_count");
    expect(sql).toContain("COALESCE(add_ons.negative_amount_count, 0) <> 0");
    expect(sql).toContain(
      "candidate.receipt_confirmation_reason = TRIM(candidate.receipt_confirmation_reason)"
    );
    expect(sql).toContain("candidate.other_method_code = TRIM(candidate.other_method_code)");
    expect(sql).toContain("candidate.other_method_label = TRIM(candidate.other_method_label)");
  });

  it("ranks immutable service snapshots without excluding soft-deleted catalog rows", async () => {
    const test = fixture([[{ anomalyCount: 0 }], [{ total: 0 }]]);
    await test.repository.listRankings({ ...input, categoryId: null });
    const sql = test.queryRaw.mock.calls.map(([query]) => queryText(query)).join("\n");
    const values = test.queryRaw.mock.calls.flatMap(([query]) => query.values ?? []);
    expect(sql).toContain("candidate.service_snapshot_json");
    expect(sql).toContain("add_on.service_snapshot_json");
    expect(values).toEqual(expect.arrayContaining(["$.publicId", "$.categoryId"]));
    expect(sql).toContain("evidence.service_name_snapshot");
    expect(sql).toContain("add_on.service_name_snapshot");
    expect(sql).toContain("MIN(line.display_name)");
    expect(sql).toContain("COUNT(DISTINCT line.category_id)");
    expect(sql).not.toContain("line.category_is_active = TRUE");
    expect(sql).not.toContain("line.category_deleted_at IS NULL");
    expect(sql).not.toContain("line.service_deleted_at IS NULL");
    expect(sql).not.toContain("line.technician_service_deleted_at IS NULL");
  });

  it("fails closed on SQL NULL evidence and uses binary persisted currency authority", async () => {
    const test = fixture([[{ anomalyCount: 1 }]]);
    await expect(test.repository.listRankings(input)).rejects.toBeInstanceOf(
      AnalyticsRankingIncompleteEvidenceError
    );
    const sql = queryText(test.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    expect(sql).toContain("CASE WHEN COALESCE((");
    expect(sql).toContain("JSON_EXTRACT(candidate.calculation_snapshot_json");
    expect(sql).toMatch(/JSON_EXTRACT\(candidate\.calculation_snapshot_json, \?\) IS NULL/u);
    expect(sql).toContain("COALESCE(NOT (");
    expect(sql).toContain("), TRUE)");
    for (const path of [
      "$.formula",
      "$.baseAmountJpy",
      "$.addOnAmountJpy",
      "$.discountAmountJpy",
      "$.checkoutAmountJpy"
    ])
      expect(
        (test.queryRaw.mock.calls[0]?.[0].values ?? []).filter((value) => value === path).length
      ).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json");
    expect(sql).toContain("BINARY candidate.currency <> BINARY");
    expect(sql).toContain("SUM(BINARY add_on.currency <> BINARY");
    expect(sql).toContain("BINARY ledger.currency = BINARY");
    expect(
      (test.queryRaw.mock.calls[0]?.[0].values ?? []).filter((value) => value === "INTEGER").length
    ).toBeGreaterThanOrEqual(8);
    expect(
      (test.queryRaw.mock.calls[0]?.[0].values ?? []).filter(
        (value) => value === "$.acceptedAddOnIds"
      ).length
    ).toBeGreaterThanOrEqual(3);
  });
});
