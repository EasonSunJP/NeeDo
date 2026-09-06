import { Prisma, type PrismaClient } from "@prisma/client";
import { formalConfirmedPaymentEvidence } from "../src/repositories/formal-confirmed-payment-evidence";
import { LiveDashboardRepository } from "../src/repositories/live-dashboard.repository";

type SqlQuery = Prisma.Sql & {
  sql?: string;
  strings?: readonly string[];
  values?: unknown[];
};

const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";
const evaluatedAt = new Date("2026-09-06T03:04:05.000Z");

const cteSlice = (sql: string, from: string, to: string): string =>
  sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));

const scopeCode = (query: SqlQuery): "JP" | "13" | "13104" => {
  if (query.values?.includes("13104")) return "13104";
  if (query.values?.includes("13")) return "13";
  return "JP";
};

const rankRows = (kind: "service" | "technician", count: number) =>
  Array.from({ length: count }, (_, index) => ({
    rankingPosition: BigInt(index + 1),
    entityPublicId: `${kind}-${index + 1}`,
    displayName: `${kind} ${index + 1}`,
    avatarUrl: null,
    gmvJpy: BigInt(10_000 - index),
    completedCount: 20 - index
  }));

const createHarness = () => {
  const queries: SqlQuery[] = [];
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    queries.push(query);
    const sql = queryText(query);
    const scope = scopeCode(query);

    if (sql.includes("live_dashboard_children")) {
      if (scope === "JP") {
        return [
          {
            code: "13",
            name: "東京都",
            orderCount: 2n,
            confirmedPaymentJpy: 12_000n,
            confirmedPaymentNdp: 500n,
            confirmedPaymentTestNdp: 40n
          }
        ];
      }
      if (scope === "13") {
        return [
          {
            code: "13104",
            name: "新宿区",
            orderCount: 1n,
            confirmedPaymentJpy: 7_000n,
            confirmedPaymentNdp: 300n,
            confirmedPaymentTestNdp: 0n
          }
        ];
      }
      return [];
    }

    if (sql.includes("live_dashboard_headline_orders")) {
      return [
        scope === "JP"
          ? { newOrders: 4n, completedOrders: 3n }
          : scope === "13"
            ? { newOrders: 2n, completedOrders: 2n }
            : { newOrders: 1n, completedOrders: 1n }
      ];
    }

    if (sql.includes("live_dashboard_headline_entities")) {
      return [
        scope === "JP"
          ? { newCustomers: 3n, onboardedTechnicians: 2n }
          : scope === "13"
            ? { newCustomers: 1n, onboardedTechnicians: 1n }
            : { newCustomers: 0n, onboardedTechnicians: 1n }
      ];
    }

    if (sql.includes("live_dashboard_money_orders")) {
      return [
        scope === "JP"
          ? {
              totalOrders: 4n,
              serviceGmvJpy: 19_000n,
              confirmedPaymentJpy: 19_000n,
              confirmedPaymentNdp: 800n,
              confirmedPaymentTestNdp: 40n,
              platformNetRevenueNdp: 600n,
              platformNetRevenueTestNdp: 30n
            }
          : scope === "13"
            ? {
                totalOrders: 2n,
                serviceGmvJpy: 12_000n,
                confirmedPaymentJpy: 12_000n,
                confirmedPaymentNdp: 500n,
                confirmedPaymentTestNdp: 40n,
                platformNetRevenueNdp: 400n,
                platformNetRevenueTestNdp: 30n
              }
            : {
                totalOrders: 1n,
                serviceGmvJpy: 7_000n,
                confirmedPaymentJpy: 7_000n,
                confirmedPaymentNdp: 300n,
                confirmedPaymentTestNdp: 0n,
                platformNetRevenueNdp: -5n,
                platformNetRevenueTestNdp: 0n
              }
      ];
    }

    if (sql.includes("live_dashboard_realtime_orders")) {
      return Array.from({ length: 22 }, (_, index) => ({
        totalCount: 22n,
        orderNo: `order-${index + 1}`,
        status: index === 0 ? "completed" : "pending",
        serviceName: `service ${index + 1}`,
        amountJpy: 1000 + index,
        createdAt: new Date(evaluatedAt.getTime() - index * 1000)
      }));
    }

    if (sql.includes("live_dashboard_activity")) {
      return [
        {
          orderNo: "order-1",
          status: "completed",
          serviceName: "service 1",
          amountJpy: 1000,
          occurredAt: evaluatedAt
        }
      ];
    }

    if (sql.includes("live_dashboard_trend")) {
      const includesSnapshotPaymentCutoff = sql.includes("booking.payment_confirmed_at <=");
      return [
        {
          bucketKey: "2026-09-06",
          label: "09-06",
          orderCount: 4n,
          // A 03:30 confirmation is inside the current bucket but after evaluatedAt 03:04:05.
          confirmedPaymentJpy: includesSnapshotPaymentCutoff ? 19_000n : 1_019_000n,
          confirmedPaymentNdp: 800n,
          confirmedPaymentTestNdp: 40n
        }
      ];
    }

    if (sql.includes("live_dashboard_service_ranking")) return rankRows("service", 12);
    if (sql.includes("live_dashboard_technician_ranking")) {
      return rankRows("technician", 11);
    }

    if (sql.includes("live_dashboard_coverage")) {
      if (scope === "JP") return [{ total: 4n, attributed: 3n, unresolved: 1n }];
      if (scope === "13") return [{ total: 2n, attributed: 2n, unresolved: 0n }];
      return [{ total: 1n, attributed: 1n, unresolved: 0n }];
    }

    throw new Error(`Unexpected live-dashboard query: ${sql}`);
  });

  const transaction = jest.fn(
    async (callback: (client: { $queryRaw: typeof queryRaw }) => unknown) =>
      callback({ $queryRaw: queryRaw })
  );
  const client = {
    $queryRaw: queryRaw,
    $transaction: transaction
  } as unknown as PrismaClient;
  return { repository: new LiveDashboardRepository(client), queries, transaction };
};

describe("LiveDashboardRepository", () => {
  it("uses non-reserved rankingPosition aliases for both MySQL ranking queries", async () => {
    const harness = createHarness();
    await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });
    const rankingQueries = harness.queries.filter((query) =>
      /live_dashboard_(?:service|technician)_ranking/u.test(queryText(query))
    );
    expect(rankingQueries).toHaveLength(2);
    for (const query of rankingQueries) {
      expect(queryText(query)).not.toMatch(/\bAS\s+rank\b/iu);
      expect(queryText(query)).toContain("ranking_position AS rankingPosition");
    }
  });

  it("maps driver rankingPosition values to unchanged public rank for both rankings", async () => {
    const { repository } = createHarness();
    const snapshot = await repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });
    for (const ranking of [snapshot.serviceRanking, snapshot.technicianRanking]) {
      expect(ranking.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(ranking[0]).not.toHaveProperty("rankingPosition");
    }
  });

  it("includes missing historical snapshots in national order facts and unresolved coverage, never narrow scopes", async () => {
    const national = createHarness();
    await national.repository.getSnapshotFacts({ scope: { countryCode: "JP", admin1Code: null, admin2Code: null }, period: "today", evaluatedAt });
    for (const marker of ["headline_orders", "money_orders", "realtime_orders", "activity", "trend", "service_ranking", "technician_ranking", "coverage"]) {
      const query = national.queries.find((item) => queryText(item).includes(`live_dashboard_${marker}`))!;
      expect(queryText(query)).toContain("LEFT JOIN booking_service_locations AS location");
      expect(queryText(query)).toContain("location.booking_order_id IS NULL OR");
    }
    const coverage = queryText(national.queries.find((item) => queryText(item).includes("live_dashboard_coverage"))!);
    expect(coverage).toContain("SUM(COALESCE(location.resolution_status,");
    const children = national.queries.find((item) => queryText(item).includes("live_dashboard_children"))!;
    expect(children.values).toContain("VERIFIED");
    const narrow = createHarness();
    await narrow.repository.getSnapshotFacts({ scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }, period: "today", evaluatedAt });
    for (const query of narrow.queries) {
      expect(queryText(query)).not.toContain("location.booking_order_id IS NULL OR");
      expect(query.values).toContain("VERIFIED");
    }
  });

  it("composes nationwide, Tokyo, and Shinjuku facts at one evaluation boundary", async () => {
    const harness = createHarness();
    const jp = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });
    const tokyo = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      period: "today",
      evaluatedAt
    });
    const shinjuku = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      period: "today",
      evaluatedAt
    });

    expect(jp.coverage).toEqual({
      total: 4,
      attributed: 3,
      unresolved: 1,
      completenessPercent: 75
    });
    expect(tokyo.orders.total).toBe(2);
    expect(shinjuku.orders.total).toBe(1);
    expect(shinjuku.orders.platformNetRevenue.ndp).toBe(-5);
    expect(jp.evaluatedAt).toEqual(tokyo.evaluatedAt);
    expect(tokyo.evaluatedAt).toEqual(shinjuku.evaluatedAt);
    expect(jp.scope).toEqual({ countryCode: "JP", admin1Code: null, admin2Code: null });
    expect(tokyo.children[0]).toMatchObject({ code: "13104", name: "新宿区", orderCount: 1 });
    const nationwideChildrenQuery = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_children")
    );
    expect(queryText(nationwideChildrenQuery!)).toContain("parent.official_code =");
    expect(nationwideChildrenQuery?.values).toContain("JP");
    expect(queryText(nationwideChildrenQuery!)).not.toContain("child.parent_id IS NULL");
    expect(harness.transaction).toHaveBeenCalledTimes(3);
    expect(harness.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
  });

  it("keeps child order-start and confirmed-payment fixture axes independent", async () => {
    const harness = createHarness();
    const snapshot = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });

    expect(snapshot.children[0]).toMatchObject({
      orderCount: 2,
      confirmedPayments: { jpy: 12_000, ndp: 500, testNdp: 40 }
    });
    const query = harness.queries.find((candidate) =>
      queryText(candidate).includes("live_dashboard_children")
    );
    const sql = queryText(query!);
    expect(sql).toMatch(/child_order_counts AS \([\s\S]*booking\.starts_at >=/u);
    expect(sql).toMatch(/child_confirmed_payments AS \([\s\S]*booking\.payment_confirmed_at >=/u);
    expect(sql).toContain("booking.payment_confirmed_at <=");
    expect(sql).not.toContain("LEFT JOIN shops AS shop");
    expect(sql.match(/INNER JOIN shops AS shop/gu) ?? []).toHaveLength(2);
    expect(query?.values?.filter((value) => value === evaluatedAt).length).toBeGreaterThanOrEqual(
      2
    );
  });

  it("keeps JPY, NDP, and Test NDP separate and bounds every scrolling page", async () => {
    const harness = createHarness();
    const result = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });

    expect(result.confirmedPayments).toEqual({ jpy: 19_000, ndp: 800, testNdp: 40 });
    expect(result.orders).toEqual({
      total: 4,
      serviceGmv: { jpy: 19_000, ndp: 0, testNdp: 0 },
      platformNetRevenue: { jpy: 0, ndp: 600, testNdp: 30 },
      agentCommission: null
    });
    expect(result.realtimeOrders).toMatchObject({ total: 22, page: 1, page_size: 20 });
    expect(result.realtimeOrders.list).toHaveLength(20);
    expect(result.serviceRanking).toHaveLength(10);
    expect(result.technicianRanking).toHaveLength(10);
    expect(result.serviceRanking.at(-1)?.rank).toBe(10);
  });

  it("reuses formal payment authority and accepts manual receipts without OrderFinancial", async () => {
    const harness = createHarness();
    const result = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });
    const authoritySql = queryText(formalConfirmedPaymentEvidence() as SqlQuery);
    const children = queryText(
      harness.queries.find((query) => queryText(query).includes("live_dashboard_children"))!
    );
    const moneyQuery = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_money_orders")
    )!;
    const money = queryText(moneyQuery);
    const trend = queryText(
      harness.queries.find((query) => queryText(query).includes("live_dashboard_trend"))!
    );
    const eligibleSegments = [
      cteSlice(children, "child_confirmed_payments AS (", ")\n      SELECT child"),
      cteSlice(money, "eligible_payments AS (", "), revenue AS ("),
      cteSlice(trend, "eligible_payments AS (", ")\n      SELECT bucket")
    ];

    expect(result.confirmedPayments).toEqual({ jpy: 19_000, ndp: 800, testNdp: 40 });
    for (const eligible of eligibleSegments) {
      expect(eligible).toContain(authoritySql);
      expect(eligible).toContain("formal_confirmed_payment_evidence");
      expect(eligible).not.toContain("order_financials");
      expect(eligible).not.toContain("financial.");
    }
    expect(eligibleSegments[0]).toContain("CASE WHEN ledger.currency =");
    expect(eligibleSegments[1]).toContain("ledger.currency AS ndp_currency");
    expect(eligibleSegments[2]).toContain("ledger.currency AS ndp_currency");
    expect(moneyQuery.values).toEqual(
      expect.arrayContaining([
        "ndp",
        "cash",
        "other",
        "booking_complete_settlement",
        "applied",
        ":technician-receipt",
        ":operations-receipt",
        "NDP",
        "TEST_NDP"
      ])
    );
  });

  it("uses formal payment evidence, excludes refunds/reversals, and scopes every business read by booking location", async () => {
    const harness = createHarness();
    await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      period: "last7days",
      evaluatedAt
    });

    const businessQueries = harness.queries.filter(
      (query) => !queryText(query).includes("live_dashboard_headline_entities")
    );
    for (const query of businessQueries) {
      const sql = queryText(query);
      expect(sql).toContain("deleted_at IS NULL");
      expect(sql).toContain("booking_service_locations");
      expect(sql).toContain("location.deleted_at IS NULL");
      expect(query.values).toEqual(expect.arrayContaining(["JP", "13", "13104", "VERIFIED"]));
      expect(query.values).toContain(evaluatedAt);
      expect(sql).not.toContain("profile.city");
      expect(sql).not.toContain("TRIM(shop.city)");
      expect(sql).not.toContain("BINARY shop.city =");
      expect(sql).not.toContain("fee_calculation_logs");
    }

    const money = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_money_orders")
    );
    const moneySql = queryText(money!);
    expect(moneySql).toContain("booking.status =");
    expect(moneySql).toContain("booking.payment_status =");
    expect(moneySql).toContain("booking.payment_refunded_at IS NULL");
    expect(moneySql).toContain("booking.payment_refunded_by_id IS NULL");
    expect(moneySql).toContain("booking.payment_refund_reference IS NULL");
    expect(moneySql).toContain("booking.payment_refund_reason IS NULL");
    expect(moneySql).toContain("booking.starts_at >=");
    expect(moneySql).toContain("booking.payment_confirmed_at >=");
    expect(moneySql).toContain("financial.user_reward_granted_at >=");
    expect(moneySql).toContain("checkout.deleted_at IS NULL");
    expect(moneySql).toContain("financial.deleted_at IS NULL");
    expect(moneySql).toContain("ledger.deleted_at IS NULL");
    expect(moneySql).not.toContain("fee_calculation_logs");
    expect(money?.values).toEqual(
      expect.arrayContaining([
        "completed",
        "confirmed",
        "booking_complete_settlement",
        "applied",
        "order_checkout_payment",
        "NDP",
        "TEST_NDP"
      ])
    );

    for (const marker of ["live_dashboard_service_ranking", "live_dashboard_technician_ranking"]) {
      const ranking = harness.queries.find((query) => queryText(query).includes(marker));
      expect(queryText(ranking!)).toContain("LIMIT 10");
      expect(queryText(ranking!)).toContain("candidate.payment_refunded_at IS NOT NULL");
    }
    const realtime = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_realtime_orders")
    );
    expect(queryText(realtime!)).toContain("LIMIT 20");

    const trend = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_trend")
    );
    expect(queryText(trend!)).toContain("booking.starts_at >= bucket.from_inclusive");

    const serviceRanking = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_service_ranking")
    );
    expect(queryText(serviceRanking!)).toContain(
      "candidate.session_ended_at > candidate.payment_confirmed_at"
    );
    expect(queryText(serviceRanking!)).toContain("candidate.customer_is_test = FALSE");
    expect(queryText(serviceRanking!)).toContain("candidate.technician_user_is_test = FALSE");
    for (const evidence of [
      "candidate.calculation_snapshot_json",
      "COALESCE(add_ons.accepted_amount, 0) <> candidate.add_on_amount_jpy",
      "SUM(BINARY add_on.currency <> BINARY",
      "candidate.receipt_confirmed_by_id = candidate.technician_user_id"
    ]) {
      expect(queryText(serviceRanking!)).toContain(evidence);
    }
    expect(serviceRanking?.values).toEqual(
      expect.arrayContaining([
        "booking_complete_settlement",
        "ndp_payment_applied",
        "receipt_confirmed",
        "backoffice.order.checkout.receipt_override"
      ])
    );
    expect(queryText(serviceRanking!)).not.toContain("fee_calculation_logs");
  });

  it("groups the trend by its explicit MySQL ordering expression", async () => {
    const harness = createHarness();
    const snapshot = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      period: "last7days",
      evaluatedAt
    });
    const trend = harness.queries.find((query) =>
      queryText(query).includes("live_dashboard_trend")
    );
    expect(
      snapshot.trend.find((bucket) => bucket.key === "2026-09-06")?.confirmedPayments.jpy
    ).toBe(19_000);
    expect(queryText(trend!)).toContain("booking.payment_confirmed_at <=");
    expect(trend?.values).toContain(evaluatedAt);
    expect(queryText(trend!)).toContain(
      "GROUP BY bucket.bucket_key, bucket.label, bucket.from_inclusive, bucket.to_exclusive"
    );
    expect(queryText(trend!)).toContain("ORDER BY bucket.from_inclusive ASC");
  });

  it("fails closed when no interactive transaction boundary is available", async () => {
    const queryRaw = jest.fn();
    const repository = new LiveDashboardRepository({ $queryRaw: queryRaw } as never);
    await expect(
      repository.getSnapshotFacts({
        scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
        period: "today",
        evaluatedAt
      })
    ).rejects.toBeInstanceOf(TypeError);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("attributes newly-created customers and technicians through service occurrence only", async () => {
    const harness = createHarness();
    const nationwide = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "today",
      evaluatedAt
    });
    const tokyo = await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      period: "today",
      evaluatedAt
    });

    expect(nationwide.headline).toMatchObject({ newCustomers: 3, onboardedTechnicians: 2 });
    expect(tokyo.headline).toMatchObject({ newCustomers: 1, onboardedTechnicians: 1 });

    const entityQueries = harness.queries.filter((query) =>
      queryText(query).includes("live_dashboard_headline_entities")
    );
    const nationalSql = queryText(entityQueries[0]!);
    const tokyoSql = queryText(entityQueries[1]!);
    expect(nationalSql).toContain("profile.created_at >=");
    expect(nationalSql).toContain("technician.created_at >=");
    expect(nationalSql).not.toContain("profile.city");
    expect(nationalSql).not.toContain("technician.city");
    expect(nationalSql).not.toContain("service_occurrence.location_id IS NOT NULL");
    expect(tokyoSql).toContain("service_occurrence.location_id IS NOT NULL");
    expect(tokyoSql).toContain("service_occurrence.customer_user_id = profile.user_id");
    expect(tokyoSql).toContain("service_occurrence.technician_profile_id = technician.id");
    expect(tokyoSql).toContain("service_occurrence.booking_deleted_at IS NULL");
    expect(tokyoSql).toContain("service_occurrence.location_deleted_at IS NULL");
    expect(tokyoSql).not.toContain("profile.city");
    expect(tokyoSql).not.toContain("technician.city");
    expect(entityQueries.every((query) => queryText(query).includes("deleted_at IS NULL"))).toBe(
      true
    );
  });

  it("includes unresolved coverage nationwide but requires VERIFIED for narrower scopes", async () => {
    const harness = createHarness();
    await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      period: "last30days",
      evaluatedAt
    });
    await harness.repository.getSnapshotFacts({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      period: "last30days",
      evaluatedAt
    });

    const national = harness.queries.filter((query) => scopeCode(query) === "JP");
    const tokyo = harness.queries.filter((query) => scopeCode(query) === "13");
    expect(national.some((query) => query.values?.includes("UNRESOLVED"))).toBe(true);
    expect(
      national.filter((query) => !queryText(query).includes("live_dashboard_children"))
        .every((query) => !queryText(query).includes("location.resolution_status ="))
    ).toBe(true);
    expect(tokyo.every((query) => query.values?.includes("VERIFIED"))).toBe(true);
    expect(tokyo.every((query) => queryText(query).includes("location.resolution_status ="))).toBe(
      true
    );
  });
});
