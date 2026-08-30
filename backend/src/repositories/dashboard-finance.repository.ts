import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DashboardAggregateInput,
  DashboardFinanceFacts,
  DashboardNdpPair
} from "../domain/dashboard";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;
type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;

interface PeriodRow {
  periodKey?: string;
  period_key?: string;
}

interface FinanceFlowRow extends PeriodRow {
  ndpCurrency?: string;
  ndp_currency?: string;
  platformFeeActualNdp?: NumericValue;
  platform_fee_actual_ndp?: NumericValue;
  requestFeeActualNdp?: NumericValue;
  request_fee_actual_ndp?: NumericValue;
  paidUserRewardNdp?: NumericValue;
  paid_user_reward_ndp?: NumericValue;
}

interface FrozenStockRow extends PeriodRow {
  ndpCurrency?: string;
  ndp_currency?: string;
  frozenNdp?: NumericValue;
  frozen_ndp?: NumericValue;
}

interface WalletStockRow {
  ndpCurrency?: string;
  ndp_currency?: string;
  walletStockNdp?: NumericValue;
  wallet_stock_ndp?: NumericValue;
}

interface WithdrawnRow {
  ndpCurrency?: string;
  ndp_currency?: string;
  withdrawnNdp?: NumericValue;
  withdrawn_ndp?: NumericValue;
}

interface MerchantProfitRow {
  bucketKey?: string;
  bucket_key?: string;
  shopEstimatedGrossProfitJpy?: NumericValue;
  shop_estimated_gross_profit_jpy?: NumericValue;
}

const periodKey = (row: PeriodRow): string => row.periodKey ?? row.period_key ?? "";
const bucketKey = (row: MerchantProfitRow): string => row.bucketKey ?? row.bucket_key ?? "";

export interface DashboardFinanceReader {
  getFinanceFacts(input: DashboardAggregateInput): Promise<DashboardFinanceFacts>;
}

export class DashboardFinanceRepository implements DashboardFinanceReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getFinanceFacts(input: DashboardAggregateInput): Promise<DashboardFinanceFacts> {
    const isPlatform = input.scope.kind === "platform";
    const [flowRows, frozenRows, walletRows, withdrawnRows, profitRows] = await Promise.all([
      this.queryFinanceFlows(input),
      this.queryFrozenStock(input),
      isPlatform ? this.queryWalletStock(input) : Promise.resolve([]),
      isPlatform ? this.queryWithdrawn(input) : Promise.resolve([]),
      isPlatform ? Promise.resolve([]) : this.queryMerchantProfit(input)
    ]);
    const currentFlows = this.financeFlowPair(flowRows, "current");
    const platformNetRevenue: DashboardNdpPair = {
      ndp:
        currentFlows.ndp.platformFeeActualNdp +
        currentFlows.ndp.requestFeeActualNdp -
        currentFlows.ndp.paidUserRewardNdp,
      testNdp:
        currentFlows.testNdp.platformFeeActualNdp +
        currentFlows.testNdp.requestFeeActualNdp -
        currentFlows.testNdp.paidUserRewardNdp
    };
    const userReward: DashboardNdpPair = {
      ndp: currentFlows.ndp.paidUserRewardNdp,
      testNdp: currentFlows.testNdp.paidUserRewardNdp
    };
    const frozen = this.frozenPair(frozenRows, "current");
    const walletStock = isPlatform
      ? this.currencyPair(walletRows, (row) => row.walletStockNdp ?? row.wallet_stock_ndp)
      : null;
    const formalWithdrawal = withdrawnRows.find(
      (row) => this.rowCurrency(row) === "NDP"
    );
    const withdrawn: DashboardNdpPair | null = isPlatform
      ? {
          ndp: this.toNumber(
            formalWithdrawal?.withdrawnNdp ?? formalWithdrawal?.withdrawn_ndp
          ),
          testNdp: 0
        }
      : null;

    return {
      platformNetRevenue,
      frozen,
      userReward,
      walletStock,
      withdrawn,
      shopNdpCost: isPlatform
        ? null
        : {
            totalNdp: currentFlows.ndp.platformFeeActualNdp,
            platformNdp:
              currentFlows.ndp.platformFeeActualNdp - currentFlows.ndp.paidUserRewardNdp,
            userRewardNdp: currentFlows.ndp.paidUserRewardNdp
          },
      bucketPlatformNetRevenueNdp: new Map(
        flowRows
          .filter(
            (row) => this.rowCurrency(row) === "NDP" && periodKey(row) !== "current"
          )
          .map((row) => [
            periodKey(row),
            this.toNumber(row.platformFeeActualNdp ?? row.platform_fee_actual_ndp) +
              this.toNumber(row.requestFeeActualNdp ?? row.request_fee_actual_ndp) -
              this.toNumber(row.paidUserRewardNdp ?? row.paid_user_reward_ndp)
          ])
      ),
      bucketFrozenNdp: new Map(
        frozenRows
          .filter(
            (row) => this.rowCurrency(row) === "NDP" && periodKey(row) !== "current"
          )
          .map((row) => [
            periodKey(row),
            this.toNumber(row.frozenNdp ?? row.frozen_ndp)
          ])
      ),
      bucketShopEstimatedGrossProfitJpy: new Map(
        profitRows.map((row) => [
          bucketKey(row),
          this.toNumber(
            row.shopEstimatedGrossProfitJpy ?? row.shop_estimated_gross_profit_jpy
          )
        ])
      )
    };
  }

  private financeIntervalTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        {
          key: "current",
          fromInclusive: input.window.fromInclusive,
          toExclusive: input.window.toExclusive
        },
        ...input.window.buckets
      ].map(
        (periodWindow) => Prisma.sql`SELECT ${periodWindow.key} AS period_key,
          ${periodWindow.fromInclusive} AS from_inclusive,
          ${periodWindow.toExclusive} AS to_exclusive`
      ),
      " UNION ALL "
    );
  }

  private financeCutoffTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        { key: "current", cutoff: input.window.toExclusive },
        ...input.window.buckets.map((bucket) => ({
          key: bucket.key,
          cutoff: bucket.toExclusive
        }))
      ].map(
        (cutoff) => Prisma.sql`SELECT ${cutoff.key} AS period_key, ${cutoff.cutoff} AS cutoff`
      ),
      " UNION ALL "
    );
  }

  private bucketTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      input.window.buckets.map(
        (bucket) => Prisma.sql`SELECT ${bucket.key} AS bucket_key,
          ${bucket.fromInclusive} AS from_inclusive,
          ${bucket.toExclusive} AS to_exclusive`
      ),
      " UNION ALL "
    );
  }

  private bookingScope(shopId: number | null, city: string | null): Prisma.Sql {
    const filters: Prisma.Sql[] = [Prisma.sql`shop.deleted_at IS NULL`];
    if (shopId) filters.push(Prisma.sql`booking.shop_id = ${shopId}`);
    if (city) filters.push(Prisma.sql`shop.city = ${city}`);
    return Prisma.join(filters, " AND ");
  }

  private async queryFinanceFlows(input: DashboardAggregateInput): Promise<FinanceFlowRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const intervals = this.financeIntervalTable(input);
    const scope = this.bookingScope(shopId, city);
    return this.client.$queryRaw<FinanceFlowRow[]>(Prisma.sql`
      /* dashboard_finance_flows */
      WITH intervals AS (${intervals}),
      currencies AS (
        SELECT ${"NDP"} AS ndp_currency
        UNION ALL SELECT ${"TEST_NDP"} AS ndp_currency
      ),
      revenue AS (
        SELECT
          period_window.period_key,
          financial.ndp_currency,
          COALESCE(SUM(financial.b_platform_fee_actual_ndp), 0) AS platform_fee_actual_ndp,
          COALESCE(SUM(financial.c_request_fee_actual_ndp), 0) AS request_fee_actual_ndp
        FROM intervals AS period_window
        INNER JOIN booking_orders AS booking
          ON booking.starts_at >= period_window.from_inclusive
          AND booking.starts_at < period_window.to_exclusive
          AND booking.deleted_at IS NULL
        INNER JOIN order_financials AS financial
          ON financial.booking_order_id = booking.id
          AND financial.shop_id = booking.shop_id
          AND financial.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = booking.shop_id
        WHERE ${scope}
        GROUP BY period_window.period_key, financial.ndp_currency
      ),
      paid_reward AS (
        SELECT
          period_window.period_key,
          financial.ndp_currency,
          COALESCE(SUM(financial.user_reward_ndp), 0) AS paid_user_reward_ndp
        FROM intervals AS period_window
        INNER JOIN order_financials AS financial
          ON financial.user_reward_granted_at >= period_window.from_inclusive
          AND financial.user_reward_granted_at < period_window.to_exclusive
          AND financial.user_reward_status = ${"paid"}
          AND financial.deleted_at IS NULL
        INNER JOIN booking_orders AS booking
          ON booking.id = financial.booking_order_id
          AND financial.shop_id = booking.shop_id
          AND booking.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = booking.shop_id
        WHERE ${scope}
        GROUP BY period_window.period_key, financial.ndp_currency
      )
      SELECT
        period_window.period_key AS periodKey,
        currency.ndp_currency AS ndpCurrency,
        COALESCE(revenue.platform_fee_actual_ndp, 0) AS platformFeeActualNdp,
        COALESCE(revenue.request_fee_actual_ndp, 0) AS requestFeeActualNdp,
        COALESCE(paid_reward.paid_user_reward_ndp, 0) AS paidUserRewardNdp
      FROM intervals AS period_window
      CROSS JOIN currencies AS currency
      LEFT JOIN revenue
        ON revenue.period_key = period_window.period_key
        AND revenue.ndp_currency = currency.ndp_currency
      LEFT JOIN paid_reward
        ON paid_reward.period_key = period_window.period_key
        AND paid_reward.ndp_currency = currency.ndp_currency
    `);
  }

  private async queryFrozenStock(input: DashboardAggregateInput): Promise<FrozenStockRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const cutoffs = this.financeCutoffTable(input);
    const scope = this.bookingScope(shopId, city);
    const merchantFeeScope = shopId
      ? Prisma.sql`AND hold.fee_type = ${"b_platform_fee"}`
      : Prisma.empty;
    return this.client.$queryRaw<FrozenStockRow[]>(Prisma.sql`
      /* dashboard_frozen_stock */
      WITH cutoffs AS (${cutoffs})
      SELECT
        cutoff.period_key AS periodKey,
        hold.currency AS ndpCurrency,
        COALESCE(SUM(GREATEST(
          0,
          hold.hold_amount_ndp
            - CASE
                WHEN hold.captured_at IS NOT NULL AND hold.captured_at < cutoff.cutoff
                THEN hold.captured_amount_ndp
                ELSE 0
              END
            - CASE
                WHEN hold.released_at IS NOT NULL AND hold.released_at < cutoff.cutoff
                THEN hold.released_amount_ndp
                ELSE 0
              END
        )), 0) AS frozenNdp
      FROM cutoffs AS cutoff
      INNER JOIN wallet_holds AS hold
        ON hold.created_at < cutoff.cutoff
        AND hold.deleted_at IS NULL
        AND hold.currency IN (${"NDP"}, ${"TEST_NDP"})
      INNER JOIN booking_orders AS booking
        ON booking.id = hold.booking_order_id
        AND booking.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = booking.shop_id
      WHERE ${scope}
        ${merchantFeeScope}
      GROUP BY cutoff.period_key, hold.currency
    `);
  }

  private async queryWalletStock(input: DashboardAggregateInput): Promise<WalletStockRow[]> {
    return this.client.$queryRaw<WalletStockRow[]>(Prisma.sql`
      /* dashboard_wallet_stock */
      WITH ranked_ledger AS (
        SELECT
          wallet.currency AS ndp_currency,
          ledger.wallet_id,
          ledger.available_balance_after + ledger.frozen_balance_after AS wallet_total,
          ROW_NUMBER() OVER (
            PARTITION BY ledger.wallet_id
            ORDER BY ledger.created_at DESC, ledger.id DESC
          ) AS ledger_rank
        FROM wallet_ledgers AS ledger
        INNER JOIN wallets AS wallet
          ON wallet.id = ledger.wallet_id
          AND wallet.deleted_at IS NULL
          AND wallet.currency IN (${"NDP"}, ${"TEST_NDP"})
        WHERE ledger.created_at < ${input.window.toExclusive}
          AND ledger.deleted_at IS NULL
      )
      SELECT
        latest.ndp_currency AS ndpCurrency,
        COALESCE(SUM(
          CASE WHEN latest.wallet_total > 0 THEN latest.wallet_total ELSE 0 END
        ), 0) AS walletStockNdp
      FROM ranked_ledger AS latest
      WHERE latest.ledger_rank = 1
      GROUP BY latest.ndp_currency
    `);
  }

  private async queryWithdrawn(input: DashboardAggregateInput): Promise<WithdrawnRow[]> {
    return this.client.$queryRaw<WithdrawnRow[]>(Prisma.sql`
      /* dashboard_withdrawn */
      SELECT
        ${"NDP"} AS ndpCurrency,
        COALESCE(SUM(request.amount_ndp), 0) AS withdrawnNdp
      FROM wallet_adjustment_requests AS request
      INNER JOIN ledger_transactions AS ledger_transaction
        ON request.ledger_transaction_id = ledger_transaction.id
      WHERE request.type = ${"withdrawal"}
        AND request.status = ${"approved"}
        AND request.deleted_at IS NULL
        AND ledger_transaction.status = ${"applied"}
        AND ledger_transaction.currency = ${"NDP"}
        AND ledger_transaction.created_at >= ${input.window.fromInclusive}
        AND ledger_transaction.created_at < ${input.window.toExclusive}
        AND ledger_transaction.deleted_at IS NULL
    `);
  }

  private async queryMerchantProfit(
    input: DashboardAggregateInput
  ): Promise<MerchantProfitRow[]> {
    if (input.scope.kind !== "shop") return [];

    const buckets = this.bucketTable(input);
    const eventType = "technician_income_estimated";
    return this.client.$queryRaw<MerchantProfitRow[]>(Prisma.sql`
      /* dashboard_merchant_profit */
      WITH buckets AS (${buckets})
      SELECT
        bucket.bucket_key AS bucketKey,
        COALESCE(SUM(
          CASE
            WHEN JSON_TYPE(JSON_EXTRACT(
              financial.money_timeline_json,
              REPLACE(
                JSON_UNQUOTE(JSON_SEARCH(
                  financial.money_timeline_json,
                  ${"one"},
                  ${eventType},
                  NULL,
                  ${"$[*].type"}
                )),
                ${".type"},
                ${".metadata.shopEstimatedGrossProfitJpy"}
              )
            )) IN (${"INTEGER"}, ${"DOUBLE"})
            THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(
              financial.money_timeline_json,
              REPLACE(
                JSON_UNQUOTE(JSON_SEARCH(
                  financial.money_timeline_json,
                  ${"one"},
                  ${eventType},
                  NULL,
                  ${"$[*].type"}
                )),
                ${".type"},
                ${".metadata.shopEstimatedGrossProfitJpy"}
              )
            )) AS DECIMAL(20, 2))
            ELSE 0
          END
        ), 0) AS shopEstimatedGrossProfitJpy
      FROM buckets AS bucket
      INNER JOIN booking_orders AS booking
        ON booking.starts_at >= bucket.from_inclusive
        AND booking.starts_at < bucket.to_exclusive
        AND booking.status = ${"completed"}
        AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})
        AND booking.deleted_at IS NULL
      INNER JOIN order_financials AS financial
        ON financial.booking_order_id = booking.id
        AND financial.shop_id = booking.shop_id
        AND financial.service_income_status IN (${"reported"}, ${"confirmed"})
        AND financial.deleted_at IS NULL
      INNER JOIN shops AS shop
        ON shop.id = booking.shop_id
        AND shop.deleted_at IS NULL
      WHERE booking.shop_id = ${input.scope.shopId}
      GROUP BY bucket.bucket_key
    `);
  }

  private financeFlowPair(
    rows: FinanceFlowRow[],
    key: string
  ): {
    ndp: {
      platformFeeActualNdp: number;
      requestFeeActualNdp: number;
      paidUserRewardNdp: number;
    };
    testNdp: {
      platformFeeActualNdp: number;
      requestFeeActualNdp: number;
      paidUserRewardNdp: number;
    };
  } {
    const empty = {
      platformFeeActualNdp: 0,
      requestFeeActualNdp: 0,
      paidUserRewardNdp: 0
    };
    const values = (currency: "NDP" | "TEST_NDP") => {
      const row = rows.find(
        (candidate) => periodKey(candidate) === key && this.rowCurrency(candidate) === currency
      );
      return row
        ? {
            platformFeeActualNdp: this.toNumber(
              row.platformFeeActualNdp ?? row.platform_fee_actual_ndp
            ),
            requestFeeActualNdp: this.toNumber(
              row.requestFeeActualNdp ?? row.request_fee_actual_ndp
            ),
            paidUserRewardNdp: this.toNumber(
              row.paidUserRewardNdp ?? row.paid_user_reward_ndp
            )
          }
        : { ...empty };
    };
    return { ndp: values("NDP"), testNdp: values("TEST_NDP") };
  }

  private frozenPair(rows: FrozenStockRow[], key: string): DashboardNdpPair {
    return this.currencyPair(
      rows.filter((row) => periodKey(row) === key),
      (row) => row.frozenNdp ?? row.frozen_ndp
    );
  }

  private currencyPair<T extends { ndpCurrency?: string; ndp_currency?: string }>(
    rows: T[],
    value: (row: T) => NumericValue
  ): DashboardNdpPair {
    const byCurrency = (currency: "NDP" | "TEST_NDP") => {
      const row = rows.find((candidate) => this.rowCurrency(candidate) === currency);
      return row ? this.toNumber(value(row)) : 0;
    };
    return { ndp: byCurrency("NDP"), testNdp: byCurrency("TEST_NDP") };
  }

  private rowCurrency(row: { ndpCurrency?: string; ndp_currency?: string }): string {
    return row.ndpCurrency ?? row.ndp_currency ?? "";
  }

  private toNumber(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    return Number(typeof value === "object" ? value.toString() : value);
  }
}
