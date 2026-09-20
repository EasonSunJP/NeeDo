import type { PrismaClient } from "@prisma/client";
import type { DashboardFinanceFacts } from "../src/domain/dashboard";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { DashboardRepository } from "../src/repositories/dashboard.repository";

type SqlQuery = {
  sql?: string;
  strings?: readonly string[];
  values?: unknown[];
};

const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";

const window = resolveDashboardWindow(
  { period: "last7days" },
  new Date("2026-08-31T03:00:00.000Z")
);

const storedCityFixtures = [
  { city: "Tokyo", deletedAt: null },
  { city: "   ", deletedAt: null },
  { city: "Kyoto", deletedAt: new Date("2026-08-01T00:00:00.000Z") },
  { city: " Tokyo ", deletedAt: null },
  { city: "Osaka", deletedAt: null },
  { city: "Tokyo", deletedAt: null }
];

const createClient = () => {
  const scheduleCount = jest.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(5);
  const customerCount = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1);
  const shopCount = jest.fn().mockResolvedValueOnce(11).mockResolvedValueOnce(10);
  const pendingOrderCount = jest.fn(async () => 4);
  const orderAggregate = jest
    .fn()
    .mockResolvedValueOnce({ _sum: { priceAmount: 4_200 } })
    .mockResolvedValueOnce({ _sum: { priceAmount: 1_800 } });
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    const sql = queryText(query);
    if (sql.includes("dashboard_headline_series_3d")) {
      return [
        {
          bucketKey: "2026-08-29",
          availableScheduleSlots: 4n,
          activeTechnicians: 2n,
          registeredTechnicians: 130n,
          shopCount: 20n,
          newCustomers: 3n
        },
        {
          bucketKey: "2026-08-31",
          availableScheduleSlots: 6n,
          activeTechnicians: 4n,
          registeredTechnicians: 134n,
          shopCount: 21n,
          newCustomers: 1n
        }
      ];
    }
    if (sql.includes("dashboard_available_cities")) {
      return [
        ...new Set(
          storedCityFixtures
            .filter((row) => row.deletedAt === null && row.city.trim() !== "")
            .map((row) => row.city.trim())
        )
      ]
        .sort()
        .map((city) => ({ city }));
    }
    if (sql.includes("dashboard_city_activity_scalars")) {
      return [
        {
          periodKey: "current",
          availableScheduleSlots: 8n,
          serviceGmvJpy: 4_200n,
          newCustomers: 3n,
          shopCount: 11n,
          pendingOrders: 4n
        },
        {
          periodKey: "previous",
          availableScheduleSlots: 5n,
          serviceGmvJpy: 1_800n,
          newCustomers: 1n,
          shopCount: 10n,
          pendingOrders: 0n
        }
      ];
    }
    if (sql.includes("dashboard_active_technicians")) {
      return [
        { periodKey: "current", aggregateValue: 6n },
        { periodKey: "previous", aggregateValue: 4n }
      ];
    }
    if (sql.includes("dashboard_completed_customers")) {
      return [
        { periodKey: "current", aggregateValue: 7n },
        { periodKey: "previous", aggregateValue: 3n }
      ];
    }
    if (sql.includes("dashboard_registered_technicians")) {
      return [
        { periodKey: "current", aggregateValue: 9n },
        { periodKey: "previous", aggregateValue: 8n },
        { periodKey: "2026-08-25", aggregateValue: 4n },
        { periodKey: "2026-08-26", aggregateValue: 5n }
      ];
    }
    if (sql.includes("dashboard_shop_stock")) {
      return [
        { periodKey: "2026-08-25", aggregateValue: 10n },
        { periodKey: "2026-08-26", aggregateValue: 11n }
      ];
    }
    if (sql.includes("dashboard_order_series")) {
      return [
        { bucketKey: "2026-08-25", orderCount: 2n, serviceGmvJpy: 1_200 },
        { bucketKey: "2026-08-26", orderCount: 1n, serviceGmvJpy: 0 }
      ];
    }
    if (sql.includes("dashboard_schedule_series")) {
      return [
        {
          bucketKey: "2026-08-25",
          scheduleAvailableHours: 1.5,
          scheduleBookedHours: 1,
          scheduleAttendanceCount: 3n
        },
        {
          bucketKey: "2026-08-26",
          scheduleAvailableHours: 0,
          scheduleBookedHours: 2.25,
          scheduleAttendanceCount: 2n
        }
      ];
    }
    throw new Error(`Unexpected dashboard query: ${sql}`);
  });
  const client = {
    scheduleSlot: { count: scheduleCount },
    customerProfile: { count: customerCount },
    shop: { count: shopCount },
    bookingOrder: { count: pendingOrderCount, aggregate: orderAggregate },
    $queryRaw: queryRaw
  } as unknown as PrismaClient;

  return {
    client,
    scheduleCount,
    customerCount,
    shopCount,
    pendingOrderCount,
    orderAggregate,
    queryRaw
  };
};

describe("DashboardRepository activity and supply aggregates", () => {
  it("returns an exact three-day headline skeleton with scoped zero filling", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);
    const headlineWindow = resolveDashboardWindow(
      { period: "custom", from: "2026-08-29", to: "2026-08-31" },
      new Date("2026-08-31T03:00:00.000Z")
    );

    await expect(
      repository.getHeadlineSeries3d({
        scope: { kind: "platform" },
        city: "Tokyo",
        window: headlineWindow
      })
    ).resolves.toEqual([
      {
        key: "2026-08-29",
        label: "08-29",
        availableScheduleSlots: 4,
        activeTechnicians: 2,
        registeredTechnicians: 130,
        shopCount: 20,
        newCustomers: 3
      },
      {
        key: "2026-08-30",
        label: "08-30",
        availableScheduleSlots: 0,
        activeTechnicians: 0,
        registeredTechnicians: 0,
        shopCount: 0,
        newCustomers: 0
      },
      {
        key: "2026-08-31",
        label: "08-31",
        availableScheduleSlots: 6,
        activeTechnicians: 4,
        registeredTechnicians: 134,
        shopCount: 21,
        newCustomers: 1
      }
    ]);
    const query = fixture.queryRaw.mock.calls.find(([candidate]) =>
      queryText(candidate as SqlQuery).includes("dashboard_headline_series_3d")
    )?.[0] as SqlQuery;
    expect(queryText(query)).toContain("WITH buckets AS");
    expect(query.values).toEqual(expect.arrayContaining(["Tokyo"]));
  });

  it("normalizes, filters, and deduplicates cities while using the same TRIM scope", async () => {
    const fixture = createClient();
    const financeFacts = {
      platformNetRevenue: { ndp: 0, testNdp: 0 },
      frozen: { ndp: 0, testNdp: 0 },
      userReward: { ndp: 0, testNdp: 0 },
      walletStock: { ndp: 0, testNdp: 0 },
      withdrawn: { ndp: 0, testNdp: 0 },
      shopNdpCost: null,
      bucketPlatformNetRevenueNdp: new Map(),
      bucketFrozenNdp: new Map(),
      bucketShopEstimatedGrossProfitJpy: new Map()
    } satisfies DashboardFinanceFacts;
    const repository = new DashboardRepository(
      fixture.client,
      { getFinanceFacts: jest.fn(async () => financeFacts) },
      { getMerchantFacts: jest.fn(async () => null) }
    );

    const result = await repository.getDashboard({
      scope: { kind: "platform" },
      city: "Tokyo",
      window
    });

    expect(result.availableCities).toEqual(["Osaka", "Tokyo"]);
    const queries = fixture.queryRaw.mock.calls.map(([query]) => ({
      sql: queryText(query as SqlQuery),
      values: (query as SqlQuery).values ?? []
    }));
    const availableCities = queries.find(({ sql }) => sql.includes("dashboard_available_cities"));
    expect(availableCities?.sql).toContain("SELECT DISTINCT TRIM(shop.city) AS city");
    expect(availableCities?.sql).toContain("shop.deleted_at IS NULL");
    expect(availableCities?.sql).toContain("TRIM(shop.city) <>");
    expect(availableCities?.sql).toContain("ORDER BY city ASC");

    const scalar = queries.find(({ sql }) => sql.includes("dashboard_city_activity_scalars"));
    expect(scalar?.sql).toContain("TRIM(shop.city) =");
    expect(scalar?.sql).toContain("TRIM(profile.city) =");

    for (const marker of [
      "dashboard_active_technicians",
      "dashboard_completed_customers",
      "dashboard_shop_stock",
      "dashboard_order_series",
      "dashboard_schedule_series"
    ]) {
      expect(queries.find(({ sql }) => sql.includes(marker))?.sql).toContain("TRIM(shop.city) =");
    }
    const technicians = queries.find(({ sql }) => sql.includes("dashboard_registered_technicians"));
    expect(technicians?.sql).toContain("TRIM(profile.city) =");
    expect(technicians?.sql).toContain("TRIM(direct_shop.city) =");
    expect(technicians?.sql).toContain("TRIM(affiliation_shop.city) =");
    expect(
      queries
        .filter(({ sql }) => !sql.includes("dashboard_available_cities"))
        .every(({ values }) => values.includes("Tokyo"))
    ).toBe(true);
  });

  it("returns current, previous, and a complete server-bucket skeleton from bounded queries", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getActivityFacts({
      scope: { kind: "platform" },
      city: null,
      window
    });

    expect(result.current).toEqual({
      availableScheduleSlots: 8,
      activeTechnicians: 6,
      registeredTechnicians: 9,
      shopCount: 11,
      newCustomers: 3,
      pendingOrders: 4,
      serviceGmvJpy: 4_200,
      completedCustomerCount: 7
    });
    expect(result.previous).toEqual({
      availableScheduleSlots: 5,
      activeTechnicians: 4,
      registeredTechnicians: 8,
      shopCount: 10,
      newCustomers: 1,
      serviceGmvJpy: 1_800,
      completedCustomerCount: 3
    });
    expect(result.buckets).toHaveLength(window.buckets.length);
    expect(result.buckets[0]).toEqual({
      key: "2026-08-25",
      label: "08-25",
      orderCount: 2,
      serviceGmvJpy: 1_200,
      shopCount: 10,
      registeredTechnicianCount: 4,
      scheduleTotalHours: 2.5,
      scheduleAvailableHours: 1.5,
      scheduleBookedHours: 1,
      scheduleAttendanceCount: 3
    });
    expect(result.buckets[1]).toMatchObject({
      key: "2026-08-26",
      orderCount: 1,
      serviceGmvJpy: 0,
      shopCount: 11,
      registeredTechnicianCount: 5,
      scheduleTotalHours: 2.25,
      scheduleAvailableHours: 0,
      scheduleBookedHours: 2.25,
      scheduleAttendanceCount: 2
    });
    expect(result.buckets.at(-1)).toEqual({
      key: "2026-08-31",
      label: "08-31",
      orderCount: 0,
      serviceGmvJpy: 0,
      shopCount: 0,
      registeredTechnicianCount: 0,
      scheduleTotalHours: 0,
      scheduleAvailableHours: 0,
      scheduleBookedHours: 0,
      scheduleAttendanceCount: 0
    });

    expect(fixture.scheduleCount).toHaveBeenCalledTimes(2);
    expect(fixture.customerCount).toHaveBeenCalledTimes(2);
    expect(fixture.shopCount).toHaveBeenCalledTimes(2);
    expect(fixture.pendingOrderCount).toHaveBeenCalledTimes(1);
    expect(fixture.orderAggregate).toHaveBeenCalledTimes(2);
    expect(fixture.queryRaw).toHaveBeenCalledTimes(6);
    const scheduleQuery = fixture.queryRaw.mock.calls.find(([candidate]) =>
      queryText(candidate as SqlQuery).includes("dashboard_schedule_series")
    )?.[0] as SqlQuery;
    expect(queryText(scheduleQuery)).toContain("COUNT(DISTINCT slot.technician_profile_id)");
  });

  it("excludes soft-deleted related shops from every all-city platform scalar and raw aggregate", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    await repository.getActivityFacts({
      scope: { kind: "platform" },
      city: null,
      window
    });

    expect(fixture.scheduleCount).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
        status: "AVAILABLE",
        startsAt: { lt: window.toExclusive },
        endsAt: { gt: window.fromInclusive },
        shop: { deletedAt: null }
      }
    });
    expect(fixture.pendingOrderCount).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: "PENDING",
        shop: { deletedAt: null }
      }
    });
    expect(fixture.orderAggregate).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
        status: "COMPLETED",
        paymentStatus: { notIn: ["REFUND_PENDING", "REFUNDED"] },
        startsAt: { gte: window.fromInclusive, lt: window.toExclusive },
        shop: { deletedAt: null }
      },
      _sum: { priceAmount: true }
    });

    const relatedShopQueries = fixture.queryRaw.mock.calls
      .map(([query]) => queryText(query as SqlQuery))
      .filter((sql) =>
        [
          "dashboard_active_technicians",
          "dashboard_completed_customers",
          "dashboard_order_series",
          "dashboard_schedule_series"
        ].some((marker) => sql.includes(marker))
      );
    expect(relatedShopQueries).toHaveLength(4);
    expect(relatedShopQueries.every((sql) => sql.includes("shop.deleted_at IS NULL"))).toBe(true);
  });

  it("applies overlap, soft-delete, cumulative, startsAt, refund, union, and clipping rules", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    await repository.getActivityFacts({
      scope: { kind: "platform" },
      city: "Tokyo",
      window
    });

    expect(fixture.scheduleCount).not.toHaveBeenCalled();
    expect(fixture.customerCount).not.toHaveBeenCalled();
    expect(fixture.shopCount).not.toHaveBeenCalled();
    expect(fixture.pendingOrderCount).not.toHaveBeenCalled();
    expect(fixture.orderAggregate).not.toHaveBeenCalled();

    const queries = fixture.queryRaw.mock.calls.map(([query]) => ({
      sql: queryText(query as SqlQuery),
      values: (query as SqlQuery).values ?? []
    }));
    const active = queries.find(({ sql }) => sql.includes("dashboard_active_technicians"));
    expect(active?.sql).toContain("UNION");
    expect(active?.sql).toContain("slot.deleted_at IS NULL");
    expect(active?.sql).toContain("booking.deleted_at IS NULL");
    expect(active?.sql).toContain("booking.status <>");
    expect(active?.sql).toContain("profile.deleted_at IS NULL");
    expect(active?.values).toContain("cancelled");

    const scalars = queries.find(({ sql }) => sql.includes("dashboard_city_activity_scalars"));
    expect(scalars?.sql).toContain("slot.starts_at < period.to_exclusive");
    expect(scalars?.sql).toContain("booking.starts_at >= period.from_inclusive");
    expect(scalars?.sql).toContain("booking.payment_status NOT IN");
    expect(scalars?.sql).toContain("profile.created_at < period.to_exclusive");
    expect(scalars?.sql).toContain("shop.created_at < period.to_exclusive");
    expect(scalars?.sql).toContain("TRIM(profile.city) =");
    expect(scalars?.sql.match(/TRIM\(shop\.city\) =/gu)).toHaveLength(4);

    const technicians = queries.find(({ sql }) => sql.includes("dashboard_registered_technicians"));
    expect(technicians?.sql).toContain("profile.created_at < cutoffs.cutoff");
    expect(technicians?.sql).toContain("affiliation.work_status =");
    expect(technicians?.sql).toContain("affiliation.deleted_at IS NULL");
    expect(technicians?.sql).toContain("affiliation.starts_at < cutoffs.cutoff");
    expect(technicians?.sql).toContain("affiliation.ends_at >= cutoffs.cutoff");
    expect(technicians?.sql).toContain("TRIM(direct_shop.city) =");
    expect(technicians?.sql).toContain("TRIM(affiliation_shop.city) =");
    expect(technicians?.values).toEqual(expect.arrayContaining(["active", "Tokyo"]));

    const orders = queries.find(({ sql }) => sql.includes("dashboard_order_series"));
    expect(orders?.sql).toContain("booking.starts_at >= bucket.from_inclusive");
    expect(orders?.sql).toContain("booking.starts_at < bucket.to_exclusive");
    expect(orders?.sql).toContain("COUNT(booking.id)");
    expect(orders?.sql).toContain("booking.status =");
    expect(orders?.sql).toContain("booking.payment_status NOT IN");
    expect(orders?.values).toEqual(
      expect.arrayContaining(["completed", "refund_pending", "refunded", "Tokyo"])
    );

    const completedCustomers = queries.find(({ sql }) =>
      sql.includes("dashboard_completed_customers")
    );
    expect(completedCustomers?.sql).toContain("COUNT(DISTINCT booking.customer_user_id)");
    expect(completedCustomers?.values).toEqual(
      expect.arrayContaining(["completed", "refund_pending", "refunded"])
    );

    const schedule = queries.find(({ sql }) => sql.includes("dashboard_schedule_series"));
    expect(schedule?.sql).toContain("slot.starts_at < bucket.to_exclusive");
    expect(schedule?.sql).toContain("slot.ends_at > bucket.from_inclusive");
    expect(schedule?.sql).toContain("slot.deleted_at IS NULL");
    expect(schedule?.sql).toContain("GREATEST(slot.starts_at, bucket.from_inclusive)");
    expect(schedule?.sql).toContain("LEAST(slot.ends_at, bucket.to_exclusive)");
    expect(schedule?.values).toEqual(expect.arrayContaining(["available", "booked", "Tokyo"]));

    expect(fixture.queryRaw).toHaveBeenCalledTimes(7);
    expect(queries.every(({ values }) => values.includes("Tokyo"))).toBe(true);
  });

  it("keeps every merchant query shop-scoped and does not query platform-only cards", async () => {
    const fixture = createClient();
    fixture.customerCount.mockImplementation(async () => {
      throw new Error("merchant dashboard must not query customers");
    });
    fixture.shopCount.mockImplementation(async () => {
      throw new Error("merchant dashboard must not query platform shop stock");
    });
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getActivityFacts({
      scope: { kind: "shop", shopId: 21 },
      city: null,
      window
    });

    expect(result.current.shopCount).toBeNull();
    expect(result.current.newCustomers).toBeNull();
    expect(result.previous.shopCount).toBeNull();
    expect(result.previous.newCustomers).toBeNull();
    expect(result.buckets.every((bucket: { shopCount: number }) => bucket.shopCount === 0)).toBe(
      true
    );
    expect(fixture.customerCount).not.toHaveBeenCalled();
    expect(fixture.shopCount).not.toHaveBeenCalled();
    expect(
      fixture.scheduleCount.mock.calls.every(
        ([input]) => input.where.shopId === 21 && input.where.shop?.deletedAt === null
      )
    ).toBe(true);
    expect(fixture.pendingOrderCount).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: "PENDING",
        shopId: 21,
        shop: { deletedAt: null }
      }
    });
    expect(
      fixture.orderAggregate.mock.calls.every(
        ([input]) => input.where.shopId === 21 && input.where.shop?.deletedAt === null
      )
    ).toBe(true);
    expect(fixture.queryRaw).toHaveBeenCalledTimes(5);
    expect(
      fixture.queryRaw.mock.calls.every(([query]) => (query as SqlQuery).values?.includes(21))
    ).toBe(true);
    const relatedShopQueries = fixture.queryRaw.mock.calls
      .map(([query]) => queryText(query as SqlQuery))
      .filter((sql) => !sql.includes("dashboard_registered_technicians"));
    expect(relatedShopQueries).toHaveLength(4);
    expect(relatedShopQueries.every((sql) => sql.includes("shop.deleted_at IS NULL"))).toBe(true);
  });
});
