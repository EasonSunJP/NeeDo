import {
  PlatformMembershipBenefitCode,
  PlatformMembershipTierCode,
  PlatformMembershipVersionStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type {
  PlatformMembershipBenefitCodeValue,
  PlatformMembershipTheme,
  PlatformMembershipTierCodeValue
} from "../domain/platform-membership";
import { prisma } from "../prisma/client";

export interface ResolvedPlatformMembershipBenefit {
  code: PlatformMembershipBenefitCodeValue;
  configuration: unknown;
}

export interface ResolvedPlatformMembership {
  tierCode: PlatformMembershipTierCodeValue;
  tierVersionPublicId: string;
  multiplier: number;
  expiresAt: Date | null;
  benefits: ResolvedPlatformMembershipBenefit[];
  theme: PlatformMembershipTheme;
}

export interface PlatformMembershipRepositoryPort {
  hasActiveCustomerProfile: (userId: number) => Promise<boolean>;
  findActiveEntitlementAt: (
    userId: number,
    occurredAt: Date
  ) => Promise<ResolvedPlatformMembership | null>;
  findPublishedTierAt: (
    tierCode: PlatformMembershipTierCodeValue,
    occurredAt: Date
  ) => Promise<ResolvedPlatformMembership | null>;
}

const tierVersionSelect = Prisma.validator<Prisma.PlatformMembershipTierVersionSelect>()({
  publicId: true,
  experienceMultiplier: true,
  detailAccentColor: true,
  detailSurfaceColor: true,
  detailItemSurfaceColor: true,
  detailOuterBorderColor: true,
  detailItemBorderColor: true,
  detailAvatarBorderColor: true,
  simpleTopColor: true,
  simpleBottomColor: true,
  tier: { select: { code: true } },
  benefits: {
    where: {
      isEnabled: true,
      deletedAt: null,
      benefit: { isGloballyEnabled: true, deletedAt: null }
    },
    orderBy: [{ benefit: { sortOrder: "asc" } }, { id: "asc" }],
    select: {
      configurationJson: true,
      benefit: { select: { code: true } }
    }
  }
});

type TierVersionRecord = Prisma.PlatformMembershipTierVersionGetPayload<{
  select: typeof tierVersionSelect;
}>;

const tierCodeToDb: Readonly<
  Record<PlatformMembershipTierCodeValue, PlatformMembershipTierCode>
> = {
  free: PlatformMembershipTierCode.FREE,
  silver: PlatformMembershipTierCode.SILVER,
  gold: PlatformMembershipTierCode.GOLD,
  black_diamond: PlatformMembershipTierCode.BLACK_DIAMOND
};

const tierCodeFromDb: Readonly<
  Record<PlatformMembershipTierCode, PlatformMembershipTierCodeValue>
> = {
  [PlatformMembershipTierCode.FREE]: "free",
  [PlatformMembershipTierCode.SILVER]: "silver",
  [PlatformMembershipTierCode.GOLD]: "gold",
  [PlatformMembershipTierCode.BLACK_DIAMOND]: "black_diamond"
};

const benefitCodeFromDb: Readonly<
  Record<PlatformMembershipBenefitCode, PlatformMembershipBenefitCodeValue>
> = {
  [PlatformMembershipBenefitCode.NDP_EXPERIENCE]: "ndp_experience",
  [PlatformMembershipBenefitCode.MEMBER_SIGN_IN]: "member_sign_in",
  [PlatformMembershipBenefitCode.PRIORITY_REQUEST]: "priority_request",
  [PlatformMembershipBenefitCode.SUPPORT_SERVICE]: "support_service",
  [PlatformMembershipBenefitCode.EXCLUSIVE_DISCOUNT]: "exclusive_discount",
  [PlatformMembershipBenefitCode.MEMBER_DAY]: "member_day",
  [PlatformMembershipBenefitCode.BIRTHDAY_GIFT]: "birthday_gift"
};

export class PlatformMembershipRepository implements PlatformMembershipRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async hasActiveCustomerProfile(userId: number): Promise<boolean> {
    return (
      (await this.client.customerProfile.count({ where: { userId, deletedAt: null } })) > 0
    );
  }

  public async findActiveEntitlementAt(
    userId: number,
    occurredAt: Date
  ): Promise<ResolvedPlatformMembership | null> {
    const entitlement = await this.client.platformMembershipEntitlement.findFirst({
      where: {
        userId,
        deletedAt: null,
        startsAt: { lte: occurredAt },
        supersededAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }],
        tierVersion: {
          status: PlatformMembershipVersionStatus.PUBLISHED,
          deletedAt: null,
          effectiveFrom: { lte: occurredAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
          tier: { deletedAt: null }
        }
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      select: {
        expiresAt: true,
        tierVersion: { select: tierVersionSelect }
      }
    });

    return entitlement
      ? this.mapVersion(entitlement.tierVersion, entitlement.expiresAt)
      : null;
  }

  public async findPublishedTierAt(
    tierCode: PlatformMembershipTierCodeValue,
    occurredAt: Date
  ): Promise<ResolvedPlatformMembership | null> {
    const version = await this.client.platformMembershipTierVersion.findFirst({
      where: {
        status: PlatformMembershipVersionStatus.PUBLISHED,
        deletedAt: null,
        effectiveFrom: { lte: occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
        tier: { code: tierCodeToDb[tierCode], deletedAt: null }
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: tierVersionSelect
    });

    return version ? this.mapVersion(version, null) : null;
  }

  private mapVersion(
    version: TierVersionRecord,
    expiresAt: Date | null
  ): ResolvedPlatformMembership {
    return {
      tierCode: tierCodeFromDb[version.tier.code],
      tierVersionPublicId: version.publicId,
      multiplier: Number(version.experienceMultiplier),
      expiresAt,
      benefits: version.benefits.map((item) => ({
        code: benefitCodeFromDb[item.benefit.code],
        configuration: item.configurationJson
      })),
      theme: {
        detailAccentColor: version.detailAccentColor,
        detailSurfaceColor: version.detailSurfaceColor,
        detailItemSurfaceColor: version.detailItemSurfaceColor,
        detailOuterBorderColor: version.detailOuterBorderColor,
        detailItemBorderColor: version.detailItemBorderColor,
        detailAvatarBorderColor: version.detailAvatarBorderColor,
        simpleTopColor: version.simpleTopColor,
        simpleBottomColor: version.simpleBottomColor
      }
    };
  }
}
