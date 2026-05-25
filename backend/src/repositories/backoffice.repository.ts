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

type FinanceSettlementRecord = Prisma.FinanceReconciliationGetPayload<{
  include: {
    transaction: {
      select: {
        transactionNo: true;
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
    const financeWhere = await this.financeWhere(scope, {});
    const [
      orderCount,
      latestOrders,
      grossAggregate,
      availableSlots,
      bookedSlots,
      pendingFinanceAggregate,
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
      this.client.financeReconciliation.aggregate({
        where: financeWhere,
        _sum: {
          actualAmount: true
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
    const pendingSettlementAmount = pendingFinanceAggregate._sum.actualAmount ?? 0;

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
          value: String(pendingSettlementAmount),
          change: "FinanceReconciliation",
          tone: pendingSettlementAmount > 0 ? "good" : "neutral"
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
        grossAmount,
        pendingSettlementAmount,
        refundAmount: 0
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
    const where = await this.financeWhere(input, input);
    const [list, total] = await Promise.all([
      this.client.financeReconciliation.findMany({
        where,
        include: this.financeInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.financeReconciliation.count({ where })
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
    const where = await this.financeWhere(input, input);
    const rows = await this.client.financeReconciliation.findMany({
      where,
      include: this.financeInclude(),
      take: 1000,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const header = [
      "id",
      "transactionNo",
      "referenceType",
      "referenceId",
      "status",
      "currency",
      "expectedAmount",
      "actualAmount",
      "differenceAmount",
      "createdAt"
    ];
    const content = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.transaction.transactionNo,
          row.referenceType,
          row.referenceId,
          row.status.toLowerCase(),
          row.currency,
          row.expectedAmount,
          row.actualAmount,
          row.differenceAmount,
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

  private orderWhere(scope: BackofficeScope, input: BackofficeListQuery): Prisma.BookingOrderWhereInput {
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

  private async financeWhere(
    scope: BackofficeScope,
    input: BackofficeListQuery
  ): Promise<Prisma.FinanceReconciliationWhereInput> {
    const base: Prisma.FinanceReconciliationWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: this.financeStatusToDb(input.status) } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };

    if (scope.scope === "platform") {
      return base;
    }

    const [orders, wallets] = await Promise.all([
      this.client.bookingOrder.findMany({
        where: { shopId: scope.shopId, deletedAt: null },
        select: { id: true }
      }),
      this.client.wallet.findMany({
        where: {
          ownerType: "SHOP",
          ownerId: scope.shopId,
          deletedAt: null
        },
        select: { id: true }
      })
    ]);
    const orderIds = orders.map((order) => order.id);
    const walletIds = wallets.map((wallet) => wallet.id);

    return {
      ...base,
      OR: [
        {
          referenceType: "booking_order",
          referenceId: { in: orderIds.length ? orderIds : [-1] }
        },
        {
          referenceType: "seed_wallet",
          referenceId: { in: walletIds.length ? walletIds : [-1] }
        }
      ]
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
      transaction: {
        select: {
          transactionNo: true
        }
      }
    } satisfies Prisma.FinanceReconciliationInclude;
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
      serviceName: order.service.name,
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
      serviceName: slot.service.name,
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
    return {
      id: settlement.id,
      transactionId: settlement.transactionId,
      transactionNo: settlement.transaction.transactionNo,
      referenceType: settlement.referenceType,
      referenceId: settlement.referenceId,
      status: settlement.status.toLowerCase(),
      currency: settlement.currency,
      expectedAmount: settlement.expectedAmount,
      actualAmount: settlement.actualAmount,
      differenceAmount: settlement.differenceAmount,
      exportedAt: settlement.exportedAt?.toISOString() ?? null,
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

  private financeStatusToDb(status: string) {
    return status.trim().toUpperCase() as Prisma.EnumFinanceReconciliationStatusFilter["equals"];
  }

  private statusFromDb(status: string): string {
    return status === "IN_SERVICE" ? "inService" : status.toLowerCase();
  }

  private toNumber(value: DecimalLike | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
