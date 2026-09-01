import {
  USER_EXPERIENCE_EVENT_TYPES,
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

const BPS_SCALE = 10_000n;
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

export const calculateFinalExperienceUnits = (input: {
  baseUnits: bigint;
  campaignFactorBps: number;
  membershipMultiplierBps: number;
  extraUnits: bigint;
}): bigint =>
  (input.baseUnits *
    BigInt(input.campaignFactorBps) *
    BigInt(input.membershipMultiplierBps)) /
    (BPS_SCALE * BPS_SCALE) +
  input.extraUnits;

export class UserExperienceService {
  public constructor(
    private readonly repository: UserExperienceRepositoryPort,
    private readonly membershipResolver: UserExperienceMembershipResolverPort
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
