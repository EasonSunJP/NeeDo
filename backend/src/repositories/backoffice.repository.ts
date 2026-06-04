import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  type BackofficeCsvExportPayload,
  type BackofficeDashboardPayload,
  type BackofficeFinanceSettlementPayload,
  type BackofficeOrderPayload,
  type BackofficeRepositoryPort,
  type BackofficeScheduleSlotPayload,
  type BackofficeScope,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../services/backoffice.service";
import type { BackofficeListQuery } from "../validators/backoffice.validator";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";

type DecimalLike = {
  toString: () => string;
};

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
        email: true;
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

export class BackofficeRepository implements BackofficeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

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
          value: String(techniciansPage.length),
          change: "TechnicianProfile",
          tone: techniciansPage.length > 0 ? "good" : "neutral"
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
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
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

  private orderWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Prisma.BookingOrderWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}),
      ...(input.status ? { status: this.orderStatusToDb(input.status) } : {}),
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
      ...(input.status ? { status: input.status } : {})
    };
  }

  private shopWhere(scope: BackofficeScope, input: BackofficeListQuery): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      ...(scope.scope === "merchant" ? { id: scope.shopId } : {}),
      ...(input.status ? { status: input.status } : {})
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
          email: true
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
      paymentStatus: "unpaid",
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
      displayName: technician.displayName,
      email: technician.user.email,
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
      city: shop.city,
      address: shop.address,
      phone: shop.phone,
      status: shop.status,
      isRecommended: shop.isRecommended,
      createdAt: shop.createdAt.toISOString()
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

  private toNumber(value: DecimalLike | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
