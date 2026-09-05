import type { PrismaClient } from "@prisma/client";
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

const createClient = () => {
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    const sql = queryText(query);
    if (sql.includes("dashboard_finance_flows")) {
      return [
        {
          periodKey: "current",
          ndpCurrency: "NDP",
          platformFeeActualNdp: 500n,
          requestFeeActualNdp: 200n,
          paidUserRewardNdp: 100n
        },
        {
          periodKey: "current",
          ndpCurrency: "TEST_NDP",
          platformFeeActualNdp: 70n,
          requestFeeActualNdp: 30n,
          paidUserRewardNdp: 10n
        },
        {
          periodKey: "2026-08-25",
          ndpCurrency: "NDP",
          platformFeeActualNdp: 300n,
          requestFeeActualNdp: 50n,
          paidUserRewardNdp: 25n
        },
        {
          periodKey: "2026-08-26",
          ndpCurrency: "NDP",
          platformFeeActualNdp: 200n,
          requestFeeActualNdp: 150n,
          paidUserRewardNdp: 75n
        }
      ];
    }
    if (sql.includes("dashboard_frozen_stock")) {
      return [
        { periodKey: "current", ndpCurrency: "NDP", frozenNdp: 310n },
        { periodKey: "current", ndpCurrency: "TEST_NDP", frozenNdp: 40n },
        { periodKey: "2026-08-25", ndpCurrency: "NDP", frozenNdp: 500n },
        { periodKey: "2026-08-26", ndpCurrency: "NDP", frozenNdp: 325n }
      ];
    }
    if (sql.includes("dashboard_wallet_stock")) {
      return [
        { ndpCurrency: "NDP", walletStockNdp: 1_400n },
        { ndpCurrency: "TEST_NDP", walletStockNdp: 600n }
      ];
    }
    if (sql.includes("dashboard_withdrawn")) {
      return [
        { ndpCurrency: "NDP", withdrawnNdp: 250n },
        // Defensive fixture: even an impossible Test row must never enter withdrawals.
        { ndpCurrency: "TEST_NDP", withdrawnNdp: 999n }
      ];
    }
    if (sql.includes("dashboard_merchant_profit")) {
      return [];
    }
    throw new Error(`Unexpected dashboard finance query: ${sql}`);
  });

  return {
    client: { $queryRaw: queryRaw } as unknown as PrismaClient,
    queryRaw
  };
};

describe("DashboardRepository formal finance aggregates", () => {
  it("separates formal and Test NDP and uses paid grant time for net revenue", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getFinanceFacts({
      scope: { kind: "platform" },
      city: "Tokyo",
      window
    });

    expect(result.platformNetRevenue).toEqual({ ndp: 600, testNdp: 90 });
    expect(result.userReward).toEqual({ ndp: 100, testNdp: 10 });
    expect(result.frozen).toEqual({ ndp: 310, testNdp: 40 });
    expect(result.walletStock).toEqual({ ndp: 1_400, testNdp: 600 });
    expect(result.withdrawn).toEqual({ ndp: 250, testNdp: 0 });
    expect(result.shopNdpCost).toBeNull();
    expect(result.bucketPlatformNetRevenueNdp).toEqual(
      new Map([
        ["2026-08-25", 325],
        ["2026-08-26", 275]
      ])
    );
    expect(result.bucketFrozenNdp).toEqual(
      new Map([
        ["2026-08-25", 500],
        ["2026-08-26", 325]
      ])
    );
    expect(result.bucketShopEstimatedGrossProfitJpy).toEqual(new Map());

    const queries = fixture.queryRaw.mock.calls.map(([query]) => ({
      sql: queryText(query as SqlQuery),
      values: (query as SqlQuery).values ?? []
    }));
    const flows = queries.find(({ sql }) => sql.includes("dashboard_finance_flows"));
    expect(flows?.sql).not.toContain("AS interval");
    expect(flows?.sql).toContain("booking.starts_at >= period_window.from_inclusive");
    expect(flows?.sql).toContain("booking.starts_at < period_window.to_exclusive");
    expect(flows?.sql).toContain("financial.user_reward_status =");
    expect(flows?.sql).toContain(
      "financial.user_reward_granted_at >= period_window.from_inclusive"
    );
    expect(flows?.sql).toContain("financial.user_reward_granted_at < period_window.to_exclusive");
    expect(flows?.sql).toContain("financial.deleted_at IS NULL");
    expect(flows?.sql).toContain("booking.deleted_at IS NULL");
    expect(flows?.sql).toContain("financial.shop_id = booking.shop_id");
    expect(flows?.sql).toContain("shop.id = booking.shop_id");
    expect(flows?.sql.match(/financial\.shop_id = booking\.shop_id/gu)).toHaveLength(2);
    expect(flows?.sql.match(/shop\.id = booking\.shop_id/gu)).toHaveLength(2);
    expect(flows?.sql).not.toContain("shop.id = financial.shop_id");
    expect(flows?.sql).toContain("shop.deleted_at IS NULL");
    expect(flows?.sql).toContain("TRIM(shop.city) =");
    expect(flows?.values).toEqual(expect.arrayContaining(["paid", "Tokyo"]));
  });

  it("reconstructs hold and wallet stocks at the cutoff and validates applied withdrawals", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    await repository.getFinanceFacts({
      scope: { kind: "platform" },
      city: "Tokyo",
      window
    });

    const queries = fixture.queryRaw.mock.calls.map(([query]) => ({
      sql: queryText(query as SqlQuery),
      values: (query as SqlQuery).values ?? []
    }));
    const frozen = queries.find(({ sql }) => sql.includes("dashboard_frozen_stock"));
    expect(frozen?.sql).toContain("hold.created_at < cutoff.cutoff");
    expect(frozen?.sql).toContain("hold.captured_at < cutoff.cutoff");
    expect(frozen?.sql).toContain("hold.released_at < cutoff.cutoff");
    expect(frozen?.sql).toContain("hold.hold_amount_ndp");
    expect(frozen?.sql).toContain("hold.captured_amount_ndp");
    expect(frozen?.sql).toContain("hold.released_amount_ndp");
    expect(frozen?.sql).toContain("hold.deleted_at IS NULL");
    expect(frozen?.sql).toContain("TRIM(shop.city) =");
    expect(frozen?.values).toContain("Tokyo");

    const wallet = queries.find(({ sql }) => sql.includes("dashboard_wallet_stock"));
    expect(wallet?.sql).toContain("ROW_NUMBER() OVER");
    expect(wallet?.sql).toContain("PARTITION BY ledger.wallet_id");
    expect(wallet?.sql).toContain("ledger.available_balance_after + ledger.frozen_balance_after");
    expect(wallet?.sql).toContain("ledger.created_at <");
    expect(wallet?.sql).toContain("ledger.deleted_at IS NULL");
    expect(wallet?.sql).toContain("wallet.deleted_at IS NULL");
    expect(wallet?.sql).toContain("WHEN latest.wallet_total > 0 THEN latest.wallet_total");
    expect(wallet?.sql).not.toContain("wallet.available_balance + wallet.frozen_balance");
    expect(wallet?.values).not.toContain("Tokyo");

    const withdrawn = queries.find(({ sql }) => sql.includes("dashboard_withdrawn"));
    expect(withdrawn?.sql).toContain("request.type =");
    expect(withdrawn?.sql).toContain("request.status =");
    expect(withdrawn?.sql).toContain("request.ledger_transaction_id = ledger_transaction.id");
    expect(withdrawn?.sql).toContain("ledger_transaction.status =");
    expect(withdrawn?.sql).toContain("ledger_transaction.currency =");
    expect(withdrawn?.sql).toContain("ledger_transaction.created_at >=");
    expect(withdrawn?.sql).toContain("ledger_transaction.created_at <");
    expect(withdrawn?.sql).toContain("request.deleted_at IS NULL");
    expect(withdrawn?.sql).toContain("ledger_transaction.deleted_at IS NULL");
    expect(withdrawn?.values).toEqual(
      expect.arrayContaining(["withdrawal", "approved", "applied", "NDP"])
    );
    expect(withdrawn?.values).not.toContain("Tokyo");
    expect(fixture.queryRaw).toHaveBeenCalledTimes(4);
  });

  it("does not query platform-global wallet stock or withdrawals for merchant scope", async () => {
    const fixture = createClient();
    const repository = new DashboardRepository(fixture.client);

    const result = await repository.getFinanceFacts({
      scope: { kind: "shop", shopId: 11 },
      city: null,
      window
    });

    const querySql = fixture.queryRaw.mock.calls.map(([query]) => queryText(query as SqlQuery));
    expect(querySql.some((sql) => sql.includes("dashboard_wallet_stock"))).toBe(false);
    expect(querySql.some((sql) => sql.includes("dashboard_withdrawn"))).toBe(false);
    expect(result.walletStock).toBeNull();
    expect(result.withdrawn).toBeNull();
  });
});
