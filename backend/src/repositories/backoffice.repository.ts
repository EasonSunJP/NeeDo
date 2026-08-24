import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  type BackofficeCsvExportPayload,
  type BackofficeCustomerPayload,
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
  type ScopedEntityInput,
  type ScopedServiceCreateInput,
  type ScopedServiceUpdateInput,
  type ScopedTechnicianApprovalInput,
  type ScopedTechnicianUpdateInput
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

  public async findUserByEmail(email: string): Promise<{ id: number } | null> {
    return this.client.user.findUnique({ where: { email }, select: { id: true } });
  }

  public createShop(input: BackofficeShopCreateData): Promise<BackofficeShopPayload> {
    return this.client.$transaction(async (transaction) => {
      const role = await transaction.role.findFirst({
        where: { code: "merchant_owner", deletedAt: null }
      });
      if (!role) {
        throw new Error("Registration role is missing: merchant_owner");
      }
      const owner = await transaction.user.create({
        data: {
          email: input.ownerEmail,
          passwordHash: input.ownerPasswordHash,
          username: input.ownerUsername,
          isActive: false
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
      await transaction.userIdentity.create({
        data: {
          userId: owner.id,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: shop.id,
          displayName: input.ownerUsername,
          isDefault: true,
          isActive: false
        }
      });
      await transaction.userRole.create({
        data: {
          userId: owner.id,
          roleId: role.id,
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
    });
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

  private toNumber(value: DecimalLike | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
