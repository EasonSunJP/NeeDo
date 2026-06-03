import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  MerchantFinanceRulesRepositoryPort,
  ShopFinanceBonusRulePayload,
  ShopFinanceDeductionRulePayload,
  ShopFinanceNdpBearer,
  ShopFinanceRuleSetPayload,
  ShopFinanceRuleStatus,
  ShopFinanceWageMode
} from "../services/merchant-finance-rules.service";
import type { ParsedShopFinanceRuleSetBody } from "../validators/merchant-finance-rules.validator";

type ShopFinanceRuleSetRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

export class MerchantFinanceRulesRepository implements MerchantFinanceRulesRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveRuleSet(shopId: number): Promise<ShopFinanceRuleSetPayload | null> {
    const record = await this.client.shopFinanceRuleSet.findFirst({
      where: {
        shopId,
        status: "active",
        deletedAt: null
      },
      orderBy: { id: "desc" }
    });

    return record ? this.mapRuleSet(record) : null;
  }

  public async replaceActiveRuleSet(
    shopId: number,
    input: ParsedShopFinanceRuleSetBody,
    actorUserId: number
  ): Promise<ShopFinanceRuleSetPayload> {
    const created = await this.client.$transaction(async (transaction) => {
      await transaction.shopFinanceRuleSet.updateMany({
        where: {
          shopId,
          status: "active",
          deletedAt: null
        },
        data: {
          status: "archived",
          updatedById: actorUserId,
          deletedAt: new Date()
        }
      });

      return transaction.shopFinanceRuleSet.create({
        data: {
          shopId,
          name: input.name,
          status: "active",
          wageMode: input.wageMode,
          baseSalaryJpy: input.baseSalaryJpy,
          hourlyRateJpy: input.hourlyRateJpy,
          dailyRateJpy: input.dailyRateJpy,
          fixedOrderPayJpy: input.fixedOrderPayJpy,
          commissionRateBps: this.percentToBps(input.commissionRatePercent),
          guaranteedMinimumJpy: input.guaranteedMinimumJpy,
          ndpFeeBearer: input.ndpFeeBearer,
          technicianNdpShareBps: this.percentToBps(input.technicianNdpSharePercent),
          bonusRulesJson: input.bonusRules as Prisma.InputJsonValue,
          deductionRulesJson: input.deductionRules as Prisma.InputJsonValue,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });
    });

    return this.mapRuleSet(created);
  }

  private mapRuleSet(record: ShopFinanceRuleSetRecord): ShopFinanceRuleSetPayload {
    return {
      id: record.id,
      shopId: record.shopId,
      name: record.name,
      status: this.parseStatus(record.status),
      wageMode: this.parseWageMode(record.wageMode),
      baseSalaryJpy: record.baseSalaryJpy,
      hourlyRateJpy: record.hourlyRateJpy,
      dailyRateJpy: record.dailyRateJpy,
      fixedOrderPayJpy: record.fixedOrderPayJpy,
      commissionRatePercent: this.bpsToPercent(record.commissionRateBps),
      guaranteedMinimumJpy: record.guaranteedMinimumJpy,
      ndpFeeBearer: this.parseNdpFeeBearer(record.ndpFeeBearer),
      technicianNdpSharePercent: this.bpsToPercent(record.technicianNdpShareBps),
      bonusRules: this.parseBonusRules(record.bonusRulesJson),
      deductionRules: this.parseDeductionRules(record.deductionRulesJson),
      effectiveFrom: record.effectiveFrom?.toISOString() ?? null,
      effectiveTo: record.effectiveTo?.toISOString() ?? null,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private percentToBps(percent: number): number {
    return Math.round(percent * 100);
  }

  private bpsToPercent(bps: number): number {
    return bps / 100;
  }

  private parseStatus(value: string): ShopFinanceRuleStatus {
    return value === "archived" ? "archived" : "active";
  }

  private parseWageMode(value: string): ShopFinanceWageMode {
    if (value === "fixed_per_order" || value === "base_plus_commission" || value === "hourly") {
      return value;
    }

    return "commission";
  }

  private parseNdpFeeBearer(value: string): ShopFinanceNdpBearer {
    if (value === "technician" || value === "split") {
      return value;
    }

    return "shop";
  }

  private parseBonusRules(value: Prisma.JsonValue | null): ShopFinanceBonusRulePayload[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Prisma.JsonObject => this.isJsonObject(item))
      .map((item) => ({
        id: this.readString(item.id),
        name: this.readString(item.name),
        triggerType:
          item.triggerType === "monthly_service_gmv" || item.triggerType === "rating_average"
            ? item.triggerType
            : "monthly_order_count",
        threshold: this.readNumber(item.threshold),
        amountJpy: Math.round(this.readNumber(item.amountJpy)),
        active: item.active !== false
      }));
  }

  private parseDeductionRules(value: Prisma.JsonValue | null): ShopFinanceDeductionRulePayload[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Prisma.JsonObject => this.isJsonObject(item))
      .map((item) => ({
        id: this.readString(item.id),
        name: this.readString(item.name),
        triggerType:
          item.triggerType === "rating_average_below"
            ? "rating_average_below"
            : "late_cancellation_count",
        threshold: this.readNumber(item.threshold),
        amountJpy: Math.round(this.readNumber(item.amountJpy)),
        active: item.active !== false
      }));
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private readString(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  private readNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
}
