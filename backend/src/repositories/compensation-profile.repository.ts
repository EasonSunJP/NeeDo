import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  CompensationProfilePayload,
  CompensationProfileRepositoryPort
} from "../services/compensation-profile.service";
import type {
  CompensationAdjustmentRule,
  CompensationNdpBearer,
  CompensationRuleSet,
  CompensationWageMode
} from "../services/compensation-engine.service";
import type { ParsedCompensationProfileBody } from "../validators/compensation-profile.validator";

type TechnicianProfileRecord = Prisma.TechnicianCompensationProfileGetPayload<
  Record<string, never>
>;
type ShopRuleRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

export class CompensationProfileRepository implements CompensationProfileRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveProfile(
    shopId: number,
    technicianProfileId: number
  ): Promise<CompensationProfilePayload | null> {
    const record = await this.client.technicianCompensationProfile.findFirst({
      where: {
        shopId,
        technicianProfileId,
        status: "active",
        deletedAt: null
      },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });

    return record ? this.mapProfile(record) : null;
  }

  public async findShopFallbackRule(shopId: number): Promise<CompensationRuleSet | null> {
    const record = await this.client.shopFinanceRuleSet.findFirst({
      where: {
        shopId,
        status: "active",
        deletedAt: null
      },
      orderBy: [{ id: "desc" }]
    });

    return record ? this.mapShopRule(record) : null;
  }

  public async replaceActiveProfile(
    shopId: number,
    technicianProfileId: number,
    input: ParsedCompensationProfileBody,
    actorUserId: number
  ): Promise<CompensationProfilePayload> {
    const created = await this.client.$transaction(async (transaction) => {
      const current = await transaction.technicianCompensationProfile.findFirst({
        where: {
          shopId,
          technicianProfileId,
          deletedAt: null
        },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      });
      const nextVersion = (current?.version ?? 0) + 1;

      await transaction.technicianCompensationProfile.updateMany({
        where: {
          shopId,
          technicianProfileId,
          status: "active",
          deletedAt: null
        },
        data: {
          status: "archived",
          updatedById: actorUserId
        }
      });

      return transaction.technicianCompensationProfile.create({
        data: {
          shopId,
          technicianProfileId,
          name: input.name,
          status: "active",
          version: nextVersion,
          wageMode: input.wageMode,
          baseSalaryJpy: input.baseSalaryJpy,
          hourlyRateJpy: input.hourlyRateJpy,
          dailyRateJpy: input.dailyRateJpy,
          fixedOrderPayJpy: input.fixedOrderPayJpy,
          commissionRateBps: Math.round(input.commissionRatePercent * 100),
          guaranteedMinimumJpy: input.guaranteedMinimumJpy,
          ndpFeeBearer: input.ndpFeeBearer,
          technicianNdpShareBps: Math.round(input.technicianNdpSharePercent * 100),
          bonusRulesJson: input.bonusRules as unknown as Prisma.InputJsonValue,
          deductionRulesJson: input.deductionRules as unknown as Prisma.InputJsonValue,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });
    });

    return this.mapProfile(created);
  }

  private mapProfile(record: TechnicianProfileRecord): CompensationProfilePayload {
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
      deductionRules: this.adjustmentRules(record.deductionRulesJson),
      version: record.version,
      status: record.status === "archived" ? "archived" : "active",
      effectiveFrom: record.effectiveFrom?.toISOString() ?? null,
      effectiveTo: record.effectiveTo?.toISOString() ?? null,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
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
}
