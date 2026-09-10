import type { PlatformMembershipTierCodeValue } from "./platform-membership";

export type PlatformMembershipBillingCycle = "monthly" | "annual";
export const PLATFORM_MEMBERSHIP_ENTITLEMENT_SOURCES = [
  "purchase",
  "operations",
  "offline_transfer",
  "internal",
  "migration"
] as const;
export type PlatformMembershipEntitlementSourceValue =
  (typeof PLATFORM_MEMBERSHIP_ENTITLEMENT_SOURCES)[number];
export type PlatformMembershipEntitlementChangeKind =
  | "grant"
  | "renew"
  | "upgrade"
  | "schedule_downgrade"
  | "expire";
export type PlatformMembershipEntitlementStoredChangeKind =
  | "grant"
  | "renew"
  | "upgrade"
  | "downgrade";

interface PlatformMembershipEntitlementCommandBase {
  source: PlatformMembershipEntitlementSourceValue;
  sourceReference: string;
}

export type PlatformMembershipEntitlementCommand =
  | (PlatformMembershipEntitlementCommandBase & {
      kind: "grant" | "renew" | "upgrade" | "schedule_downgrade";
      targetTierCode: PlatformMembershipTierCodeValue;
      billingCycle: PlatformMembershipBillingCycle;
      expectedCurrentLockVersion: number | null;
    })
  | (PlatformMembershipEntitlementCommandBase & {
      kind: "expire";
      expectedCurrentLockVersion: number;
    });

export interface PlatformMembershipEntitlementChangeResult {
  kind: PlatformMembershipEntitlementChangeKind;
  tierCode: PlatformMembershipTierCodeValue;
  tierVersionPublicId: string;
  entitlementPublicId: string | null;
  startsAt: Date;
  expiresAt: Date | null;
  experienceValueNdp: number;
  idempotent: boolean;
}

export interface PlatformMembershipEntitlementPlanningCurrent {
  entitlementId: number;
  entitlementPublicId: string;
  tierCode: PlatformMembershipTierCodeValue;
  monthlyValueNdp: number;
  startsAt: Date;
  expiresAt: Date | null;
  lockVersion: number;
}

export interface PlatformMembershipEntitlementPlanningTier {
  tierCode: PlatformMembershipTierCodeValue;
  tierVersionId: number;
  tierVersionPublicId: string;
  monthlyValueNdp: number;
  annualBillingMonths: number;
  durationDays: number | null;
}

export type PlatformMembershipEntitlementPlanningCommand =
  | {
      kind: "grant" | "renew" | "upgrade" | "schedule_downgrade";
      billingCycle: PlatformMembershipBillingCycle;
      expectedCurrentLockVersion: number | null;
    }
  | {
      kind: "expire";
      expectedCurrentLockVersion: number;
    };

export interface PlatformMembershipEntitlementChangePlan {
  billingMonths: number;
  experienceValueNdp: number;
  currentUpdate: {
    entitlementId: number;
    expectedLockVersion: number;
    supersededAt: Date | null;
    expiresAt: Date | null;
  } | null;
  create: {
    tierVersionId: number;
    startsAt: Date;
    expiresAt: Date;
    billingMonths: number;
    experienceValueNdp: number;
    changeKind: PlatformMembershipEntitlementStoredChangeKind;
  } | null;
}

const tierRank: Readonly<Record<PlatformMembershipTierCodeValue, number>> = {
  free: 0,
  silver: 1,
  gold: 2,
  black_diamond: 3
};

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);

const addUtcMonthsClamped = (value: Date, months: number): Date => {
  const result = new Date(value.getTime());
  const targetDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDay));
  return result;
};

const requirePaidTier = (
  tier: PlatformMembershipEntitlementPlanningTier
): { durationDays: number } => {
  if (
    tier.tierCode === "free" ||
    !Number.isInteger(tier.durationDays) ||
    (tier.durationDays ?? 0) <= 0
  ) {
    throw new RangeError("paid platform membership tier is required");
  }
  return { durationDays: tier.durationDays as number };
};

const expirationFor = (
  startsAt: Date,
  billingCycle: PlatformMembershipBillingCycle,
  tier: PlatformMembershipEntitlementPlanningTier
): Date =>
  billingCycle === "annual"
    ? addUtcMonthsClamped(startsAt, 12)
    : addDays(startsAt, requirePaidTier(tier).durationDays);

export const planPlatformMembershipEntitlementChange = (input: {
  occurredAt: Date;
  current: PlatformMembershipEntitlementPlanningCurrent | null;
  target: PlatformMembershipEntitlementPlanningTier;
  command: PlatformMembershipEntitlementPlanningCommand;
}): PlatformMembershipEntitlementChangePlan => {
  const { command, current, occurredAt, target } = input;
  if (command.kind === "grant") {
    if (current || command.expectedCurrentLockVersion !== null) {
      throw new RangeError("grant requires no active paid entitlement");
    }
    requirePaidTier(target);
    const billingMonths = command.billingCycle === "annual" ? 12 : 1;
    const experienceValueNdp =
      command.billingCycle === "annual"
        ? target.monthlyValueNdp * target.annualBillingMonths
        : target.monthlyValueNdp;
    return {
      billingMonths,
      experienceValueNdp,
      currentUpdate: null,
      create: {
        tierVersionId: target.tierVersionId,
        startsAt: occurredAt,
        expiresAt: expirationFor(occurredAt, command.billingCycle, target),
        billingMonths,
        experienceValueNdp,
        changeKind: "grant"
      }
    };
  }

  if (!current || command.expectedCurrentLockVersion !== current.lockVersion) {
    throw new RangeError("active entitlement lock does not match");
  }

  if (command.kind === "expire") {
    if (target.tierCode !== "free") throw new RangeError("expiry requires free fallback");
    return {
      billingMonths: 1,
      experienceValueNdp: 0,
      currentUpdate: {
        entitlementId: current.entitlementId,
        expectedLockVersion: current.lockVersion,
        supersededAt: occurredAt,
        expiresAt: occurredAt
      },
      create: null
    };
  }

  requirePaidTier(target);
  const billingMonths = command.billingCycle === "annual" ? 12 : 1;
  if (command.kind === "renew") {
    if (target.tierCode !== current.tierCode || !current.expiresAt) {
      throw new RangeError("renewal requires the current paid tier and expiry");
    }
    const experienceValueNdp =
      command.billingCycle === "annual"
        ? target.monthlyValueNdp * target.annualBillingMonths
        : target.monthlyValueNdp;
    return {
      billingMonths,
      experienceValueNdp,
      currentUpdate: {
        entitlementId: current.entitlementId,
        expectedLockVersion: current.lockVersion,
        supersededAt: null,
        expiresAt: current.expiresAt
      },
      create: {
        tierVersionId: target.tierVersionId,
        startsAt: current.expiresAt,
        expiresAt: expirationFor(current.expiresAt, command.billingCycle, target),
        billingMonths,
        experienceValueNdp,
        changeKind: "renew"
      }
    };
  }

  if (command.kind === "upgrade") {
    if (tierRank[target.tierCode] <= tierRank[current.tierCode]) {
      throw new RangeError("upgrade target must be higher than the current tier");
    }
    const experienceValueNdp = Math.max(target.monthlyValueNdp - current.monthlyValueNdp, 0);
    return {
      billingMonths,
      experienceValueNdp,
      currentUpdate: {
        entitlementId: current.entitlementId,
        expectedLockVersion: current.lockVersion,
        supersededAt: occurredAt,
        expiresAt: occurredAt
      },
      create: {
        tierVersionId: target.tierVersionId,
        startsAt: occurredAt,
        expiresAt:
          current.expiresAt && current.expiresAt > occurredAt
            ? current.expiresAt
            : expirationFor(occurredAt, command.billingCycle, target),
        billingMonths,
        experienceValueNdp,
        changeKind: "upgrade"
      }
    };
  }

  if (
    command.kind !== "schedule_downgrade" ||
    tierRank[target.tierCode] >= tierRank[current.tierCode] ||
    !current.expiresAt ||
    current.expiresAt <= occurredAt
  ) {
    throw new RangeError("downgrade requires a lower tier and future current expiry");
  }
  return {
    billingMonths,
    experienceValueNdp: 0,
    currentUpdate: {
      entitlementId: current.entitlementId,
      expectedLockVersion: current.lockVersion,
      supersededAt: null,
      expiresAt: current.expiresAt
    },
    create: {
      tierVersionId: target.tierVersionId,
      startsAt: current.expiresAt,
      expiresAt: expirationFor(current.expiresAt, command.billingCycle, target),
      billingMonths,
      experienceValueNdp: 0,
      changeKind: "downgrade"
    }
  };
};
