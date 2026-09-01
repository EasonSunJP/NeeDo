import {
  calculateFinalExperienceUnits,
  USER_EXPERIENCE_EVENT_TYPES,
  type NdpConsumptionExperienceSource,
  type MembershipRenewalExperienceSource,
  type UserExperienceCampaignResolverPort,
  type UserExperienceGlobalPolicyResolverPort,
  type UserExperienceMembershipResolverPort,
  type UserExperienceMutationResult,
  type UserExperienceRecordEventInput,
  type UserExperienceRepositoryPort
} from "../domain/user-experience";
import {
  USER_EXPERIENCE_THRESHOLDS,
  USER_EXPERIENCE_UNITS_PER_EXP
} from "../domain/user-experience-levels";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";

const eventTypeSet = new Set<string>(USER_EXPERIENCE_EVENT_TYPES);

const formatExperienceUnits = (units: bigint): string => {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / USER_EXPERIENCE_UNITS_PER_EXP;
  const fraction = (absolute % USER_EXPERIENCE_UNITS_PER_EXP)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};

export { calculateFinalExperienceUnits } from "../domain/user-experience";

export class UserExperienceService {
  public constructor(
    private readonly repository: UserExperienceRepositoryPort,
    private readonly membershipResolver: UserExperienceMembershipResolverPort,
    private readonly globalPolicyResolver?: UserExperienceGlobalPolicyResolverPort,
    private readonly campaignResolver?: UserExperienceCampaignResolverPort
  ) {}

  public async getSummary(userId: number) {
    const account = await this.repository.findActiveAccount(userId);
    if (!account) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.user_experience.not_applicable",
        statusCode: 422
      });
    }
    const levelStartUnits =
      BigInt(USER_EXPERIENCE_THRESHOLDS[account.currentLevel - 1]) *
      USER_EXPERIENCE_UNITS_PER_EXP;
    if (account.currentLevel === 100) {
      return {
        level: 100,
        totalExp: formatExperienceUnits(account.totalUnits),
        currentLevelExp: formatExperienceUnits(account.totalUnits - levelStartUnits),
        nextLevelExp: "0",
        progressBps: 10_000
      };
    }
    const nextLevelUnits =
      BigInt(USER_EXPERIENCE_THRESHOLDS[account.currentLevel]) *
      USER_EXPERIENCE_UNITS_PER_EXP;
    const currentLevelUnits = account.totalUnits - levelStartUnits;
    const levelSpanUnits = nextLevelUnits - levelStartUnits;
    return {
      level: account.currentLevel,
      totalExp: formatExperienceUnits(account.totalUnits),
      currentLevelExp: formatExperienceUnits(currentLevelUnits),
      nextLevelExp: formatExperienceUnits(levelSpanUnits),
      progressBps: Number((currentLevelUnits * 10_000n) / levelSpanUnits)
    };
  }

  public async listEntries(userId: number, input: PaginationInput) {
    const result = await this.repository.listEntries(userId, input);
    return {
      ...result,
      list: result.list.map((entry) => ({
        publicId: entry.publicId,
        eventType: entry.eventType,
        sourceType: entry.sourceType,
        sourcePublicId: entry.sourcePublicId,
        baseExp: formatExperienceUnits(entry.baseUnits),
        campaignFactorBps: entry.campaignFactorBps,
        membershipMultiplierBps: entry.membershipMultiplierBps,
        extraExp: formatExperienceUnits(entry.extraUnits),
        finalExp: formatExperienceUnits(entry.finalUnits),
        membershipTierCode: entry.membershipTierCode,
        membershipTierVersionId: entry.membershipTierVersionId,
        policyVersionId: entry.policyVersionId,
        campaignVersionId: entry.campaignVersionId,
        occurredAt: entry.occurredAt.toISOString()
      }))
    };
  }

  public async recordEvent(
    input: UserExperienceRecordEventInput,
    options: { transactionClient?: unknown } = {}
  ): Promise<UserExperienceMutationResult> {
    this.assertInput(input);
    const account = await this.repository.findActiveAccount(input.userId);
    if (!account) return { status: "ineligible", account: null };

    const membership = await this.membershipResolver.resolveMembershipAt(
      input.userId,
      input.occurredAt
    );
    if (
      input.requiredBenefit &&
      !membership.benefits.some((benefit) => benefit.code === input.requiredBenefit)
    ) {
      return { status: "ineligible", account };
    }

    const membershipMultiplierBps = Math.round(membership.multiplier * 10_000);
    if (!Number.isSafeInteger(membershipMultiplierBps) || membershipMultiplierBps <= 0) {
      throw new RangeError("membership multiplier is invalid");
    }
    const campaignFactorBps = input.campaignFactorBps ?? 10_000;
    const extraUnits = input.extraUnits ?? 0n;
    const finalUnits = calculateFinalExperienceUnits({
      baseUnits: input.baseUnits,
      campaignFactorBps,
      membershipMultiplierBps,
      extraUnits
    });

    const calculatedEvent = {
      userId: input.userId,
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourcePublicId: input.sourcePublicId,
      idempotencyKey: input.idempotencyKey,
      baseUnits: input.baseUnits,
      campaignFactorBps,
      membershipMultiplierBps,
      extraUnits,
      finalUnits,
      membershipTierCode: membership.tierCode,
      membershipTierVersionId: membership.tierVersionPublicId,
      policyVersionId: input.policyVersionId ?? null,
      campaignVersionId: input.campaignVersionId ?? null,
      occurredAt: input.occurredAt,
      reversalOfEntryId: null
    };
    return options.transactionClient
      ? this.repository.recordCalculatedEvent(calculatedEvent, options)
      : this.repository.recordCalculatedEvent(calculatedEvent);
  }

  public async recordNdpConsumption(
    source: NdpConsumptionExperienceSource,
    options: { transactionClient?: unknown } = {}
  ): Promise<UserExperienceMutationResult> {
    this.assertNdpSource(source);
    const account = await this.repository.findActiveAccount(source.userId);
    if (!account) return { status: "ineligible", account: null };
    if (!this.globalPolicyResolver || !this.campaignResolver) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.user_experience.ndp_policy_unavailable",
        statusCode: 500
      });
    }

    const [membership, policy, campaign] = await Promise.all([
      this.membershipResolver.resolveMembershipAt(source.userId, source.occurredAt),
      this.globalPolicyResolver.resolvePolicyAt(source.occurredAt),
      this.campaignResolver.resolveCampaignAt(source.occurredAt)
    ]);
    const ndpBenefit = membership.benefits.find(
      (benefit) => benefit.code === "ndp_experience"
    );
    if (!ndpBenefit) return { status: "ineligible", account };
    if (!Number.isSafeInteger(ndpBenefit.tierBenefitId) || (ndpBenefit.tierBenefitId ?? 0) < 1) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.user_experience.ndp_benefit_version_unavailable",
        statusCode: 500
      });
    }
    const { extraThresholdNdp, extraAwardUnits } = this.parseNdpBenefitConfiguration(
      ndpBenefit.configuration
    );
    const membershipMultiplierBps = Math.round(membership.multiplier * 10_000);
    if (
      !Number.isSafeInteger(membershipMultiplierBps) ||
      membershipMultiplierBps <= 0 ||
      !Number.isSafeInteger(policy.ndpPerBaseExp) ||
      policy.ndpPerBaseExp <= 0 ||
      !Number.isSafeInteger(policy.baseExpUnitsPerThreshold) ||
      policy.baseExpUnitsPerThreshold <= 0 ||
      !Number.isSafeInteger(campaign.factorBps) ||
      campaign.factorBps <= 0
    ) {
      throw new RangeError("NDP experience policy is invalid");
    }

    const event = {
      userId: source.userId,
      eventType: "ndp_consumed" as const,
      sourceType: "ledger_transaction" as const,
      sourcePublicId: source.transactionNo,
      idempotencyKey: `ndp-consumption:${source.transactionNo}`,
      baseUnits:
        (BigInt(source.settledNdp) * BigInt(policy.baseExpUnitsPerThreshold)) /
        BigInt(policy.ndpPerBaseExp),
      campaignFactorBps: campaign.factorBps,
      membershipMultiplierBps,
      membershipTierCode: membership.tierCode,
      membershipTierVersionId: membership.tierVersionPublicId,
      policyVersionId: policy.versionPublicId,
      campaignVersionId: campaign.versionPublicId,
      occurredAt: source.occurredAt,
      ledgerTransactionId: source.ledgerTransactionId,
      ndpAmount: source.settledNdp,
      ndpPerBaseExp: policy.ndpPerBaseExp,
      tierBenefitId: ndpBenefit.tierBenefitId!,
      extraThresholdNdp,
      extraAwardUnits
    };
    return this.repository.recordNdpConsumptionEvent(
      event,
      options.transactionClient ? options : undefined
    );
  }

  public async recordMembershipRenewal(
    source: MembershipRenewalExperienceSource,
    options: { transactionClient?: unknown } = {}
  ): Promise<UserExperienceMutationResult> {
    this.assertMembershipRenewalSource(source);
    const account = await this.repository.findActiveAccount(source.userId);
    if (!account) return { status: "ineligible", account: null };
    if (
      source.experienceValueNdp === 0 ||
      !source.benefits.some((benefit) => benefit.code === "ndp_experience")
    ) {
      return { status: "ineligible", account };
    }
    if (!this.globalPolicyResolver) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.user_experience.ndp_policy_unavailable",
        statusCode: 500
      });
    }
    const policy = await this.globalPolicyResolver.resolvePolicyAt(source.occurredAt);
    const membershipMultiplierBps = Math.round(source.multiplier * 10_000);
    if (
      !Number.isSafeInteger(policy.ndpPerBaseExp) ||
      policy.ndpPerBaseExp <= 0 ||
      !Number.isSafeInteger(policy.baseExpUnitsPerThreshold) ||
      policy.baseExpUnitsPerThreshold <= 0 ||
      !Number.isSafeInteger(membershipMultiplierBps) ||
      membershipMultiplierBps <= 0
    ) {
      throw new RangeError("membership renewal experience policy is invalid");
    }
    const baseUnits =
      (BigInt(source.experienceValueNdp) *
        BigInt(policy.baseExpUnitsPerThreshold)) /
      BigInt(policy.ndpPerBaseExp);
    const finalUnits = calculateFinalExperienceUnits({
      baseUnits,
      campaignFactorBps: 10_000,
      membershipMultiplierBps,
      extraUnits: 0n
    });
    const event = {
      userId: source.userId,
      eventType: "membership_renewed" as const,
      sourceType: "platform_membership_entitlement",
      sourcePublicId: source.entitlementPublicId,
      idempotencyKey: `membership-renewal:${source.entitlementPublicId}`,
      baseUnits,
      campaignFactorBps: 10_000,
      membershipMultiplierBps,
      extraUnits: 0n,
      finalUnits,
      membershipTierCode: source.tierCode,
      membershipTierVersionId: source.tierVersionPublicId,
      policyVersionId: policy.versionPublicId,
      campaignVersionId: null,
      occurredAt: source.occurredAt,
      reversalOfEntryId: null,
      entitlementId: source.entitlementId,
      ndpAmount: source.experienceValueNdp,
      ndpPerBaseExp: policy.ndpPerBaseExp,
      extraThresholdNdp: null,
      extraAwardUnits: 0n,
      accumulatorBeforeNumerator: null,
      accumulatorAfterNumerator: null
    };
    return this.repository.recordCalculatedEvent(
      event,
      options.transactionClient ? options : undefined
    );
  }

  private assertMembershipRenewalSource(source: MembershipRenewalExperienceSource): void {
    if (
      !Number.isSafeInteger(source.userId) ||
      source.userId < 1 ||
      !Number.isSafeInteger(source.entitlementId) ||
      source.entitlementId < 1 ||
      !source.entitlementPublicId ||
      source.entitlementPublicId.length > 96 ||
      !Number.isSafeInteger(source.experienceValueNdp) ||
      source.experienceValueNdp < 0 ||
      !Number.isFinite(source.multiplier) ||
      source.multiplier <= 0 ||
      Number.isNaN(source.occurredAt.getTime())
    ) {
      throw new RangeError("membership renewal experience source is invalid");
    }
  }

  private parseNdpBenefitConfiguration(configuration: unknown): {
    extraThresholdNdp: number | null;
    extraAwardUnits: bigint;
  } {
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
      throw new RangeError("NDP experience benefit configuration is invalid");
    }
    const value = configuration as Record<string, unknown>;
    const threshold = value.extraThresholdNdp;
    const award = value.extraAwardExpUnits;
    if (threshold === null && award === null) {
      return { extraThresholdNdp: null, extraAwardUnits: 0n };
    }
    if (
      !Number.isSafeInteger(threshold) ||
      Number(threshold) <= 0 ||
      !Number.isSafeInteger(award) ||
      Number(award) <= 0
    ) {
      throw new RangeError("NDP experience benefit configuration is invalid");
    }
    return { extraThresholdNdp: Number(threshold), extraAwardUnits: BigInt(Number(award)) };
  }

  private assertNdpSource(source: NdpConsumptionExperienceSource): void {
    if (
      source.kind !== "qualifying_consumption" ||
      !Number.isSafeInteger(source.userId) ||
      source.userId < 1 ||
      !Number.isSafeInteger(source.settledNdp) ||
      source.settledNdp < 1 ||
      !Number.isSafeInteger(source.ledgerTransactionId) ||
      source.ledgerTransactionId < 1 ||
      source.transactionNo.length < 1 ||
      source.transactionNo.length > 96 ||
      Number.isNaN(source.occurredAt.getTime())
    ) {
      throw new RangeError("NDP experience source is invalid");
    }
  }

  private assertInput(input: UserExperienceRecordEventInput): void {
    if (
      !Number.isInteger(input.userId) ||
      input.userId <= 0 ||
      !eventTypeSet.has(input.eventType) ||
      input.sourceType.length < 1 ||
      input.sourceType.length > 80 ||
      (input.sourcePublicId !== null &&
        (input.sourcePublicId.length < 1 || input.sourcePublicId.length > 96)) ||
      input.idempotencyKey.length < 1 ||
      input.idempotencyKey.length > 191 ||
      input.baseUnits < 0n ||
      (input.extraUnits ?? 0n) < 0n ||
      !Number.isInteger(input.campaignFactorBps ?? 10_000) ||
      (input.campaignFactorBps ?? 10_000) <= 0 ||
      Number.isNaN(input.occurredAt.getTime())
    ) {
      throw new RangeError("experience event input is invalid");
    }
  }
}
