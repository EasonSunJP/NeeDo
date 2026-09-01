import type {
  PlatformMembershipBenefitCodeValue,
  PlatformMembershipTierCodeValue
} from "./platform-membership";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export const USER_EXPERIENCE_EVENT_TYPES = [
  "member_sign_in",
  "service_completed",
  "social_post_liked",
  "ndp_consumed",
  "membership_renewed",
  "adjustment",
  "reversal"
] as const;

export type UserExperienceEventTypeValue = (typeof USER_EXPERIENCE_EVENT_TYPES)[number];

export interface UserExperienceAccountSnapshot {
  publicId: string;
  userId: number;
  totalUnits: bigint;
  currentLevel: number;
  lockVersion: number;
}

export interface UserExperienceEntrySnapshot {
  publicId: string;
  userId: number;
  eventType: UserExperienceEventTypeValue;
  sourceType: string;
  sourcePublicId: string | null;
  idempotencyKey: string;
  baseUnits: bigint;
  campaignFactorBps: number;
  membershipMultiplierBps: number;
  extraUnits: bigint;
  finalUnits: bigint;
  membershipTierCode: PlatformMembershipTierCodeValue | null;
  membershipTierVersionId: string | null;
  policyVersionId: string | null;
  campaignVersionId: string | null;
  occurredAt: Date;
  reversalOfEntryId: number | null;
  ledgerTransactionId?: number | null;
  entitlementId?: number | null;
  ndpAmount?: number | null;
  ndpPerBaseExp?: number | null;
  extraThresholdNdp?: number | null;
  extraAwardUnits?: bigint | null;
  accumulatorBeforeNumerator?: bigint | null;
  accumulatorAfterNumerator?: bigint | null;
}

export interface UserExperienceCalculatedEvent {
  userId: number;
  eventType: UserExperienceEventTypeValue;
  sourceType: string;
  sourcePublicId: string | null;
  idempotencyKey: string;
  baseUnits: bigint;
  campaignFactorBps: number;
  membershipMultiplierBps: number;
  extraUnits: bigint;
  finalUnits: bigint;
  membershipTierCode: PlatformMembershipTierCodeValue;
  membershipTierVersionId: string;
  policyVersionId: string | null;
  campaignVersionId: string | null;
  occurredAt: Date;
  reversalOfEntryId: number | null;
  ledgerTransactionId?: number | null;
  entitlementId?: number | null;
  ndpAmount?: number | null;
  ndpPerBaseExp?: number | null;
  extraThresholdNdp?: number | null;
  extraAwardUnits?: bigint | null;
  accumulatorBeforeNumerator?: bigint | null;
  accumulatorAfterNumerator?: bigint | null;
}

export interface MembershipRenewalExperienceSource {
  userId: number;
  entitlementId: number;
  entitlementPublicId: string;
  experienceValueNdp: number;
  tierCode: PlatformMembershipTierCodeValue;
  tierVersionPublicId: string;
  multiplier: number;
  benefits: Array<{ code: PlatformMembershipBenefitCodeValue }>;
  occurredAt: Date;
}

export interface NdpConsumptionExperienceSource {
  kind: "qualifying_consumption";
  userId: number;
  settledNdp: number;
  ledgerTransactionId: number;
  transactionNo: string;
  occurredAt: Date;
}

export interface NdpConsumptionCalculatedEvent {
  userId: number;
  eventType: "ndp_consumed";
  sourceType: "ledger_transaction";
  sourcePublicId: string;
  idempotencyKey: string;
  baseUnits: bigint;
  campaignFactorBps: number;
  membershipMultiplierBps: number;
  membershipTierCode: PlatformMembershipTierCodeValue;
  membershipTierVersionId: string;
  policyVersionId: string;
  campaignVersionId: string | null;
  occurredAt: Date;
  ledgerTransactionId: number;
  ndpAmount: number;
  ndpPerBaseExp: number;
  tierBenefitId: number;
  extraThresholdNdp: number | null;
  extraAwardUnits: bigint;
}

export interface UserExperienceRecordEventInput {
  userId: number;
  eventType: UserExperienceEventTypeValue;
  sourceType: string;
  sourcePublicId: string | null;
  idempotencyKey: string;
  baseUnits: bigint;
  campaignFactorBps?: number;
  extraUnits?: bigint;
  requiredBenefit?: PlatformMembershipBenefitCodeValue;
  policyVersionId?: string | null;
  campaignVersionId?: string | null;
  occurredAt: Date;
}

export type UserExperienceMutationResult =
  | {
      status: "awarded" | "duplicate";
      account: UserExperienceAccountSnapshot;
      entry: UserExperienceEntrySnapshot | null;
    }
  | {
      status: "ineligible";
      account: UserExperienceAccountSnapshot | null;
      entry?: never;
    };

export interface UserExperienceRepositoryPort {
  findActiveAccount: (userId: number) => Promise<UserExperienceAccountSnapshot | null>;
  listEntries: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<UserExperienceEntrySnapshot>>;
  recordCalculatedEvent: (
    event: UserExperienceCalculatedEvent,
    options?: { transactionClient?: unknown }
  ) => Promise<UserExperienceMutationResult>;
  recordNdpConsumptionEvent: (
    event: NdpConsumptionCalculatedEvent,
    options?: { transactionClient?: unknown }
  ) => Promise<UserExperienceMutationResult>;
}

export interface UserExperienceMembershipResolverPort {
  resolveMembershipAt: (
    userId: number,
    occurredAt: Date
  ) => Promise<{
    tierCode: PlatformMembershipTierCodeValue;
    tierVersionPublicId: string;
    multiplier: number;
    benefits: Array<{
      code: PlatformMembershipBenefitCodeValue;
      configuration: unknown;
      tierBenefitId?: number;
      tierBenefitPublicId?: string;
    }>;
  }>;
}

export interface UserExperienceGlobalPolicyResolverPort {
  resolvePolicyAt: (occurredAt: Date) => Promise<{
    versionPublicId: string;
    ndpPerBaseExp: number;
    baseExpUnitsPerThreshold: number;
  }>;
}

export interface UserExperienceCampaignResolverPort {
  resolveCampaignAt: (occurredAt: Date) => Promise<{
    factorBps: number;
    versionPublicId: string | null;
  }>;
}

const BPS_SCALE = 10_000n;

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

export const calculateNdpBonus = (input: {
  ndpAmount: number;
  extraThresholdNdp: number | null;
  extraAwardUnits: bigint;
  accumulatorBeforeNumerator: bigint;
}): {
  extraUnits: bigint;
  accumulatorAfterNumerator: bigint;
} => {
  if (input.extraThresholdNdp === null) {
    return { extraUnits: 0n, accumulatorAfterNumerator: 0n };
  }
  const numerator =
    input.accumulatorBeforeNumerator + BigInt(input.ndpAmount) * input.extraAwardUnits;
  const threshold = BigInt(input.extraThresholdNdp);
  return {
    extraUnits: numerator / threshold,
    accumulatorAfterNumerator: numerator % threshold
  };
};
