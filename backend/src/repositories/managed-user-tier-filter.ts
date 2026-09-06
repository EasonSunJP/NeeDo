import { PlatformMembershipTierCode, Prisma } from "@prisma/client";

const PAID_PLATFORM_TIER_CODES = [
  PlatformMembershipTierCode.SILVER,
  PlatformMembershipTierCode.GOLD,
  PlatformMembershipTierCode.BLACK_DIAMOND
];

export function buildManagedUserTierWhere(
  tierCode: "free" | "silver" | "gold" | "black_diamond",
  occurredAt: Date
): Prisma.UserWhereInput {
  const activeEntitlement = activeEntitlementWhere(occurredAt);
  const activeTierAdjustment = {
    deletedAt: null,
    supersededAt: null,
    effectiveFrom: { lte: occurredAt },
    tierVersionId: { not: null }
  } satisfies Prisma.UserMembershipAdjustmentWhereInput;
  if (tierCode === "free") {
    return {
      customerProfile: { is: { deletedAt: null } },
      OR: [
        {
          membershipAdjustments: {
            some: {
              ...activeTierAdjustment,
              tierVersion: { tier: { code: PlatformMembershipTierCode.FREE } }
            }
          }
        },
        {
          membershipAdjustments: { none: activeTierAdjustment },
          platformMembershipEntitlements: {
            none: {
              ...activeEntitlement,
              tierVersion: {
                ...activeTierVersionWhere(occurredAt),
                tier: { code: { in: PAID_PLATFORM_TIER_CODES }, deletedAt: null }
              }
            }
          }
        }
      ]
    };
  }
  const dbTierCode =
    tierCode === "silver"
      ? PlatformMembershipTierCode.SILVER
      : tierCode === "gold"
        ? PlatformMembershipTierCode.GOLD
        : PlatformMembershipTierCode.BLACK_DIAMOND;
  return {
    customerProfile: { is: { deletedAt: null } },
    OR: [
      {
        membershipAdjustments: {
          some: {
            ...activeTierAdjustment,
            tierVersion: { tier: { code: dbTierCode, deletedAt: null } }
          }
        }
      },
      {
        membershipAdjustments: { none: activeTierAdjustment },
        platformMembershipEntitlements: {
          some: {
            ...activeEntitlement,
            tierVersion: {
              ...activeTierVersionWhere(occurredAt),
              tier: { code: dbTierCode, deletedAt: null }
            }
          }
        }
      }
    ]
  };
}

function activeEntitlementWhere(occurredAt: Date): Prisma.PlatformMembershipEntitlementWhereInput {
  return {
    deletedAt: null,
    supersededAt: null,
    startsAt: { lte: occurredAt },
    OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }]
  };
}

function activeTierVersionWhere(occurredAt: Date): Prisma.PlatformMembershipTierVersionWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    effectiveFrom: { lte: occurredAt },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }]
  };
}
