import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  MoneyTimelineEvent,
  OrderFinanceRecord,
  OrderFinanceRepositoryPort,
  OrderFinancialRecordPayload,
  ServiceIncomeReportInput,
  ServiceIncomeStatus,
  ServicePaymentChannel
} from "../services/order-finance.service";
import type {
  CompensationAdjustmentRule,
  CompensationNdpBearer,
  CompensationRuleSet,
  CompensationWageMode
} from "../services/compensation-engine.service";

type DecimalLike = {
  toString: () => string;
};

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    shop: {
      select: {
        name: true;
      };
    };
    technicianProfile: {
      select: {
        displayName: true;
      };
    };
    financial: true;
  };
}>;

type TechnicianProfileRecord = Prisma.TechnicianCompensationProfileGetPayload<
  Record<string, never>
>;
type ShopRuleRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

export class OrderFinanceRepository implements OrderFinanceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findOrderFinance(bookingOrderId: number): Promise<OrderFinanceRecord | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        id: bookingOrderId,
        deletedAt: null
      },
      include: this.orderInclude()
    });

    if (!order) {
      return null;
    }

    const activeCompensationRule = await this.findActiveCompensationRule(
      order.shopId,
      order.technicianProfileId
    );

    return this.mapOrder(order, activeCompensationRule);
  }

  public async upsertServiceIncomeReport(
    input: ServiceIncomeReportInput
  ): Promise<OrderFinanceRecord> {
    await this.client.$transaction(async (transaction) => {
      const order = await transaction.bookingOrder.findFirstOrThrow({
        where: {
          id: input.bookingOrderId,
          deletedAt: null
        },
        select: {
          id: true,
          orderType: true,
          customerUserId: true,
          shopId: true,
          technicianProfileId: true
        }
      });

      await transaction.orderFinancial.upsert({
        where: {
          bookingOrderId: input.bookingOrderId
        },
        update: {
          serviceAmountJpy: input.serviceAmountJpy,
          platformCollectedServiceAmountJpy: input.platformCollectedServiceAmountJpy,
          offlineReportedServiceAmountJpy: input.offlineReportedServiceAmountJpy,
          unknownOrUnreportedServiceAmountJpy: input.unknownOrUnreportedServiceAmountJpy,
          paymentChannel: input.paymentChannel,
          serviceIncomeStatus: input.serviceIncomeStatus,
          serviceIncomeReportedById: input.reportedById,
          serviceIncomeReportedAt: new Date(),
          serviceIncomeConfirmedById: input.confirmedById,
          serviceIncomeConfirmedAt: input.confirmedById ? new Date() : null,
          serviceIncomeNote: input.note,
          serviceIncomeProofUrl: input.proofUrl,
          moneyTimelineJson: input.moneyTimeline as unknown as Prisma.InputJsonValue
        },
        create: {
          bookingOrderId: order.id,
          orderType: order.orderType === "REQUEST" ? "request" : "booking",
          customerUserId: order.customerUserId,
          shopId: order.shopId,
          technicianProfileId: order.technicianProfileId,
          serviceAmountJpy: input.serviceAmountJpy,
          platformCollectedServiceAmountJpy: input.platformCollectedServiceAmountJpy,
          offlineReportedServiceAmountJpy: input.offlineReportedServiceAmountJpy,
          unknownOrUnreportedServiceAmountJpy: input.unknownOrUnreportedServiceAmountJpy,
          paymentChannel: input.paymentChannel,
          serviceIncomeStatus: input.serviceIncomeStatus,
          serviceIncomeReportedById: input.reportedById,
          serviceIncomeReportedAt: new Date(),
          serviceIncomeConfirmedById: input.confirmedById,
          serviceIncomeConfirmedAt: input.confirmedById ? new Date() : null,
          serviceIncomeNote: input.note,
          serviceIncomeProofUrl: input.proofUrl,
          moneyTimelineJson: input.moneyTimeline as unknown as Prisma.InputJsonValue
        }
      });
    });

    const record = await this.findOrderFinance(input.bookingOrderId);

    if (!record) {
      throw new Error("Order finance record disappeared after service income report");
    }

    return record;
  }

  private async findActiveCompensationRule(
    shopId: number,
    technicianProfileId: number | null
  ): Promise<CompensationRuleSet | null> {
    if (technicianProfileId) {
      const profile = await this.client.technicianCompensationProfile.findFirst({
        where: {
          shopId,
          technicianProfileId,
          status: "active",
          deletedAt: null
        },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      });

      if (profile) {
        return this.mapTechnicianProfile(profile);
      }
    }

    const fallback = await this.client.shopFinanceRuleSet.findFirst({
      where: {
        shopId,
        status: "active",
        deletedAt: null
      },
      orderBy: [{ id: "desc" }]
    });

    return fallback ? this.mapShopRule(fallback, technicianProfileId) : null;
  }

  private orderInclude() {
    return {
      shop: {
        select: {
          name: true
        }
      },
      technicianProfile: {
        select: {
          displayName: true
        }
      },
      financial: true
    } satisfies Prisma.BookingOrderInclude;
  }

  private mapOrder(
    order: OrderRecord,
    activeCompensationRule: CompensationRuleSet | null
  ): OrderFinanceRecord {
    return {
      bookingOrderId: order.id,
      orderNo: order.orderNo,
      orderStatus: String(order.status),
      customerUserId: order.customerUserId,
      shopId: order.shopId,
      shopName: order.shop.name,
      technicianProfileId: order.technicianProfileId,
      technicianName: order.technicianProfile?.displayName ?? null,
      serviceName: order.serviceNameSnapshot ?? "Unknown service",
      priceAmountJpy: Math.round(this.toNumber(order.priceAmount)),
      startsAt: order.startsAt.toISOString(),
      endsAt: order.endsAt.toISOString(),
      financial: order.financial ? this.mapFinancial(order.financial) : null,
      activeCompensationRule,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }

  private mapFinancial(
    record: Prisma.OrderFinancialGetPayload<Record<string, never>>
  ): OrderFinancialRecordPayload {
    return {
      id: record.id,
      serviceAmountJpy: record.serviceAmountJpy,
      platformCollectedServiceAmountJpy: record.platformCollectedServiceAmountJpy,
      offlineReportedServiceAmountJpy: record.offlineReportedServiceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: record.unknownOrUnreportedServiceAmountJpy,
      paymentChannel: this.paymentChannel(record.paymentChannel),
      serviceIncomeStatus: this.incomeStatus(record.serviceIncomeStatus),
      bPlatformFeeHoldNdp: record.bPlatformFeeHoldNdp,
      bPlatformFeeActualNdp: record.bPlatformFeeActualNdp,
      userRewardNdp: record.userRewardNdp,
      campaignDiscountNdp: record.campaignDiscountNdp,
      releasedNdp: record.releasedNdp,
      penaltyNdp: record.penaltyNdp,
      compensationToUserNdp: record.compensationToUserNdp,
      appliedFeeRuleIds: this.stringArray(record.appliedFeeRuleIdsJson),
      moneyTimeline: this.timelineArray(record.moneyTimelineJson),
      serviceIncomeReportedById: record.serviceIncomeReportedById,
      serviceIncomeReportedAt: record.serviceIncomeReportedAt?.toISOString() ?? null,
      serviceIncomeConfirmedById: record.serviceIncomeConfirmedById,
      serviceIncomeConfirmedAt: record.serviceIncomeConfirmedAt?.toISOString() ?? null,
      serviceIncomeNote: record.serviceIncomeNote,
      serviceIncomeProofUrl: record.serviceIncomeProofUrl,
      settlementStatus: record.settlementStatus,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapTechnicianProfile(record: TechnicianProfileRecord): CompensationRuleSet {
    return {
      id: record.id,
      sourceType: "technician_override",
      shopId: record.shopId,
      technicianProfileId: record.technicianProfileId,
      name: record.name,
      wageMode: this.wageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: record.commissionRateBps / 100,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private mapShopRule(
    record: ShopRuleRecord,
    technicianProfileId: number | null
  ): CompensationRuleSet {
    return {
      id: record.id,
      sourceType: "shop_default",
      shopId: record.shopId,
      technicianProfileId,
      name: record.name,
      wageMode: this.wageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: record.commissionRateBps / 100,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private wageMode(value: string): CompensationWageMode {
    if (
      value === "fixed_per_order" ||
      value === "commission" ||
      value === "base_plus_commission" ||
      value === "hourly"
    ) {
      return value;
    }

    return "commission";
  }

  private ndpBearer(value: string): CompensationNdpBearer {
    if (value === "shop" || value === "technician" || value === "split") {
      return value;
    }

    return "shop";
  }

  private paymentChannel(value: string): ServicePaymentChannel {
    if (
      value === "unknown" ||
      value === "platform_online" ||
      value === "offline_cash" ||
      value === "offline_card" ||
      value === "bank_transfer" ||
      value === "other"
    ) {
      return value;
    }

    return "unknown";
  }

  private incomeStatus(value: string): ServiceIncomeStatus {
    if (value === "reported" || value === "confirmed") {
      return value;
    }

    return "unreported";
  }

  private adjustmentRules(value: unknown): CompensationAdjustmentRule[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is CompensationAdjustmentRule => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const rule = item as Partial<CompensationAdjustmentRule>;

      return (
        typeof rule.id === "string" &&
        typeof rule.name === "string" &&
        typeof rule.triggerType === "string" &&
        typeof rule.threshold === "number" &&
        typeof rule.amountJpy === "number"
      );
    });
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private timelineArray(value: unknown): MoneyTimelineEvent[] {
    return Array.isArray(value) ? (value as MoneyTimelineEvent[]) : [];
  }

  private toNumber(value: DecimalLike | number | string | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value.toString());
  }
}
