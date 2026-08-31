import { z } from "zod";

export const platformMembershipTierCodeSchema = z.enum([
  "free",
  "silver",
  "gold",
  "black_diamond"
]);
export const platformMembershipBenefitCodeSchema = z.enum([
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift"
]);

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const platformMembershipThemeSchema = z
  .object({
    detailAccentColor: hexColorSchema,
    detailSurfaceColor: hexColorSchema,
    detailItemSurfaceColor: hexColorSchema,
    detailOuterBorderColor: hexColorSchema,
    detailItemBorderColor: hexColorSchema,
    detailAvatarBorderColor: hexColorSchema,
    simpleTopColor: hexColorSchema,
    simpleBottomColor: hexColorSchema
  })
  .strict();

const emptyConfigurationSchema = z.object({}).strict();
const ndpExperienceConfigurationSchema = z
  .object({
    extraThresholdNdp: z.number().int().positive().nullable(),
    extraAwardExpUnits: z.number().int().positive().nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.extraThresholdNdp === null) !== (value.extraAwardExpUnits === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NDP bonus threshold and award must both be set or both be null"
      });
    }
  });

const ordinaryBenefitCodes = platformMembershipBenefitCodeSchema.exclude([
  "ndp_experience"
]);
const tierBenefitSchema = z.union([
  z
    .object({
      code: z.literal("ndp_experience"),
      isEnabled: z.boolean(),
      configuration: ndpExperienceConfigurationSchema
    })
    .strict(),
  z
    .object({
      code: ordinaryBenefitCodes,
      isEnabled: z.boolean(),
      configuration: emptyConfigurationSchema
    })
    .strict()
]);

export const platformMembershipTierParamSchema = z.object({
  tierCode: platformMembershipTierCodeSchema
});
export const platformMembershipBenefitParamSchema = z.object({
  benefitCode: platformMembershipBenefitCodeSchema
});
export const platformMembershipUserParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const platformMembershipTierDraftBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedLockVersion: z.number().int().positive(),
    durationDays: z.number().int().positive().max(3_650).nullable(),
    monthlyValueNdp: z.number().int().min(0).max(214_748_364),
    annualBillingMonths: z.number().int().min(0).max(12),
    experienceMultiplier: z.number().positive().max(100),
    description: z.string().trim().max(500).nullable(),
    theme: platformMembershipThemeSchema,
    benefits: z.array(tierBenefitSchema).length(7)
  })
  .strict();

export const platformMembershipTierPublishBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedLockVersion: z.number().int().positive()
  })
  .strict();

export const platformMembershipBenefitUpdateBodySchema = z
  .object({
    isGloballyEnabled: z.boolean(),
    expectedLockVersion: z.number().int().positive()
  })
  .strict();

const entitlementSourceSchema = z.enum(["operations", "offline_transfer", "internal"]);
const entitlementBase = {
  source: entitlementSourceSchema,
  sourceReference: z.string().trim().min(1).max(160)
};
const paidEntitlementBase = {
  ...entitlementBase,
  targetTierCode: platformMembershipTierCodeSchema.exclude(["free"]),
  billingCycle: z.enum(["monthly", "annual"])
};

export const platformMembershipEntitlementCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("grant"),
      ...paidEntitlementBase,
      expectedCurrentLockVersion: z.null()
    })
    .strict(),
  z
    .object({
      kind: z.enum(["renew", "upgrade", "schedule_downgrade"]),
      ...paidEntitlementBase,
      expectedCurrentLockVersion: z.number().int().positive()
    })
    .strict(),
  z
    .object({
      kind: z.literal("expire"),
      ...entitlementBase,
      expectedCurrentLockVersion: z.number().int().positive()
    })
    .strict()
]);

export type PlatformMembershipTierDraftBody = z.infer<
  typeof platformMembershipTierDraftBodySchema
>;
export type PlatformMembershipBenefitUpdateBody = z.infer<
  typeof platformMembershipBenefitUpdateBodySchema
>;
