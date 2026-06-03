import {
  FeeCalculationService,
  type FeeCalculationLogPayload,
  type FeeRuleMutationInput,
  type FeeRuleRepositoryPort,
  type FeeRuleSetStatus,
  type FeeType,
  type FinanceOrderType,
  type PlatformFeeRuleSetPayload,
  type FeeCampaignPayload
} from "../src/services/fee-calculation.service";
import { buildPaginatedResponse } from "../src/utils/pagination";

const now = new Date("2026-06-10T14:30:00.000Z");

class InMemoryFeeRuleRepository implements FeeRuleRepositoryPort {
  public ruleSets: PlatformFeeRuleSetPayload[] = [];
  public campaigns: FeeCampaignPayload[] = [];
  public completedCount = 0;
  public logs: FeeCalculationLogPayload[] = [];

  private logId = 1;

  public async listRuleSets() {
    return buildPaginatedResponse(this.ruleSets, this.ruleSets.length);
  }

  public async createRuleSet(
    input: FeeRuleMutationInput & { actorUserId: number | null }
  ): Promise<PlatformFeeRuleSetPayload> {
    const ruleSet = makeRuleSet(this.ruleSets.length + 1, input);
    this.ruleSets.push(ruleSet);

    return ruleSet;
  }

  public async updateRuleSet() {
    return null;
  }

  public async setRuleSetStatus() {
    return null;
  }

  public async findActiveRuleSets(input: {
    feeType: FeeType;
    orderType: FinanceOrderType;
    at: Date;
  }): Promise<PlatformFeeRuleSetPayload[]> {
    return this.ruleSets
      .filter((ruleSet) => ruleSet.status === "active")
      .map((ruleSet) => ({
        ...ruleSet,
        rules: ruleSet.rules.filter(
          (rule) =>
            rule.status === "active" &&
            rule.feeType === input.feeType &&
            (rule.orderType === "all" || rule.orderType === input.orderType) &&
            (!rule.effectiveFrom || rule.effectiveFrom <= input.at) &&
            (!rule.effectiveTo || rule.effectiveTo > input.at)
        )
      }))
      .filter((ruleSet) => ruleSet.rules.length > 0);
  }

  public async listActiveCampaigns(input: {
    feeType: FeeType;
    at: Date;
  }): Promise<FeeCampaignPayload[]> {
    return this.campaigns.filter(
      (campaign) =>
        campaign.status === "active" &&
        (campaign.targetFeeType === "all" || campaign.targetFeeType === input.feeType) &&
        campaign.startsAt <= input.at &&
        (!campaign.endsAt || campaign.endsAt > input.at)
    );
  }

  public async countCompletedOrdersForPeriod(): Promise<number> {
    return this.completedCount;
  }

  public async createCalculationLog(
    input: Omit<FeeCalculationLogPayload, "id" | "createdAt" | "updatedAt">
  ): Promise<FeeCalculationLogPayload> {
    const log: FeeCalculationLogPayload = {
      ...input,
      id: this.logId++,
      createdAt: input.calculatedAt,
      updatedAt: input.calculatedAt
    };
    this.logs.push(log);

    return log;
  }

  public async listCalculationLogs() {
    return buildPaginatedResponse(this.logs, this.logs.length);
  }
}

describe("FeeCalculationService", () => {
  it("calculates default Booking platform fee and user reward", async () => {
    const repository = new InMemoryFeeRuleRepository();
    repository.ruleSets = [
      makeRuleSet(1, {
        name: "Default",
        status: "active",
        rules: [
          { feeType: "b_platform_fee", orderType: "booking", baseAmountNdp: 500 },
          {
            feeType: "user_reward",
            orderType: "booking",
            payerType: "platform",
            baseAmountNdp: 100
          }
        ]
      })
    ];
    const service = new FeeCalculationService(repository);

    await expect(service.calculateFee(baseInput("b_platform_fee"))).resolves.toMatchObject({
      finalFeeNdp: 500,
      holdAmountNdp: 500
    });
    await expect(service.calculateFee(baseInput("user_reward"))).resolves.toMatchObject({
      finalFeeNdp: 100
    });
  });

  it("prefers a lower-priority-number shop-specific rule over the global rule", async () => {
    const repository = new InMemoryFeeRuleRepository();
    repository.ruleSets = [
      makeRuleSet(1, {
        name: "Shop pilot",
        status: "active",
        priority: 10,
        rules: [
          {
            feeType: "b_platform_fee",
            orderType: "booking",
            baseAmountNdp: 300,
            conditionJson: { shopIds: [99] }
          }
        ]
      }),
      makeRuleSet(2, {
        name: "Global",
        status: "active",
        priority: 100,
        rules: [{ feeType: "b_platform_fee", orderType: "booking", baseAmountNdp: 500 }]
      })
    ];
    const service = new FeeCalculationService(repository);

    await expect(
      service.calculateFee({ ...baseInput("b_platform_fee"), shopId: 99 })
    ).resolves.toMatchObject({
      finalFeeNdp: 300
    });
  });

  it("applies monthly progressive tiers for the 101st completed order", async () => {
    const repository = new InMemoryFeeRuleRepository();
    repository.completedCount = 101;
    repository.ruleSets = [
      makeRuleSet(1, {
        name: "Monthly tier",
        status: "active",
        rules: [
          {
            feeType: "b_platform_fee",
            orderType: "booking",
            baseAmountNdp: 500,
            holdStrategy: "max_possible_fee",
            tiers: [
              { minValue: 1, maxValue: 100, feeAmountNdp: 500 },
              { minValue: 101, feeAmountNdp: 300 }
            ]
          }
        ]
      })
    ];
    const service = new FeeCalculationService(repository);

    await expect(
      service.calculateFee({ ...baseInput("b_platform_fee"), stage: "capture" })
    ).resolves.toMatchObject({
      completedOrderOrdinalInPeriod: 101,
      finalFeeNdp: 300,
      holdAmountNdp: 500
    });
  });

  it("waives all platform fee during a free campaign", async () => {
    const repository = defaultRepository();
    repository.campaigns = [makeCampaign({ waiveScope: "all" })];
    const service = new FeeCalculationService(repository);

    await expect(service.calculateFee(baseInput("b_platform_fee"))).resolves.toMatchObject({
      finalFeeNdp: 0,
      holdAmountNdp: 0,
      campaignDiscountNdp: 500
    });
  });

  it("waives only base fee while keeping cross-day night surcharge", async () => {
    const repository = defaultRepositoryWithNightWindow();
    repository.campaigns = [makeCampaign({ waiveScope: "base_only" })];
    const service = new FeeCalculationService(repository);

    await expect(service.calculateFee(baseInput("b_platform_fee"))).resolves.toMatchObject({
      baseFeeNdp: 500,
      timeAdjustmentNdp: 200,
      campaignDiscountNdp: 500,
      finalFeeNdp: 200
    });
  });

  it("applies a 22:00-03:00 cross-day surcharge without a campaign", async () => {
    const repository = defaultRepositoryWithNightWindow();
    const service = new FeeCalculationService(repository);

    await expect(service.calculateFee(baseInput("b_platform_fee"))).resolves.toMatchObject({
      timeAdjustmentNdp: 200,
      finalFeeNdp: 700
    });
  });
});

function baseInput(feeType: FeeType) {
  return {
    orderType: "booking" as const,
    stage: "hold" as const,
    feeType,
    shopId: 10,
    userId: 3,
    scheduledStartAt: now,
    serviceAmountJpy: 8800,
    timezone: "Asia/Tokyo"
  };
}

function defaultRepository() {
  const repository = new InMemoryFeeRuleRepository();
  repository.ruleSets = [
    makeRuleSet(1, {
      name: "Default",
      status: "active",
      rules: [{ feeType: "b_platform_fee", orderType: "booking", baseAmountNdp: 500 }]
    })
  ];

  return repository;
}

function defaultRepositoryWithNightWindow() {
  const repository = defaultRepository();
  repository.ruleSets[0]!.rules[0]!.timeWindows = [
    {
      id: 1,
      ruleId: 1,
      timeBasis: "scheduled_start_at",
      timezone: "Asia/Tokyo",
      dayOfWeekMask: null,
      holidayCalendarId: null,
      startTime: "22:00",
      endTime: "03:00",
      crossDay: true,
      adjustmentType: "fixed_amount",
      adjustmentValueNdp: 200,
      createdAt: now,
      updatedAt: now
    }
  ];

  return repository;
}

function makeRuleSet(id: number, input: FeeRuleMutationInput): PlatformFeeRuleSetPayload {
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    scopeType: input.scopeType ?? "platform",
    priority: input.priority ?? 100,
    status: (input.status ?? "active") as FeeRuleSetStatus,
    version: input.version ?? 1,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    createdById: null,
    updatedById: null,
    createdAt: now,
    updatedAt: now,
    rules: (input.rules ?? []).map((rule, index) => ({
      id: id * 100 + index + 1,
      ruleSetId: id,
      feeType: rule.feeType,
      orderType: rule.orderType ?? "all",
      payerType: rule.payerType ?? "shop",
      baseAmountNdp: rule.baseAmountNdp ?? 0,
      calculationMode: rule.calculationMode ?? "fixed",
      holdStrategy: rule.holdStrategy ?? "exact_estimate",
      pricingLockMode: rule.pricingLockMode ?? "recalculate_at_complete",
      stackingMode: rule.stackingMode ?? "sum",
      priority: rule.priority ?? 100,
      conditionJson: rule.conditionJson ?? null,
      formulaJson: rule.formulaJson ?? null,
      capJson: rule.capJson ?? null,
      status: rule.status ?? "active",
      effectiveFrom: rule.effectiveFrom ?? null,
      effectiveTo: rule.effectiveTo ?? null,
      createdAt: now,
      updatedAt: now,
      tiers: (rule.tiers ?? []).map((tier, tierIndex) => ({
        id: id * 1000 + tierIndex + 1,
        ruleId: id * 100 + index + 1,
        tierBasis: tier.tierBasis ?? "monthly_completed_orders",
        tierMode: tier.tierMode ?? "progressive",
        minValue: tier.minValue ?? 0,
        maxValue: tier.maxValue ?? null,
        feeAmountNdp: tier.feeAmountNdp ?? null,
        adjustmentAmountNdp: tier.adjustmentAmountNdp ?? null,
        adjustmentPercent: tier.adjustmentPercent ?? null,
        createdAt: now,
        updatedAt: now
      })),
      timeWindows: (rule.timeWindows ?? []).map((window, windowIndex) => ({
        id: id * 2000 + windowIndex + 1,
        ruleId: id * 100 + index + 1,
        timeBasis: window.timeBasis ?? "scheduled_start_at",
        timezone: window.timezone ?? "Asia/Tokyo",
        dayOfWeekMask: window.dayOfWeekMask ?? null,
        holidayCalendarId: window.holidayCalendarId ?? null,
        startTime: window.startTime,
        endTime: window.endTime,
        crossDay: window.crossDay ?? false,
        adjustmentType: window.adjustmentType ?? "fixed_amount",
        adjustmentValueNdp: window.adjustmentValueNdp ?? 0,
        createdAt: now,
        updatedAt: now
      }))
    }))
  };
}

function makeCampaign(input: { waiveScope: string }): FeeCampaignPayload {
  return {
    id: 1,
    name: "Free campaign",
    campaignType: "free",
    targetFeeType: "b_platform_fee",
    waiveScope: input.waiveScope,
    discountType: "amount_off",
    discountValueNdp: 0,
    maxDiscountNdp: null,
    budgetLimitNdp: null,
    usedBudgetNdp: 0,
    startsAt: new Date("2026-06-01T00:00:00.000Z"),
    endsAt: new Date("2026-06-15T23:59:59.000Z"),
    timezone: "Asia/Tokyo",
    targetConditionJson: null,
    onBudgetExhausted: "continue_with_alert",
    status: "active",
    priority: 1,
    createdById: null,
    approvedById: null,
    createdAt: now,
    updatedAt: now
  };
}
