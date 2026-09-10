import { Prisma, type PrismaClient } from "@prisma/client";
import {
  type LiveDashboardChildRegion,
  type LiveDashboardCoverage,
  type LiveDashboardInput,
  type LiveDashboardOrderSummary,
  type LiveDashboardRankingItem,
  type LiveDashboardSnapshotFacts,
  type LiveDashboardScope,
  type LiveDashboardTrendBucket,
  type LiveMoney
} from "../domain/live-dashboard";
import { resolveDashboardWindow, type DashboardWindow } from "../domain/dashboard-period";
import type { AnalyticsRankingInput, RankingKind } from "../domain/analytics-ranking";
import { AnalyticsRankingRepository } from "./analytics-ranking.repository";
import { formalConfirmedPaymentEvidence } from "./formal-confirmed-payment-evidence";

type QueryClient = Pick<PrismaClient, "$queryRaw">;
type LiveDashboardClient = QueryClient & Pick<PrismaClient, "$transaction">;
type NumericValue = bigint | number | string | { toString(): string } | null | undefined;

interface ChildRow {
  code?: unknown;
  name?: unknown;
  orderCount?: NumericValue;
  order_count?: NumericValue;
  currentDayOrderCount?: NumericValue;
  current_day_order_count?: NumericValue;
  previousDayOrderCount?: NumericValue;
  previous_day_order_count?: NumericValue;
  confirmedPaymentJpy?: NumericValue;
  confirmed_payment_jpy?: NumericValue;
  confirmedPaymentNdp?: NumericValue;
  confirmed_payment_ndp?: NumericValue;
  confirmedPaymentTestNdp?: NumericValue;
  confirmed_payment_test_ndp?: NumericValue;
}

interface HeadlineOrderRow {
  newOrders?: NumericValue;
  new_orders?: NumericValue;
  completedOrders?: NumericValue;
  completed_orders?: NumericValue;
}

interface HeadlineEntityRow {
  newCustomers?: NumericValue;
  new_customers?: NumericValue;
  onboardedTechnicians?: NumericValue;
  onboarded_technicians?: NumericValue;
}

interface MoneyOrderRow {
  totalOrders?: NumericValue;
  total_orders?: NumericValue;
  serviceGmvJpy?: NumericValue;
  service_gmv_jpy?: NumericValue;
  confirmedPaymentJpy?: NumericValue;
  confirmed_payment_jpy?: NumericValue;
  confirmedPaymentNdp?: NumericValue;
  confirmed_payment_ndp?: NumericValue;
  confirmedPaymentTestNdp?: NumericValue;
  confirmed_payment_test_ndp?: NumericValue;
  platformNetRevenueNdp?: NumericValue;
  platform_net_revenue_ndp?: NumericValue;
  platformNetRevenueTestNdp?: NumericValue;
  platform_net_revenue_test_ndp?: NumericValue;
}

interface OrderSummaryRow {
  totalCount?: NumericValue;
  total_count?: NumericValue;
  orderNo?: unknown;
  order_no?: unknown;
  status?: unknown;
  serviceName?: unknown;
  service_name?: unknown;
  amountJpy?: NumericValue;
  amount_jpy?: NumericValue;
  createdAt?: unknown;
  created_at?: unknown;
  occurredAt?: unknown;
  occurred_at?: unknown;
}

interface TrendRow {
  bucketKey?: unknown;
  bucket_key?: unknown;
  label?: unknown;
  orderCount?: NumericValue;
  order_count?: NumericValue;
  confirmedPaymentJpy?: NumericValue;
  confirmed_payment_jpy?: NumericValue;
  confirmedPaymentNdp?: NumericValue;
  confirmed_payment_ndp?: NumericValue;
  confirmedPaymentTestNdp?: NumericValue;
  confirmed_payment_test_ndp?: NumericValue;
}

interface RankingRow {
  rankingPosition?: NumericValue;
  entityPublicId?: unknown;
  entity_public_id?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  avatarUrl?: unknown;
  avatar_url?: unknown;
  gmvJpy?: NumericValue;
  gmv_jpy?: NumericValue;
  completedCount?: NumericValue;
  completed_count?: NumericValue;
}

interface CoverageRow {
  total?: NumericValue;
  attributed?: NumericValue;
  unresolved?: NumericValue;
}

const MAX_REALTIME_ORDERS = 20;
const MAX_RANKING_ITEMS = 10;
const aggregateError = "Live dashboard aggregate evidence is invalid";

const locationScope = (scope: LiveDashboardScope, alias = "location"): Prisma.Sql => Prisma.sql`
  ${Prisma.raw(alias)}.country_code = ${scope.countryCode}
  ${
    scope.admin1Code
      ? Prisma.sql`AND ${Prisma.raw(alias)}.admin1_region_code = ${scope.admin1Code}`
      : Prisma.empty
  }
  ${
    scope.admin2Code
      ? Prisma.sql`AND ${Prisma.raw(alias)}.admin2_region_code = ${scope.admin2Code}`
      : Prisma.empty
  }
  AND ${Prisma.raw(alias)}.deleted_at IS NULL
`;

const scopedLocation = (scope: LiveDashboardScope, alias = "location"): Prisma.Sql =>
  scope.admin1Code || scope.admin2Code
    ? Prisma.sql`${locationScope(scope, alias)} AND ${Prisma.raw(alias)}.resolution_status = ${"VERIFIED"}`
    : Prisma.sql`(${Prisma.raw(alias)}.booking_order_id IS NULL OR (${locationScope(scope, alias)}))`;

export interface LiveDashboardRepositoryPort {
  getSnapshotFacts(input: LiveDashboardInput): Promise<LiveDashboardSnapshotFacts>;
}

export class LiveDashboardRepository implements LiveDashboardRepositoryPort {
  public constructor(private readonly client: LiveDashboardClient) {}

  public async getSnapshotFacts(input: LiveDashboardInput): Promise<LiveDashboardSnapshotFacts> {
    this.assertInput(input);
    const window = resolveDashboardWindow({ period: input.period }, input.evaluatedAt);
    const dailyWindow = resolveDashboardWindow({ period: "today" }, input.evaluatedAt);
    const trendWindow = resolveDashboardWindow({ period: "last7days" }, input.evaluatedAt);

    return this.client.$transaction(
      (transaction) => this.readSnapshot(transaction, input, window, dailyWindow, trendWindow),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  private async readSnapshot(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow,
    dailyWindow: DashboardWindow,
    trendWindow: DashboardWindow
  ): Promise<LiveDashboardSnapshotFacts> {
    const [
      childRows,
      headlineOrderRows,
      headlineEntityRows,
      moneyRows,
      realtimeRows,
      activityRows,
      trendRows,
      serviceRankingRows,
      technicianRankingRows,
      coverageRows
    ] = await Promise.all([
      this.queryChildren(client, input, window, dailyWindow),
      this.queryHeadlineOrders(client, input, window),
      this.queryHeadlineEntities(client, input, window),
      this.queryMoneyOrders(client, input, window),
      this.queryRealtimeOrders(client, input, window),
      this.queryActivity(client, input, window),
      this.queryTrend(client, input, trendWindow),
      this.queryServiceRanking(client, input, window),
      this.queryTechnicianRanking(client, input, window),
      this.queryCoverage(client, input, window)
    ]);

    const headlineOrders = this.singleRow(headlineOrderRows);
    const headlineEntities = this.singleRow(headlineEntityRows);
    const money = this.singleRow(moneyRows);
    const coverage = this.mapCoverage(this.singleRow(coverageRows));

    return {
      evaluatedAt: new Date(input.evaluatedAt),
      scope: { ...input.scope },
      children: childRows.map((row) => this.mapChild(row)),
      headline: {
        newOrders: this.safeInteger(headlineOrders?.newOrders ?? headlineOrders?.new_orders),
        completedOrders: this.safeInteger(
          headlineOrders?.completedOrders ?? headlineOrders?.completed_orders
        ),
        newCustomers: this.safeInteger(
          headlineEntities?.newCustomers ?? headlineEntities?.new_customers
        ),
        onboardedTechnicians: this.safeInteger(
          headlineEntities?.onboardedTechnicians ?? headlineEntities?.onboarded_technicians
        )
      },
      confirmedPayments: this.money(
        money?.confirmedPaymentJpy ?? money?.confirmed_payment_jpy,
        money?.confirmedPaymentNdp ?? money?.confirmed_payment_ndp,
        money?.confirmedPaymentTestNdp ?? money?.confirmed_payment_test_ndp
      ),
      orders: {
        total: this.safeInteger(money?.totalOrders ?? money?.total_orders),
        serviceGmv: this.money(money?.serviceGmvJpy ?? money?.service_gmv_jpy, 0, 0),
        platformNetRevenue: this.signedMoney(
          0,
          money?.platformNetRevenueNdp ?? money?.platform_net_revenue_ndp,
          money?.platformNetRevenueTestNdp ?? money?.platform_net_revenue_test_ndp
        ),
        // Existing Dashboard commission semantics explicitly mark agent commission unavailable.
        agentCommission: null
      },
      realtimeOrders: {
        list: realtimeRows
          .slice(0, MAX_REALTIME_ORDERS)
          .map((row) => this.mapOrderSummary(row, row.createdAt ?? row.created_at)),
        total:
          realtimeRows.length === 0
            ? 0
            : this.safeInteger(realtimeRows[0]?.totalCount ?? realtimeRows[0]?.total_count),
        page: 1,
        page_size: MAX_REALTIME_ORDERS
      },
      activity: activityRows
        .slice(0, MAX_REALTIME_ORDERS)
        .map((row) => this.mapOrderSummary(row, row.occurredAt ?? row.occurred_at)),
      trend: this.mapTrend(trendWindow, trendRows),
      serviceRanking: serviceRankingRows
        .slice(0, MAX_RANKING_ITEMS)
        .map((row) => this.mapRanking(row)),
      technicianRanking: technicianRankingRows
        .slice(0, MAX_RANKING_ITEMS)
        .map((row) => this.mapRanking(row)),
      coverage
    };
  }

  private queryChildren(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow,
    dailyWindow: DashboardWindow
  ): Promise<ChildRow[]> {
    if (input.scope.admin2Code) return Promise.resolve([]);
    const childLevel = input.scope.admin1Code ? "ADMIN2" : "ADMIN1";
    const parentScope = input.scope.admin1Code
      ? Prisma.sql`AND parent.country_code = ${input.scope.countryCode}
          AND parent.official_code = ${input.scope.admin1Code}
          AND parent.level = ${"ADMIN1"}
          AND parent.deleted_at IS NULL
          AND child.parent_id = parent.id`
      : Prisma.sql`AND parent.country_code = ${input.scope.countryCode}
          AND parent.official_code = ${input.scope.countryCode}
          AND parent.level = ${"COUNTRY"}
          AND parent.deleted_at IS NULL
          AND child.parent_id = parent.id`;
    const childRegionCode = input.scope.admin1Code
      ? Prisma.sql`location.admin2_region_code`
      : Prisma.sql`location.admin1_region_code`;
    return client.$queryRaw<ChildRow[]>(Prisma.sql`
      /* live_dashboard_children */
      WITH child_order_counts AS (
        SELECT ${childRegionCode} AS child_code, COUNT(booking.id) AS order_count
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        WHERE booking.starts_at >= ${window.fromInclusive}
          AND booking.starts_at < ${window.toExclusive}
          AND booking.created_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND location.resolution_status = ${"VERIFIED"}
        GROUP BY ${childRegionCode}
      ), child_current_day_order_counts AS (
        SELECT ${childRegionCode} AS child_code, COUNT(booking.id) AS order_count
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        WHERE booking.starts_at >= ${dailyWindow.fromInclusive}
          AND booking.starts_at < ${dailyWindow.toExclusive}
          AND booking.created_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND location.resolution_status = ${"VERIFIED"}
        GROUP BY ${childRegionCode}
      ), child_previous_day_order_counts AS (
        SELECT ${childRegionCode} AS child_code, COUNT(booking.id) AS order_count
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        WHERE booking.starts_at >= ${dailyWindow.previousFromInclusive}
          AND booking.starts_at < ${dailyWindow.previousToExclusive}
          AND booking.created_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND location.resolution_status = ${"VERIFIED"}
        GROUP BY ${childRegionCode}
      ), child_confirmed_payments AS (
        SELECT ${childRegionCode} AS child_code,
               COALESCE(SUM(checkout.checkout_amount_jpy), 0) AS confirmed_payment_jpy,
               COALESCE(SUM(CASE WHEN ledger.currency = ${"NDP"}
                 THEN checkout.payable_ndp ELSE 0 END), 0) AS confirmed_payment_ndp,
               COALESCE(SUM(CASE WHEN ledger.currency = ${"TEST_NDP"}
                 THEN checkout.payable_ndp ELSE 0 END), 0) AS confirmed_payment_test_ndp
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        LEFT JOIN ledger_transactions AS ledger
          ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
        WHERE booking.payment_confirmed_at >= ${window.fromInclusive}
          AND booking.payment_confirmed_at < ${window.toExclusive}
          AND booking.payment_confirmed_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND ${formalConfirmedPaymentEvidence()}
          AND location.resolution_status = ${"VERIFIED"}
        GROUP BY ${childRegionCode}
      )
      SELECT child.official_code AS code,
             COALESCE(locale.name, child.official_code) AS name,
             COALESCE(order_counts.order_count, 0) AS orderCount,
             COALESCE(current_day_orders.order_count, 0) AS currentDayOrderCount,
             COALESCE(previous_day_orders.order_count, 0) AS previousDayOrderCount,
             COALESCE(payments.confirmed_payment_jpy, 0) AS confirmedPaymentJpy,
             COALESCE(payments.confirmed_payment_ndp, 0) AS confirmedPaymentNdp,
             COALESCE(payments.confirmed_payment_test_ndp, 0) AS confirmedPaymentTestNdp
      FROM administrative_regions AS child
      INNER JOIN administrative_regions AS parent
        ON parent.id = child.parent_id AND parent.deleted_at IS NULL
      LEFT JOIN administrative_region_locales AS locale
        ON locale.region_id = child.id AND locale.locale = ${"ja"}
        AND locale.deleted_at IS NULL
      LEFT JOIN child_order_counts AS order_counts
        ON order_counts.child_code = child.official_code
      LEFT JOIN child_current_day_order_counts AS current_day_orders
        ON current_day_orders.child_code = child.official_code
      LEFT JOIN child_previous_day_order_counts AS previous_day_orders
        ON previous_day_orders.child_code = child.official_code
      LEFT JOIN child_confirmed_payments AS payments
        ON payments.child_code = child.official_code
      WHERE child.country_code = ${input.scope.countryCode}
        AND child.level = ${childLevel}
        AND child.deleted_at IS NULL
        ${parentScope}
      ORDER BY child.official_code ASC
    `);
  }

  private queryHeadlineOrders(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<HeadlineOrderRow[]> {
    return client.$queryRaw<HeadlineOrderRow[]>(Prisma.sql`
      /* live_dashboard_headline_orders */
      SELECT
        COALESCE(SUM(booking.created_at >= ${window.fromInclusive}
          AND booking.created_at < ${window.toExclusive}), 0) AS newOrders,
        COALESCE(SUM(booking.starts_at >= ${window.fromInclusive}
          AND booking.starts_at < ${window.toExclusive}
          AND booking.status = ${"completed"}
          AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})), 0)
          AS completedOrders
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location
        ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop
        ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
      WHERE booking.created_at <= ${input.evaluatedAt}
        AND booking.deleted_at IS NULL
        AND (
          (booking.created_at >= ${window.fromInclusive} AND booking.created_at < ${window.toExclusive})
          OR (booking.starts_at >= ${window.fromInclusive} AND booking.starts_at < ${window.toExclusive})
        )
    `);
  }

  private queryHeadlineEntities(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<HeadlineEntityRow[]> {
    const occurrenceCte =
      input.scope.admin1Code || input.scope.admin2Code
        ? Prisma.sql`, service_occurrence AS (
          SELECT booking.customer_user_id, booking.technician_profile_id,
                 booking.deleted_at AS booking_deleted_at,
                 location.id AS location_id, location.deleted_at AS location_deleted_at
          FROM booking_orders AS booking
          LEFT JOIN booking_service_locations AS location
            ON location.booking_order_id = booking.id
          INNER JOIN shops AS shop
            ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
          WHERE booking.created_at <= ${input.evaluatedAt}
            AND booking.deleted_at IS NULL
            AND location.deleted_at IS NULL
        )`
        : Prisma.empty;
    const customerOccurrence =
      input.scope.admin1Code || input.scope.admin2Code
        ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM service_occurrence
          WHERE service_occurrence.customer_user_id = profile.user_id
            AND service_occurrence.location_id IS NOT NULL
            AND service_occurrence.booking_deleted_at IS NULL
            AND service_occurrence.location_deleted_at IS NULL
        )`
        : Prisma.empty;
    const technicianOccurrence =
      input.scope.admin1Code || input.scope.admin2Code
        ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM service_occurrence
          WHERE service_occurrence.technician_profile_id = technician.id
            AND service_occurrence.location_id IS NOT NULL
            AND service_occurrence.booking_deleted_at IS NULL
            AND service_occurrence.location_deleted_at IS NULL
        )`
        : Prisma.empty;
    return client.$queryRaw<HeadlineEntityRow[]>(Prisma.sql`
      /* live_dashboard_headline_entities */
      WITH evaluation_boundary AS (
        SELECT ${input.evaluatedAt} AS evaluated_at
      )
      ${occurrenceCte}
      SELECT
        (SELECT COUNT(profile.id)
         FROM customer_profiles AS profile
         WHERE profile.created_at >= ${window.fromInclusive}
           AND profile.created_at < ${window.toExclusive}
           AND profile.created_at <= (SELECT evaluated_at FROM evaluation_boundary)
           AND profile.deleted_at IS NULL
           ${customerOccurrence}) AS newCustomers,
        (SELECT COUNT(technician.id)
         FROM technician_profiles AS technician
         WHERE technician.created_at >= ${window.fromInclusive}
           AND technician.created_at < ${window.toExclusive}
           AND technician.created_at <= (SELECT evaluated_at FROM evaluation_boundary)
           AND technician.deleted_at IS NULL
           ${technicianOccurrence}) AS onboardedTechnicians
    `);
  }

  private queryMoneyOrders(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<MoneyOrderRow[]> {
    return client.$queryRaw<MoneyOrderRow[]>(Prisma.sql`
      /* live_dashboard_money_orders */
      WITH scoped_orders AS (
        SELECT booking.id, booking.status, booking.payment_status, booking.price_amount
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        WHERE booking.starts_at >= ${window.fromInclusive}
          AND booking.starts_at < ${window.toExclusive}
          AND booking.created_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
      ), eligible_payments AS (
        SELECT booking.id, checkout.checkout_amount_jpy, checkout.payable_ndp,
               ledger.currency AS ndp_currency
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        LEFT JOIN ledger_transactions AS ledger
          ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
        WHERE booking.payment_confirmed_at >= ${window.fromInclusive}
          AND booking.payment_confirmed_at < ${window.toExclusive}
          AND booking.payment_confirmed_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND ${formalConfirmedPaymentEvidence()}
      ), revenue AS (
        SELECT financial.ndp_currency,
               COALESCE(SUM(financial.b_platform_fee_actual_ndp), 0)
                 AS platform_fee_actual_ndp,
               COALESCE(SUM(financial.c_request_fee_actual_ndp), 0)
                 AS request_fee_actual_ndp
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        INNER JOIN order_financials AS financial
          ON financial.booking_order_id = booking.id AND financial.shop_id = booking.shop_id
          AND financial.deleted_at IS NULL
        WHERE booking.starts_at >= ${window.fromInclusive}
          AND booking.starts_at < ${window.toExclusive}
          AND booking.created_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
        GROUP BY financial.ndp_currency
      ), paid_reward AS (
        SELECT financial.ndp_currency,
               COALESCE(SUM(financial.user_reward_ndp), 0) AS paid_user_reward_ndp
        FROM order_financials AS financial
        INNER JOIN booking_orders AS booking
          ON booking.id = financial.booking_order_id
          AND financial.shop_id = booking.shop_id
          AND booking.deleted_at IS NULL
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        WHERE financial.user_reward_granted_at >= ${window.fromInclusive}
          AND financial.user_reward_granted_at < ${window.toExclusive}
          AND financial.user_reward_granted_at <= ${input.evaluatedAt}
          AND financial.user_reward_status = ${"paid"}
          AND financial.deleted_at IS NULL
        GROUP BY financial.ndp_currency
      )
      SELECT
        (SELECT COUNT(*) FROM scoped_orders) AS totalOrders,
        COALESCE((SELECT SUM(CASE WHEN scoped.status = ${"completed"}
          AND scoped.payment_status NOT IN (${"refund_pending"}, ${"refunded"})
          THEN scoped.price_amount ELSE 0 END) FROM scoped_orders AS scoped), 0) AS serviceGmvJpy,
        COALESCE((SELECT SUM(eligible.checkout_amount_jpy) FROM eligible_payments AS eligible), 0)
          AS confirmedPaymentJpy,
        COALESCE((SELECT SUM(eligible.payable_ndp) FROM eligible_payments AS eligible
          WHERE eligible.ndp_currency = ${"NDP"}), 0) AS confirmedPaymentNdp,
        COALESCE((SELECT SUM(eligible.payable_ndp) FROM eligible_payments AS eligible
          WHERE eligible.ndp_currency = ${"TEST_NDP"}), 0) AS confirmedPaymentTestNdp,
        COALESCE((SELECT revenue.platform_fee_actual_ndp + revenue.request_fee_actual_ndp
          FROM revenue WHERE revenue.ndp_currency = ${"NDP"}), 0)
          - COALESCE((SELECT paid_reward.paid_user_reward_ndp FROM paid_reward
            WHERE paid_reward.ndp_currency = ${"NDP"}), 0) AS platformNetRevenueNdp,
        COALESCE((SELECT revenue.platform_fee_actual_ndp + revenue.request_fee_actual_ndp
          FROM revenue WHERE revenue.ndp_currency = ${"TEST_NDP"}), 0)
          - COALESCE((SELECT paid_reward.paid_user_reward_ndp FROM paid_reward
            WHERE paid_reward.ndp_currency = ${"TEST_NDP"}), 0) AS platformNetRevenueTestNdp
    `);
  }

  private queryRealtimeOrders(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<OrderSummaryRow[]> {
    return client.$queryRaw<OrderSummaryRow[]>(Prisma.sql`
      /* live_dashboard_realtime_orders */
      SELECT COUNT(*) OVER() AS totalCount, booking.order_no AS orderNo,
             booking.status, COALESCE(booking.service_name_snapshot, ${"-"}) AS serviceName,
             CAST(booking.price_amount AS DECIMAL(65, 0)) AS amountJpy,
             booking.created_at AS createdAt
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location
        ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop
        ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
      WHERE booking.created_at >= ${window.fromInclusive}
        AND booking.created_at < ${window.toExclusive}
        AND booking.created_at <= ${input.evaluatedAt}
        AND booking.deleted_at IS NULL
      ORDER BY booking.created_at DESC, booking.id DESC
      LIMIT 20
    `);
  }

  private queryActivity(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<OrderSummaryRow[]> {
    return client.$queryRaw<OrderSummaryRow[]>(Prisma.sql`
      /* live_dashboard_activity */
      SELECT booking.order_no AS orderNo, history.to_status AS status,
             COALESCE(booking.service_name_snapshot, ${"-"}) AS serviceName,
             CAST(booking.price_amount AS DECIMAL(65, 0)) AS amountJpy,
             history.created_at AS occurredAt
      FROM order_status_histories AS history
      INNER JOIN booking_orders AS booking
        ON booking.id = history.booking_order_id AND booking.deleted_at IS NULL
      LEFT JOIN booking_service_locations AS location
        ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop
        ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
      WHERE history.created_at >= ${window.fromInclusive}
        AND history.created_at < ${window.toExclusive}
        AND history.created_at <= ${input.evaluatedAt}
        AND history.deleted_at IS NULL
      ORDER BY history.created_at DESC, history.id DESC
      LIMIT 20
    `);
  }

  private queryTrend(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<TrendRow[]> {
    const buckets = this.bucketTable(window);
    return client.$queryRaw<TrendRow[]>(Prisma.sql`
      /* live_dashboard_trend */
      WITH buckets AS (${buckets}), eligible_payments AS (
        SELECT booking.id, booking.created_at, booking.payment_confirmed_at,
               checkout.checkout_amount_jpy, checkout.payable_ndp,
               ledger.currency AS ndp_currency
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        LEFT JOIN ledger_transactions AS ledger
          ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
        WHERE booking.created_at <= ${input.evaluatedAt}
          AND booking.payment_confirmed_at <= ${input.evaluatedAt}
          AND booking.deleted_at IS NULL
          AND ${formalConfirmedPaymentEvidence()}
      )
      SELECT bucket.bucket_key AS bucketKey, bucket.label,
             (SELECT COUNT(booking.id)
              FROM booking_orders AS booking
              LEFT JOIN booking_service_locations AS location
                ON location.booking_order_id = booking.id
              INNER JOIN shops AS shop
                ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
              WHERE booking.starts_at >= bucket.from_inclusive
                AND booking.starts_at < bucket.to_exclusive
                AND booking.created_at <= ${input.evaluatedAt}
                AND booking.deleted_at IS NULL) AS orderCount,
             COALESCE(SUM(eligible.checkout_amount_jpy), 0) AS confirmedPaymentJpy,
             COALESCE(SUM(CASE WHEN eligible.ndp_currency = ${"NDP"}
               THEN eligible.payable_ndp ELSE 0 END), 0) AS confirmedPaymentNdp,
             COALESCE(SUM(CASE WHEN eligible.ndp_currency = ${"TEST_NDP"}
               THEN eligible.payable_ndp ELSE 0 END), 0) AS confirmedPaymentTestNdp
      FROM buckets AS bucket
      LEFT JOIN eligible_payments AS eligible
        ON eligible.payment_confirmed_at >= bucket.from_inclusive
        AND eligible.payment_confirmed_at < bucket.to_exclusive
      GROUP BY bucket.bucket_key, bucket.label, bucket.from_inclusive, bucket.to_exclusive
      ORDER BY bucket.from_inclusive ASC
    `);
  }

  private queryServiceRanking(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<RankingRow[]> {
    const rankingInput = this.rankingInput("service", input, window);
    return client.$queryRaw<RankingRow[]>(Prisma.sql`
      /* live_dashboard_service_ranking */
      WITH ${AnalyticsRankingRepository.formalRankingCtes(
        rankingInput,
        this.rankingEvidenceScope(input.scope)
      )}, ${AnalyticsRankingRepository.rankingCtes(rankingInput)}
      SELECT ranking_position AS rankingPosition, entity_public_id AS entityPublicId,
             display_name AS displayName, avatar_url AS avatarUrl,
             gmv_jpy AS gmvJpy, completed_count AS completedCount
      FROM ranked_entities
      ORDER BY ranking_position ASC
      LIMIT 10
    `);
  }

  private queryTechnicianRanking(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<RankingRow[]> {
    const rankingInput = this.rankingInput("technician", input, window);
    return client.$queryRaw<RankingRow[]>(Prisma.sql`
      /* live_dashboard_technician_ranking */
      WITH ${AnalyticsRankingRepository.formalRankingCtes(
        rankingInput,
        this.rankingEvidenceScope(input.scope)
      )}, ${AnalyticsRankingRepository.rankingCtes(rankingInput)}
      SELECT ranking_position AS rankingPosition, entity_public_id AS entityPublicId,
             display_name AS displayName, avatar_url AS avatarUrl,
             gmv_jpy AS gmvJpy, completed_count AS completedCount
      FROM ranked_entities
      ORDER BY ranking_position ASC
      LIMIT 10
    `);
  }

  private rankingInput(
    kind: Extract<RankingKind, "service" | "technician">,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): AnalyticsRankingInput {
    return {
      kind,
      metric: "gmv",
      window,
      evaluatedAt: input.evaluatedAt,
      city: null,
      categoryId: null,
      page: 1,
      pageSize: MAX_RANKING_ITEMS
    };
  }

  private rankingEvidenceScope(scope: LiveDashboardScope) {
    return {
      candidateJoins: Prisma.sql`LEFT JOIN booking_service_locations AS location
        ON location.booking_order_id = booking.id`,
      candidatePredicate: scopedLocation(scope),
      entityPredicate: Prisma.sql`candidate.customer_is_test = FALSE
        AND candidate.technician_user_is_test = FALSE`
    };
  }

  private queryCoverage(
    client: QueryClient,
    input: LiveDashboardInput,
    window: DashboardWindow
  ): Promise<CoverageRow[]> {
    return client.$queryRaw<CoverageRow[]>(Prisma.sql`
      /* live_dashboard_coverage */
      SELECT COUNT(booking.id) AS total,
             COALESCE(SUM(location.resolution_status IN (${"VERIFIED"})), 0) AS attributed,
             COALESCE(SUM(COALESCE(location.resolution_status, ${"UNRESOLVED"}) IN (${"UNRESOLVED"})), 0) AS unresolved
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location
        ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop
        ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopedLocation(input.scope)}
      WHERE booking.starts_at >= ${window.fromInclusive}
        AND booking.starts_at < ${window.toExclusive}
        AND booking.created_at <= ${input.evaluatedAt}
        AND booking.deleted_at IS NULL
    `);
  }

  private bucketTable(window: DashboardWindow): Prisma.Sql {
    return Prisma.join(
      window.buckets.map(
        (bucket) => Prisma.sql`SELECT ${bucket.key} AS bucket_key, ${bucket.label} AS label,
          ${bucket.fromInclusive} AS from_inclusive, ${bucket.toExclusive} AS to_exclusive`
      ),
      " UNION ALL "
    );
  }

  private mapChild(row: ChildRow): LiveDashboardChildRegion {
    return {
      code: this.nonEmptyString(row.code),
      name: this.nonEmptyString(row.name),
      orderCount: this.safeInteger(row.orderCount ?? row.order_count),
      currentDayOrderCount: this.safeInteger(row.currentDayOrderCount ?? row.current_day_order_count),
      previousDayOrderCount: this.safeInteger(row.previousDayOrderCount ?? row.previous_day_order_count),
      confirmedPayments: this.money(
        row.confirmedPaymentJpy ?? row.confirmed_payment_jpy,
        row.confirmedPaymentNdp ?? row.confirmed_payment_ndp,
        row.confirmedPaymentTestNdp ?? row.confirmed_payment_test_ndp
      )
    };
  }

  private mapOrderSummary(row: OrderSummaryRow, timestamp: unknown): LiveDashboardOrderSummary {
    return {
      orderNo: this.nonEmptyString(row.orderNo ?? row.order_no),
      status: this.nonEmptyString(row.status),
      serviceName: this.nonEmptyString(row.serviceName ?? row.service_name),
      amountJpy: this.safeInteger(row.amountJpy ?? row.amount_jpy),
      occurredAt: this.date(timestamp)
    };
  }

  private mapTrend(window: DashboardWindow, rows: TrendRow[]): LiveDashboardTrendBucket[] {
    const byKey = new Map(
      rows.map((row) => [this.nonEmptyString(row.bucketKey ?? row.bucket_key), row])
    );
    return window.buckets.map((bucket) => {
      const row = byKey.get(bucket.key);
      return {
        key: bucket.key,
        label: row ? this.nonEmptyString(row.label) : bucket.label,
        orderCount: this.safeInteger(row?.orderCount ?? row?.order_count),
        confirmedPayments: this.money(
          row?.confirmedPaymentJpy ?? row?.confirmed_payment_jpy,
          row?.confirmedPaymentNdp ?? row?.confirmed_payment_ndp,
          row?.confirmedPaymentTestNdp ?? row?.confirmed_payment_test_ndp
        )
      };
    });
  }

  private mapRanking(row: RankingRow): LiveDashboardRankingItem {
    const avatar = row.avatarUrl ?? row.avatar_url;
    if (avatar !== null && avatar !== undefined && typeof avatar !== "string") {
      throw new RangeError(aggregateError);
    }
    return {
      rank: this.safeInteger(row.rankingPosition),
      entityPublicId: this.nonEmptyString(row.entityPublicId ?? row.entity_public_id),
      displayName: this.nonEmptyString(row.displayName ?? row.display_name),
      avatarUrl: (avatar ?? null) as string | null,
      gmvJpy: this.safeInteger(row.gmvJpy ?? row.gmv_jpy),
      completedCount: this.safeInteger(row.completedCount ?? row.completed_count)
    };
  }

  private mapCoverage(row: CoverageRow | undefined): LiveDashboardCoverage {
    const total = this.safeInteger(row?.total);
    const attributed = this.safeInteger(row?.attributed);
    const unresolved = this.safeInteger(row?.unresolved);
    if (attributed + unresolved !== total) throw new RangeError(aggregateError);
    return {
      total,
      attributed,
      unresolved,
      completenessPercent: total === 0 ? 100 : Math.round((attributed / total) * 100)
    };
  }

  private money(jpy: NumericValue, ndp: NumericValue, testNdp: NumericValue): LiveMoney {
    return {
      jpy: this.safeInteger(jpy),
      ndp: this.safeInteger(ndp),
      testNdp: this.safeInteger(testNdp)
    };
  }

  private signedMoney(jpy: NumericValue, ndp: NumericValue, testNdp: NumericValue): LiveMoney {
    return {
      jpy: this.safeSignedInteger(jpy),
      ndp: this.safeSignedInteger(ndp),
      testNdp: this.safeSignedInteger(testNdp)
    };
  }

  private singleRow<T>(rows: T[]): T | undefined {
    if (rows.length > 1) throw new RangeError(aggregateError);
    return rows[0];
  }

  private assertInput(input: LiveDashboardInput): void {
    if (
      input.scope.countryCode !== "JP" ||
      (!input.scope.admin1Code && input.scope.admin2Code) ||
      !Number.isFinite(input.evaluatedAt.getTime())
    ) {
      throw new RangeError(aggregateError);
    }
  }

  private safeInteger(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(aggregateError);
      }
      return Number(value);
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(aggregateError);
      return value;
    }
    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^(?:0|[1-9]\d*)(?:\.0+)?$/u.test(serialized)) throw new RangeError(aggregateError);
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(aggregateError);
    return parsed;
  }

  private safeSignedInteger(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    const serialized =
      typeof value === "bigint" || typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value
          : value.toString();
    if (!/^-?(?:0|[1-9]\d*)(?:\.0+)?$/u.test(serialized)) {
      throw new RangeError(aggregateError);
    }
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed)) throw new RangeError(aggregateError);
    return parsed;
  }

  private nonEmptyString(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new RangeError(aggregateError);
    }
    return value;
  }

  private date(value: unknown): Date {
    const date =
      value instanceof Date ? new Date(value) : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw new RangeError(aggregateError);
    return date;
  }
}
