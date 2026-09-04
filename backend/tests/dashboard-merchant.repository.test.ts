import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import { DashboardMerchantSnapshotService } from "../src/services/dashboard-merchant-snapshot.service";

type SqlQuery = {
  sql?: string;
  strings?: readonly string[];
  values?: unknown[];
};

const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";

const now = new Date("2026-08-31T03:00:00.000Z");
const window = resolveDashboardWindow({ period: "last7days" }, now);

const financeRows = [
  {
    periodKey: "current",
    ndpCurrency: "NDP",
    platformFeeActualNdp: 500n,
    requestFeeActualNdp: 0n,
    paidUserRewardNdp: 100n
  },
  {
    periodKey: "current",
    ndpCurrency: "TEST_NDP",
    platformFeeActualNdp: 800n,
    requestFeeActualNdp: 0n,
    paidUserRewardNdp: 200n
  },
  {
    periodKey: "2026-08-25",
    ndpCurrency: "NDP",
    platformFeeActualNdp: 300n,
    requestFeeActualNdp: 0n,
    paidUserRewardNdp: 50n
  }
];

const createClient = (walletOpened = true) => {
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    const sql = queryText(query);
    if (sql.includes("dashboard_finance_flows")) return financeRows;
    if (sql.includes("dashboard_frozen_stock")) {
      return [
        { periodKey: "current", ndpCurrency: "NDP", frozenNdp: 175n },
        { periodKey: "current", ndpCurrency: "TEST_NDP", frozenNdp: 40n },
        { periodKey: "2026-08-25", ndpCurrency: "NDP", frozenNdp: 225n }
      ];
    }
    if (sql.includes("dashboard_merchant_profit")) {
      return [
        { bucketKey: "2026-08-25", shopEstimatedGrossProfitJpy: 1_250n },
        { bucketKey: "2026-08-26", shopEstimatedGrossProfitJpy: -50n }
      ];
    }
    if (sql.includes("dashboard_merchant_shop_snapshot")) {
      return [
        {
          publicId: "s0000000021",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          address: "1-2-3 Aoyama",
          status: "published",
          activeTechnicianCount: 3n,
          billingProfileId: 8,
          billingCadence: "monthly",
          trialStatus: "active",
          trialEndsAt: new Date("2026-09-30T15:00:00.000Z"),
          paidThrough: null,
          walletId: walletOpened ? 91 : null,
          walletAvailableBalance: walletOpened ? 2_500 : null,
          walletFrozenBalance: walletOpened ? 175 : null
        }
      ];
    }
    throw new Error(`Unexpected merchant dashboard query: ${sql}`);
  });

  return {
    client: { $queryRaw: queryRaw } as unknown as PrismaClient,
    queryRaw
  };
};

describe("DashboardRepository merchant finance and current shop snapshot", () => {
  it("keeps formal shop cost separate and restricts frozen stock and profit to the shop", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getFinanceFacts({
      scope: { kind: "shop", shopId: 21 },
      city: null,
      window
    });

    expect(result.platformNetRevenue).toEqual({ ndp: 400, testNdp: 600 });
    expect(result.userReward).toEqual({ ndp: 100, testNdp: 200 });
    expect(result.frozen).toEqual({ ndp: 175, testNdp: 40 });
    expect(result.shopNdpCost).toEqual({
      totalNdp: 500,
      platformNdp: 400,
      userRewardNdp: 100
    });
    expect(result.walletStock).toBeNull();
    expect(result.withdrawn).toBeNull();
    expect(result.bucketPlatformNetRevenueNdp.get("2026-08-25")).toBe(250);
    expect(result.bucketFrozenNdp.get("2026-08-25")).toBe(225);
    expect(result.bucketShopEstimatedGrossProfitJpy).toEqual(
      new Map([
        ["2026-08-25", 1_250],
        ["2026-08-26", -50]
      ])
    );

    const queries = fixture.queryRaw.mock.calls.map(([query]) => ({
      sql: queryText(query as SqlQuery),
      values: (query as SqlQuery).values ?? []
    }));
    expect(queries).toHaveLength(3);
    expect(queries.every(({ values }) => values.includes(21))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("dashboard_wallet_stock"))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes("dashboard_withdrawn"))).toBe(false);

    const frozen = queries.find(({ sql }) => sql.includes("dashboard_frozen_stock"));
    expect(frozen?.sql).toContain("hold.fee_type =");
    expect(frozen?.values).toContain("b_platform_fee");

    const profit = queries.find(({ sql }) => sql.includes("dashboard_merchant_profit"));
    expect(profit?.sql).toContain("booking.starts_at >= bucket.from_inclusive");
    expect(profit?.sql).toContain("booking.starts_at < bucket.to_exclusive");
    expect(profit?.sql).toContain("booking.status =");
    expect(profit?.sql).toContain("booking.payment_status NOT IN");
    expect(profit?.sql).toContain("financial.service_income_status IN");
    expect(profit?.sql).toContain("financial.shop_id = booking.shop_id");
    expect(profit?.sql).toContain("booking.shop_id =");
    expect(profit?.sql).toContain("shop.id = booking.shop_id");
    expect(profit?.sql).not.toContain("shop.id = financial.shop_id");
    expect(profit?.sql).toContain("shopEstimatedGrossProfitJpy");
    expect(profit?.sql).toContain("JSON_TYPE");
    expect(profit?.sql).not.toContain("technicianNetIncomeJpy");
    expect(profit?.sql).not.toContain("financial.service_amount_jpy -");
    expect(profit?.values).toEqual(
      expect.arrayContaining([
        21,
        "completed",
        "refund_pending",
        "refunded",
        "reported",
        "confirmed",
        "technician_income_estimated"
      ])
    );
  });

  it("loads public shop, active billing, technicians, and the current formal wallet once", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    const facts = await repository.getMerchantFacts({
      scope: { kind: "shop", shopId: 21 },
      city: null,
      window
    });
    expect(facts).toEqual({
      publicId: "s0000000021",
      name: "Aoyama Care Studio",
      city: "Tokyo",
      address: "1-2-3 Aoyama",
      status: "published",
      activeTechnicianCount: 3,
      billing: {
        cadence: "monthly",
        trialStatus: "active",
        trialEndsAt: new Date("2026-09-30T15:00:00.000Z"),
        paidThrough: null
      },
      wallet: {
        currency: "NDP",
        availableBalance: 2_500,
        frozenBalance: 175
      }
    });
    expect(new DashboardMerchantSnapshotService(undefined, () => now).compose(facts)).toEqual({
      publicId: "s0000000021",
      name: "Aoyama Care Studio",
      city: "Tokyo",
      address: "1-2-3 Aoyama",
      status: "published",
      billing: {
        cadence: "monthly",
        state: "trial",
        trialEndsAt: "2026-09-30T15:00:00.000Z",
        paidThrough: null
      },
      wallet: {
        status: "available",
        currency: "NDP",
        availableBalance: 2_500,
        frozenBalance: 175
      }
    });

    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);
    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("dashboard_merchant_shop_snapshot");
    expect(sql).toContain("public_identifiers");
    expect(sql).toContain("saas_billing_profiles");
    expect(sql).toContain("technician_profiles");
    expect(sql).toContain("wallets");
    expect(sql).toContain("billing.active_key IS NOT NULL");
    expect(sql).toContain("wallet.currency =");
    expect(query.values).toEqual(
      expect.arrayContaining([21, "shop", "active", "published", "NDP"])
    );
    expect(query.values).not.toEqual(
      expect.arrayContaining([
        window.fromInclusive,
        window.toExclusive,
        window.previousFromInclusive,
        window.previousToExclusive
      ])
    );
  });

  it("returns not_opened with null balances when the formal shop wallet is absent", async () => {
    const fixture = createClient(false);
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getMerchantFacts({
      scope: { kind: "shop", shopId: 21 },
      city: null,
      window
    });

    expect(result?.wallet).toBeNull();
    expect(
      new DashboardMerchantSnapshotService(undefined, () => now).compose(result)?.wallet
    ).toEqual({
      status: "not_opened",
      currency: "NDP",
      availableBalance: null,
      frozenBalance: null
    });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);
  });
});
