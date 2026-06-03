import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  FeeCalculationLogPayload,
  FeeCalculationStage,
  FeeCampaignPayload,
  FeeRuleInput,
  FeeRuleMutationInput,
  FeeRuleRepositoryPort,
  FeeRuleSetStatus,
  FeeType,
  FinanceOrderType,
  PlatformFeeRulePayload,
  PlatformFeeRuleSetPayload,
  PlatformFeeTierPayload,
  PlatformFeeTimeWindowPayload
} from "../services/fee-calculation.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

type FeeRulePrismaClient = PrismaClient | Prisma.TransactionClient;

type RuleSetRecord = Prisma.PlatformFeeRuleSetGetPayload<{
  include: {
    rules: {
      where: { deletedAt: null };
      orderBy: [{ priority: "asc" }, { id: "asc" }];
      include: {
        tiers: {
          where: { deletedAt: null };
          orderBy: [{ minValue: "asc" }, { id: "asc" }];
        };
        timeWindows: {
          where: { deletedAt: null };
          orderBy: { id: "asc" };
        };
      };
    };
  };
}>;

type RuleRecord = RuleSetRecord["rules"][number];
type TierRecord = RuleRecord["tiers"][number];
type TimeWindowRecord = RuleRecord["timeWindows"][number];
type CampaignRecord = Prisma.FeeCampaignGetPayload<Record<string, never>>;
type CalculationLogRecord = Prisma.FeeCalculationLogGetPayload<Record<string, never>>;

export class FeeRuleRepository implements FeeRuleRepositoryPort {
  public constructor(private readonly client: FeeRulePrismaClient = prisma) {}

  public withTransactionClient(transactionClient: unknown): FeeRuleRepositoryPort {
    return new FeeRuleRepository(transactionClient as FeeRulePrismaClient);
  }

  public async listRuleSets(
    input: PaginationInput & { status?: FeeRuleSetStatus }
  ): Promise<PaginatedResponse<PlatformFeeRuleSetPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.PlatformFeeRuleSetWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {})
    };
    const [list, total] = await Promise.all([
      this.client.platformFeeRuleSet.findMany({
        where,
        include: this.ruleSetInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ priority: "asc" }, { id: "desc" }]
      }),
      this.client.platformFeeRuleSet.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((ruleSet) => this.mapRuleSet(ruleSet)),
      total,
      pagination
    );
  }

  public async createRuleSet(
    input: FeeRuleMutationInput & { actorUserId: number | null }
  ): Promise<PlatformFeeRuleSetPayload> {
    return this.runWriteTransaction(async (tx) => {
      const ruleSet = await tx.platformFeeRuleSet.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          scopeType: input.scopeType ?? "platform",
          priority: input.priority ?? 100,
          status: input.status ?? "draft",
          version: input.version ?? 1,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          createdById: input.actorUserId,
          updatedById: input.actorUserId
        }
      });

      await this.createRules(tx, ruleSet.id, input.rules ?? [], input.actorUserId);

      return this.findRuleSetById(tx, ruleSet.id);
    });
  }

  public async updateRuleSet(
    id: number,
    input: Partial<FeeRuleMutationInput> & { actorUserId: number | null }
  ): Promise<PlatformFeeRuleSetPayload | null> {
    return this.runWriteTransaction(async (tx) => {
      const existing = await tx.platformFeeRuleSet.findFirst({
        where: { id, deletedAt: null },
        select: { id: true }
      });

      if (!existing) {
        return null;
      }

      await tx.platformFeeRuleSet.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.scopeType !== undefined ? { scopeType: input.scopeType } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.version !== undefined ? { version: input.version } : {}),
          ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
          ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
          updatedById: input.actorUserId
        }
      });

      if (input.rules) {
        await this.softDeleteRules(tx, id);
        await this.createRules(tx, id, input.rules, input.actorUserId);
      }

      return this.findRuleSetById(tx, id);
    });
  }

  public async setRuleSetStatus(
    id: number,
    status: "active" | "paused",
    actorUserId: number | null
  ): Promise<PlatformFeeRuleSetPayload | null> {
    const updated = await this.client.platformFeeRuleSet.updateMany({
      where: { id, deletedAt: null },
      data: { status, updatedById: actorUserId }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findRuleSetById(this.client, id);
  }

  public async findActiveRuleSets(input: {
    feeType: FeeType;
    orderType: FinanceOrderType;
    at: Date;
  }): Promise<PlatformFeeRuleSetPayload[]> {
    const ruleSets = await this.client.platformFeeRuleSet.findMany({
      where: {
        deletedAt: null,
        status: "active",
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: input.at } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.at } }] }],
        rules: {
          some: {
            deletedAt: null,
            status: "active",
            feeType: input.feeType,
            orderType: { in: ["all", input.orderType] }
          }
        }
      },
      include: this.ruleSetInclude(),
      orderBy: [{ priority: "asc" }, { id: "asc" }]
    });

    return ruleSets.map((ruleSet) => this.mapRuleSet(ruleSet));
  }

  public async listActiveCampaigns(input: {
    feeType: FeeType;
    at: Date;
  }): Promise<FeeCampaignPayload[]> {
    const campaigns = await this.client.feeCampaign.findMany({
      where: {
        deletedAt: null,
        status: "active",
        targetFeeType: { in: ["all", input.feeType] },
        startsAt: { lte: input.at },
        OR: [{ endsAt: null }, { endsAt: { gt: input.at } }]
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }]
    });

    return campaigns.map((campaign) => this.mapCampaign(campaign));
  }

  public async countCompletedOrdersForPeriod(input: {
    shopId?: number;
    castId?: number;
    orderType: FinanceOrderType;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<number> {
    return this.client.bookingOrder.count({
      where: {
        deletedAt: null,
        status: "COMPLETED",
        orderType: input.orderType === "request" ? "REQUEST" : "BOOKING",
        updatedAt: {
          gte: input.periodStart,
          lt: input.periodEnd
        },
        ...(input.shopId ? { shopId: input.shopId } : {}),
        ...(input.castId ? { technicianProfileId: input.castId } : {})
      }
    });
  }

  public async createCalculationLog(
    input: Omit<FeeCalculationLogPayload, "id" | "createdAt" | "updatedAt">
  ): Promise<FeeCalculationLogPayload> {
    const log = await this.client.feeCalculationLog.create({
      data: {
        bookingOrderId: input.bookingOrderId,
        calculationStage: input.calculationStage,
        feeType: input.feeType,
        payerType: input.payerType,
        payerId: input.payerId,
        baseFeeNdp: input.baseFeeNdp,
        tierAdjustmentNdp: input.tierAdjustmentNdp,
        timeAdjustmentNdp: input.timeAdjustmentNdp,
        campaignDiscountNdp: input.campaignDiscountNdp,
        finalFeeNdp: input.finalFeeNdp,
        holdAmountNdp: input.holdAmountNdp,
        appliedRuleIdsJson: input.appliedRuleIds as Prisma.InputJsonValue,
        explanationJson: input.explanation as Prisma.InputJsonValue,
        calculatedAt: input.calculatedAt
      }
    });

    return this.mapCalculationLog(log);
  }

  public async listCalculationLogs(
    input: PaginationInput & {
      bookingOrderId?: number;
      feeType?: FeeType;
      stage?: FeeCalculationStage;
    }
  ): Promise<PaginatedResponse<FeeCalculationLogPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.FeeCalculationLogWhereInput = {
      deletedAt: null,
      ...(input.bookingOrderId ? { bookingOrderId: input.bookingOrderId } : {}),
      ...(input.feeType ? { feeType: input.feeType } : {}),
      ...(input.stage ? { calculationStage: input.stage } : {})
    };
    const [list, total] = await Promise.all([
      this.client.feeCalculationLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ calculatedAt: "desc" }, { id: "desc" }]
      }),
      this.client.feeCalculationLog.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((log) => this.mapCalculationLog(log)),
      total,
      pagination
    );
  }

  private async runWriteTransaction<T>(
    handler: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((tx) => handler(tx));
    }

    return handler(this.client as Prisma.TransactionClient);
  }

  private async createRules(
    tx: Prisma.TransactionClient,
    ruleSetId: number,
    rules: FeeRuleInput[],
    actorUserId: number | null
  ): Promise<void> {
    for (const rule of rules) {
      const created = await tx.platformFeeRule.create({
        data: {
          ruleSetId,
          feeType: rule.feeType,
          orderType: rule.orderType ?? "all",
          payerType: rule.payerType ?? "shop",
          baseAmountNdp: rule.baseAmountNdp ?? 0,
          calculationMode: rule.calculationMode ?? "fixed",
          holdStrategy: rule.holdStrategy ?? "exact_estimate",
          pricingLockMode: rule.pricingLockMode ?? "recalculate_at_complete",
          stackingMode: rule.stackingMode ?? "sum",
          priority: rule.priority ?? 100,
          conditionJson: this.jsonOrUndefined(rule.conditionJson),
          formulaJson: this.jsonOrUndefined(rule.formulaJson),
          capJson: this.jsonOrUndefined(rule.capJson),
          status: rule.status ?? "active",
          effectiveFrom: rule.effectiveFrom ?? null,
          effectiveTo: rule.effectiveTo ?? null,
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });

      await this.createTiers(tx, created.id, rule.tiers ?? []);
      await this.createTimeWindows(tx, created.id, rule.timeWindows ?? []);
    }
  }

  private async createTiers(
    tx: Prisma.TransactionClient,
    ruleId: number,
    tiers: NonNullable<FeeRuleInput["tiers"]>
  ): Promise<void> {
    for (const tier of tiers) {
      await tx.platformFeeTier.create({
        data: {
          ruleId,
          tierBasis: tier.tierBasis ?? "monthly_completed_orders",
          tierMode: tier.tierMode ?? "progressive",
          minValue: tier.minValue ?? 0,
          maxValue: tier.maxValue ?? null,
          feeAmountNdp: tier.feeAmountNdp ?? null,
          adjustmentAmountNdp: tier.adjustmentAmountNdp ?? null,
          adjustmentPercent: tier.adjustmentPercent ?? null
        }
      });
    }
  }

  private async createTimeWindows(
    tx: Prisma.TransactionClient,
    ruleId: number,
    timeWindows: NonNullable<FeeRuleInput["timeWindows"]>
  ): Promise<void> {
    for (const window of timeWindows) {
      await tx.platformFeeTimeWindow.create({
        data: {
          ruleId,
          timeBasis: window.timeBasis ?? "scheduled_start_at",
          timezone: window.timezone ?? "Asia/Tokyo",
          dayOfWeekMask: window.dayOfWeekMask ?? null,
          holidayCalendarId: window.holidayCalendarId ?? null,
          startTime: window.startTime,
          endTime: window.endTime,
          crossDay: window.crossDay ?? false,
          adjustmentType: window.adjustmentType ?? "fixed_amount",
          adjustmentValueNdp: window.adjustmentValueNdp ?? 0
        }
      });
    }
  }

  private async softDeleteRules(tx: Prisma.TransactionClient, ruleSetId: number): Promise<void> {
    const rules = await tx.platformFeeRule.findMany({
      where: { ruleSetId, deletedAt: null },
      select: { id: true }
    });
    const ruleIds = rules.map((rule) => rule.id);
    const deletedAt = new Date();

    if (ruleIds.length > 0) {
      await Promise.all([
        tx.platformFeeTier.updateMany({
          where: { ruleId: { in: ruleIds }, deletedAt: null },
          data: { deletedAt }
        }),
        tx.platformFeeTimeWindow.updateMany({
          where: { ruleId: { in: ruleIds }, deletedAt: null },
          data: { deletedAt }
        })
      ]);
    }

    await tx.platformFeeRule.updateMany({
      where: { ruleSetId, deletedAt: null },
      data: { deletedAt }
    });
  }

  private async findRuleSetById(
    client: FeeRulePrismaClient,
    id: number
  ): Promise<PlatformFeeRuleSetPayload> {
    const ruleSet = await client.platformFeeRuleSet.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: this.ruleSetInclude()
    });

    return this.mapRuleSet(ruleSet);
  }

  private ruleSetInclude() {
    return {
      rules: {
        where: { deletedAt: null },
        orderBy: [{ priority: "asc" as const }, { id: "asc" as const }],
        include: {
          tiers: {
            where: { deletedAt: null },
            orderBy: [{ minValue: "asc" as const }, { id: "asc" as const }]
          },
          timeWindows: {
            where: { deletedAt: null },
            orderBy: { id: "asc" as const }
          }
        }
      }
    };
  }

  private mapRuleSet(ruleSet: RuleSetRecord): PlatformFeeRuleSetPayload {
    return {
      id: ruleSet.id,
      name: ruleSet.name,
      description: ruleSet.description,
      scopeType: ruleSet.scopeType,
      priority: ruleSet.priority,
      status: this.ruleSetStatus(ruleSet.status),
      version: ruleSet.version,
      effectiveFrom: ruleSet.effectiveFrom,
      effectiveTo: ruleSet.effectiveTo,
      createdById: ruleSet.createdById,
      updatedById: ruleSet.updatedById,
      createdAt: ruleSet.createdAt,
      updatedAt: ruleSet.updatedAt,
      rules: ruleSet.rules.map((rule) => this.mapRule(rule))
    };
  }

  private mapRule(rule: RuleRecord): PlatformFeeRulePayload {
    return {
      id: rule.id,
      ruleSetId: rule.ruleSetId,
      feeType: this.feeType(rule.feeType),
      orderType:
        rule.orderType === "booking" || rule.orderType === "request" ? rule.orderType : "all",
      payerType: this.payerType(rule.payerType),
      baseAmountNdp: rule.baseAmountNdp,
      calculationMode: rule.calculationMode,
      holdStrategy: rule.holdStrategy,
      pricingLockMode: rule.pricingLockMode,
      stackingMode: rule.stackingMode,
      priority: rule.priority,
      conditionJson: rule.conditionJson ?? null,
      formulaJson: rule.formulaJson ?? null,
      capJson: rule.capJson ?? null,
      status: rule.status,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      tiers: rule.tiers.map((tier) => this.mapTier(tier)),
      timeWindows: rule.timeWindows.map((window) => this.mapTimeWindow(window))
    };
  }

  private mapTier(tier: TierRecord): PlatformFeeTierPayload {
    return {
      id: tier.id,
      ruleId: tier.ruleId,
      tierBasis: tier.tierBasis,
      tierMode: tier.tierMode,
      minValue: tier.minValue,
      maxValue: tier.maxValue,
      feeAmountNdp: tier.feeAmountNdp,
      adjustmentAmountNdp: tier.adjustmentAmountNdp,
      adjustmentPercent: tier.adjustmentPercent === null ? null : Number(tier.adjustmentPercent),
      createdAt: tier.createdAt,
      updatedAt: tier.updatedAt
    };
  }

  private mapTimeWindow(window: TimeWindowRecord): PlatformFeeTimeWindowPayload {
    return {
      id: window.id,
      ruleId: window.ruleId,
      timeBasis: window.timeBasis,
      timezone: window.timezone,
      dayOfWeekMask: window.dayOfWeekMask,
      holidayCalendarId: window.holidayCalendarId,
      startTime: window.startTime,
      endTime: window.endTime,
      crossDay: window.crossDay,
      adjustmentType: window.adjustmentType,
      adjustmentValueNdp: window.adjustmentValueNdp,
      createdAt: window.createdAt,
      updatedAt: window.updatedAt
    };
  }

  private mapCampaign(campaign: CampaignRecord): FeeCampaignPayload {
    return {
      id: campaign.id,
      name: campaign.name,
      campaignType: campaign.campaignType,
      targetFeeType:
        campaign.targetFeeType === "all" ? "all" : this.feeType(campaign.targetFeeType),
      waiveScope: campaign.waiveScope,
      discountType: campaign.discountType,
      discountValueNdp: campaign.discountValueNdp,
      maxDiscountNdp: campaign.maxDiscountNdp,
      budgetLimitNdp: campaign.budgetLimitNdp,
      usedBudgetNdp: campaign.usedBudgetNdp,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      timezone: campaign.timezone,
      targetConditionJson: campaign.targetConditionJson ?? null,
      onBudgetExhausted: campaign.onBudgetExhausted,
      status: campaign.status,
      priority: campaign.priority,
      createdById: campaign.createdById,
      approvedById: campaign.approvedById,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt
    };
  }

  private mapCalculationLog(log: CalculationLogRecord): FeeCalculationLogPayload {
    return {
      id: log.id,
      bookingOrderId: log.bookingOrderId,
      calculationStage: this.stage(log.calculationStage),
      feeType: this.feeType(log.feeType),
      payerType: this.payerType(log.payerType),
      payerId: log.payerId,
      baseFeeNdp: log.baseFeeNdp,
      tierAdjustmentNdp: log.tierAdjustmentNdp,
      timeAdjustmentNdp: log.timeAdjustmentNdp,
      campaignDiscountNdp: log.campaignDiscountNdp,
      finalFeeNdp: log.finalFeeNdp,
      holdAmountNdp: log.holdAmountNdp,
      appliedRuleIds: this.stringArray(log.appliedRuleIdsJson),
      explanation: this.stringArray(log.explanationJson),
      calculatedAt: log.calculatedAt,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt
    };
  }

  private jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue);
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private ruleSetStatus(status: string): FeeRuleSetStatus {
    if (status === "active" || status === "paused" || status === "archived") {
      return status;
    }

    return "draft";
  }

  private feeType(value: string): FeeType {
    if (value === "c_request_dispatch_fee" || value === "user_reward" || value === "penalty") {
      return value;
    }

    return "b_platform_fee";
  }

  private payerType(value: string): PlatformFeeRulePayload["payerType"] {
    if (value === "cast" || value === "user" || value === "platform" || value === "split") {
      return value;
    }

    return "shop";
  }

  private stage(value: string): FeeCalculationStage {
    if (value === "hold" || value === "capture" || value === "release" || value === "reversal") {
      return value;
    }

    return "preview";
  }

  private canStartTransaction(client: FeeRulePrismaClient): client is PrismaClient {
    return "$transaction" in client;
  }
}
