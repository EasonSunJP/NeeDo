import { z } from "zod";

const safeNonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const safePositiveInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const bpsSchema = z.number().int().min(0).max(10_000);
const uuidListSchema = z.array(z.string().uuid()).max(100).transform((values) => [...new Set(values)]);

const emptyScope = {
  servicePublicIds: [],
  categoryPublicIds: [],
  excludedServicePublicIds: [],
  excludedCategoryPublicIds: [],
  activeFrom: null,
  activeTo: null
};

export const membershipRewardScopeSchema = z
  .object({
    servicePublicIds: uuidListSchema.default([]),
    categoryPublicIds: uuidListSchema.default([]),
    excludedServicePublicIds: uuidListSchema.default([]),
    excludedCategoryPublicIds: uuidListSchema.default([]),
    activeFrom: z.string().datetime().nullable().default(null),
    activeTo: z.string().datetime().nullable().default(null)
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.activeFrom && scope.activeTo && new Date(scope.activeFrom) >= new Date(scope.activeTo)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "activeFrom must be before activeTo" });
    }
  });

const scopeField = { scope: membershipRewardScopeSchema.default(emptyScope) };

const fixedPerCompletionSchema = z.object({
  kind: z.literal("fixed_per_completion"),
  rewardNdp: safeNonNegativeInt,
  ...scopeField
}).strict();

const percentOfEligibleAmountSchema = z.object({
  kind: z.literal("percent_of_eligible_amount"),
  rewardRateBps: bpsSchema,
  ...scopeField
}).strict();

const spendBlockSchema = z.object({
  kind: z.literal("spend_block"),
  blockAmountJpy: safePositiveInt,
  rewardNdpPerBlock: safeNonNegativeInt,
  ...scopeField
}).strict();

const firstCardUseBonusSchema = z.object({
  kind: z.literal("first_card_use_bonus"),
  rewardNdp: safeNonNegativeInt,
  ...scopeField
}).strict();

const serviceScopeBonusSchema = z.object({
  kind: z.literal("service_scope_bonus"),
  rewardNdp: safeNonNegativeInt.nullable().optional(),
  rewardRateBps: bpsSchema.nullable().optional(),
  ...scopeField
}).strict();

const completionMilestoneBonusSchema = z.object({
  kind: z.literal("completion_milestone_bonus"),
  everyCompletions: safePositiveInt,
  rewardNdp: safeNonNegativeInt,
  repeat: z.boolean(),
  ...scopeField
}).strict();

const spendMilestoneBonusSchema = z.object({
  kind: z.literal("spend_milestone_bonus"),
  thresholdJpy: safePositiveInt,
  rewardNdp: safeNonNegativeInt,
  repeat: z.boolean(),
  ...scopeField
}).strict();

const birthdayMonthBonusSchema = z.object({
  kind: z.literal("birthday_month_bonus"),
  rewardNdp: safeNonNegativeInt,
  annualLimit: z.number().int().min(1).max(12),
  ...scopeField
}).strict();

const scheduleWindowBonusSchema = z.object({
  kind: z.literal("schedule_window_bonus"),
  rewardNdp: safeNonNegativeInt,
  timezone: z.literal("Asia/Tokyo"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((values) => [...new Set(values)]),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  ...scopeField
}).strict();

const consecutiveMonthBonusSchema = z.object({
  kind: z.literal("consecutive_month_bonus"),
  consecutiveMonths: z.number().int().min(2).max(60),
  rewardNdp: safeNonNegativeInt,
  ...scopeField
}).strict();

const rawMembershipRewardRuleSchema = z.discriminatedUnion("kind", [
  fixedPerCompletionSchema,
  percentOfEligibleAmountSchema,
  spendBlockSchema,
  firstCardUseBonusSchema,
  serviceScopeBonusSchema,
  completionMilestoneBonusSchema,
  spendMilestoneBonusSchema,
  birthdayMonthBonusSchema,
  scheduleWindowBonusSchema,
  consecutiveMonthBonusSchema
]);

export const membershipRewardRuleSchema = rawMembershipRewardRuleSchema.superRefine((rule, context) => {
  if (rule.kind !== "service_scope_bonus") return;
  const hasFixed = typeof rule.rewardNdp === "number" && rule.rewardNdp > 0;
  const hasRate = typeof rule.rewardRateBps === "number" && rule.rewardRateBps > 0;
  if (hasFixed === hasRate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "service_scope_bonus requires exactly one positive reward output"
    });
  }
});

const baseKinds = new Set([
  "fixed_per_completion",
  "percent_of_eligible_amount",
  "spend_block"
]);

export const membershipRewardRuleListSchema = z.array(membershipRewardRuleSchema).min(1).max(21).superRefine(
  (rules, context) => {
    const baseCount = rules.filter((rule) => baseKinds.has(rule.kind)).length;
    if (baseCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one base reward rule is required"
      });
    }
    if (rules.length - baseCount > 20) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "at most 20 bonus rules are allowed" });
    }
  }
);

export const membershipRewardCapsSchema = z.object({
  perOrderNdp: safeNonNegativeInt.nullable().default(null),
  perDayNdp: safeNonNegativeInt.nullable().default(null),
  perMonthNdp: safeNonNegativeInt.nullable().default(null),
  lifetimeNdp: safeNonNegativeInt.nullable().default(null)
}).strict();

export type MembershipRewardRuleInput = z.infer<typeof membershipRewardRuleSchema>;
export type MembershipRewardCaps = z.infer<typeof membershipRewardCapsSchema>;

export interface MembershipRewardPreviewFacts {
  eligibleAmountJpy: number;
  servicePublicId: string;
  categoryPublicId: string;
  occurredAt: string;
  completedCountBefore: number;
  lifetimeEligibleSpendJpyBefore: number;
  isFirstCardUse: boolean;
  customerBirthMonth: number | null;
  birthdayRewardsThisYear: number;
  consecutiveEligibleMonths: number;
  rewardedConsecutiveMonthMilestones: number[];
  alreadyRewardedTodayNdp: number;
  alreadyRewardedMonthNdp: number;
  alreadyRewardedLifetimeNdp: number;
}

export interface MembershipRewardRuleHit {
  ruleIndex: number;
  kind: MembershipRewardRuleInput["kind"];
  basis: Record<string, string | number | boolean | null>;
  rewardNdp: number;
}

export interface MembershipRewardPreviewResult {
  hits: MembershipRewardRuleHit[];
  rawCustomerRewardNdp: number;
  customerRewardNdp: number;
  platformFeeRateBps: number;
  platformFeeNdp: number;
  totalShopDebitNdp: number;
  capped: boolean;
}

const factsSchema = z.object({
  eligibleAmountJpy: safeNonNegativeInt,
  servicePublicId: z.string().uuid(),
  categoryPublicId: z.string().uuid(),
  occurredAt: z.string().datetime(),
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
}).strict();

function checkedNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("error.shop_membership_card_plan.amount_out_of_range");
  }
  return Number(value);
}

function multiplyFloor(left: number, right: number, divisor = 1): number {
  return checkedNumber((BigInt(left) * BigInt(right)) / BigInt(divisor));
}

function multiplyCeil(left: number, right: number, divisor: number): number {
  const numerator = BigInt(left) * BigInt(right);
  return checkedNumber((numerator + BigInt(divisor - 1)) / BigInt(divisor));
}

function scopeMatches(rule: MembershipRewardRuleInput, facts: MembershipRewardPreviewFacts): boolean {
  const { scope } = rule;
  if (scope.excludedServicePublicIds.includes(facts.servicePublicId)) return false;
  if (scope.excludedCategoryPublicIds.includes(facts.categoryPublicId)) return false;
  const hasInclusions = scope.servicePublicIds.length > 0 || scope.categoryPublicIds.length > 0;
  if (
    hasInclusions &&
    !scope.servicePublicIds.includes(facts.servicePublicId) &&
    !scope.categoryPublicIds.includes(facts.categoryPublicId)
  ) return false;
  const occurredAt = new Date(facts.occurredAt).getTime();
  if (scope.activeFrom && occurredAt < new Date(scope.activeFrom).getTime()) return false;
  if (scope.activeTo && occurredAt >= new Date(scope.activeTo).getTime()) return false;
  return true;
}

function localScheduleParts(occurredAt: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(occurredAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday ?? "");
  return { day, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function ruleReward(rule: MembershipRewardRuleInput, facts: MembershipRewardPreviewFacts): { reward: number; basis: MembershipRewardRuleHit["basis"] } {
  switch (rule.kind) {
    case "fixed_per_completion":
      return { reward: rule.rewardNdp, basis: { rewardNdp: rule.rewardNdp } };
    case "percent_of_eligible_amount":
      return {
        reward: multiplyFloor(facts.eligibleAmountJpy, rule.rewardRateBps, 10_000),
        basis: { eligibleAmountJpy: facts.eligibleAmountJpy, rewardRateBps: rule.rewardRateBps }
      };
    case "spend_block": {
      const blocks = Math.floor(facts.eligibleAmountJpy / rule.blockAmountJpy);
      return {
        reward: multiplyFloor(blocks, rule.rewardNdpPerBlock),
        basis: { eligibleAmountJpy: facts.eligibleAmountJpy, blockAmountJpy: rule.blockAmountJpy, blocks }
      };
    }
    case "first_card_use_bonus":
      return facts.isFirstCardUse && facts.completedCountBefore === 0
        ? { reward: rule.rewardNdp, basis: { firstCardUse: true } }
        : { reward: 0, basis: { firstCardUse: false } };
    case "service_scope_bonus":
      return typeof rule.rewardNdp === "number" && rule.rewardNdp > 0
        ? { reward: rule.rewardNdp, basis: { rewardNdp: rule.rewardNdp } }
        : {
            reward: multiplyFloor(facts.eligibleAmountJpy, rule.rewardRateBps ?? 0, 10_000),
            basis: { eligibleAmountJpy: facts.eligibleAmountJpy, rewardRateBps: rule.rewardRateBps ?? 0 }
          };
    case "completion_milestone_bonus": {
      const completedAfter = facts.completedCountBefore + 1;
      const hitCount = rule.repeat
        ? completedAfter % rule.everyCompletions === 0 ? 1 : 0
        : completedAfter === rule.everyCompletions ? 1 : 0;
      return {
        reward: multiplyFloor(hitCount, rule.rewardNdp),
        basis: { completedAfter, everyCompletions: rule.everyCompletions, repeat: rule.repeat }
      };
    }
    case "spend_milestone_bonus": {
      const spendAfter = checkedNumber(BigInt(facts.lifetimeEligibleSpendJpyBefore) + BigInt(facts.eligibleAmountJpy));
      const hits = rule.repeat
        ? Math.floor(spendAfter / rule.thresholdJpy) - Math.floor(facts.lifetimeEligibleSpendJpyBefore / rule.thresholdJpy)
        : facts.lifetimeEligibleSpendJpyBefore < rule.thresholdJpy && spendAfter >= rule.thresholdJpy ? 1 : 0;
      return {
        reward: multiplyFloor(hits, rule.rewardNdp),
        basis: { spendAfter, thresholdJpy: rule.thresholdJpy, repeat: rule.repeat }
      };
    }
    case "birthday_month_bonus": {
      const japanMonth = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "numeric" }).format(new Date(facts.occurredAt)));
      const eligible = facts.customerBirthMonth === japanMonth && facts.birthdayRewardsThisYear < rule.annualLimit;
      return { reward: eligible ? rule.rewardNdp : 0, basis: { japanMonth, eligible } };
    }
    case "schedule_window_bonus": {
      const local = localScheduleParts(facts.occurredAt);
      const start = timeToMinutes(rule.startTime);
      const end = timeToMinutes(rule.endTime);
      const inTime = start <= end
        ? local.minutes >= start && local.minutes <= end
        : local.minutes >= start || local.minutes <= end;
      const eligible = rule.daysOfWeek.includes(local.day) && inTime;
      return { reward: eligible ? rule.rewardNdp : 0, basis: { localDay: local.day, localMinutes: local.minutes, eligible } };
    }
    case "consecutive_month_bonus": {
      const alreadyRewarded = facts.rewardedConsecutiveMonthMilestones.includes(rule.consecutiveMonths);
      const eligible = facts.consecutiveEligibleMonths >= rule.consecutiveMonths && !alreadyRewarded;
      return { reward: eligible ? rule.rewardNdp : 0, basis: { consecutiveMonths: facts.consecutiveEligibleMonths, alreadyRewarded } };
    }
  }
}

function remainingCap(cap: number | null, alreadyRewarded = 0): number {
  return cap === null ? Number.MAX_SAFE_INTEGER : Math.max(0, cap - alreadyRewarded);
}

export function evaluateMembershipRewardRules(input: {
  rules: unknown;
  caps?: unknown;
  facts: MembershipRewardPreviewFacts;
  platformFeeRateBps: number;
}): MembershipRewardPreviewResult {
  const rules = membershipRewardRuleListSchema.parse(input.rules);
  const caps = membershipRewardCapsSchema.parse(input.caps ?? {});
  const facts = factsSchema.parse(input.facts);
  const platformFeeRateBps = bpsSchema.parse(input.platformFeeRateBps);
  const rawHits = rules.flatMap((rule, ruleIndex) => {
    if (!scopeMatches(rule, facts)) return [];
    const result = ruleReward(rule, facts);
    return result.reward > 0 ? [{ ruleIndex, kind: rule.kind, basis: result.basis, rewardNdp: result.reward }] : [];
  });
  const rawCustomerRewardNdp = checkedNumber(
    rawHits.reduce((total, hit) => total + BigInt(hit.rewardNdp), 0n)
  );
  const cap = Math.min(
    remainingCap(caps.perOrderNdp),
    remainingCap(caps.perDayNdp, facts.alreadyRewardedTodayNdp),
    remainingCap(caps.perMonthNdp, facts.alreadyRewardedMonthNdp),
    remainingCap(caps.lifetimeNdp, facts.alreadyRewardedLifetimeNdp)
  );
  const customerRewardNdp = Math.min(rawCustomerRewardNdp, cap);
  let remainingReward = customerRewardNdp;
  const hits = rawHits.map((hit) => {
    const rewardNdp = Math.min(hit.rewardNdp, remainingReward);
    remainingReward -= rewardNdp;
    return { ...hit, rewardNdp };
  });
  const platformFeeNdp = customerRewardNdp === 0
    ? 0
    : multiplyCeil(customerRewardNdp, platformFeeRateBps, 10_000);
  const totalShopDebitNdp = checkedNumber(BigInt(customerRewardNdp) + BigInt(platformFeeNdp));
  return {
    hits,
    rawCustomerRewardNdp,
    customerRewardNdp,
    platformFeeRateBps,
    platformFeeNdp,
    totalShopDebitNdp,
    capped: customerRewardNdp !== rawCustomerRewardNdp
  };
}

export function summarizeMembershipRewardRule(ruleInput: unknown): string {
  const rule = membershipRewardRuleSchema.parse(ruleInput);
  switch (rule.kind) {
    case "fixed_per_completion": return `${rule.rewardNdp} NDP / completion`;
    case "percent_of_eligible_amount": return `${rule.rewardRateBps} bps of eligible amount`;
    case "spend_block": return `${rule.rewardNdpPerBlock} NDP / ${rule.blockAmountJpy} JPY`;
    case "first_card_use_bonus": return `${rule.rewardNdp} NDP first-use bonus`;
    case "service_scope_bonus": return rule.rewardNdp ? `${rule.rewardNdp} NDP service bonus` : `${rule.rewardRateBps ?? 0} bps service bonus`;
    case "completion_milestone_bonus": return `${rule.rewardNdp} NDP every ${rule.everyCompletions} completions`;
    case "spend_milestone_bonus": return `${rule.rewardNdp} NDP at ${rule.thresholdJpy} JPY`;
    case "birthday_month_bonus": return `${rule.rewardNdp} NDP birthday-month bonus`;
    case "schedule_window_bonus": return `${rule.rewardNdp} NDP schedule bonus`;
    case "consecutive_month_bonus": return `${rule.rewardNdp} NDP at ${rule.consecutiveMonths} consecutive months`;
  }
}
