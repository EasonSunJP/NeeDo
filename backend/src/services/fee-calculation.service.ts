import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export type FeeType = "b_platform_fee" | "c_request_dispatch_fee" | "user_reward" | "penalty";
export type FeeCalculationStage = "preview" | "hold" | "capture" | "release" | "reversal";
export type FinanceOrderType = "booking" | "request";
export type FeePayerType = "shop" | "cast" | "user" | "platform" | "split";
export type FeeRuleSetStatus = "draft" | "active" | "paused" | "archived";

export interface PlatformFeeTierPayload {
  id: number;
  ruleId: number;
  tierBasis: string;
  tierMode: string;
  minValue: number;
  maxValue: number | null;
  feeAmountNdp: number | null;
  adjustmentAmountNdp: number | null;
  adjustmentPercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformFeeTimeWindowPayload {
  id: number;
  ruleId: number;
  timeBasis: string;
  timezone: string;
  dayOfWeekMask: string | null;
  holidayCalendarId: string | null;
  startTime: string;
  endTime: string;
  crossDay: boolean;
  adjustmentType: string;
  adjustmentValueNdp: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformFeeRulePayload {
  id: number;
  ruleSetId: number;
  feeType: FeeType;
  orderType: "all" | FinanceOrderType;
  payerType: FeePayerType;
  baseAmountNdp: number;
  calculationMode: string;
  holdStrategy: string;
  pricingLockMode: string;
  stackingMode: string;
  priority: number;
  conditionJson: unknown;
  formulaJson: unknown;
  capJson: unknown;
  status: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tiers: PlatformFeeTierPayload[];
  timeWindows: PlatformFeeTimeWindowPayload[];
}

export interface PlatformFeeRuleSetPayload {
  id: number;
  name: string;
  description: string | null;
  scopeType: string;
  priority: number;
  status: FeeRuleSetStatus;
  version: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdById: number | null;
  updatedById: number | null;
  createdAt: Date;
  updatedAt: Date;
  rules: PlatformFeeRulePayload[];
}

export interface FeeCampaignPayload {
  id: number;
  name: string;
  campaignType: string;
  targetFeeType: FeeType | "all";
  waiveScope: string;
  discountType: string;
  discountValueNdp: number;
  maxDiscountNdp: number | null;
  budgetLimitNdp: number | null;
  usedBudgetNdp: number;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  targetConditionJson: unknown;
  onBudgetExhausted: string;
  status: string;
  priority: number;
  createdById: number | null;
  approvedById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeCalculationLogPayload {
  id: number;
  bookingOrderId: number | null;
  calculationStage: FeeCalculationStage;
  feeType: FeeType;
  payerType: FeePayerType;
  payerId: number | null;
  baseFeeNdp: number;
  tierAdjustmentNdp: number;
  timeAdjustmentNdp: number;
  campaignDiscountNdp: number;
  finalFeeNdp: number;
  holdAmountNdp: number;
  appliedRuleIds: string[];
  explanation: string[];
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeCalculationInput {
  bookingOrderId?: number;
  orderType: FinanceOrderType;
  stage: FeeCalculationStage;
  feeType: FeeType;
  shopId?: number;
  castId?: number;
  userId?: number;
  serviceId?: number | null;
  serviceCategoryId?: number | null;
  regionId?: number | null;
  city?: string | null;
  scheduledStartAt?: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  serviceAmountJpy?: number;
  paymentChannel?: string;
  timezone?: string;
}

export interface FeeCalculationResult {
  bookingOrderId: number | null;
  orderType: FinanceOrderType;
  stage: FeeCalculationStage;
  feeType: FeeType;
  payerType: FeePayerType;
  payerId: number | null;
  baseFeeNdp: number;
  tierAdjustmentNdp: number;
  timeAdjustmentNdp: number;
  campaignDiscountNdp: number;
  finalFeeNdp: number;
  holdAmountNdp: number;
  completedOrderOrdinalInPeriod: number | null;
  appliedRuleIds: string[];
  explanation: string[];
  calculationLogId: number | null;
}

export interface FeeRuleMutationInput {
  name: string;
  description?: string | null;
  scopeType?: string;
  priority?: number;
  status?: FeeRuleSetStatus;
  version?: number;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  rules?: FeeRuleInput[];
}

export interface FeeRuleInput {
  feeType: FeeType;
  orderType?: "all" | FinanceOrderType;
  payerType?: FeePayerType;
  baseAmountNdp?: number;
  calculationMode?: string;
  holdStrategy?: string;
  pricingLockMode?: string;
  stackingMode?: string;
  priority?: number;
  conditionJson?: unknown;
  formulaJson?: unknown;
  capJson?: unknown;
  status?: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  tiers?: FeeTierInput[];
  timeWindows?: FeeTimeWindowInput[];
}

export interface FeeTierInput {
  tierBasis?: string;
  tierMode?: string;
  minValue?: number;
  maxValue?: number | null;
  feeAmountNdp?: number | null;
  adjustmentAmountNdp?: number | null;
  adjustmentPercent?: number | null;
}

export interface FeeTimeWindowInput {
  timeBasis?: string;
  timezone?: string;
  dayOfWeekMask?: string | null;
  holidayCalendarId?: string | null;
  startTime: string;
  endTime: string;
  crossDay?: boolean;
  adjustmentType?: string;
  adjustmentValueNdp?: number;
}

export interface FeeCalculationContext {
  transactionClient?: unknown;
}

export interface FeeRuleRepositoryPort {
  withTransactionClient?: (transactionClient: unknown) => FeeRuleRepositoryPort;
  listRuleSets: (
    input: PaginationInput & { status?: FeeRuleSetStatus }
  ) => Promise<PaginatedResponse<PlatformFeeRuleSetPayload>>;
  createRuleSet: (
    input: FeeRuleMutationInput & { actorUserId: number | null }
  ) => Promise<PlatformFeeRuleSetPayload>;
  updateRuleSet: (
    id: number,
    input: Partial<FeeRuleMutationInput> & { actorUserId: number | null }
  ) => Promise<PlatformFeeRuleSetPayload | null>;
  setRuleSetStatus: (
    id: number,
    status: "active" | "paused",
    actorUserId: number | null
  ) => Promise<PlatformFeeRuleSetPayload | null>;
  findActiveRuleSets: (input: {
    feeType: FeeType;
    orderType: FinanceOrderType;
    at: Date;
  }) => Promise<PlatformFeeRuleSetPayload[]>;
  listActiveCampaigns: (input: { feeType: FeeType; at: Date }) => Promise<FeeCampaignPayload[]>;
  countCompletedOrdersForPeriod: (input: {
    shopId?: number;
    castId?: number;
    orderType: FinanceOrderType;
    periodStart: Date;
    periodEnd: Date;
  }) => Promise<number>;
  createCalculationLog: (
    input: Omit<FeeCalculationLogPayload, "id" | "createdAt" | "updatedAt">
  ) => Promise<FeeCalculationLogPayload>;
  listCalculationLogs: (
    input: PaginationInput & {
      bookingOrderId?: number;
      feeType?: FeeType;
      stage?: FeeCalculationStage;
    }
  ) => Promise<PaginatedResponse<FeeCalculationLogPayload>>;
}

type JsonRecord = Record<string, unknown>;

export class FeeCalculationService {
  public constructor(private readonly repository: FeeRuleRepositoryPort) {}

  public listRuleSets(input: PaginationInput & { status?: FeeRuleSetStatus }) {
    return this.repository.listRuleSets(input);
  }

  public createRuleSet(input: FeeRuleMutationInput, actorUserId: number | null) {
    return this.repository.createRuleSet({ ...input, actorUserId });
  }

  public async updateRuleSet(
    id: number,
    input: Partial<FeeRuleMutationInput>,
    actorUserId: number | null
  ): Promise<PlatformFeeRuleSetPayload> {
    const updated = await this.repository.updateRuleSet(id, { ...input, actorUserId });

    if (!updated) {
      throw this.notFoundError();
    }

    return updated;
  }

  public async setRuleSetStatus(
    id: number,
    status: "active" | "paused",
    actorUserId: number | null
  ): Promise<PlatformFeeRuleSetPayload> {
    const updated = await this.repository.setRuleSetStatus(id, status, actorUserId);

    if (!updated) {
      throw this.notFoundError();
    }

    return updated;
  }

  public listCalculationLogs(input: Parameters<FeeRuleRepositoryPort["listCalculationLogs"]>[0]) {
    return this.repository.listCalculationLogs(input);
  }

  public async calculateFee(
    input: FeeCalculationInput,
    context: FeeCalculationContext = {}
  ): Promise<FeeCalculationResult> {
    const repository = this.resolveRepository(context);
    const at = this.resolveCalculationTime(input);
    const ruleSets = await repository.findActiveRuleSets({
      feeType: input.feeType,
      orderType: input.orderType,
      at
    });
    const matchedRules = ruleSets
      .flatMap((ruleSet) =>
        ruleSet.rules.map((rule) => ({
          ruleSet,
          rule
        }))
      )
      .filter(({ rule }) => this.ruleMatches(rule, input, at))
      .sort((left, right) => {
        const setPriority = left.ruleSet.priority - right.ruleSet.priority;
        if (setPriority !== 0) {
          return setPriority;
        }

        return left.rule.priority - right.rule.priority || left.rule.id - right.rule.id;
      });
    const primary = matchedRules[0];
    const payerType = primary?.rule.payerType ?? this.defaultPayerType(input.feeType);
    const payerId = this.resolvePayerId(payerType, input);
    const completedOrderOrdinalInPeriod = await this.resolveCompletedOrderOrdinal(
      repository,
      input,
      at,
      primary?.rule
    );
    const tierResult = this.applyTier(primary?.rule, completedOrderOrdinalInPeriod);
    const baseFeeNdp = primary?.rule.baseAmountNdp ?? 0;
    const timeAdjustmentNdp = this.applyTimeWindows(
      matchedRules.map(({ rule }) => rule),
      input,
      at
    );
    const campaigns = (await repository.listActiveCampaigns({ feeType: input.feeType, at })).filter(
      (campaign) => this.campaignMatches(campaign, input, at)
    );
    const grossBeforeCampaign = Math.max(0, baseFeeNdp + tierResult.adjustment + timeAdjustmentNdp);
    const campaignDiscountNdp = this.applyCampaigns(campaigns, {
      baseFeeNdp,
      tierAdjustmentNdp: tierResult.adjustment,
      timeAdjustmentNdp,
      grossBeforeCampaign
    });
    const finalFeeNdp = Math.max(0, grossBeforeCampaign - campaignDiscountNdp);
    const holdAmountNdp = this.calculateHoldAmount(primary?.rule, {
      baseFeeNdp,
      timeAdjustmentNdp,
      campaignDiscountNdp,
      finalFeeNdp,
      tierCandidates: tierResult.candidates,
      campaigns
    });
    const appliedRuleIds = [
      ...matchedRules.map(({ ruleSet, rule }) => `rule_set:${ruleSet.id}:rule:${rule.id}`),
      ...tierResult.appliedIds,
      ...this.matchedTimeWindowIds(
        matchedRules.map(({ rule }) => rule),
        input,
        at
      ),
      ...campaigns.map((campaign) => `campaign:${campaign.id}`)
    ];
    const explanation = this.buildExplanation({
      baseFeeNdp,
      tierAdjustmentNdp: tierResult.adjustment,
      timeAdjustmentNdp,
      campaignDiscountNdp,
      finalFeeNdp,
      holdAmountNdp,
      completedOrderOrdinalInPeriod,
      matchedRuleName: primary?.ruleSet.name ?? null
    });
    const log = await repository.createCalculationLog({
      bookingOrderId: input.bookingOrderId ?? null,
      calculationStage: input.stage,
      feeType: input.feeType,
      payerType,
      payerId,
      baseFeeNdp,
      tierAdjustmentNdp: tierResult.adjustment,
      timeAdjustmentNdp,
      campaignDiscountNdp,
      finalFeeNdp,
      holdAmountNdp,
      appliedRuleIds,
      explanation,
      calculatedAt: at
    });

    return {
      bookingOrderId: input.bookingOrderId ?? null,
      orderType: input.orderType,
      stage: input.stage,
      feeType: input.feeType,
      payerType,
      payerId,
      baseFeeNdp,
      tierAdjustmentNdp: tierResult.adjustment,
      timeAdjustmentNdp,
      campaignDiscountNdp,
      finalFeeNdp,
      holdAmountNdp,
      completedOrderOrdinalInPeriod,
      appliedRuleIds,
      explanation,
      calculationLogId: log.id
    };
  }

  private resolveRepository(context: FeeCalculationContext): FeeRuleRepositoryPort {
    if (context.transactionClient && this.repository.withTransactionClient) {
      return this.repository.withTransactionClient(context.transactionClient);
    }

    return this.repository;
  }

  private resolveCalculationTime(input: FeeCalculationInput): Date {
    if (input.stage === "capture" && input.completedAt) {
      return input.completedAt;
    }
    if (input.stage === "hold" && input.acceptedAt) {
      return input.acceptedAt;
    }

    return input.scheduledStartAt ?? input.completedAt ?? input.acceptedAt ?? new Date();
  }

  private ruleMatches(rule: PlatformFeeRulePayload, input: FeeCalculationInput, at: Date): boolean {
    if (rule.status !== "active") {
      return false;
    }
    if (rule.feeType !== input.feeType) {
      return false;
    }
    if (rule.orderType !== "all" && rule.orderType !== input.orderType) {
      return false;
    }
    if (!this.isEffective(rule.effectiveFrom, rule.effectiveTo, at)) {
      return false;
    }

    return this.conditionMatches(rule.conditionJson, input);
  }

  private campaignMatches(
    campaign: FeeCampaignPayload,
    input: FeeCalculationInput,
    at: Date
  ): boolean {
    if (campaign.status !== "active") {
      return false;
    }
    if (campaign.targetFeeType !== "all" && campaign.targetFeeType !== input.feeType) {
      return false;
    }
    if (!this.isEffective(campaign.startsAt, campaign.endsAt, at)) {
      return false;
    }
    if (
      typeof campaign.budgetLimitNdp === "number" &&
      campaign.usedBudgetNdp >= campaign.budgetLimitNdp
    ) {
      return false;
    }

    return this.conditionMatches(campaign.targetConditionJson, input);
  }

  private conditionMatches(conditionJson: unknown, input: FeeCalculationInput): boolean {
    const condition = this.asRecord(conditionJson);

    if (!condition) {
      return true;
    }

    return (
      this.numberArrayMatches(condition.shopIds, input.shopId) &&
      this.numberArrayMatches(condition.castIds, input.castId) &&
      this.numberArrayMatches(condition.technicianProfileIds, input.castId) &&
      this.numberArrayMatches(condition.userIds, input.userId) &&
      this.numberArrayMatches(condition.serviceIds, input.serviceId ?? undefined) &&
      this.numberArrayMatches(condition.serviceCategoryIds, input.serviceCategoryId ?? undefined) &&
      this.numberArrayMatches(condition.regionIds, input.regionId ?? undefined) &&
      this.stringArrayMatches(condition.cities, input.city ?? undefined) &&
      this.stringArrayMatches(condition.paymentChannels, input.paymentChannel)
    );
  }

  private async resolveCompletedOrderOrdinal(
    repository: FeeRuleRepositoryPort,
    input: FeeCalculationInput,
    at: Date,
    rule?: PlatformFeeRulePayload
  ): Promise<number | null> {
    if (!rule?.tiers.some((tier) => tier.tierBasis === "monthly_completed_orders")) {
      return null;
    }

    const periodStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const completedCount = await repository.countCompletedOrdersForPeriod({
      shopId: input.shopId,
      castId: input.castId,
      orderType: input.orderType,
      periodStart,
      periodEnd
    });

    return input.stage === "capture" ? Math.max(1, completedCount) : completedCount + 1;
  }

  private applyTier(
    rule: PlatformFeeRulePayload | undefined,
    completedOrderOrdinalInPeriod: number | null
  ): { adjustment: number; candidates: number[]; appliedIds: string[] } {
    if (!rule || completedOrderOrdinalInPeriod === null || rule.tiers.length === 0) {
      return { adjustment: 0, candidates: [], appliedIds: [] };
    }

    const candidates = rule.tiers
      .map((tier) =>
        typeof tier.feeAmountNdp === "number"
          ? tier.feeAmountNdp
          : rule.baseAmountNdp + (tier.adjustmentAmountNdp ?? 0)
      )
      .filter((value) => Number.isFinite(value));
    const matchedTier = rule.tiers
      .slice()
      .sort((left, right) => left.minValue - right.minValue || left.id - right.id)
      .find(
        (tier) =>
          completedOrderOrdinalInPeriod >= tier.minValue &&
          (tier.maxValue === null || completedOrderOrdinalInPeriod <= tier.maxValue)
      );

    if (!matchedTier) {
      return { adjustment: 0, candidates, appliedIds: [] };
    }

    const adjustment =
      typeof matchedTier.feeAmountNdp === "number"
        ? matchedTier.feeAmountNdp - rule.baseAmountNdp
        : (matchedTier.adjustmentAmountNdp ?? 0);

    return {
      adjustment,
      candidates,
      appliedIds: [`tier:${matchedTier.id}`]
    };
  }

  private applyTimeWindows(
    rules: PlatformFeeRulePayload[],
    input: FeeCalculationInput,
    at: Date
  ): number {
    return this.matchedTimeWindows(rules, input, at).reduce((total, window) => {
      if (window.adjustmentType === "set_to_amount") {
        return window.adjustmentValueNdp;
      }

      return total + window.adjustmentValueNdp;
    }, 0);
  }

  private matchedTimeWindowIds(
    rules: PlatformFeeRulePayload[],
    input: FeeCalculationInput,
    at: Date
  ): string[] {
    return this.matchedTimeWindows(rules, input, at).map((window) => `time_window:${window.id}`);
  }

  private matchedTimeWindows(
    rules: PlatformFeeRulePayload[],
    input: FeeCalculationInput,
    at: Date
  ): PlatformFeeTimeWindowPayload[] {
    return rules.flatMap((rule) =>
      rule.timeWindows.filter((window) => this.timeWindowMatches(window, input, at))
    );
  }

  private timeWindowMatches(
    window: PlatformFeeTimeWindowPayload,
    input: FeeCalculationInput,
    fallbackTime: Date
  ): boolean {
    const basisTime = this.resolveTimeBasis(window.timeBasis, input) ?? fallbackTime;
    const local = this.getLocalDateParts(basisTime, window.timezone);

    if (!this.dayOfWeekMatches(window.dayOfWeekMask, local.dayOfWeek)) {
      return false;
    }

    const startMinute = this.parseClockMinute(window.startTime);
    const endMinute = this.parseClockMinute(window.endTime);
    const currentMinute = local.hour * 60 + local.minute;

    if (window.crossDay || startMinute > endMinute) {
      return currentMinute >= startMinute || currentMinute < endMinute;
    }

    return currentMinute >= startMinute && currentMinute < endMinute;
  }

  private applyCampaigns(
    campaigns: FeeCampaignPayload[],
    amounts: {
      baseFeeNdp: number;
      tierAdjustmentNdp: number;
      timeAdjustmentNdp: number;
      grossBeforeCampaign: number;
    }
  ): number {
    return campaigns.reduce((total, campaign) => {
      const discount = this.campaignDiscount(campaign, amounts);
      const cappedDiscount =
        typeof campaign.maxDiscountNdp === "number"
          ? Math.min(discount, campaign.maxDiscountNdp)
          : discount;

      return Math.min(amounts.grossBeforeCampaign, total + cappedDiscount);
    }, 0);
  }

  private campaignDiscount(
    campaign: FeeCampaignPayload,
    amounts: {
      baseFeeNdp: number;
      tierAdjustmentNdp: number;
      timeAdjustmentNdp: number;
      grossBeforeCampaign: number;
    }
  ): number {
    if (campaign.campaignType === "free" || campaign.discountType === "set_to_amount") {
      if (campaign.waiveScope === "base_only") {
        return Math.max(0, amounts.baseFeeNdp + amounts.tierAdjustmentNdp);
      }
      if (campaign.waiveScope === "surcharge_only") {
        return Math.max(0, amounts.timeAdjustmentNdp);
      }
      if (campaign.discountType === "set_to_amount") {
        return Math.max(0, amounts.grossBeforeCampaign - campaign.discountValueNdp);
      }

      return amounts.grossBeforeCampaign;
    }

    if (campaign.discountType === "percent_off") {
      return Math.round(amounts.grossBeforeCampaign * (campaign.discountValueNdp / 100));
    }

    return Math.max(0, campaign.discountValueNdp);
  }

  private calculateHoldAmount(
    rule: PlatformFeeRulePayload | undefined,
    input: {
      baseFeeNdp: number;
      timeAdjustmentNdp: number;
      campaignDiscountNdp: number;
      finalFeeNdp: number;
      tierCandidates: number[];
      campaigns: FeeCampaignPayload[];
    }
  ): number {
    if (!rule) {
      return input.finalFeeNdp;
    }
    if (
      input.campaigns.some(
        (campaign) => campaign.campaignType === "free" && campaign.waiveScope === "all"
      )
    ) {
      return 0;
    }
    if (rule.holdStrategy === "fixed_hold_amount") {
      const formula = this.asRecord(rule.formulaJson);
      const fixed = this.asNumber(formula?.fixedHoldAmountNdp);

      return typeof fixed === "number" ? fixed : input.finalFeeNdp;
    }
    if (rule.holdStrategy === "max_possible_fee") {
      const maxTierCandidate =
        input.tierCandidates.length > 0 ? Math.max(...input.tierCandidates) : input.baseFeeNdp;

      return Math.max(
        input.finalFeeNdp,
        Math.max(0, maxTierCandidate + input.timeAdjustmentNdp - input.campaignDiscountNdp)
      );
    }

    return input.finalFeeNdp;
  }

  private buildExplanation(input: {
    baseFeeNdp: number;
    tierAdjustmentNdp: number;
    timeAdjustmentNdp: number;
    campaignDiscountNdp: number;
    finalFeeNdp: number;
    holdAmountNdp: number;
    completedOrderOrdinalInPeriod: number | null;
    matchedRuleName: string | null;
  }): string[] {
    const lines = [
      input.matchedRuleName
        ? `Matched rule set: ${input.matchedRuleName}`
        : "No active rule matched",
      `Base fee: ${input.baseFeeNdp} NDP`
    ];

    if (input.completedOrderOrdinalInPeriod !== null) {
      lines.push(`Monthly completed-order ordinal: ${input.completedOrderOrdinalInPeriod}`);
    }
    if (input.tierAdjustmentNdp !== 0) {
      lines.push(`Tier adjustment: ${input.tierAdjustmentNdp} NDP`);
    }
    if (input.timeAdjustmentNdp !== 0) {
      lines.push(`Time adjustment: ${input.timeAdjustmentNdp} NDP`);
    }
    if (input.campaignDiscountNdp !== 0) {
      lines.push(`Campaign discount: -${input.campaignDiscountNdp} NDP`);
    }
    lines.push(`Final fee: ${input.finalFeeNdp} NDP`);
    lines.push(`Hold amount: ${input.holdAmountNdp} NDP`);

    return lines;
  }

  private defaultPayerType(feeType: FeeType): FeePayerType {
    if (feeType === "user_reward") {
      return "platform";
    }
    if (feeType === "c_request_dispatch_fee") {
      return "user";
    }

    return "shop";
  }

  private resolvePayerId(payerType: FeePayerType, input: FeeCalculationInput): number | null {
    if (payerType === "shop") {
      return input.shopId ?? null;
    }
    if (payerType === "cast") {
      return input.castId ?? null;
    }
    if (payerType === "user") {
      return input.userId ?? null;
    }

    return null;
  }

  private isEffective(from: Date | null, to: Date | null, at: Date): boolean {
    return (!from || from.getTime() <= at.getTime()) && (!to || to.getTime() > at.getTime());
  }

  private resolveTimeBasis(basis: string, input: FeeCalculationInput): Date | undefined {
    if (basis === "completed_at") {
      return input.completedAt;
    }
    if (basis === "accepted_at") {
      return input.acceptedAt;
    }

    return input.scheduledStartAt;
  }

  private getLocalDateParts(
    date: Date,
    timezone: string
  ): {
    hour: number;
    minute: number;
    dayOfWeek: number;
  } {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(date);
    const partValue = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const weekday = partValue("weekday").toLowerCase();
    const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday);

    return {
      hour: Number(partValue("hour")) % 24,
      minute: Number(partValue("minute")),
      dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : date.getUTCDay()
    };
  }

  private dayOfWeekMatches(mask: string | null, dayOfWeek: number): boolean {
    if (!mask) {
      return true;
    }

    return mask
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .some((item) => item === String(dayOfWeek) || item === this.dayLabel(dayOfWeek));
  }

  private dayLabel(dayOfWeek: number): string {
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayOfWeek] ?? "";
  }

  private parseClockMinute(value: string): number {
    const [hour, minute] = value.split(":").map((part) => Number(part));

    return hour * 60 + minute;
  }

  private numberArrayMatches(value: unknown, candidate?: number): boolean {
    const values = this.asNumberArray(value);

    return !values || (typeof candidate === "number" && values.includes(candidate));
  }

  private stringArrayMatches(value: unknown, candidate?: string): boolean {
    const values = this.asStringArray(value);

    return !values || (typeof candidate === "string" && values.includes(candidate));
  }

  private asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : null;
  }

  private asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private asNumberArray(value: unknown): number[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    return value.filter(
      (item): item is number => typeof item === "number" && Number.isFinite(item)
    );
  }

  private asStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.finance.rule_set_not_found",
      statusCode: 404
    });
  }
}
