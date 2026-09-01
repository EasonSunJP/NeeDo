import type {
  PlatformMembershipBenefitCodeValue,
  PlatformMembershipTierCodeValue
} from "./platform-membership";

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
  recordCalculatedEvent: (
    event: UserExperienceCalculatedEvent
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
    }>;
  }>;
}
