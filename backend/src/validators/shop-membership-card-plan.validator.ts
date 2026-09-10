import { z } from "zod";
import {
  membershipRewardCapsSchema,
  membershipRewardRuleListSchema
} from "../domain/shop-membership-reward-rule";

const safeNonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const safePositiveInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const paginationShape = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const shopMembershipCardPlanListQuerySchema = z.object(paginationShape).strict();

export const shopMembershipCardPlanPublicIdParamSchema = z
  .object({ publicId: z.string().trim().uuid() })
  .strict();

const validitySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("never") }).strict(),
  z.object({ mode: z.literal("fixed_days"), days: z.number().int().positive().max(3650) }).strict(),
  z
    .object({
      mode: z.literal("fixed_date"),
      expiresAt: z
        .string()
        .datetime()
        .transform((value) => new Date(value))
    })
    .strict()
]);

const issuanceSchema = z
  .object({
    minInitialPrincipalJpy: safeNonNegativeInt.nullable(),
    maxInitialPrincipalJpy: safeNonNegativeInt.nullable(),
    minInitialUses: safeNonNegativeInt.nullable(),
    maxInitialUses: safeNonNegativeInt.nullable()
  })
  .strict();

export const shopMembershipCardPlanDraftBodySchema = z
  .object({
    expectedLockVersion: safeNonNegativeInt,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    cardType: z.enum(["stored_value", "count", "benefit"]),
    validity: validitySchema,
    issuance: issuanceSchema,
    caps: membershipRewardCapsSchema,
    rules: membershipRewardRuleListSchema
  })
  .strict();

export const shopMembershipCardPlanPreviewBodySchema = z
  .object({
    eligibleAmountJpy: safeNonNegativeInt,
    servicePublicId: z.string().uuid(),
    categoryCode: z.string().trim().min(1).max(100),
    scheduledAt: z.string().datetime(),
    completedCountBefore: safeNonNegativeInt,
    lifetimeEligibleSpendJpyBefore: safeNonNegativeInt,
    isFirstCardUse: z.boolean(),
    customerBirthMonth: z.number().int().min(1).max(12).nullable(),
    birthdayRewardsThisYear: safeNonNegativeInt,
    consecutiveEligibleMonths: safeNonNegativeInt,
    rewardedConsecutiveMonthMilestones: z.array(safePositiveInt).max(100),
    alreadyRewardedTodayNdp: safeNonNegativeInt,
    alreadyRewardedMonthNdp: safeNonNegativeInt,
    alreadyRewardedLifetimeNdp: safeNonNegativeInt
  })
  .strict()
  .transform(({ scheduledAt, ...input }) => ({ ...input, occurredAt: scheduledAt }));

export const shopMembershipCardPlanPublishBodySchema = z
  .object({ expectedLockVersion: safeNonNegativeInt })
  .strict();

export const shopMembershipCardPlanRetireBodySchema = z.object({}).strict().default({});

export const membershipRewardFeePolicyListQuerySchema = z.object(paginationShape).strict();

export const membershipRewardFeePolicyCreateBodySchema = z
  .object({
    feeRateBps: z.number().int().min(0).max(10_000),
    expectedVersion: safeNonNegativeInt,
    effectiveFrom: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();

export type ShopMembershipCardPlanDraftBody = z.output<
  typeof shopMembershipCardPlanDraftBodySchema
>;
export type ShopMembershipCardPlanPreviewBody = z.output<
  typeof shopMembershipCardPlanPreviewBodySchema
>;
export type ShopMembershipCardPlanPublishBody = z.output<
  typeof shopMembershipCardPlanPublishBodySchema
>;
export type MembershipRewardFeePolicyCreateBody = z.output<
  typeof membershipRewardFeePolicyCreateBodySchema
>;
