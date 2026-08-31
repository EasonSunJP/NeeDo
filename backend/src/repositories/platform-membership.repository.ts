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
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";

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

export interface PlatformMembershipTierBenefitDraft {
  code: PlatformMembershipBenefitCodeValue;
  isEnabled: boolean;
  configuration: Record<string, unknown>;
}

export interface PlatformMembershipTierDraftPersistenceInput {
  expectedVersion: number;
  expectedLockVersion: number;
  durationDays: number | null;
  monthlyValueNdp: number;
  annualBillingMonths: number;
  experienceMultiplier: number;
  description: string | null;
  theme: PlatformMembershipTheme;
  benefits: PlatformMembershipTierBenefitDraft[];
}

export interface PlatformMembershipTierVersionPayload {
  tierCode: PlatformMembershipTierCodeValue;
  tierVersionPublicId: string;
  version: number;
  status: "draft" | "published" | "archived";
  lockVersion: number;
  durationDays: number | null;
  monthlyValueNdp: number;
  annualBillingMonths: number;
  experienceMultiplier: number;
  description: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedAt: Date | null;
  theme: PlatformMembershipTheme;
  benefits: PlatformMembershipTierBenefitDraft[];
}

export type PlatformMembershipTierMutationResult =
  | {
      kind: "saved" | "published";
      value: PlatformMembershipTierVersionPayload;
    }
  | { kind: "not_found" | "version_conflict" | "invalid_state" };

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
  findTierDraft: (
    tierCode: PlatformMembershipTierCodeValue
  ) => Promise<PlatformMembershipTierVersionPayload | null>;
  saveTierDraftWithAudit: (input: {
    actorId: number;
    tierCode: PlatformMembershipTierCodeValue;
    draft: PlatformMembershipTierDraftPersistenceInput;
    audit: AuditLogCreateInput;
  }) => Promise<PlatformMembershipTierMutationResult>;
  publishTierDraftWithAudit: (input: {
    actorId: number;
    tierCode: PlatformMembershipTierCodeValue;
    expectedVersion: number;
    expectedLockVersion: number;
    audit: AuditLogCreateInput;
  }) => Promise<PlatformMembershipTierMutationResult>;
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

const tierVersionAdministrationSelect =
  Prisma.validator<Prisma.PlatformMembershipTierVersionSelect>()({
    publicId: true,
    version: true,
    status: true,
    lockVersion: true,
    durationDays: true,
    monthlyValueNdp: true,
    annualBillingMonths: true,
    experienceMultiplier: true,
    description: true,
    effectiveFrom: true,
    effectiveTo: true,
    publishedAt: true,
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
      where: { deletedAt: null, benefit: { deletedAt: null } },
      orderBy: [{ benefit: { sortOrder: "asc" } }, { id: "asc" }],
      select: {
        isEnabled: true,
        configurationJson: true,
        benefit: { select: { code: true } }
      }
    }
  });

type TierVersionAdministrationRecord =
  Prisma.PlatformMembershipTierVersionGetPayload<{
    select: typeof tierVersionAdministrationSelect;
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

const versionStatusFromDb = {
  [PlatformMembershipVersionStatus.DRAFT]: "draft",
  [PlatformMembershipVersionStatus.PUBLISHED]: "published",
  [PlatformMembershipVersionStatus.ARCHIVED]: "archived"
} as const;

export class PlatformMembershipRepository implements PlatformMembershipRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now: () => Date = () => new Date()
  ) {}

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

  public async findTierDraft(
    tierCode: PlatformMembershipTierCodeValue
  ): Promise<PlatformMembershipTierVersionPayload | null> {
    const draft = await this.client.platformMembershipTierVersion.findFirst({
      where: {
        status: PlatformMembershipVersionStatus.DRAFT,
        deletedAt: null,
        tier: { code: tierCodeToDb[tierCode], deletedAt: null }
      },
      orderBy: { version: "desc" },
      select: tierVersionAdministrationSelect
    });
    return draft ? this.mapAdministrationVersion(draft) : null;
  }

  public async saveTierDraftWithAudit(input: {
    actorId: number;
    tierCode: PlatformMembershipTierCodeValue;
    draft: PlatformMembershipTierDraftPersistenceInput;
    audit: AuditLogCreateInput;
  }): Promise<PlatformMembershipTierMutationResult> {
    const occurredAt = this.now();
    const result = await this.client.$transaction(async (transaction) => {
      const tier = await transaction.platformMembershipTier.findFirst({
        where: { code: tierCodeToDb[input.tierCode], deletedAt: null },
        select: { id: true, publicId: true }
      });
      if (!tier) return { kind: "not_found" as const };

      const latest = await transaction.platformMembershipTierVersion.findFirst({
        where: { tierId: tier.id, deletedAt: null },
        orderBy: { version: "desc" },
        select: { id: true, version: true, status: true, lockVersion: true }
      });
      if (!latest) return { kind: "invalid_state" as const };
      if (
        latest.version !== input.draft.expectedVersion ||
        latest.lockVersion !== input.draft.expectedLockVersion
      ) {
        return { kind: "version_conflict" as const };
      }

      const benefitCatalog = await transaction.platformMembershipBenefit.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true }
      });
      if (benefitCatalog.length !== input.draft.benefits.length) {
        return { kind: "invalid_state" as const };
      }
      const benefitIdByCode = new Map(
        benefitCatalog.map((benefit) => [benefitCodeFromDb[benefit.code], benefit.id])
      );
      if (input.draft.benefits.some((benefit) => !benefitIdByCode.has(benefit.code))) {
        return { kind: "invalid_state" as const };
      }

      let draftId: number;
      let draftVersion: number;
      if (latest.status === PlatformMembershipVersionStatus.DRAFT) {
        const updated = await transaction.platformMembershipTierVersion.updateMany({
          where: {
            id: latest.id,
            status: PlatformMembershipVersionStatus.DRAFT,
            lockVersion: input.draft.expectedLockVersion,
            deletedAt: null
          },
          data: {
            ...this.versionMutableData(input.draft),
            lockVersion: { increment: 1 }
          }
        });
        if (updated.count !== 1) return { kind: "version_conflict" as const };
        draftId = latest.id;
        draftVersion = latest.version;
      } else {
        const created = await transaction.platformMembershipTierVersion.create({
          data: {
            tierId: tier.id,
            version: latest.version + 1,
            status: PlatformMembershipVersionStatus.DRAFT,
            ...this.versionMutableData(input.draft),
            effectiveFrom: occurredAt,
            createdById: input.actorId
          },
          select: { id: true, version: true }
        });
        draftId = created.id;
        draftVersion = created.version;
      }

      for (const benefit of input.draft.benefits) {
        const benefitId = benefitIdByCode.get(benefit.code)!;
        const updated = await transaction.platformMembershipTierBenefit.updateMany({
          where: { tierVersionId: draftId, benefitId },
          data: {
            isEnabled: benefit.isEnabled,
            configurationJson: benefit.configuration as Prisma.InputJsonObject,
            deletedAt: null
          }
        });
        if (updated.count === 0) {
          await transaction.platformMembershipTierBenefit.create({
            data: {
              tierVersionId: draftId,
              benefitId,
              isEnabled: benefit.isEnabled,
              configurationJson: benefit.configuration as Prisma.InputJsonObject
            }
          });
        }
      }

      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: tier.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            tierPublicId: tier.publicId,
            tierCode: input.tierCode,
            version: draftVersion
          }
        })
      });
      return { kind: "saved" as const };
    }).catch((error: unknown) => {
      if (this.isUniqueConstraintError(error)) return { kind: "version_conflict" as const };
      throw error;
    });

    if (result.kind !== "saved") return result;
    const value = await this.findTierDraft(input.tierCode);
    return value ? { kind: "saved", value } : { kind: "invalid_state" };
  }

  public async publishTierDraftWithAudit(input: {
    actorId: number;
    tierCode: PlatformMembershipTierCodeValue;
    expectedVersion: number;
    expectedLockVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<PlatformMembershipTierMutationResult> {
    const publishedAt = this.now();
    const result = await this.client.$transaction(async (transaction) => {
      const tier = await transaction.platformMembershipTier.findFirst({
        where: { code: tierCodeToDb[input.tierCode], deletedAt: null },
        select: { id: true, publicId: true }
      });
      if (!tier) return { kind: "not_found" as const };

      const draft = await transaction.platformMembershipTierVersion.findFirst({
        where: {
          tierId: tier.id,
          status: PlatformMembershipVersionStatus.DRAFT,
          deletedAt: null
        },
        orderBy: { version: "desc" },
        select: { id: true, publicId: true, version: true, lockVersion: true }
      });
      if (!draft) return { kind: "invalid_state" as const };
      if (
        draft.version !== input.expectedVersion ||
        draft.lockVersion !== input.expectedLockVersion
      ) {
        return { kind: "version_conflict" as const };
      }

      const published = await transaction.platformMembershipTierVersion.updateMany({
        where: {
          id: draft.id,
          status: PlatformMembershipVersionStatus.DRAFT,
          lockVersion: input.expectedLockVersion,
          deletedAt: null
        },
        data: {
          status: PlatformMembershipVersionStatus.PUBLISHED,
          effectiveFrom: publishedAt,
          effectiveTo: null,
          publishedAt,
          publishedById: input.actorId,
          lockVersion: { increment: 1 }
        }
      });
      if (published.count !== 1) return { kind: "version_conflict" as const };
      await transaction.platformMembershipTierVersion.updateMany({
        where: {
          tierId: tier.id,
          id: { not: draft.id },
          status: PlatformMembershipVersionStatus.PUBLISHED,
          deletedAt: null
        },
        data: {
          status: PlatformMembershipVersionStatus.ARCHIVED,
          effectiveTo: publishedAt
        }
      });

      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: tier.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            tierPublicId: tier.publicId,
            tierVersionPublicId: draft.publicId,
            tierCode: input.tierCode,
            version: draft.version
          }
        })
      });
      return { kind: "published" as const };
    });

    if (result.kind !== "published") return result;
    const value = await this.findTierVersion(input.tierCode, input.expectedVersion);
    return value ? { kind: "published", value } : { kind: "invalid_state" };
  }

  private async findTierVersion(
    tierCode: PlatformMembershipTierCodeValue,
    version: number
  ): Promise<PlatformMembershipTierVersionPayload | null> {
    const record = await this.client.platformMembershipTierVersion.findFirst({
      where: {
        version,
        deletedAt: null,
        tier: { code: tierCodeToDb[tierCode], deletedAt: null }
      },
      select: tierVersionAdministrationSelect
    });
    return record ? this.mapAdministrationVersion(record) : null;
  }

  private versionMutableData(input: PlatformMembershipTierDraftPersistenceInput) {
    return {
      durationDays: input.durationDays,
      monthlyValueNdp: input.monthlyValueNdp,
      annualBillingMonths: input.annualBillingMonths,
      experienceMultiplier: input.experienceMultiplier,
      description: input.description,
      detailAccentColor: input.theme.detailAccentColor,
      detailSurfaceColor: input.theme.detailSurfaceColor,
      detailItemSurfaceColor: input.theme.detailItemSurfaceColor,
      detailOuterBorderColor: input.theme.detailOuterBorderColor,
      detailItemBorderColor: input.theme.detailItemBorderColor,
      detailAvatarBorderColor: input.theme.detailAvatarBorderColor,
      simpleTopColor: input.theme.simpleTopColor,
      simpleBottomColor: input.theme.simpleBottomColor
    };
  }

  private mapAdministrationVersion(
    version: TierVersionAdministrationRecord
  ): PlatformMembershipTierVersionPayload {
    return {
      tierCode: tierCodeFromDb[version.tier.code],
      tierVersionPublicId: version.publicId,
      version: version.version,
      status: versionStatusFromDb[version.status],
      lockVersion: version.lockVersion,
      durationDays: version.durationDays,
      monthlyValueNdp: version.monthlyValueNdp,
      annualBillingMonths: version.annualBillingMonths,
      experienceMultiplier: Number(version.experienceMultiplier),
      description: version.description,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      publishedAt: version.publishedAt,
      theme: {
        detailAccentColor: version.detailAccentColor,
        detailSurfaceColor: version.detailSurfaceColor,
        detailItemSurfaceColor: version.detailItemSurfaceColor,
        detailOuterBorderColor: version.detailOuterBorderColor,
        detailItemBorderColor: version.detailItemBorderColor,
        detailAvatarBorderColor: version.detailAvatarBorderColor,
        simpleTopColor: version.simpleTopColor,
        simpleBottomColor: version.simpleBottomColor
      },
      benefits: version.benefits.map((item) => ({
        code: benefitCodeFromDb[item.benefit.code],
        isEnabled: item.isEnabled,
        configuration: this.configurationObject(item.configurationJson)
      }))
    };
  }

  private configurationObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new Error("platform membership benefit configuration must be an object");
  }

  private metadataObject(metadata: unknown): Record<string, unknown> {
    return metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
    );
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
