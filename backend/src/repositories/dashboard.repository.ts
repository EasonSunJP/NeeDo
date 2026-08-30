import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DashboardActivityFacts,
  DashboardAggregateInput
} from "../domain/dashboard";
import { prisma } from "../prisma/client";

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

const periodKey = (row: PeriodAggregateRow): string => row.periodKey ?? row.period_key ?? "";
const periodValue = (row: PeriodAggregateRow): NumericValue =>
  row.aggregateValue ?? row.aggregate_value;
const bucketKey = (row: OrderBucketRow | ScheduleBucketRow): string =>
  row.bucketKey ?? row.bucket_key ?? "";

export class DashboardRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

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
      ...(shopId ? { shopId } : {}),
      ...(city ? { shop: { city, deletedAt: null } } : {})
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
      ...(shopId ? { shopId } : {}),
      ...(city ? { shop: { city, deletedAt: null } } : {})
    };
  }

  private pendingOrderWhere(
    shopId: number | null,
    city: string | null
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      status: "PENDING",
      ...(shopId ? { shopId } : {}),
      ...(city ? { shop: { city, deletedAt: null } } : {})
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

  private bookingScope(shopId: number | null, city: string | null): Prisma.Sql {
    if (shopId) return Prisma.sql`booking.shop_id = ${shopId}`;
    if (city) return Prisma.sql`shop.city = ${city} AND shop.deleted_at IS NULL`;
    return Prisma.sql`shop.deleted_at IS NULL`;
  }

  private slotScope(shopId: number | null, city: string | null): Prisma.Sql {
    if (shopId) return Prisma.sql`slot.shop_id = ${shopId}`;
    if (city) return Prisma.sql`shop.city = ${city} AND shop.deleted_at IS NULL`;
    return Prisma.sql`shop.deleted_at IS NULL`;
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

  private periodMap(rows: PeriodAggregateRow[]): Map<string, number> {
    return new Map(rows.map((row) => [periodKey(row), this.toNumber(periodValue(row))]));
  }

  private toNumber(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    return Number(typeof value === "object" ? value.toString() : value);
  }
}
