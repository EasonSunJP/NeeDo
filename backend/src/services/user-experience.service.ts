import {
  USER_EXPERIENCE_EVENT_TYPES,
  type UserExperienceMembershipResolverPort,
  type UserExperienceMutationResult,
  type UserExperienceRecordEventInput,
  type UserExperienceRepositoryPort
} from "../domain/user-experience";

const BPS_SCALE = 10_000n;
const eventTypeSet = new Set<string>(USER_EXPERIENCE_EVENT_TYPES);

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
