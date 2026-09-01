import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  TechnicianDataCenterIncomeModelSource,
  TechnicianDataCenterOrderSource,
  TechnicianDataCenterRepositoryPort,
  TechnicianDataCenterResolvedPeriod,
  TechnicianDataCenterSource
} from "../services/technician-data-center.service";
import type {
  CompensationAdjustmentRule,
  CompensationNdpBearer,
  CompensationRuleSet,
  CompensationWageMode
} from "../services/compensation-engine.service";

type TechnicianRuleRecord = Prisma.TechnicianCompensationProfileGetPayload<Record<string, never>>;
type ShopRuleRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

const orderSelect = {
  id: true,
  orderNo: true,
  status: true,
  startsAt: true,
  endsAt: true,
  serviceNameSnapshot: true,
  service: { select: { name: true } },
  shop: { select: { name: true } },
  financial: {
    select: {
      serviceIncomeStatus: true,
      baseServiceAmountJpy: true,
      extensionAmountJpy: true,
      nominationChargeAmountJpy: true,
      wasTechnicianNominated: true,
      compensationBasisVersion: true
    }
  }
} satisfies Prisma.BookingOrderSelect;

type OrderRecord = Prisma.BookingOrderGetPayload<{ select: typeof orderSelect }>;

const recognizedPayslipStatuses = [
  "published",
  "confirmed",
  "approved",
  "scheduled",
  "paid",
  "locked"
] as const;

export class TechnicianDataCenterRepository implements TechnicianDataCenterRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async load(
    userId: number,
    technicianProfileId: number,
    range: TechnicianDataCenterResolvedPeriod
  ): Promise<TechnicianDataCenterSource | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: { id: technicianProfileId, userId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        shopId: true,
        displayName: true,
        employmentStartedAt: true
      }
    });
    if (!technician) return null;

    const affiliations = await this.client.technicianShopAffiliation.findMany({
      where: {
        technicianProfileId,
        workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
        endsAt: null,
        deletedAt: null
      },
      select: {
        shopId: true,
        relationshipType: true,
        startsAt: true,
        shop: { select: { name: true } }
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }]
    });
    const affiliation = affiliations.find((item) => item.shopId === technician.shopId)
      ?? affiliations[0]
      ?? null;
    const shopId = affiliation?.shopId ?? technician.shopId;

    const [periodRecords, recentRecords, upcomingOrderCount, nextRecord] = await Promise.all([
      this.client.bookingOrder.findMany({
        where: {
          technicianProfileId,
          status: "COMPLETED",
          startsAt: { gte: range.startsAt, lt: range.endsAt },
          deletedAt: null
        },
        select: orderSelect,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.bookingOrder.findMany({
        where: { technicianProfileId, deletedAt: null },
        select: orderSelect,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 3
      }),
      this.client.bookingOrder.count({
        where: {
          technicianProfileId,
          status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
          endsAt: { gt: range.referenceAt },
          deletedAt: null
        }
      }),
      this.client.bookingOrder.findFirst({
        where: {
          technicianProfileId,
          status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
          endsAt: { gt: range.referenceAt },
          deletedAt: null
        },
        select: orderSelect,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      })
    ]);

    const periodOrders = periodRecords.map((order) => this.mapOrder(order));
    const recentOrders = recentRecords.map((order) => this.mapOrder(order));
    const allOrderIds = [...new Set([...periodOrders, ...recentOrders].map((order) => order.id))];
    const [recognizedIncomeByOrderId, compensationRulesByBasis, incomeModel] = await Promise.all([
      this.recognizedIncome(technicianProfileId, allOrderIds),
      this.historicalRules([...periodOrders, ...recentOrders]),
      shopId ? this.currentIncomeModel(shopId, technicianProfileId) : Promise.resolve(null)
    ]);

    return {
      technician: {
        id: technician.id,
        userId: technician.userId,
        displayName: technician.displayName,
        employmentStartedAt: technician.employmentStartedAt?.toISOString() ?? null
      },
      affiliation: affiliation ? {
        shopId: affiliation.shopId,
        shopName: affiliation.shop.name,
        relationshipType: affiliation.relationshipType,
        startsAt: affiliation.startsAt.toISOString()
      } : null,
      incomeModel,
      compensationRulesByBasis,
      recognizedIncomeByOrderId,
      periodOrders,
      recentOrders,
      upcomingOrderCount,
      nextOrder: nextRecord ? this.mapOrder(nextRecord) : null
    };
  }

  private async recognizedIncome(
    technicianProfileId: number,
    orderIds: number[]
  ): Promise<Record<number, number>> {
    if (orderIds.length === 0) return {};
    const lines = await this.client.payslipLine.findMany({
      where: {
        orderId: { in: orderIds },
        deletedAt: null,
        payslip: {
          technicianProfileId,
          status: { in: [...recognizedPayslipStatuses] },
          deletedAt: null
        }
      },
      select: { orderId: true, amountJpy: true }
    });
    return lines.reduce<Record<number, number>>((result, line) => {
      if (line.orderId !== null) result[line.orderId] = (result[line.orderId] ?? 0) + line.amountJpy;
      return result;
    }, {});
  }

  private async historicalRules(
    orders: TechnicianDataCenterOrderSource[]
  ): Promise<Record<string, CompensationRuleSet>> {
    const technicianIds = new Set<number>();
    const shopIds = new Set<number>();
    for (const order of orders) {
      const basis = order.financial?.compensationBasisVersion;
      const match = basis?.match(/^(technician_override|shop_default):(\d+)$/);
      if (!match) continue;
      const id = Number(match[2]);
      if (match[1] === "technician_override") technicianIds.add(id);
      else shopIds.add(id);
    }
    const [technicianRules, shopRules] = await Promise.all([
      technicianIds.size > 0
        ? this.client.technicianCompensationProfile.findMany({
            where: { id: { in: [...technicianIds] }, deletedAt: null }
          })
        : Promise.resolve([]),
      shopIds.size > 0
        ? this.client.shopFinanceRuleSet.findMany({
            where: { id: { in: [...shopIds] }, deletedAt: null }
          })
        : Promise.resolve([])
    ]);
    return {
      ...Object.fromEntries(technicianRules.map((rule) => [
        `technician_override:${rule.id}`,
        this.mapTechnicianRule(rule)
      ])),
      ...Object.fromEntries(shopRules.map((rule) => [
        `shop_default:${rule.id}`,
        this.mapShopRule(rule)
      ]))
    };
  }

  private async currentIncomeModel(
    shopId: number,
    technicianProfileId: number
  ): Promise<TechnicianDataCenterIncomeModelSource | null> {
    const profile = await this.client.technicianCompensationProfile.findFirst({
      where: { shopId, technicianProfileId, status: "active", deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });
    if (profile) {
      return {
        ...this.mapTechnicianRule(profile),
        version: profile.version,
        updatedAt: profile.updatedAt.toISOString()
      };
    }
    const fallback = await this.client.shopFinanceRuleSet.findFirst({
      where: { shopId, status: "active", deletedAt: null },
      orderBy: [{ id: "desc" }]
    });
    return fallback ? {
      ...this.mapShopRule(fallback),
      version: fallback.id,
      updatedAt: fallback.updatedAt.toISOString()
    } : null;
  }

  private mapOrder(order: OrderRecord): TechnicianDataCenterOrderSource {
    const normalized = order.status.toLowerCase();
    return {
      id: order.id,
      orderNo: order.orderNo,
      serviceName: order.serviceNameSnapshot ?? order.service?.name ?? "",
      shopName: order.shop.name,
      status: normalized === "in_service" ? "inService" : normalized,
      startsAt: order.startsAt.toISOString(),
      endsAt: order.endsAt.toISOString(),
      financial: order.financial ? {
        serviceIncomeStatus: order.financial.serviceIncomeStatus,
        baseServiceAmountJpy: order.financial.baseServiceAmountJpy,
        extensionAmountJpy: order.financial.extensionAmountJpy,
        nominationChargeAmountJpy: order.financial.nominationChargeAmountJpy,
        wasTechnicianNominated: order.financial.wasTechnicianNominated,
        compensationBasisVersion: order.financial.compensationBasisVersion
      } : null
    };
  }

  private mapTechnicianRule(record: TechnicianRuleRecord): CompensationRuleSet {
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
      extensionCommissionRatePercent: record.extensionCommissionRateBps / 100,
      nominationFeeJpy: record.nominationFeeJpy,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private mapShopRule(record: ShopRuleRecord): CompensationRuleSet {
    return {
      id: record.id,
      sourceType: "shop_default",
      shopId: record.shopId,
      technicianProfileId: null,
      name: record.name,
      wageMode: this.wageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: record.commissionRateBps / 100,
      extensionCommissionRatePercent: record.extensionCommissionRateBps / 100,
      nominationFeeJpy: record.nominationFeeJpy,
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.ndpBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: record.technicianNdpShareBps / 100,
      bonusRules: this.adjustmentRules(record.bonusRulesJson),
      deductionRules: this.adjustmentRules(record.deductionRulesJson)
    };
  }

  private wageMode(value: string): CompensationWageMode {
    return value === "fixed_per_order" || value === "base_plus_commission" || value === "hourly"
      ? value
      : "commission";
  }

  private ndpBearer(value: string): CompensationNdpBearer {
    return value === "technician" || value === "split" ? value : "shop";
  }

  private adjustmentRules(value: Prisma.JsonValue | null): CompensationAdjustmentRule[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, Prisma.JsonValue>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.triggerType !== "string" ||
        typeof record.threshold !== "number" ||
        typeof record.amountJpy !== "number" ||
        typeof record.active !== "boolean"
      ) return [];
      if (![
        "monthly_order_count",
        "monthly_service_gmv",
        "rating_average",
        "late_cancellation_count",
        "rating_average_below"
      ].includes(record.triggerType)) return [];
      return [{
        id: record.id,
        name: record.name,
        triggerType: record.triggerType as CompensationAdjustmentRule["triggerType"],
        threshold: record.threshold,
        amountJpy: record.amountJpy,
        active: record.active
      }];
    });
  }
}
