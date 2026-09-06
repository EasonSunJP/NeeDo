import type { Prisma, PrismaClient } from "@prisma/client";
import { LiveDashboardRepository } from "../src/repositories/live-dashboard.repository";

type SqlQuery = Prisma.Sql & {
  sql?: string;
  strings?: readonly string[];
  values?: unknown[];
};

const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";
const evaluatedAt = new Date("2026-09-06T03:04:05.000Z");

const scopeCode = (query: SqlQuery): "JP" | "13" | "13104" => {
  if (query.values?.includes("13104")) return "13104";
  if (query.values?.includes("13")) return "13";
  return "JP";
};

const rankRows = (kind: "service" | "technician", count: number) =>
  Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
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
      return [
        {
          bucketKey: "2026-09-06",
          label: "09-06",
          orderCount: 4n,
          confirmedPaymentJpy: 19_000n,
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
      expect(sql).not.toMatch(/profile\.city|shop\.city/u);
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
      expect(queryText(ranking!)).toContain("booking.payment_refunded_at IS NULL");
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
      "session.ended_at <= booking.payment_confirmed_at"
    );
    expect(queryText(serviceRanking!)).toContain("customer_user.is_test_account = FALSE");
    expect(queryText(serviceRanking!)).toContain("technician_user.is_test_account = FALSE");
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
      national.every((query) => !queryText(query).includes("location.resolution_status ="))
    ).toBe(true);
    expect(tokyo.every((query) => query.values?.includes("VERIFIED"))).toBe(true);
    expect(tokyo.every((query) => queryText(query).includes("location.resolution_status ="))).toBe(
      true
    );
  });
});
