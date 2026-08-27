import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { NeedoIdAllocator } from "../services/needo-id.service";
import {
  IdentifierAllocator,
  formatPersonId
} from "../services/public-identifier.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  type BackofficeCsvExportPayload,
  type BackofficeAccountPayload,
  type BackofficeAuditEventPayload,
  type BackofficeCompensationProfilePayload,
  type BackofficeCustomerPayload,
  type BackofficeCustomerDetailPayload,
  type BackofficeDashboardPayload,
  type BackofficeFinanceSettlementPayload,
  type BackofficeOrderPayload,
  type BackofficeRepositoryPort,
  type BackofficeScheduleSlotPayload,
  type BackofficeServicePayload,
  type BackofficeScope,
  type BackofficeShopCreateData,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload,
  type BackofficeTechnicianRankingPayload,
  type BackofficeTechnicianDetailPayload,
  type BackofficeTechnicianServiceDetailPayload,
  type ScopedEntityInput,
  type ScopedServiceCreateInput,
  type ScopedServiceUpdateInput,
  type ScopedTechnicianApprovalInput,
  type ScopedTechnicianUpdateInput,
  type TechnicianRankingRepositoryInput
} from "../services/backoffice.service";
import type {
  BackofficeCustomerUpdateBody,
  BackofficeListQuery,
  BackofficeShopUpdateBody
} from "../validators/backoffice.validator";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";

type DecimalLike = {
  toString: () => string;
};

interface TechnicianRankingDatabaseRow {
  technician_profile_id: number;
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  shop_id: number | null;
  shop_name: string | null;
  city: string;
  service_area: string | null;
  status: string;
  verified_at: Date | string | null;
  revenue_jpy: bigint | number | string | DecimalLike;
  completed_orders: bigint | number | string | DecimalLike;
  working_days: bigint | number | string | DecimalLike;
  ranking_position: bigint | number | string | DecimalLike;
  total_technicians: bigint | number | string | DecimalLike;
  total_revenue_jpy: bigint | number | string | DecimalLike;
  total_completed_orders: bigint | number | string | DecimalLike;
  total_working_days: bigint | number | string | DecimalLike;
}

const PROFILE_DETAIL_SERVICE_LIMIT = 50;

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    customer: {
      select: {
        username: true;
        email: true;
      };
    };
    service: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type ScheduleSlotRecord = Prisma.ScheduleSlotGetPayload<{
  include: {
    service: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type FinanceSettlementRecord = Prisma.OrderFinancialGetPayload<{
  include: {
    bookingOrder: {
      select: {
        id: true;
        orderNo: true;
        shopId: true;
        technicianProfileId: true;
        technicianProfile: {
          select: {
            displayName: true;
          };
        };
        shop: {
          select: {
            name: true;
          };
        };
      };
    };
  };
}>;

type TechnicianRecord = Prisma.TechnicianProfileGetPayload<{
  include: {
    user: {
      select: {
        needoId: true;
        email: true;
        avatarUrl: true;
      };
    };
    shop: {
      select: {
        name: true;
      };
    };
  };
}>;

type ShopRecord = Prisma.ShopGetPayload<{
  include: {
    owner: {
      select: {
        email: true;
      };
    };
  };
}>;

type CustomerRecord = Prisma.CustomerProfileGetPayload<{
  include: {
    user: {
      select: {
        email: true;
        _count: {
          select: {
            bookingOrders: true;
          };
        };
      };
    };
  };
}>;

type ServiceRecord = Prisma.ServiceGetPayload<{
  include: {
    category: {
      select: {
        name: true;
      };
    };
  };
}>;

export class BackofficeRepository implements BackofficeRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly needoIdAllocator = new NeedoIdAllocator(),
    private readonly createIdentifierAllocator = (client: Prisma.TransactionClient) =>
      new IdentifierAllocator(new PublicIdentifierRepository(client))
  ) {}

  public async getDashboard(scope: BackofficeScope): Promise<BackofficeDashboardPayload> {
    const orderWhere = this.orderWhere(scope, {});
    const scheduleWhere = this.scheduleWhere(scope, {});
    const technicianWhere = this.technicianWhere(scope, {});
    const shopWhere = this.shopWhere(scope, {});
    const financeWhere = this.financeWhere(scope, {});
    const [
      orderCount,
      latestOrders,
      grossAggregate,
      availableSlots,
      bookedSlots,
      financeAggregate,
      technicianCount,
      techniciansPage,
      shopsPage
    ] = await Promise.all([
      this.client.bookingOrder.count({ where: orderWhere }),
      this.client.bookingOrder.findMany({
        where: orderWhere,
        include: this.orderInclude(),
        take: 8,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.aggregate({
        where: orderWhere,
        _sum: {
          priceAmount: true
        }
      }),
      this.client.scheduleSlot.count({
        where: {
          ...scheduleWhere,
          status: "AVAILABLE"
        }
      }),
      this.client.scheduleSlot.count({
        where: {
          ...scheduleWhere,
          status: "BOOKED"
        }
      }),
      this.client.orderFinancial.aggregate({
        where: financeWhere,
        _sum: {
          serviceAmountJpy: true,
          platformCollectedServiceAmountJpy: true,
          offlineReportedServiceAmountJpy: true,
          unknownOrUnreportedServiceAmountJpy: true,
          bPlatformFeeActualNdp: true,
          cRequestFeeActualNdp: true,
          userRewardNdp: true,
          campaignDiscountNdp: true,
          bPlatformFeeHoldNdp: true,
          cRequestFeeHoldNdp: true,
          releasedNdp: true
        }
      }),
      this.client.technicianProfile.count({ where: technicianWhere }),
      this.client.technicianProfile.findMany({
        where: technicianWhere,
        include: this.technicianInclude(),
        take: 6,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.shop.findMany({
        where: shopWhere,
        include: this.shopInclude(),
        take: 6,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    ]);
    const grossAmount = this.toNumber(grossAggregate._sum.priceAmount);
    const requestFeeNdpRevenue = financeAggregate._sum.cRequestFeeActualNdp ?? 0;
    const platformNdpRevenue =
      (financeAggregate._sum.bPlatformFeeActualNdp ?? 0) +
      requestFeeNdpRevenue -
      (financeAggregate._sum.userRewardNdp ?? 0);
    const pendingHoldNdp = Math.max(
      0,
      (financeAggregate._sum.bPlatformFeeHoldNdp ?? 0) +
        (financeAggregate._sum.cRequestFeeHoldNdp ?? 0) -
        (financeAggregate._sum.bPlatformFeeActualNdp ?? 0) -
        (financeAggregate._sum.cRequestFeeActualNdp ?? 0) -
        (financeAggregate._sum.releasedNdp ?? 0)
    );

    return {
      metrics: [
        {
          label: "订单总量",
          value: String(orderCount),
          change: "真实数据库",
          tone: orderCount > 0 ? "good" : "neutral"
        },
        {
          label: "可排班",
          value: String(availableSlots),
          change: "ScheduleSlot",
          tone: availableSlots > 0 ? "good" : "warn"
        },
        {
          label: "NDP 对账",
          value: String(platformNdpRevenue),
          change: "OrderFinancial",
          tone: platformNdpRevenue > 0 ? "good" : "neutral"
        },
        {
          label: "技师数量",
          value: String(technicianCount),
          change: "TechnicianProfile",
          tone: technicianCount > 0 ? "good" : "neutral"
        }
      ],
      orders: latestOrders.map((order) => this.mapOrder(order)),
      schedule: {
        total: availableSlots + bookedSlots,
        available: availableSlots,
        booked: bookedSlots
      },
      finance: {
        estimatedServiceGmvJpy: financeAggregate._sum.serviceAmountJpy ?? grossAmount,
        platformNdpRevenue,
        requestFeeNdpRevenue,
        userRewardNdpCost: financeAggregate._sum.userRewardNdp ?? 0,
        pendingHoldNdp,
        campaignDiscountNdp: financeAggregate._sum.campaignDiscountNdp ?? 0,
        unknownOrUnreportedServiceAmountJpy:
          financeAggregate._sum.unknownOrUnreportedServiceAmountJpy ?? 0
      },
      technicians: techniciansPage.map((technician) => this.mapTechnician(technician)),
      shops: shopsPage.map((shop) => this.mapShop(shop))
    };
  }

  public async listOrders(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.orderWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        include: this.orderInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((order) => this.mapOrder(order)),
      total,
      input
    );
  }

  public async listSchedule(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.scheduleWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.scheduleInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((slot) => this.mapScheduleSlot(slot)),
      total,
      input
    );
  }

  public async listFinanceSettlements(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.financeWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.orderFinancial.findMany({
        where,
        include: this.financeInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.orderFinancial.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((settlement) => this.mapFinanceSettlement(settlement)),
      total,
      input
    );
  }

  public async exportFinanceSettlements(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    const where = this.financeWhere(input, input);
    const rows = await this.client.orderFinancial.findMany({
      where,
      include: this.financeInclude(),
      take: 1000,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const header = [
      "id",
      "orderType",
      "orderNo",
      "shopName",
      "status",
      "serviceIncomeStatus",
      "paymentChannel",
      "technicianProfileId",
      "technicianName",
      "estimatedServiceGmvJpy",
      "platformCollectedServiceAmountJpy",
      "offlineReportedServiceAmountJpy",
      "unknownOrUnreportedServiceAmountJpy",
      "platformNdpRevenue",
      "cRequestFeeHoldNdp",
      "cRequestFeeActualNdp",
      "requestFeeNdpRevenue",
      "userRewardNdpCost",
      "pendingHoldNdp",
      "campaignDiscountNdp",
      "releasedNdp",
      "penaltyNdp",
      "compensationToUserNdp",
      "technicianEstimatedIncomeJpy",
      "shopEstimatedGrossProfitJpy",
      "moneyTimelineStatus",
      "createdAt"
    ];
    const content = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          this.orderType(row.orderType),
          row.bookingOrder.orderNo,
          row.bookingOrder.shop.name,
          row.settlementStatus,
          row.serviceIncomeStatus,
          row.paymentChannel,
          row.technicianProfileId ?? "",
          row.bookingOrder.technicianProfile?.displayName ?? "",
          row.serviceAmountJpy,
          row.platformCollectedServiceAmountJpy,
          row.offlineReportedServiceAmountJpy,
          row.unknownOrUnreportedServiceAmountJpy,
          this.platformNdpRevenue(row),
          row.cRequestFeeHoldNdp,
          row.cRequestFeeActualNdp,
          row.cRequestFeeActualNdp,
          row.userRewardNdp,
          this.pendingHoldNdp(row),
          row.campaignDiscountNdp,
          row.releasedNdp,
          row.penaltyNdp,
          row.compensationToUserNdp,
          this.timelineAmount(row.moneyTimelineJson, "technician_income_estimated"),
          this.shopEstimatedGrossProfit(row),
          this.moneyTimelineStatus(row.serviceIncomeStatus),
          row.createdAt.toISOString()
        ].join(",")
      )
    ].join("\n");

    return {
      filename:
        input.scope === "merchant"
          ? `merchant-${input.shopId}-finance-settlements.csv`
          : "backoffice-finance-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content
    };
  }

  public async listTechnicians(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.technicianWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.technicianProfile.findMany({
        where,
        include: this.technicianInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.technicianProfile.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((technician) => this.mapTechnician(technician)),
      total,
      input
    );
  }

  public async listTechnicianRankings(
    input: TechnicianRankingRepositoryInput
  ): Promise<BackofficeTechnicianRankingPayload> {
    const pagination = toPrismaPagination(input);
    const filters: Prisma.Sql[] = [
      Prisma.sql`profile.deleted_at IS NULL`,
      Prisma.sql`account.deleted_at IS NULL`,
      Prisma.sql`booking.deleted_at IS NULL`,
      Prisma.sql`booking.status = ${"completed"}`,
      Prisma.sql`booking.payment_status <> ${"refunded"}`
    ];
    if (input.window.fromInclusive) {
      filters.push(Prisma.sql`booking.ends_at >= ${input.window.fromInclusive}`);
    }
    if (input.window.toExclusive) {
      filters.push(Prisma.sql`booking.ends_at < ${input.window.toExclusive}`);
    }
    if (input.keyword) {
      const keyword = `%${input.keyword}%`;
      filters.push(
        Prisma.sql`(
          profile.display_name LIKE ${keyword}
          OR account.email LIKE ${keyword}
          OR shop.name LIKE ${keyword}
        )`
      );
    }
    const scopedShopId = input.shopId;
    if (scopedShopId) {
      filters.push(Prisma.sql`profile.shop_id = ${scopedShopId}`);
    }
    if (input.city) {
      filters.push(Prisma.sql`profile.city = ${input.city}`);
    }

    const orderDirection = input.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderBy = {
      revenue: Prisma.sql`revenue_jpy ${orderDirection}, completed_orders DESC, working_days DESC, technician_profile_id ASC`,
      completedOrders: Prisma.sql`completed_orders ${orderDirection}, revenue_jpy DESC, working_days DESC, technician_profile_id ASC`,
      workingDays: Prisma.sql`working_days ${orderDirection}, revenue_jpy DESC, completed_orders DESC, technician_profile_id ASC`
    }[input.sortBy];
    const technicianTotals = Prisma.sql`
      WITH technician_totals AS (
        SELECT
          profile.id AS technician_profile_id,
          profile.user_id AS user_id,
          profile.display_name AS display_name,
          account.email AS email,
          account.avatar_url AS avatar_url,
          profile.shop_id AS shop_id,
          shop.name AS shop_name,
          profile.city AS city,
          profile.service_area AS service_area,
          profile.status AS status,
          profile.verified_at AS verified_at,
          COALESCE(SUM(financial.service_amount_jpy), 0) AS revenue_jpy,
          COUNT(DISTINCT booking.id) AS completed_orders,
          COUNT(DISTINCT DATE(DATE_ADD(booking.ends_at, INTERVAL 9 HOUR))) AS working_days
        FROM technician_profiles AS profile
        INNER JOIN users AS account ON account.id = profile.user_id
        LEFT JOIN shops AS shop ON shop.id = profile.shop_id AND shop.deleted_at IS NULL
        INNER JOIN booking_orders AS booking ON booking.technician_profile_id = profile.id
        LEFT JOIN order_financials AS financial
          ON financial.booking_order_id = booking.id
          AND financial.deleted_at IS NULL
        WHERE ${Prisma.join(filters, " AND ")}
        GROUP BY
          profile.id,
          profile.user_id,
          profile.display_name,
          account.email,
          account.avatar_url,
          profile.shop_id,
          shop.name,
          profile.city,
          profile.service_area,
          profile.status,
          profile.verified_at
      )
    `;
    const rows = await this.client.$queryRaw<TechnicianRankingDatabaseRow[]>(Prisma.sql`
      ${technicianTotals}
      SELECT
        technician_totals.*,
        ROW_NUMBER() OVER (
          ORDER BY ${orderBy}
        ) AS ranking_position,
        COUNT(*) OVER () AS total_technicians,
        COALESCE(SUM(revenue_jpy) OVER (), 0) AS total_revenue_jpy,
        COALESCE(SUM(completed_orders) OVER (), 0) AS total_completed_orders,
        COALESCE(SUM(working_days) OVER (), 0) AS total_working_days
      FROM technician_totals
      ORDER BY ${orderBy}
      LIMIT ${pagination.take} OFFSET ${pagination.skip}
    `);

    const first = rows[0];
    const summary =
      first ??
      (
        await this.client.$queryRaw<
          Array<
            Pick<
              TechnicianRankingDatabaseRow,
              | "total_technicians"
              | "total_revenue_jpy"
              | "total_completed_orders"
              | "total_working_days"
            >
          >
        >(Prisma.sql`
          ${technicianTotals}
          SELECT
            COUNT(*) AS total_technicians,
            COALESCE(SUM(revenue_jpy), 0) AS total_revenue_jpy,
            COALESCE(SUM(completed_orders), 0) AS total_completed_orders,
            COALESCE(SUM(working_days), 0) AS total_working_days
          FROM technician_totals
        `)
      )[0];
    return {
      list: rows.map((row) => ({
        rank: this.toNumber(row.ranking_position),
        technicianProfileId: row.technician_profile_id,
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        avatarUrl: row.avatar_url,
        shopId: row.shop_id,
        shopName: row.shop_name,
        city: row.city,
        serviceArea: row.service_area,
        status: row.status,
        verifiedAt:
          row.verified_at instanceof Date
            ? row.verified_at.toISOString()
            : row.verified_at
              ? new Date(row.verified_at).toISOString()
              : null,
        completedServiceAmountJpy: this.toNumber(row.revenue_jpy),
        completedOrderCount: this.toNumber(row.completed_orders),
        workingDayCount: this.toNumber(row.working_days)
      })),
      summary: {
        technicianCount: this.toNumber(summary?.total_technicians),
        completedServiceAmountJpy: this.toNumber(summary?.total_revenue_jpy),
        completedOrderCount: this.toNumber(summary?.total_completed_orders),
        workingDayCount: this.toNumber(summary?.total_working_days)
      },
      total: this.toNumber(summary?.total_technicians),
      page: pagination.page,
      page_size: pagination.pageSize
    };
  }

  public async getTechnicianDetail(
    input: ScopedEntityInput
  ): Promise<BackofficeTechnicianDetailPayload | null> {
    const profile = await this.client.technicianProfile.findFirst({
      where: this.technicianMutationWhere(input, input.id),
      include: this.technicianDetailInclude(input)
    });
    if (!profile) return null;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysFromMonday = (dayStart.getUTCDay() + 6) % 7;
    const weekStart = new Date(dayStart.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const scheduleWindowStart = weekStart < monthStart ? weekStart : monthStart;
    const scheduleWindowEnd = weekEnd > monthEnd ? weekEnd : monthEnd;
    const bookingWhere = {
      deletedAt: null,
      technicianProfileId: profile.id,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.BookingOrderWhereInput;
    const scheduleWhere = {
      deletedAt: null,
      technicianProfileId: profile.id,
      startsAt: { lt: scheduleWindowEnd },
      endsAt: { gt: scheduleWindowStart },
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.ScheduleSlotWhereInput;
    const [statusGroups, completedRevenue, monthSlots, upcomingSlots, technicianServices, legacyServices, compensationProfile, auditRows] =
      await Promise.all([
        this.client.bookingOrder.groupBy({ by: ["status"], where: bookingWhere, _count: { _all: true } }),
        this.client.bookingOrder.aggregate({
          where: { ...bookingWhere, status: "COMPLETED" },
          _sum: { priceAmount: true }
        }),
        this.client.scheduleSlot.findMany({
          where: scheduleWhere,
          select: { startsAt: true, endsAt: true }
        }),
        this.client.scheduleSlot.findMany({
          where: {
            deletedAt: null,
            technicianProfileId: profile.id,
            startsAt: { gte: now },
            ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
          },
          include: this.scheduleInclude(),
          take: 12,
          orderBy: [{ startsAt: "asc" }, { id: "asc" }]
        }),
        this.client.technicianService.findMany({
          where: {
            technicianId: profile.id,
            isActive: true,
            deletedAt: null,
            ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
          },
          select: {
            id: true,
            sourceShopServiceId: true,
            name: true,
            description: true,
            categoryId: true,
            priceAmount: true,
            currency: true,
            durationMinutes: true,
            isRecommended: true
          },
          take: PROFILE_DETAIL_SERVICE_LIMIT + 1,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        }),
        this.client.service.findMany({
          where: {
            technicianProfileId: profile.id,
            status: "published",
            deletedAt: null,
            ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
          },
          select: {
            id: true,
            name: true,
            description: true,
            categoryId: true,
            priceAmount: true,
            currency: true,
            durationMinutes: true,
            isRecommended: true
          },
          take: PROFILE_DETAIL_SERVICE_LIMIT + 1,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        }),
        this.client.technicianCompensationProfile.findFirst({
          where: {
            technicianProfileId: profile.id,
            status: "active",
            deletedAt: null,
            ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
          },
          orderBy: [{ version: "desc" }, { id: "desc" }]
        }),
        this.findScopedAuditEvents(input, profile.id, profile.userId, "technician")
      ]);

    const statusTotals = this.statusTotals(statusGroups);
    const mergedServices = this.mergeTechnicianServices(technicianServices, legacyServices);
    const servicesTruncated =
      technicianServices.length > PROFILE_DETAIL_SERVICE_LIMIT ||
      legacyServices.length > PROFILE_DETAIL_SERVICE_LIMIT ||
      mergedServices.length > PROFILE_DETAIL_SERVICE_LIMIT;
    const services = mergedServices.slice(0, PROFILE_DETAIL_SERVICE_LIMIT);

    return {
      ...this.mapTechnician(profile),
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      isRecommended: profile.isRecommended,
      updatedAt: profile.updatedAt.toISOString(),
      account: this.mapAccount(profile.user, input, "technician"),
      statistics: {
        bookingCount: Object.values(statusTotals).reduce((total, count) => total + count, 0),
        completedCount: statusTotals.completed ?? 0,
        cancelledCount: statusTotals.cancelled ?? 0,
        completedRevenueJpy: this.toNumber(completedRevenue._sum.priceAmount),
        ...this.scheduleMinutes(monthSlots, now, monthStart, monthEnd)
      },
      reviewSummary: this.mapDetailReviewSummary(profile.reviewSummary),
      services,
      servicesLimit: PROFILE_DETAIL_SERVICE_LIMIT,
      servicesTruncated,
      upcomingSchedule: upcomingSlots.map((slot) => this.mapScheduleSlot(slot)),
      compensationProfile: compensationProfile
        ? this.mapCompensationProfile(compensationProfile)
        : null,
      timeline: this.mergeProfileTimeline(auditRows, profile.createdAt, profile.verifiedAt),
      unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
    };
  }

  public async getCustomerDetail(
    input: ScopedEntityInput
  ): Promise<BackofficeCustomerDetailPayload | null> {
    const profile = await this.client.customerProfile.findFirst({
      where: { ...this.customerWhere(input, {}), id: input.id },
      include: this.customerDetailInclude(input)
    });
    if (!profile) return null;

    const now = new Date();
    const bookingWhere = {
      deletedAt: null,
      customerUserId: profile.userId,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    } satisfies Prisma.BookingOrderWhereInput;
    const [statusGroups, completedSpend, recentBookings, nextBookings, auditRows] = await Promise.all([
      this.client.bookingOrder.groupBy({ by: ["status"], where: bookingWhere, _count: { _all: true } }),
      this.client.bookingOrder.aggregate({
        where: { ...bookingWhere, status: "COMPLETED" },
        _sum: { priceAmount: true }
      }),
      this.client.bookingOrder.findMany({
        where: bookingWhere,
        include: this.orderInclude(),
        take: 10,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.findMany({
        where: {
          ...bookingWhere,
          status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
          startsAt: { gte: now }
        },
        include: this.orderInclude(),
        take: 1,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.findScopedAuditEvents(input, profile.id, profile.userId, "customer")
    ]);
    const bookingStatusTotals = this.statusTotals(statusGroups);

    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      email: profile.user.email,
      city: profile.city,
      membershipLevel: profile.membershipLevel,
      isPublic: profile.isPublic,
      bookingCount: Object.values(bookingStatusTotals).reduce((total, count) => total + count, 0),
      createdAt: profile.createdAt.toISOString(),
      bio: profile.bio,
      updatedAt: profile.updatedAt.toISOString(),
      account: this.mapAccount(profile.user, input, "customer"),
      bookingStatusTotals,
      completedSpendJpy: this.toNumber(completedSpend._sum.priceAmount),
      nextBooking: nextBookings[0] ? this.mapOrder(nextBookings[0]) : null,
      recentBookings: recentBookings.map((booking) => this.mapOrder(booking)),
      reviewSummary: this.mapDetailReviewSummary(profile.reviewSummary),
      timeline: this.mergeProfileTimeline(auditRows, profile.createdAt)
    };
  }

  public async listShops(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.shopWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        include: this.shopInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.shop.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((shop) => this.mapShop(shop)),
      total,
      input
    );
  }

  public async findUserByEmail(email: string): Promise<{ id: number } | null> {
    return this.client.user.findUnique({ where: { email }, select: { id: true } });
  }

  public createShop(input: BackofficeShopCreateData): Promise<BackofficeShopPayload> {
    return this.needoIdAllocator.withNewId((temporaryNeedoId) => this.client.$transaction(async (transaction) => {
      const roles = await transaction.role.findMany({
        where: { code: { in: ["customer", "merchant_owner"] }, deletedAt: null },
        select: { id: true, code: true }
      });
      const customerRole = roles.find((role) => role.code === "customer");
      const merchantRole = roles.find((role) => role.code === "merchant_owner");
      if (!customerRole || !merchantRole) {
        throw new Error("Registration roles are missing: customer or merchant_owner");
      }
      const owner = await transaction.user.create({
        data: {
          needoId: temporaryNeedoId,
          email: input.ownerEmail,
          emailVerifiedAt: new Date(),
          passwordHash: input.ownerPasswordHash,
          username: input.ownerUsername,
          isActive: false
        }
      });
      const customerProfile = await transaction.customerProfile.create({
        data: { userId: owner.id, displayName: input.ownerUsername }
      });
      const customerIdentity = await transaction.userIdentity.create({
        data: {
          userId: owner.id,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: customerProfile.id,
          displayName: input.ownerUsername,
          isDefault: true,
          isActive: true
        }
      });
      const primaryIdentifier = await this.createIdentifierAllocator(transaction).allocate({
        kind: "U",
        userIdentityId: customerIdentity.id
      });
      await transaction.user.update({
        where: { id: owner.id },
        data: { needoId: primaryIdentifier.publicId }
      });
      await transaction.userRole.create({
        data: {
          userId: owner.id,
          roleId: customerRole.id,
          scopeType: "customer_profile",
          scopeId: customerProfile.id
        }
      });
      const shop = await transaction.shop.create({
        data: {
          ownerUserId: owner.id,
          name: input.name,
          description: input.description ?? null,
          city: input.city,
          address: input.address,
          phone: input.phone ?? null,
          status: "pending_review",
          isRecommended: input.isRecommended ?? false
        }
      });
      const merchantIdentity = await transaction.userIdentity.create({
        data: {
          userId: owner.id,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: shop.id,
          displayName: input.ownerUsername,
          isDefault: false,
          isActive: false
        }
      });
      await new PublicIdentifierRepository(transaction).createIdentifier({
        publicId: formatPersonId("B", primaryIdentifier.numberPart),
        numberPart: primaryIdentifier.numberPart,
        kind: "B",
        userIdentityId: merchantIdentity.id,
        loginAllowed: true,
        searchable: true
      });
      await transaction.userRole.create({
        data: {
          userId: owner.id,
          roleId: merchantRole.id,
          scopeType: "shop",
          scopeId: shop.id
        }
      });
      const record = await transaction.shop.findFirst({
        where: { id: shop.id, deletedAt: null },
        include: this.shopInclude()
      });
      if (!record) {
        throw new Error("Created shop could not be reloaded");
      }
      return this.mapShop(record);
    }));
  }

  public async updateShop(
    id: number,
    input: BackofficeShopUpdateBody
  ): Promise<BackofficeShopPayload | null> {
    const existing = await this.client.shop.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return null;
    return this.mapShop(await this.client.shop.update({ where: { id }, data: input, include: this.shopInclude() }));
  }

  public approveShop(id: number, approvedAt: Date): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.shop.findFirst({ where: { id, deletedAt: null } });
      if (!existing) return null;
      const shop = await transaction.shop.update({
        where: { id },
        data: { status: "published", updatedAt: approvedAt },
        include: this.shopInclude()
      });
      if (shop.ownerUserId) {
        await transaction.user.update({ where: { id: shop.ownerUserId }, data: { isActive: true } });
        await transaction.userIdentity.updateMany({
          where: { userId: shop.ownerUserId, scopeType: "shop", scopeId: shop.id, deletedAt: null },
          data: { isActive: true }
        });
      }
      return this.mapShop(shop);
    });
  }

  public softDeleteShop(id: number): Promise<BackofficeShopPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.shop.findFirst({ where: { id, deletedAt: null } });
      if (!existing) return null;
      const deletedAt = new Date();
      const shop = await transaction.shop.update({
        where: { id },
        data: { status: "archived", deletedAt },
        include: this.shopInclude()
      });
      await transaction.service.updateMany({
        where: { shopId: shop.id, deletedAt: null },
        data: { status: "archived", deletedAt }
      });
      if (shop.ownerUserId) {
        await transaction.user.update({
          where: { id: shop.ownerUserId },
          data: { isActive: false }
        });
        await transaction.userIdentity.updateMany({
          where: { userId: shop.ownerUserId, scopeType: "shop", scopeId: shop.id, deletedAt: null },
          data: { isActive: false }
        });
      }
      return this.mapShop(shop);
    });
  }

  public async updateTechnician(
    input: ScopedTechnicianUpdateInput
  ): Promise<BackofficeTechnicianPayload | null> {
    const existing = await this.client.technicianProfile.findFirst({
      where: this.technicianMutationWhere(input, input.technicianId)
    });
    if (!existing) return null;
    if (input.scope === "platform" && input.shopId) {
      const shop = await this.client.shop.findFirst({ where: { id: input.shopId, deletedAt: null } });
      if (!shop) return null;
    }
    const data = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceArea !== undefined ? { serviceArea: input.serviceArea } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.scope === "platform" && input.shopId !== undefined ? { shopId: input.shopId } : {})
    };
    return this.mapTechnician(await this.client.technicianProfile.update({
      where: { id: existing.id },
      data,
      include: this.technicianInclude()
    }));
  }

  public approveTechnician(
    input: ScopedTechnicianApprovalInput
  ): Promise<BackofficeTechnicianPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.technicianProfile.findFirst({
        where: this.technicianMutationWhere(input, input.technicianId),
        include: this.technicianInclude()
      });
      if (!existing) return null;
      const shopId = input.scope === "merchant" ? input.shopId : input.shopId ?? existing.shopId;
      if (shopId) {
        const shop = await transaction.shop.findFirst({ where: { id: shopId, deletedAt: null } });
        if (!shop) return null;
      }
      const technician = await transaction.technicianProfile.update({
        where: { id: existing.id },
        data: { shopId, status: "published", verifiedAt: input.approvedAt },
        include: this.technicianInclude()
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: true } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "technician", deletedAt: null },
        data: { isActive: true }
      });
      return this.mapTechnician(technician);
    });
  }

  public softDeleteTechnician(input: ScopedEntityInput): Promise<BackofficeTechnicianPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.technicianProfile.findFirst({
        where: this.technicianMutationWhere(input, input.id),
        include: this.technicianInclude()
      });
      if (!existing) return null;
      const technician = await transaction.technicianProfile.update({
        where: { id: existing.id },
        data: { status: "archived", deletedAt: new Date() },
        include: this.technicianInclude()
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "technician", deletedAt: null },
        data: { isActive: false }
      });
      return this.mapTechnician(technician);
    });
  }

  public async listCustomers(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.customerWhere(input, input);
    const include = this.customerInclude(input);
    const [list, total] = await Promise.all([
      this.client.customerProfile.findMany({ where, include, skip: pagination.skip, take: pagination.take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.client.customerProfile.count({ where })
    ]);
    return buildPaginatedResponse(list.map((customer) => this.mapCustomer(customer)), total, input);
  }

  public async getCustomer(input: ScopedEntityInput): Promise<BackofficeCustomerPayload | null> {
    const customer = await this.client.customerProfile.findFirst({
      where: { ...this.customerWhere(input, {}), id: input.id },
      include: this.customerInclude(input)
    });
    return customer ? this.mapCustomer(customer) : null;
  }

  public async updateCustomer(
    id: number,
    input: BackofficeCustomerUpdateBody
  ): Promise<BackofficeCustomerPayload | null> {
    const existing = await this.client.customerProfile.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return null;
    return this.mapCustomer(await this.client.customerProfile.update({
      where: { id }, data: input, include: this.customerInclude({ scope: "platform" })
    }));
  }

  public softDeleteCustomer(id: number): Promise<BackofficeCustomerPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.customerProfile.findFirst({
        where: { id, deletedAt: null }, include: this.customerInclude({ scope: "platform" })
      });
      if (!existing) return null;
      const customer = await transaction.customerProfile.update({
        where: { id }, data: { deletedAt: new Date() }, include: this.customerInclude({ scope: "platform" })
      });
      await transaction.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      await transaction.userIdentity.updateMany({
        where: { userId: existing.userId, type: "customer", deletedAt: null }, data: { isActive: false }
      });
      return this.mapCustomer(customer);
    });
  }

  public async listServices(
    input: BackofficeScope & BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.serviceWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.service.findMany({ where, include: this.serviceInclude(), skip: pagination.skip, take: pagination.take, orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }),
      this.client.service.count({ where })
    ]);
    return buildPaginatedResponse(list.map((service) => this.mapService(service)), total, input);
  }

  public async createService(input: ScopedServiceCreateInput): Promise<BackofficeServicePayload> {
    const shopId = input.shopId;
    await this.requireServiceRelations(shopId, input.categoryId, input.technicianProfileId ?? null);
    return this.mapService(await this.client.service.create({
      data: {
        categoryId: input.categoryId,
        shopId,
        technicianProfileId: input.technicianProfileId ?? null,
        name: input.name,
        description: input.description ?? null,
        city: input.city,
        serviceMode: input.serviceMode,
        priceAmount: input.priceAmount,
        currency: "JPY",
        durationMinutes: input.durationMinutes,
        status: input.status ?? "draft",
        isRecommended: input.isRecommended ?? false,
        sortOrder: input.sortOrder ?? 0
      },
      include: this.serviceInclude()
    }));
  }

  public async updateService(input: ScopedServiceUpdateInput): Promise<BackofficeServicePayload | null> {
    const existing = await this.client.service.findFirst({ where: { ...this.serviceWhere(input, {}), id: input.serviceId } });
    if (!existing) return null;
    await this.requireServiceRelations(existing.shopId, input.categoryId ?? existing.categoryId, input.technicianProfileId === undefined ? existing.technicianProfileId : input.technicianProfileId);
    const data = {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.technicianProfileId !== undefined ? { technicianProfileId: input.technicianProfileId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
      ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    };
    return this.mapService(await this.client.service.update({ where: { id: existing.id }, data, include: this.serviceInclude() }));
  }

  public async softDeleteService(input: ScopedEntityInput): Promise<BackofficeServicePayload | null> {
    const existing = await this.client.service.findFirst({ where: { ...this.serviceWhere(input, {}), id: input.id } });
    if (!existing) return null;
    return this.mapService(await this.client.service.update({
      where: { id: existing.id }, data: { status: "archived", deletedAt: new Date() }, include: this.serviceInclude()
    }));
  }

  private technicianMutationWhere(scope: BackofficeScope, id: number): Prisma.TechnicianProfileWhereInput {
    return {
      id,
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {})
    };
  }

  private customerWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.CustomerProfileWhereInput {
    return {
      deletedAt: null,
      user: {
        deletedAt: null,
        ...(scope.scope === "merchant"
          ? { bookingOrders: { some: { shopId: scope.shopId, deletedAt: null } } }
          : {})
      },
      ...(input.keyword
        ? {
            OR: [
              { displayName: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { user: { email: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private customerInclude(scope: BackofficeScope) {
    return {
      user: {
        select: {
          needoId: true,
          email: true,
          _count: {
            select: {
              bookingOrders:
                scope.scope === "merchant"
                  ? { where: { shopId: scope.shopId, deletedAt: null } }
                  : { where: { deletedAt: null } }
            }
          }
        }
      }
    } satisfies Prisma.CustomerProfileInclude;
  }

  private serviceWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.ServiceWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : input.shopId ? { shopId: input.shopId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword } },
              { description: { contains: input.keyword } },
              { city: { contains: input.keyword } }
            ]
          }
        : {})
    };
  }

  private serviceInclude() {
    return {
      category: { select: { name: true } }
    } satisfies Prisma.ServiceInclude;
  }

  private async requireServiceRelations(
    shopId: number,
    categoryId: number,
    technicianProfileId: number | null
  ): Promise<void> {
    const [shop, category, technician] = await Promise.all([
      this.client.shop.findFirst({ where: { id: shopId, deletedAt: null }, select: { id: true } }),
      this.client.category.findFirst({ where: { id: categoryId, deletedAt: null, isActive: true }, select: { id: true } }),
      technicianProfileId
        ? this.client.technicianProfile.findFirst({ where: { id: technicianProfileId, shopId, deletedAt: null }, select: { id: true } })
        : Promise.resolve({ id: 0 })
    ]);
    if (!shop || !category || !technician) {
      throw new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.master_data.relation_not_found", statusCode: 404 });
    }
  }

  private orderWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: this.orderStatusToDb(input.status) } : {}),
      ...(input.keyword
        ? {
            OR: [
              { orderNo: { contains: input.keyword } },
              { customer: { username: { contains: input.keyword } } },
              { customer: { email: { contains: input.keyword } } },
              { service: { name: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } },
              { technicianProfile: { displayName: { contains: input.keyword } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            startsAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private scheduleWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.ScheduleSlotWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: this.scheduleStatusToDb(input.status) } : {}),
      ...(input.keyword
        ? {
            OR: [
              { service: { name: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } },
              { technicianProfile: { displayName: { contains: input.keyword } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            startsAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private technicianWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.TechnicianProfileWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { displayName: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { serviceArea: { contains: input.keyword } },
              { user: { email: { contains: input.keyword } } },
              { shop: { name: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private shopWhere(scope: BackofficeScope, input: BackofficeListQuery): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { id: scope.shopId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword } },
              { description: { contains: input.keyword } },
              { city: { contains: input.keyword } },
              { address: { contains: input.keyword } },
              { owner: { email: { contains: input.keyword } } }
            ]
          }
        : {})
    };
  }

  private financeWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.OrderFinancialWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { settlementStatus: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { paymentChannel: { contains: input.keyword } },
              { bookingOrder: { orderNo: { contains: input.keyword } } },
              { bookingOrder: { shop: { name: { contains: input.keyword } } } },
              { bookingOrder: { technicianProfile: { displayName: { contains: input.keyword } } } }
            ]
          }
        : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
  }

  private technicianDetailInclude(input: ScopedEntityInput) {
    return {
      user: {
        select: this.accountSelect(input, "technician")
      },
      shop: { select: { name: true } },
      reviewSummary: { where: { deletedAt: null } }
    } satisfies Prisma.TechnicianProfileInclude;
  }

  private customerDetailInclude(input: ScopedEntityInput) {
    return {
      user: {
        select: this.accountSelect(input, "customer")
      },
      reviewSummary: { where: { deletedAt: null } }
    } satisfies Prisma.CustomerProfileInclude;
  }

  private accountSelect(
    input: ScopedEntityInput,
    profileIdentityType: "technician" | "customer"
  ) {
    const profileScopeType =
      profileIdentityType === "technician" ? "technician_profile" : "customer_profile";
    const merchantRoleScope = input.scope === "merchant"
      ? {
          OR: [
            { scopeType: "shop", scopeId: input.shopId },
            { scopeType: profileScopeType, scopeId: input.id }
          ]
        }
      : {};
    const merchantIdentityScope =
      input.scope === "merchant"
        ? {
            OR: [
              { scopeType: "shop", scopeId: input.shopId },
              { type: profileIdentityType, scopeType: "global" },
              {
                type: profileIdentityType,
                scopeType: profileScopeType,
                scopeId: input.id
              }
            ]
          }
        : {};

    return {
      needoId: true,
      username: true,
      email: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
      lastLoginAt: true,
      userRoles: {
        where: { deletedAt: null, role: { deletedAt: null }, ...merchantRoleScope },
        select: {
          scopeType: true,
          scopeId: true,
          role: { select: { name: true, code: true } }
        }
      },
      identities: {
        where: { isActive: true, deletedAt: null, ...merchantIdentityScope },
        select: { type: true, scopeType: true, scopeId: true, displayName: true }
      }
    } satisfies Prisma.UserSelect;
  }

  private async findScopedAuditEvents(
    input: ScopedEntityInput,
    profileId: number,
    userId: number,
    profileType: "technician" | "customer"
  ) {
    const targetTypes = profileType === "technician"
      ? ["TechnicianProfile", "technician_profile"]
      : ["CustomerProfile", "customer_profile"];
    const metadataProfileIdPaths = profileType === "technician"
      ? ["$.technicianProfileId", "$.technicianId"]
      : ["$.customerProfileId"];

    return this.client.auditLog.findMany({
      where: {
        deletedAt: null,
        AND: [
          {
            OR: [
              ...targetTypes.map((targetType) => ({ targetType, targetId: profileId })),
              { targetType: "User", targetId: userId },
              ...metadataProfileIdPaths.map((path) => ({
                metadata: { path, equals: profileId }
              })),
              { metadata: { path: "$.userId", equals: userId } }
            ]
          },
          ...(input.scope === "merchant"
            ? [{ metadata: { path: "$.shopId", equals: input.shopId } }]
            : [])
        ]
      },
      include: { actor: { select: { username: true, avatarUrl: true } } },
      take: 30,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  }

  private orderInclude() {
    return {
      customer: {
        select: {
          username: true,
          email: true
        }
      },
      service: true,
      shop: true,
      technicianProfile: true
    } satisfies Prisma.BookingOrderInclude;
  }

  private scheduleInclude() {
    return {
      service: true,
      shop: true,
      technicianProfile: true
    } satisfies Prisma.ScheduleSlotInclude;
  }

  private financeInclude() {
    return {
      bookingOrder: {
        select: {
          id: true,
          orderNo: true,
          shopId: true,
          technicianProfileId: true,
          technicianProfile: {
            select: {
              displayName: true
            }
          },
          shop: {
            select: {
              name: true
            }
          }
        }
      }
    } satisfies Prisma.OrderFinancialInclude;
  }

  private technicianInclude() {
    return {
      user: {
        select: {
          needoId: true,
          email: true,
          avatarUrl: true
        }
      },
      shop: {
        select: {
          name: true
        }
      }
    } satisfies Prisma.TechnicianProfileInclude;
  }

  private shopInclude() {
    return {
      owner: {
        select: {
          email: true
        }
      }
    } satisfies Prisma.ShopInclude;
  }

  private mapOrder(order: OrderRecord): BackofficeOrderPayload {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: this.statusFromDb(order.status),
      paymentStatus: this.paymentStatusFromDb(order.paymentStatus),
      customerUserId: order.customerUserId,
      customerName: order.customer.username || order.customer.email,
      serviceId: order.serviceId,
      serviceName: order.serviceNameSnapshot ?? order.service?.name ?? "Unknown service",
      shopId: order.shopId,
      shopName: order.shop.name,
      technicianProfileId: order.technicianProfileId,
      technicianName: order.technicianProfile?.displayName ?? null,
      fulfillmentMode: order.fulfillmentMode,
      priceAmount: this.toNumber(order.priceAmount),
      currency: order.currency,
      startsAt: order.startsAt.toISOString(),
      endsAt: order.endsAt.toISOString(),
      note: order.note,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }

  private mapScheduleSlot(slot: ScheduleSlotRecord): BackofficeScheduleSlotPayload {
    return {
      id: slot.id,
      serviceId: slot.serviceId,
      serviceName: slot.service?.name ?? "Unknown service",
      shopId: slot.shopId,
      shopName: slot.shop.name,
      technicianProfileId: slot.technicianProfileId,
      technicianName: slot.technicianProfile?.displayName ?? null,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      status: slot.status.toLowerCase()
    };
  }

  private mapFinanceSettlement(
    settlement: FinanceSettlementRecord
  ): BackofficeFinanceSettlementPayload {
    const pendingHoldNdp = this.pendingHoldNdp(settlement);

    return {
      id: settlement.id,
      bookingOrderId: settlement.bookingOrderId,
      orderType: this.orderType(settlement.orderType),
      orderNo: settlement.bookingOrder.orderNo,
      referenceType: "booking_order",
      referenceId: settlement.bookingOrderId,
      status: settlement.settlementStatus,
      shopId: settlement.shopId,
      shopName: settlement.bookingOrder.shop.name,
      technicianProfileId:
        settlement.technicianProfileId ?? settlement.bookingOrder.technicianProfileId,
      technicianName: settlement.bookingOrder.technicianProfile?.displayName ?? null,
      estimatedServiceGmvJpy: settlement.serviceAmountJpy,
      platformCollectedServiceAmountJpy: settlement.platformCollectedServiceAmountJpy,
      offlineReportedServiceAmountJpy: settlement.offlineReportedServiceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: settlement.unknownOrUnreportedServiceAmountJpy,
      serviceIncomeStatus: settlement.serviceIncomeStatus,
      paymentChannel: settlement.paymentChannel,
      platformNdpRevenue: this.platformNdpRevenue(settlement),
      cRequestFeeHoldNdp: settlement.cRequestFeeHoldNdp,
      cRequestFeeActualNdp: settlement.cRequestFeeActualNdp,
      requestFeeNdpRevenue: settlement.cRequestFeeActualNdp,
      userRewardNdpCost: settlement.userRewardNdp,
      pendingHoldNdp,
      campaignDiscountNdp: settlement.campaignDiscountNdp,
      releasedNdp: settlement.releasedNdp,
      penaltyNdp: settlement.penaltyNdp,
      compensationToUserNdp: settlement.compensationToUserNdp,
      technicianEstimatedIncomeJpy: this.timelineAmount(
        settlement.moneyTimelineJson,
        "technician_income_estimated"
      ),
      shopEstimatedGrossProfitJpy: this.shopEstimatedGrossProfit(settlement),
      appliedFeeRuleIds: this.stringArray(settlement.appliedFeeRuleIdsJson),
      moneyTimeline: this.timelineArray(settlement.moneyTimelineJson),
      moneyTimelineStatus: this.moneyTimelineStatus(settlement.serviceIncomeStatus),
      createdAt: settlement.createdAt.toISOString()
    };
  }

  private mapTechnician(technician: TechnicianRecord): BackofficeTechnicianPayload {
    return {
      id: technician.id,
      userId: technician.userId,
      needoId: technician.user.needoId,
      displayName: technician.displayName,
      email: technician.user.email,
      avatarUrl: technician.user.avatarUrl,
      shopId: technician.shopId,
      shopName: technician.shop?.name ?? null,
      city: technician.city,
      serviceArea: technician.serviceArea,
      status: technician.status,
      verifiedAt: technician.verifiedAt?.toISOString() ?? null,
      createdAt: technician.createdAt.toISOString()
    };
  }

  private mapShop(shop: ShopRecord): BackofficeShopPayload {
    return {
      id: shop.id,
      ownerUserId: shop.ownerUserId,
      ownerEmail: shop.owner?.email ?? null,
      name: shop.name,
      description: shop.description,
      city: shop.city,
      address: shop.address,
      phone: shop.phone,
      status: shop.status,
      isRecommended: shop.isRecommended,
      createdAt: shop.createdAt.toISOString()
    };
  }

  private mapCustomer(customer: CustomerRecord): BackofficeCustomerPayload {
    return {
      id: customer.id,
      userId: customer.userId,
      displayName: customer.displayName,
      email: customer.user.email,
      city: customer.city,
      membershipLevel: customer.membershipLevel,
      isPublic: customer.isPublic,
      bookingCount: customer.user._count.bookingOrders,
      createdAt: customer.createdAt.toISOString()
    };
  }

  private mapAccount(account: {
    username: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    userRoles: Array<{
      scopeType: string | null;
      scopeId: number | null;
      role: { name: string; code: string };
    }>;
    identities: Array<{
      type: string;
      scopeType: string | null;
      scopeId: number | null;
      displayName: string | null;
    }>;
  }, input: ScopedEntityInput, profileIdentityType: "technician" | "customer"): BackofficeAccountPayload {
    const profileScopeType =
      profileIdentityType === "technician" ? "technician_profile" : "customer_profile";
    const roles = input.scope === "merchant"
      ? account.userRoles.filter((userRole) =>
          (userRole.scopeType === "shop" && userRole.scopeId === input.shopId) ||
          (userRole.scopeType === profileScopeType && userRole.scopeId === input.id)
        )
      : account.userRoles;
    const identities = input.scope === "merchant"
      ? account.identities.filter((identity) =>
              (identity.scopeType === "shop" && identity.scopeId === input.shopId) ||
              (identity.type === profileIdentityType && identity.scopeType === "global") ||
              (identity.type === profileIdentityType &&
                identity.scopeType === profileScopeType &&
                identity.scopeId === input.id)
        )
      : account.identities;

    return {
      username: account.username,
      email: account.email,
      phone: account.phone,
      avatarUrl: account.avatarUrl,
      isActive: account.isActive,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      roles: roles.map((userRole) => ({
        name: userRole.role.name,
        code: userRole.role.code,
        scopeType: userRole.scopeType,
        scopeId: userRole.scopeId
      })),
      identities: identities.map((identity) => ({
        type: identity.type,
        scopeType: identity.scopeType,
        scopeId: identity.scopeId,
        displayName: identity.displayName
      }))
    };
  }

  private mapDetailReviewSummary(summary: {
    ratingAverage: DecimalLike;
    reviewCount: number;
    latestReviewAt: Date | null;
    highlights: unknown;
  } | null) {
    if (!summary) return null;

    return {
      ratingAverage: this.toNumber(summary.ratingAverage),
      reviewCount: summary.reviewCount,
      latestReviewAt: summary.latestReviewAt?.toISOString() ?? null,
      highlights: this.stringArray(summary.highlights)
    };
  }

  private statusTotals(groups: Array<{ status: string; _count: { _all: number } }>): Record<string, number> {
    return groups.reduce<Record<string, number>>((totals, group) => {
      totals[this.statusFromDb(group.status)] = group._count._all;
      return totals;
    }, {});
  }

  private scheduleMinutes(
    slots: Array<{ startsAt: Date; endsAt: Date }>,
    now: Date,
    monthStart: Date,
    monthEnd: Date
  ): Pick<
    BackofficeTechnicianDetailPayload["statistics"],
    "todayScheduleMinutes" | "weekScheduleMinutes" | "monthScheduleMinutes"
  > {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const daysFromMonday = (dayStart.getUTCDay() + 6) % 7;
    const weekStart = new Date(dayStart.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      todayScheduleMinutes: this.intersectionMinutes(slots, dayStart, dayEnd),
      weekScheduleMinutes: this.intersectionMinutes(slots, weekStart, weekEnd),
      monthScheduleMinutes: this.intersectionMinutes(slots, monthStart, monthEnd)
    };
  }

  private intersectionMinutes(
    slots: Array<{ startsAt: Date; endsAt: Date }>,
    rangeStart: Date,
    rangeEnd: Date
  ): number {
    return slots.reduce((total, slot) => {
      const startsAt = Math.max(slot.startsAt.getTime(), rangeStart.getTime());
      const endsAt = Math.min(slot.endsAt.getTime(), rangeEnd.getTime());
      return total + Math.max(0, Math.round((endsAt - startsAt) / 60000));
    }, 0);
  }

  private mergeTechnicianServices(
    technicianServices: Array<{
      id: number;
      sourceShopServiceId: number | null;
      name: string;
      description: string | null;
      categoryId: number;
      priceAmount: number;
      currency: string;
      durationMinutes: number;
      isRecommended: boolean;
    }>,
    legacyServices: Array<{
      id: number;
      name: string;
      description: string | null;
      categoryId: number;
      priceAmount: DecimalLike;
      currency: string;
      durationMinutes: number;
      isRecommended: boolean;
    }>
  ): BackofficeTechnicianServiceDetailPayload[] {
    const result: BackofficeTechnicianServiceDetailPayload[] = [];
    const seen = new Set<string>();
    for (const service of technicianServices) {
      const key = service.sourceShopServiceId
        ? `service:${service.sourceShopServiceId}`
        : `technician_service:${service.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: service.id,
        source: "technician_service",
        sourceShopServiceId: service.sourceShopServiceId,
        name: service.name,
        description: service.description,
        categoryId: service.categoryId,
        priceAmount: service.priceAmount,
        currency: service.currency,
        durationMinutes: service.durationMinutes,
        isRecommended: service.isRecommended
      });
    }
    for (const service of legacyServices) {
      const key = `service:${service.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: service.id,
        source: "service",
        sourceShopServiceId: service.id,
        name: service.name,
        description: service.description,
        categoryId: service.categoryId,
        priceAmount: this.toNumber(service.priceAmount),
        currency: service.currency,
        durationMinutes: service.durationMinutes,
        isRecommended: service.isRecommended
      });
    }
    return result;
  }

  private mapCompensationProfile(profile: {
    id: number;
    shopId: number;
    technicianProfileId: number;
    name: string;
    status: string;
    version: number;
    wageMode: string;
    baseSalaryJpy: number;
    hourlyRateJpy: number;
    dailyRateJpy: number;
    fixedOrderPayJpy: number;
    commissionRateBps: number;
    guaranteedMinimumJpy: number;
    ndpFeeBearer: string;
    technicianNdpShareBps: number;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    updatedAt: Date;
  }): BackofficeCompensationProfilePayload {
    return {
      id: profile.id,
      shopId: profile.shopId,
      technicianProfileId: profile.technicianProfileId,
      name: profile.name,
      status: profile.status,
      version: profile.version,
      wageMode: profile.wageMode,
      baseSalaryJpy: profile.baseSalaryJpy,
      hourlyRateJpy: profile.hourlyRateJpy,
      dailyRateJpy: profile.dailyRateJpy,
      fixedOrderPayJpy: profile.fixedOrderPayJpy,
      commissionRatePercent: profile.commissionRateBps / 100,
      guaranteedMinimumJpy: profile.guaranteedMinimumJpy,
      ndpFeeBearer: profile.ndpFeeBearer,
      technicianNdpSharePercent: profile.technicianNdpShareBps / 100,
      effectiveFrom: profile.effectiveFrom?.toISOString() ?? null,
      effectiveTo: profile.effectiveTo?.toISOString() ?? null,
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private mergeProfileTimeline(
    rows: Array<{
      id: number;
      action: string;
      metadata: unknown;
      createdAt: Date;
      actor: { username: string; avatarUrl: string | null } | null;
    }>,
    createdAt: Date,
    verifiedAt?: Date | null
  ): BackofficeAuditEventPayload[] {
    const events = rows.map((row) => this.mapAuditEvent(row));
    this.appendLifecycleEvent(events, "profile.created", createdAt);
    if (verifiedAt) this.appendLifecycleEvent(events, "profile.verified", verifiedAt);
    return events
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30);
  }

  private appendLifecycleEvent(
    events: BackofficeAuditEventPayload[],
    action: "profile.created" | "profile.verified",
    occurredAt: Date
  ): void {
    const createdAt = occurredAt.toISOString();
    if (events.some((event) => event.createdAt === createdAt && event.action === action)) return;
    events.push({
      id: `${action}:${createdAt}`,
      action,
      actorName: "System",
      actorAvatarUrl: null,
      createdAt,
      metadata: null
    });
  }

  private mapAuditEvent(row: {
    id: number;
    action: string;
    metadata: unknown;
    createdAt: Date;
    actor: { username: string; avatarUrl: string | null } | null;
  }): BackofficeAuditEventPayload {
    return {
      id: String(row.id),
      action: row.action,
      actorName: row.actor?.username ?? "System",
      actorAvatarUrl: row.actor?.avatarUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      metadata: this.metadataObject(row.metadata)
    };
  }

  private metadataObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private mapService(service: ServiceRecord): BackofficeServicePayload {
    return {
      id: service.id,
      categoryId: service.categoryId,
      categoryName: service.category.name,
      shopId: service.shopId,
      technicianProfileId: service.technicianProfileId,
      name: service.name,
      description: service.description,
      city: service.city,
      serviceMode: service.serviceMode,
      priceAmount: this.toNumber(service.priceAmount),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      status: service.status,
      isRecommended: service.isRecommended,
      sortOrder: service.sortOrder,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString()
    };
  }

  private orderStatusToDb(status: string) {
    const normalized = status.trim();
    if (normalized === "inService" || normalized === "in_service") {
      return "IN_SERVICE" as const;
    }

    return normalized.toUpperCase() as Prisma.EnumBookingOrderStatusFilter["equals"];
  }

  private scheduleStatusToDb(status: string) {
    return status.trim().toUpperCase() as Prisma.EnumScheduleSlotStatusFilter["equals"];
  }

  private statusFromDb(status: string): string {
    return status === "IN_SERVICE" ? "inService" : status.toLowerCase();
  }

  private paymentStatusFromDb(status: string): BackofficeOrderPayload["paymentStatus"] {
    if (status === "CONFIRMED") return "confirmed";
    if (status === "REFUND_PENDING") return "refundPending";
    if (status === "REFUNDED") return "refunded";
    return "pending";
  }

  private orderType(value: string): "booking" | "request" {
    return value === "request" ? "request" : "booking";
  }

  private platformNdpRevenue(
    settlement: Pick<
      FinanceSettlementRecord,
      "bPlatformFeeActualNdp" | "cRequestFeeActualNdp" | "userRewardNdp"
    >
  ): number {
    return (
      settlement.bPlatformFeeActualNdp + settlement.cRequestFeeActualNdp - settlement.userRewardNdp
    );
  }

  private pendingHoldNdp(
    settlement: Pick<
      FinanceSettlementRecord,
      | "bPlatformFeeHoldNdp"
      | "bPlatformFeeActualNdp"
      | "cRequestFeeHoldNdp"
      | "cRequestFeeActualNdp"
      | "releasedNdp"
    >
  ): number {
    return Math.max(
      0,
      settlement.bPlatformFeeHoldNdp +
        settlement.cRequestFeeHoldNdp -
        settlement.bPlatformFeeActualNdp -
        settlement.cRequestFeeActualNdp -
        settlement.releasedNdp
    );
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private timelineArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private timelineAmount(value: unknown, type: string): number {
    const event = this.timelineArray(value).find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return (item as { type?: unknown }).type === type;
    }) as { amountJpy?: unknown } | undefined;

    return typeof event?.amountJpy === "number" ? event.amountJpy : 0;
  }

  private shopEstimatedGrossProfit(settlement: FinanceSettlementRecord): number {
    const event = this.timelineArray(settlement.moneyTimelineJson).find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return (item as { type?: unknown }).type === "technician_income_estimated";
    }) as { metadata?: { shopEstimatedGrossProfitJpy?: unknown } } | undefined;
    const timelineValue = event?.metadata?.shopEstimatedGrossProfitJpy;

    if (typeof timelineValue === "number") {
      return timelineValue;
    }

    return (
      settlement.serviceAmountJpy -
      this.timelineAmount(settlement.moneyTimelineJson, "technician_income_estimated") -
      settlement.bPlatformFeeActualNdp
    );
  }

  private moneyTimelineStatus(serviceIncomeStatus: string): string {
    if (serviceIncomeStatus === "confirmed") {
      return "complete";
    }
    if (serviceIncomeStatus === "reported") {
      return "needs_review";
    }

    return "needs_income_report";
  }

  private toNumber(value: DecimalLike | bigint | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
