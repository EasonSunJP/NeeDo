import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DashboardActivityFacts,
  DashboardAggregateFacts,
  DashboardAggregateInput,
  DashboardFinanceFacts,
  DashboardHeadlineSeriesPoint,
  DashboardMerchantFacts
} from "../domain/dashboard";
import { prisma } from "../prisma/client";
import {
  DashboardFinanceRepository,
  type DashboardFinanceReader
} from "./dashboard-finance.repository";
import {
  DashboardMerchantRepository,
  type DashboardMerchantReader
} from "./dashboard-merchant.repository";
import {
  DashboardOperationsFinanceRepository,
  type DashboardOperationsFinanceReader,
  type OperationsFinanceFacts,
  type TravelFareDetailRow
} from "./dashboard-operations-finance.repository";
import {
  DashboardCommissionRepository,
  type CommissionFacts,
  type DashboardCommissionReader
} from "./dashboard-commission.repository";
import {
  DashboardGrowthRepository,
  type DashboardGrowthReader,
  type GrowthFacts
} from "./dashboard-growth.repository";
import {
  DashboardMembershipRepository,
  type DashboardMembershipReader
} from "./dashboard-membership.repository";

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

interface AvailableCityRow {
  city: string;
}

interface CityActivityScalarRow extends PeriodAggregateRow {
  availableScheduleSlots?: NumericValue;
  available_schedule_slots?: NumericValue;
  serviceGmvJpy?: NumericValue;
  service_gmv_jpy?: NumericValue;
  newCustomers?: NumericValue;
  new_customers?: NumericValue;
  shopCount?: NumericValue;
  shop_count?: NumericValue;
  pendingOrders?: NumericValue;
  pending_orders?: NumericValue;
}

interface HeadlineBucketRow {
  bucketKey?: string;
  bucket_key?: string;
  availableScheduleSlots?: NumericValue;
  available_schedule_slots?: NumericValue;
  activeTechnicians?: NumericValue;
  active_technicians?: NumericValue;
  registeredTechnicians?: NumericValue;
  registered_technicians?: NumericValue;
  shopCount?: NumericValue;
  shop_count?: NumericValue;
  newCustomers?: NumericValue;
  new_customers?: NumericValue;
}

interface ActivityScalarFacts {
  current: {
    availableScheduleSlots: number;
    serviceGmvJpy: number;
    newCustomers: number | null;
    shopCount: number | null;
    pendingOrders: number;
  };
  previous: {
    availableScheduleSlots: number;
    serviceGmvJpy: number;
    newCustomers: number | null;
    shopCount: number | null;
  };
}

const periodKey = (row: PeriodAggregateRow): string => row.periodKey ?? row.period_key ?? "";
const periodValue = (row: PeriodAggregateRow): NumericValue =>
  row.aggregateValue ?? row.aggregate_value;
const bucketKey = (row: OrderBucketRow | ScheduleBucketRow): string =>
  row.bucketKey ?? row.bucket_key ?? "";

export class DashboardRepository {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly financeReader: DashboardFinanceReader = new DashboardFinanceRepository(client),
    private readonly merchantReader: DashboardMerchantReader = new DashboardMerchantRepository(
      client
    ),
    private readonly operationsFinanceReader: DashboardOperationsFinanceReader = new DashboardOperationsFinanceRepository(
      client
    ),
    private readonly commissionReader: DashboardCommissionReader = new DashboardCommissionRepository(
      client
    ),
    private readonly growthReader: DashboardGrowthReader = new DashboardGrowthRepository(client),
    private readonly membershipReader: DashboardMembershipReader = new DashboardMembershipRepository(
      client
    )
  ) {}

  public async getDashboard(input: DashboardAggregateInput): Promise<DashboardAggregateFacts> {
    const [activity, finance, merchant, availableCities, membership] = await Promise.all([
      this.getActivityFacts(input),
      this.getFinanceFacts(input),
      this.getMerchantFacts(input),
      this.getAvailableCities(input),
      input.scope.kind === "shop"
        ? this.membershipReader.getMembershipFacts(input)
        : Promise.resolve(null)
    ]);

    return {
      ...activity,
      finance,
      merchant,
      membership,
      availableCities
    };
  }

  public async getHeadlineSeries3d(
    input: DashboardAggregateInput
  ): Promise<DashboardHeadlineSeriesPoint[]> {
    if (input.window.buckets.length !== 3) {
      throw new RangeError("Dashboard headline series requires exactly three buckets");
    }
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const technicianScope = shopId
      ? Prisma.sql`(direct_shop.id = ${shopId} OR affiliation_shop.id = ${shopId})`
      : city
        ? Prisma.sql`(
            TRIM(profile.city) = ${city}
            OR TRIM(direct_shop.city) = ${city}
            OR TRIM(affiliation_shop.city) = ${city}
          )`
        : Prisma.sql`TRUE`;
    const shopStockScope = shopId
      ? Prisma.sql`shop.id = ${shopId}`
      : city
        ? Prisma.sql`TRIM(shop.city) = ${city}`
        : Prisma.sql`TRUE`;
    const customerScope = shopId
      ? Prisma.sql`FALSE`
      : city
        ? Prisma.sql`TRIM(profile.city) = ${city}`
        : Prisma.sql`TRUE`;
    const slotScope = this.slotScope(shopId, city);
    const bookingScope = this.bookingScope(shopId, city);
    const rows = await this.client.$queryRaw<HeadlineBucketRow[]>(Prisma.sql`
      /* dashboard_headline_series_3d */
      WITH buckets AS (${this.bucketTable(input)}),
      active_profiles AS (
        SELECT bucket.bucket_key, slot.technician_profile_id AS profile_id
        FROM buckets AS bucket
        INNER JOIN schedule_slots AS slot
          ON slot.starts_at < bucket.to_exclusive
          AND slot.ends_at > bucket.from_inclusive
          AND slot.deleted_at IS NULL
          AND slot.technician_profile_id IS NOT NULL
        INNER JOIN technician_profiles AS profile
          ON profile.id = slot.technician_profile_id AND profile.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = slot.shop_id
        WHERE ${slotScope}
        UNION
        SELECT bucket.bucket_key, booking.technician_profile_id AS profile_id
        FROM buckets AS bucket
        INNER JOIN booking_orders AS booking
          ON booking.starts_at >= bucket.from_inclusive
          AND booking.starts_at < bucket.to_exclusive
          AND booking.deleted_at IS NULL
          AND booking.status <> ${"cancelled"}
          AND booking.technician_profile_id IS NOT NULL
        INNER JOIN technician_profiles AS profile
          ON profile.id = booking.technician_profile_id AND profile.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = booking.shop_id
        WHERE ${bookingScope}
      )
      SELECT bucket.bucket_key AS bucketKey,
        (SELECT COUNT(slot.id)
         FROM schedule_slots AS slot
         INNER JOIN shops AS shop ON shop.id = slot.shop_id
         WHERE slot.deleted_at IS NULL AND slot.status = ${"available"}
           AND slot.starts_at < bucket.to_exclusive
           AND slot.ends_at > bucket.from_inclusive
           AND ${slotScope}) AS availableScheduleSlots,
        (SELECT COUNT(DISTINCT active.profile_id)
         FROM active_profiles AS active
         WHERE active.bucket_key = bucket.bucket_key) AS activeTechnicians,
        (SELECT COUNT(DISTINCT profile.id)
         FROM technician_profiles AS profile
         LEFT JOIN shops AS direct_shop
           ON direct_shop.id = profile.shop_id AND direct_shop.deleted_at IS NULL
         LEFT JOIN technician_shop_affiliations AS affiliation
           ON affiliation.technician_profile_id = profile.id
           AND affiliation.work_status = ${"active"}
           AND affiliation.deleted_at IS NULL
           AND affiliation.starts_at < bucket.to_exclusive
           AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= bucket.to_exclusive)
         LEFT JOIN shops AS affiliation_shop
           ON affiliation_shop.id = affiliation.shop_id AND affiliation_shop.deleted_at IS NULL
         WHERE profile.deleted_at IS NULL
           AND profile.created_at < bucket.to_exclusive
           AND ${technicianScope}) AS registeredTechnicians,
        (SELECT COUNT(shop.id)
         FROM shops AS shop
         WHERE shop.deleted_at IS NULL
           AND shop.created_at < bucket.to_exclusive
           AND ${shopStockScope}) AS shopCount,
        (SELECT COUNT(profile.id)
         FROM customer_profiles AS profile
         WHERE profile.deleted_at IS NULL
           AND profile.created_at >= bucket.from_inclusive
           AND profile.created_at < bucket.to_exclusive
           AND ${customerScope}) AS newCustomers
      FROM buckets AS bucket
    `);
    const allowedKeys = new Set(input.window.buckets.map((bucket) => bucket.key));
    const byKey = new Map<string, Omit<DashboardHeadlineSeriesPoint, "key" | "label">>();
    for (const row of rows) {
      const key = row.bucketKey ?? row.bucket_key ?? "";
      if (!allowedKeys.has(key) || byKey.has(key)) {
        throw new RangeError("Dashboard headline series returned invalid bucket evidence");
      }
      byKey.set(key, {
        availableScheduleSlots: this.toHeadlineInteger(
          row.availableScheduleSlots ?? row.available_schedule_slots
        ),
        activeTechnicians: this.toHeadlineInteger(
          row.activeTechnicians ?? row.active_technicians
        ),
        registeredTechnicians: this.toHeadlineInteger(
          row.registeredTechnicians ?? row.registered_technicians
        ),
        shopCount: this.toHeadlineInteger(row.shopCount ?? row.shop_count),
        newCustomers: this.toHeadlineInteger(row.newCustomers ?? row.new_customers)
      });
    }
    return input.window.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      ...(byKey.get(bucket.key) ?? {
        availableScheduleSlots: 0,
        activeTechnicians: 0,
        registeredTechnicians: 0,
        shopCount: 0,
        newCustomers: 0
      })
    }));
  }

  public async getFinanceFacts(input: DashboardAggregateInput): Promise<DashboardFinanceFacts> {
    return this.financeReader.getFinanceFacts(input);
  }

  public async getMerchantFacts(
    input: DashboardAggregateInput
  ): Promise<DashboardMerchantFacts | null> {
    return this.merchantReader.getMerchantFacts(input);
  }

  public async getOperationsFinance(
    input: DashboardAggregateInput
  ): Promise<OperationsFinanceFacts> {
    return this.operationsFinanceReader.getOperationsFinance(input);
  }

  public async getTravelFareDetails(
    input: DashboardAggregateInput
  ): Promise<TravelFareDetailRow[]> {
    return this.operationsFinanceReader.getTravelFareDetails?.(input) ?? [];
  }

  public async getCommissionFacts(input: DashboardAggregateInput): Promise<CommissionFacts> {
    return this.commissionReader.getCommissionFacts(input);
  }

  public async getGrowthFacts(input: DashboardAggregateInput): Promise<GrowthFacts> {
    return this.growthReader.getGrowthFacts(input);
  }

  public async getActivityFacts(input: DashboardAggregateInput): Promise<DashboardActivityFacts> {
    const { window } = input;
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    const city = input.scope.kind === "platform" ? input.city : null;
    const isPlatform = input.scope.kind === "platform";

    const [
      scalars,
      activeRows,
      completedCustomerRows,
      registeredTechnicianRows,
      shopStockRows,
      orderRows,
      scheduleRows
    ] = await Promise.all([
      this.getActivityScalarFacts(input, shopId, city),
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
          available: this.toNumber(row.scheduleAvailableHours ?? row.schedule_available_hours),
          booked: this.toNumber(row.scheduleBookedHours ?? row.schedule_booked_hours)
        }
      ])
    );

    return {
      current: {
        availableScheduleSlots: scalars.current.availableScheduleSlots,
        activeTechnicians: activeByPeriod.get("current") ?? 0,
        registeredTechnicians: techniciansByPeriod.get("current") ?? 0,
        shopCount: scalars.current.shopCount,
        newCustomers: scalars.current.newCustomers,
        pendingOrders: scalars.current.pendingOrders,
        serviceGmvJpy: scalars.current.serviceGmvJpy,
        completedCustomerCount: customersByPeriod.get("current") ?? 0
      },
      previous: {
        availableScheduleSlots: scalars.previous.availableScheduleSlots,
        activeTechnicians: activeByPeriod.get("previous") ?? 0,
        registeredTechnicians: techniciansByPeriod.get("previous") ?? 0,
        shopCount: scalars.previous.shopCount,
        newCustomers: scalars.previous.newCustomers,
        serviceGmvJpy: scalars.previous.serviceGmvJpy,
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

  private async getAvailableCities(input: DashboardAggregateInput): Promise<string[]> {
    if (input.scope.kind !== "platform") return [];

    const rows = await this.client.$queryRaw<AvailableCityRow[]>(Prisma.sql`
      /* dashboard_available_cities */
      SELECT DISTINCT TRIM(shop.city) AS city
      FROM shops AS shop
      WHERE shop.deleted_at IS NULL
        AND TRIM(shop.city) <> ${""}
      ORDER BY city ASC
    `);
    return rows.map((row) => row.city);
  }

  private async getActivityScalarFacts(
    input: DashboardAggregateInput,
    shopId: number | null,
    city: string | null
  ): Promise<ActivityScalarFacts> {
    if (input.scope.kind === "platform" && city) {
      return this.queryCityActivityScalarFacts(input, city);
    }

    const { window } = input;
    const [
      currentAvailableScheduleSlots,
      previousAvailableScheduleSlots,
      currentGmv,
      previousGmv,
      pendingOrders,
      currentNewCustomers,
      previousNewCustomers,
      currentShopCount,
      previousShopCount
    ] = await Promise.all([
      this.client.scheduleSlot.count({
        where: this.scheduleWhere(shopId, window.fromInclusive, window.toExclusive)
      }),
      this.client.scheduleSlot.count({
        where: this.scheduleWhere(shopId, window.previousFromInclusive, window.previousToExclusive)
      }),
      this.client.bookingOrder.aggregate({
        where: this.completedGmvWhere(shopId, window.fromInclusive, window.toExclusive),
        _sum: { priceAmount: true }
      }),
      this.client.bookingOrder.aggregate({
        where: this.completedGmvWhere(
          shopId,
          window.previousFromInclusive,
          window.previousToExclusive
        ),
        _sum: { priceAmount: true }
      }),
      this.client.bookingOrder.count({ where: this.pendingOrderWhere(shopId) }),
      input.scope.kind === "platform"
        ? this.client.customerProfile.count({
            where: this.customerWhere(window.fromInclusive, window.toExclusive)
          })
        : Promise.resolve(null),
      input.scope.kind === "platform"
        ? this.client.customerProfile.count({
            where: this.customerWhere(window.previousFromInclusive, window.previousToExclusive)
          })
        : Promise.resolve(null),
      input.scope.kind === "platform"
        ? this.client.shop.count({ where: this.shopWhere(window.toExclusive) })
        : Promise.resolve(null),
      input.scope.kind === "platform"
        ? this.client.shop.count({ where: this.shopWhere(window.previousToExclusive) })
        : Promise.resolve(null)
    ]);

    return {
      current: {
        availableScheduleSlots: currentAvailableScheduleSlots,
        serviceGmvJpy: this.toNumber(currentGmv._sum.priceAmount),
        newCustomers: currentNewCustomers,
        shopCount: currentShopCount,
        pendingOrders
      },
      previous: {
        availableScheduleSlots: previousAvailableScheduleSlots,
        serviceGmvJpy: this.toNumber(previousGmv._sum.priceAmount),
        newCustomers: previousNewCustomers,
        shopCount: previousShopCount
      }
    };
  }

  private async queryCityActivityScalarFacts(
    input: DashboardAggregateInput,
    city: string
  ): Promise<ActivityScalarFacts> {
    const periods = this.periodTable(input);
    const rows = await this.client.$queryRaw<CityActivityScalarRow[]>(Prisma.sql`
      /* dashboard_city_activity_scalars */
      WITH periods AS (${periods})
      SELECT
        period.period_key AS periodKey,
        (
          SELECT COUNT(slot.id)
          FROM schedule_slots AS slot
          INNER JOIN shops AS shop
            ON shop.id = slot.shop_id
            AND shop.deleted_at IS NULL
          WHERE slot.deleted_at IS NULL
            AND slot.status = ${"available"}
            AND slot.starts_at < period.to_exclusive
            AND slot.ends_at > period.from_inclusive
            AND TRIM(shop.city) = ${city}
        ) AS availableScheduleSlots,
        (
          SELECT COALESCE(SUM(booking.price_amount), 0)
          FROM booking_orders AS booking
          INNER JOIN shops AS shop
            ON shop.id = booking.shop_id
            AND shop.deleted_at IS NULL
          WHERE booking.deleted_at IS NULL
            AND booking.status = ${"completed"}
            AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})
            AND booking.starts_at >= period.from_inclusive
            AND booking.starts_at < period.to_exclusive
            AND TRIM(shop.city) = ${city}
        ) AS serviceGmvJpy,
        (
          SELECT COUNT(profile.id)
          FROM customer_profiles AS profile
          WHERE profile.deleted_at IS NULL
            AND profile.created_at >= period.from_inclusive
            AND profile.created_at < period.to_exclusive
            AND TRIM(profile.city) = ${city}
        ) AS newCustomers,
        (
          SELECT COUNT(shop.id)
          FROM shops AS shop
          WHERE shop.deleted_at IS NULL
            AND shop.created_at < period.to_exclusive
            AND TRIM(shop.city) = ${city}
        ) AS shopCount,
        CASE WHEN period.period_key = ${"current"} THEN (
          SELECT COUNT(booking.id)
          FROM booking_orders AS booking
          INNER JOIN shops AS shop
            ON shop.id = booking.shop_id
            AND shop.deleted_at IS NULL
          WHERE booking.deleted_at IS NULL
            AND booking.status = ${"pending"}
            AND TRIM(shop.city) = ${city}
        ) ELSE 0 END AS pendingOrders
      FROM periods AS period
    `);
    const byPeriod = new Map(rows.map((row) => [periodKey(row), row]));
    const current = byPeriod.get("current");
    const previous = byPeriod.get("previous");

    return {
      current: {
        availableScheduleSlots: this.toNumber(
          current?.availableScheduleSlots ?? current?.available_schedule_slots
        ),
        serviceGmvJpy: this.toNumber(current?.serviceGmvJpy ?? current?.service_gmv_jpy),
        newCustomers: this.toNumber(current?.newCustomers ?? current?.new_customers),
        shopCount: this.toNumber(current?.shopCount ?? current?.shop_count),
        pendingOrders: this.toNumber(current?.pendingOrders ?? current?.pending_orders)
      },
      previous: {
        availableScheduleSlots: this.toNumber(
          previous?.availableScheduleSlots ?? previous?.available_schedule_slots
        ),
        serviceGmvJpy: this.toNumber(previous?.serviceGmvJpy ?? previous?.service_gmv_jpy),
        newCustomers: this.toNumber(previous?.newCustomers ?? previous?.new_customers),
        shopCount: this.toNumber(previous?.shopCount ?? previous?.shop_count)
      }
    };
  }

  private scheduleWhere(
    shopId: number | null,
    fromInclusive: Date,
    toExclusive: Date
  ): Prisma.ScheduleSlotWhereInput {
    return {
      deletedAt: null,
      status: "AVAILABLE",
      startsAt: { lt: toExclusive },
      endsAt: { gt: fromInclusive },
      ...this.prismaRelatedShopScope(shopId)
    };
  }

  private completedGmvWhere(
    shopId: number | null,
    fromInclusive: Date,
    toExclusive: Date
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      status: "COMPLETED",
      paymentStatus: { notIn: ["REFUND_PENDING", "REFUNDED"] },
      startsAt: { gte: fromInclusive, lt: toExclusive },
      ...this.prismaRelatedShopScope(shopId)
    };
  }

  private pendingOrderWhere(shopId: number | null): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      status: "PENDING",
      ...this.prismaRelatedShopScope(shopId)
    };
  }

  private prismaRelatedShopScope(shopId: number | null): {
    shopId?: number;
    shop: Prisma.ShopWhereInput;
  } {
    return {
      ...(shopId ? { shopId } : {}),
      shop: {
        deletedAt: null
      }
    };
  }

  private customerWhere(fromInclusive: Date, toExclusive: Date): Prisma.CustomerProfileWhereInput {
    return {
      deletedAt: null,
      createdAt: { gte: fromInclusive, lt: toExclusive }
    };
  }

  private shopWhere(toExclusive: Date): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      createdAt: { lt: toExclusive }
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
      ].map((cutoff) => Prisma.sql`SELECT ${cutoff.key} AS period_key, ${cutoff.cutoff} AS cutoff`),
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
    if (city) filters.push(Prisma.sql`TRIM(shop.city) = ${city}`);
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
            TRIM(profile.city) = ${city}
            OR TRIM(direct_shop.city) = ${city}
            OR TRIM(affiliation_shop.city) = ${city}
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
    const cityScope = city ? Prisma.sql`AND TRIM(shop.city) = ${city}` : Prisma.empty;
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

  private periodMap(rows: PeriodAggregateRow[]): Map<string, number> {
    return new Map(rows.map((row) => [periodKey(row), this.toNumber(periodValue(row))]));
  }

  private toNumber(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    return Number(typeof value === "object" ? value.toString() : value);
  }

  private toHeadlineInteger(value: NumericValue): number {
    const parsed = this.toNumber(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new RangeError("Dashboard headline series returned invalid numeric evidence");
    }
    return parsed;
  }
}
