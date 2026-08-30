import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DashboardActivityFacts,
  DashboardAggregateInput,
  DashboardFinanceFacts,
  DashboardMerchantFacts,
  DashboardNdpPair
} from "../domain/dashboard";
import { prisma } from "../prisma/client";
import {
  SaasBillingPolicyService,
  type BillingCadence,
  type TrialStatus
} from "../services/saas-billing-policy.service";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;

interface PeriodAggregateRow {
  periodKey?: string;
  period_key?: string;
  aggregateValue?: NumericValue;
  aggregate_value?: NumericValue;
}

interface OrderBucketRow {
  bucketKey?: string;
  bucket_key?: string;
  orderCount?: NumericValue;
  order_count?: NumericValue;
  serviceGmvJpy?: NumericValue;
  service_gmv_jpy?: NumericValue;
}

interface ScheduleBucketRow {
  bucketKey?: string;
  bucket_key?: string;
  scheduleAvailableHours?: NumericValue;
  schedule_available_hours?: NumericValue;
  scheduleBookedHours?: NumericValue;
  schedule_booked_hours?: NumericValue;
}

interface FinanceFlowRow {
  periodKey?: string;
  period_key?: string;
  ndpCurrency?: string;
  ndp_currency?: string;
  platformFeeActualNdp?: NumericValue;
  platform_fee_actual_ndp?: NumericValue;
  requestFeeActualNdp?: NumericValue;
  request_fee_actual_ndp?: NumericValue;
  paidUserRewardNdp?: NumericValue;
  paid_user_reward_ndp?: NumericValue;
}

interface FrozenStockRow {
  periodKey?: string;
  period_key?: string;
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

interface MerchantSnapshotRow {
  publicId?: string;
  public_id?: string;
  name: string;
  city: string;
  address: string;
  status: string;
  activeTechnicianCount?: NumericValue;
  active_technician_count?: NumericValue;
  billingProfileId?: NumericValue;
  billing_profile_id?: NumericValue;
  billingCadence?: string | null;
  billing_cadence?: string | null;
  trialStatus?: string | null;
  trial_status?: string | null;
  trialEndsAt?: Date | string | null;
  trial_ends_at?: Date | string | null;
  paidThrough?: Date | string | null;
  paid_through?: Date | string | null;
  walletId?: NumericValue;
  wallet_id?: NumericValue;
  walletAvailableBalance?: NumericValue;
  wallet_available_balance?: NumericValue;
  walletFrozenBalance?: NumericValue;
  wallet_frozen_balance?: NumericValue;
}

const periodKey = (row: PeriodAggregateRow): string => row.periodKey ?? row.period_key ?? "";
const periodValue = (row: PeriodAggregateRow): NumericValue =>
  row.aggregateValue ?? row.aggregate_value;
const bucketKey = (row: OrderBucketRow | ScheduleBucketRow): string =>
  row.bucketKey ?? row.bucket_key ?? "";

export class DashboardRepository {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly billingPolicy: SaasBillingPolicyService = new SaasBillingPolicyService(),
    private readonly now: () => Date = () => new Date()
  ) {}

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

  public async getMerchantFacts(
    input: DashboardAggregateInput
  ): Promise<DashboardMerchantFacts | null> {
    if (input.scope.kind !== "shop") return null;

    const [row] = await this.queryMerchantSnapshot(input.scope.shopId);
    const publicId = row?.publicId ?? row?.public_id;
    if (!row || !publicId) return null;

    const activeTechnicians = this.toNumber(
      row.activeTechnicianCount ?? row.active_technician_count
    );
    const billingProfileId = row.billingProfileId ?? row.billing_profile_id;
    const billing =
      billingProfileId === null || billingProfileId === undefined
        ? null
        : this.mapMerchantBilling(row, activeTechnicians);
    const walletId = row.walletId ?? row.wallet_id;
    const walletOpened = walletId !== null && walletId !== undefined;

    return {
      publicId,
      name: row.name,
      city: row.city,
      address: row.address,
      status: row.status,
      billing,
      wallet: walletOpened
        ? {
            status: "available",
            currency: "NDP",
            availableBalance: this.toNumber(
              row.walletAvailableBalance ?? row.wallet_available_balance
            ),
            frozenBalance: this.toNumber(row.walletFrozenBalance ?? row.wallet_frozen_balance)
          }
        : {
            status: "not_opened",
            currency: "NDP",
            availableBalance: null,
            frozenBalance: null
          }
    };
  }

  public async getActivityFacts(input: DashboardAggregateInput): Promise<DashboardActivityFacts> {
    const { window } = input;
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const currentScheduleWhere = this.scheduleWhere(
      shopId,
      city,
      window.fromInclusive,
      window.toExclusive
    );
    const previousScheduleWhere = this.scheduleWhere(
      shopId,
      city,
      window.previousFromInclusive,
      window.previousToExclusive
    );
    const currentCompletedWhere = this.completedGmvWhere(
      shopId,
      city,
      window.fromInclusive,
      window.toExclusive
    );
    const previousCompletedWhere = this.completedGmvWhere(
      shopId,
      city,
      window.previousFromInclusive,
      window.previousToExclusive
    );
    const isPlatform = input.scope.kind === "platform";

    const [
      currentAvailableSlots,
      previousAvailableSlots,
      currentGmv,
      previousGmv,
      pendingOrders,
      currentNewCustomers,
      previousNewCustomers,
      currentShopCount,
      previousShopCount,
      activeRows,
      completedCustomerRows,
      registeredTechnicianRows,
      shopStockRows,
      orderRows,
      scheduleRows
    ] = await Promise.all([
      this.client.scheduleSlot.count({ where: currentScheduleWhere }),
      this.client.scheduleSlot.count({ where: previousScheduleWhere }),
      this.client.bookingOrder.aggregate({
        where: currentCompletedWhere,
        _sum: { priceAmount: true }
      }),
      this.client.bookingOrder.aggregate({
        where: previousCompletedWhere,
        _sum: { priceAmount: true }
      }),
      this.client.bookingOrder.count({ where: this.pendingOrderWhere(shopId, city) }),
      isPlatform
        ? this.client.customerProfile.count({
            where: this.customerWhere(
              city,
              window.fromInclusive,
              window.toExclusive
            )
          })
        : Promise.resolve(null),
      isPlatform
        ? this.client.customerProfile.count({
            where: this.customerWhere(
              city,
              window.previousFromInclusive,
              window.previousToExclusive
            )
          })
        : Promise.resolve(null),
      isPlatform
        ? this.client.shop.count({
            where: this.shopWhere(city, window.toExclusive)
          })
        : Promise.resolve(null),
      isPlatform
        ? this.client.shop.count({
            where: this.shopWhere(city, window.previousToExclusive)
          })
        : Promise.resolve(null),
      this.queryActiveTechnicians(input),
      this.queryCompletedCustomers(input),
      this.queryRegisteredTechnicians(input),
      isPlatform ? this.queryShopStock(input) : Promise.resolve([]),
      this.queryOrderSeries(input),
      this.queryScheduleSeries(input)
    ]);

    const activeByPeriod = this.periodMap(activeRows);
    const customersByPeriod = this.periodMap(completedCustomerRows);
    const techniciansByPeriod = this.periodMap(registeredTechnicianRows);
    const shopsByPeriod = this.periodMap(shopStockRows);
    const ordersByBucket = new Map(
      orderRows.map((row) => [
        bucketKey(row),
        {
          orderCount: this.toNumber(row.orderCount ?? row.order_count),
          serviceGmvJpy: this.toNumber(row.serviceGmvJpy ?? row.service_gmv_jpy)
        }
      ])
    );
    const scheduleByBucket = new Map(
      scheduleRows.map((row) => [
        bucketKey(row),
        {
          available: this.toNumber(
            row.scheduleAvailableHours ?? row.schedule_available_hours
          ),
          booked: this.toNumber(row.scheduleBookedHours ?? row.schedule_booked_hours)
        }
      ])
    );

    return {
      current: {
        availableScheduleSlots: currentAvailableSlots,
        activeTechnicians: activeByPeriod.get("current") ?? 0,
        registeredTechnicians: techniciansByPeriod.get("current") ?? 0,
        shopCount: currentShopCount,
        newCustomers: currentNewCustomers,
        pendingOrders,
        serviceGmvJpy: this.toNumber(currentGmv._sum.priceAmount),
        completedCustomerCount: customersByPeriod.get("current") ?? 0
      },
      previous: {
        availableScheduleSlots: previousAvailableSlots,
        activeTechnicians: activeByPeriod.get("previous") ?? 0,
        registeredTechnicians: techniciansByPeriod.get("previous") ?? 0,
        shopCount: previousShopCount,
        newCustomers: previousNewCustomers,
        serviceGmvJpy: this.toNumber(previousGmv._sum.priceAmount),
        completedCustomerCount: customersByPeriod.get("previous") ?? 0
      },
      buckets: window.buckets.map((bucket) => {
        const orders = ordersByBucket.get(bucket.key) ?? {
          orderCount: 0,
          serviceGmvJpy: 0
        };
        const schedule = scheduleByBucket.get(bucket.key) ?? { available: 0, booked: 0 };
        return {
          key: bucket.key,
          label: bucket.label,
          orderCount: orders.orderCount,
          serviceGmvJpy: orders.serviceGmvJpy,
          shopCount: shopsByPeriod.get(bucket.key) ?? 0,
          registeredTechnicianCount: techniciansByPeriod.get(bucket.key) ?? 0,
          scheduleTotalHours: schedule.available + schedule.booked,
          scheduleAvailableHours: schedule.available,
          scheduleBookedHours: schedule.booked
        };
      })
    };
  }

  private scheduleWhere(
    shopId: number | null,
    city: string | null,
    fromInclusive: Date,
    toExclusive: Date
  ): Prisma.ScheduleSlotWhereInput {
    return {
      deletedAt: null,
      status: "AVAILABLE",
      startsAt: { lt: toExclusive },
      endsAt: { gt: fromInclusive },
      ...this.prismaRelatedShopScope(shopId, city)
    };
  }

  private completedGmvWhere(
    shopId: number | null,
    city: string | null,
    fromInclusive: Date,
    toExclusive: Date
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      status: "COMPLETED",
      paymentStatus: { notIn: ["REFUND_PENDING", "REFUNDED"] },
      startsAt: { gte: fromInclusive, lt: toExclusive },
      ...this.prismaRelatedShopScope(shopId, city)
    };
  }

  private pendingOrderWhere(
    shopId: number | null,
    city: string | null
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      status: "PENDING",
      ...this.prismaRelatedShopScope(shopId, city)
    };
  }

  private prismaRelatedShopScope(
    shopId: number | null,
    city: string | null
  ): { shopId?: number; shop: Prisma.ShopWhereInput } {
    return {
      ...(shopId ? { shopId } : {}),
      shop: {
        deletedAt: null,
        ...(city ? { city } : {})
      }
    };
  }

  private customerWhere(
    city: string | null,
    fromInclusive: Date,
    toExclusive: Date
  ): Prisma.CustomerProfileWhereInput {
    return {
      deletedAt: null,
      createdAt: { gte: fromInclusive, lt: toExclusive },
      ...(city ? { city } : {})
    };
  }

  private shopWhere(city: string | null, toExclusive: Date): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      createdAt: { lt: toExclusive },
      ...(city ? { city } : {})
    };
  }

  private periodTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        {
          key: "current",
          fromInclusive: input.window.fromInclusive,
          toExclusive: input.window.toExclusive
        },
        {
          key: "previous",
          fromInclusive: input.window.previousFromInclusive,
          toExclusive: input.window.previousToExclusive
        }
      ].map(
        (period) => Prisma.sql`SELECT ${period.key} AS period_key,
          ${period.fromInclusive} AS from_inclusive,
          ${period.toExclusive} AS to_exclusive`
      ),
      " UNION ALL "
    );
  }

  private cutoffTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        { key: "current", cutoff: input.window.toExclusive },
        { key: "previous", cutoff: input.window.previousToExclusive },
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
        (interval) => Prisma.sql`SELECT ${interval.key} AS period_key,
          ${interval.fromInclusive} AS from_inclusive,
          ${interval.toExclusive} AS to_exclusive`
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

  private bookingScope(shopId: number | null, city: string | null): Prisma.Sql {
    return this.rawRelatedShopScope(Prisma.sql`booking.shop_id`, shopId, city);
  }

  private slotScope(shopId: number | null, city: string | null): Prisma.Sql {
    return this.rawRelatedShopScope(Prisma.sql`slot.shop_id`, shopId, city);
  }

  private rawRelatedShopScope(
    relatedShopId: Prisma.Sql,
    shopId: number | null,
    city: string | null
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [Prisma.sql`shop.deleted_at IS NULL`];
    if (shopId) filters.push(Prisma.sql`${relatedShopId} = ${shopId}`);
    if (city) filters.push(Prisma.sql`shop.city = ${city}`);
    return Prisma.join(filters, " AND ");
  }

  private async queryActiveTechnicians(
    input: DashboardAggregateInput
  ): Promise<PeriodAggregateRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const periods = this.periodTable(input);
    const slotScope = this.slotScope(shopId, city);
    const bookingScope = this.bookingScope(shopId, city);
    return this.client.$queryRaw<PeriodAggregateRow[]>(Prisma.sql`
      /* dashboard_active_technicians */
      WITH periods AS (${periods}), active_profiles AS (
        SELECT period.period_key, slot.technician_profile_id AS profile_id
        FROM periods AS period
        INNER JOIN schedule_slots AS slot
          ON slot.starts_at < period.to_exclusive
          AND slot.ends_at > period.from_inclusive
          AND slot.deleted_at IS NULL
          AND slot.technician_profile_id IS NOT NULL
        INNER JOIN technician_profiles AS profile
          ON profile.id = slot.technician_profile_id
          AND profile.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = slot.shop_id
        WHERE ${slotScope}
        UNION
        SELECT period.period_key, booking.technician_profile_id AS profile_id
        FROM periods AS period
        INNER JOIN booking_orders AS booking
          ON booking.starts_at >= period.from_inclusive
          AND booking.starts_at < period.to_exclusive
          AND booking.deleted_at IS NULL
          AND booking.status <> ${"cancelled"}
          AND booking.technician_profile_id IS NOT NULL
        INNER JOIN technician_profiles AS profile
          ON profile.id = booking.technician_profile_id
          AND profile.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = booking.shop_id
        WHERE ${bookingScope}
      )
      SELECT period_key AS periodKey, COUNT(DISTINCT profile_id) AS aggregateValue
      FROM active_profiles
      GROUP BY period_key
    `);
  }

  private async queryCompletedCustomers(
    input: DashboardAggregateInput
  ): Promise<PeriodAggregateRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const periods = this.periodTable(input);
    const scope = this.bookingScope(shopId, city);
    return this.client.$queryRaw<PeriodAggregateRow[]>(Prisma.sql`
      /* dashboard_completed_customers */
      WITH periods AS (${periods})
      SELECT
        period.period_key AS periodKey,
        COUNT(DISTINCT booking.customer_user_id) AS aggregateValue
      FROM periods AS period
      INNER JOIN booking_orders AS booking
        ON booking.starts_at >= period.from_inclusive
        AND booking.starts_at < period.to_exclusive
        AND booking.deleted_at IS NULL
        AND booking.status = ${"completed"}
        AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})
      INNER JOIN shops AS shop ON shop.id = booking.shop_id
      WHERE ${scope}
      GROUP BY period.period_key
    `);
  }

  private async queryRegisteredTechnicians(
    input: DashboardAggregateInput
  ): Promise<PeriodAggregateRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const cutoffs = this.cutoffTable(input);
    const scope = shopId
      ? Prisma.sql`(direct_shop.id = ${shopId} OR affiliation_shop.id = ${shopId})`
      : city
        ? Prisma.sql`(
            profile.city = ${city}
            OR direct_shop.city = ${city}
            OR affiliation_shop.city = ${city}
          )`
        : Prisma.sql`1 = 1`;
    return this.client.$queryRaw<PeriodAggregateRow[]>(Prisma.sql`
      /* dashboard_registered_technicians */
      WITH cutoffs AS (${cutoffs})
      SELECT
        cutoffs.period_key AS periodKey,
        COUNT(DISTINCT profile.id) AS aggregateValue
      FROM cutoffs
      INNER JOIN technician_profiles AS profile
        ON profile.deleted_at IS NULL
        AND profile.created_at < cutoffs.cutoff
      LEFT JOIN shops AS direct_shop
        ON direct_shop.id = profile.shop_id
        AND direct_shop.deleted_at IS NULL
      LEFT JOIN technician_shop_affiliations AS affiliation
        ON affiliation.technician_profile_id = profile.id
        AND affiliation.work_status = ${"active"}
        AND affiliation.deleted_at IS NULL
        AND affiliation.starts_at < cutoffs.cutoff
        AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= cutoffs.cutoff)
      LEFT JOIN shops AS affiliation_shop
        ON affiliation_shop.id = affiliation.shop_id
        AND affiliation_shop.deleted_at IS NULL
      WHERE ${scope}
      GROUP BY cutoffs.period_key
    `);
  }

  private async queryShopStock(input: DashboardAggregateInput): Promise<PeriodAggregateRow[]> {
    const cutoffs = this.cutoffTable(input);
    const city = input.city;
    const cityScope = city ? Prisma.sql`AND shop.city = ${city}` : Prisma.empty;
    return this.client.$queryRaw<PeriodAggregateRow[]>(Prisma.sql`
      /* dashboard_shop_stock */
      WITH cutoffs AS (${cutoffs})
      SELECT
        cutoffs.period_key AS periodKey,
        COUNT(shop.id) AS aggregateValue
      FROM cutoffs
      LEFT JOIN shops AS shop
        ON shop.deleted_at IS NULL
        AND shop.created_at < cutoffs.cutoff
        ${cityScope}
      GROUP BY cutoffs.period_key
    `);
  }

  private async queryOrderSeries(input: DashboardAggregateInput): Promise<OrderBucketRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const buckets = this.bucketTable(input);
    const scope = this.bookingScope(shopId, city);
    return this.client.$queryRaw<OrderBucketRow[]>(Prisma.sql`
      /* dashboard_order_series */
      WITH buckets AS (${buckets})
      SELECT
        bucket.bucket_key AS bucketKey,
        COUNT(booking.id) AS orderCount,
        COALESCE(SUM(
          CASE
            WHEN booking.status = ${"completed"}
              AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})
            THEN booking.price_amount
            ELSE 0
          END
        ), 0) AS serviceGmvJpy
      FROM buckets AS bucket
      INNER JOIN booking_orders AS booking
        ON booking.starts_at >= bucket.from_inclusive
        AND booking.starts_at < bucket.to_exclusive
        AND booking.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = booking.shop_id
      WHERE ${scope}
      GROUP BY bucket.bucket_key
    `);
  }

  private async queryScheduleSeries(input: DashboardAggregateInput): Promise<ScheduleBucketRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const buckets = this.bucketTable(input);
    const scope = this.slotScope(shopId, city);
    return this.client.$queryRaw<ScheduleBucketRow[]>(Prisma.sql`
      /* dashboard_schedule_series */
      WITH buckets AS (${buckets})
      SELECT
        bucket.bucket_key AS bucketKey,
        COALESCE(SUM(
          CASE WHEN slot.status = ${"available"} THEN
            TIMESTAMPDIFF(
              MICROSECOND,
              GREATEST(slot.starts_at, bucket.from_inclusive),
              LEAST(slot.ends_at, bucket.to_exclusive)
            ) / 3600000000
          ELSE 0 END
        ), 0) AS scheduleAvailableHours,
        COALESCE(SUM(
          CASE WHEN slot.status = ${"booked"} THEN
            TIMESTAMPDIFF(
              MICROSECOND,
              GREATEST(slot.starts_at, bucket.from_inclusive),
              LEAST(slot.ends_at, bucket.to_exclusive)
            ) / 3600000000
          ELSE 0 END
        ), 0) AS scheduleBookedHours
      FROM buckets AS bucket
      INNER JOIN schedule_slots AS slot
        ON slot.starts_at < bucket.to_exclusive
        AND slot.ends_at > bucket.from_inclusive
        AND slot.deleted_at IS NULL
        AND slot.status IN (${"available"}, ${"booked"})
      INNER JOIN shops AS shop ON shop.id = slot.shop_id
      WHERE ${scope}
      GROUP BY bucket.bucket_key
    `);
  }

  private async queryFinanceFlows(input: DashboardAggregateInput): Promise<FinanceFlowRow[]> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const intervals = this.financeIntervalTable(input);
    const scope = this.rawRelatedShopScope(Prisma.sql`financial.shop_id`, shopId, city);
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
          AND financial.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = financial.shop_id
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
          AND booking.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = financial.shop_id
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
        AND financial.shop_id = ${input.scope.shopId}
        AND financial.service_income_status IN (${"reported"}, ${"confirmed"})
        AND financial.deleted_at IS NULL
      INNER JOIN shops AS shop
        ON shop.id = financial.shop_id
        AND shop.deleted_at IS NULL
      GROUP BY bucket.bucket_key
    `);
  }

  private async queryMerchantSnapshot(shopId: number): Promise<MerchantSnapshotRow[]> {
    return this.client.$queryRaw<MerchantSnapshotRow[]>(Prisma.sql`
      /* dashboard_merchant_shop_snapshot */
      SELECT
        identifier.public_id AS publicId,
        shop.name,
        shop.city,
        shop.address,
        shop.status,
        COALESCE(active_technician.aggregate_value, 0) AS activeTechnicianCount,
        billing.id AS billingProfileId,
        billing.billing_cadence AS billingCadence,
        billing.trial_status AS trialStatus,
        billing.trial_ends_at AS trialEndsAt,
        billing.paid_through AS paidThrough,
        wallet.id AS walletId,
        wallet.available_balance AS walletAvailableBalance,
        wallet.frozen_balance AS walletFrozenBalance
      FROM shops AS shop
      INNER JOIN public_identifiers AS identifier
        ON identifier.shop_id = shop.id
        AND identifier.kind = ${"shop"}
        AND identifier.status = ${"active"}
        AND identifier.deleted_at IS NULL
      LEFT JOIN saas_billing_profiles AS billing
        ON billing.subject_type = ${"shop"}
        AND billing.subject_id = shop.id
        AND billing.shop_id = shop.id
        AND billing.active_key IS NOT NULL
        AND billing.deleted_at IS NULL
      LEFT JOIN (
        SELECT profile.shop_id, COUNT(profile.id) AS aggregate_value
        FROM technician_profiles AS profile
        WHERE profile.status = ${"published"}
          AND profile.deleted_at IS NULL
        GROUP BY profile.shop_id
      ) AS active_technician ON active_technician.shop_id = shop.id
      LEFT JOIN wallets AS wallet
        ON wallet.owner_type = ${"shop"}
        AND wallet.owner_id = shop.id
        AND wallet.currency = ${"NDP"}
        AND wallet.deleted_at IS NULL
      WHERE shop.id = ${shopId}
        AND shop.deleted_at IS NULL
      LIMIT 1
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

  private mapMerchantBilling(
    row: MerchantSnapshotRow,
    activeTechnicians: number
  ): NonNullable<DashboardMerchantFacts["billing"]> {
    const storedCadence = row.billingCadence ?? row.billing_cadence;
    const billingCadence: BillingCadence =
      storedCadence === "annual" || storedCadence === "free" ? storedCadence : "monthly";
    const storedTrialStatus = row.trialStatus ?? row.trial_status;
    const trialStatus: TrialStatus =
      storedTrialStatus === "active" ||
      storedTrialStatus === "completed" ||
      storedTrialStatus === "interrupted" ||
      storedTrialStatus === "not_applicable"
        ? storedTrialStatus
        : "not_started";
    const trialEndsAt = this.dateValue(row.trialEndsAt ?? row.trial_ends_at);
    const paidThrough = this.dateValue(row.paidThrough ?? row.paid_through);
    const classification = this.billingPolicy.classifyShop(activeTechnicians);
    const state = this.billingPolicy.resolveState(
      {
        subjectType: "shop",
        activeTechnicians,
        billingCadence,
        trialStatus,
        trialEndsAt,
        paidThrough
      },
      this.now()
    );

    return {
      cadence: classification.billable ? billingCadence : "free",
      state,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      paidThrough: paidThrough?.toISOString() ?? null
    };
  }

  private dateValue(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value : new Date(value);
  }

  private periodMap(rows: PeriodAggregateRow[]): Map<string, number> {
    return new Map(rows.map((row) => [periodKey(row), this.toNumber(periodValue(row))]));
  }

  private toNumber(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    return Number(typeof value === "object" ? value.toString() : value);
  }
}
