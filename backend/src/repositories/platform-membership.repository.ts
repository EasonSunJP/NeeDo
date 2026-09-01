import {
  PlatformMembershipBenefitCode,
  PlatformMembershipEntitlementChangeKind,
  PlatformMembershipEntitlementSource,
  PlatformMembershipTierCode,
  PlatformMembershipVersionStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import {
  planPlatformMembershipEntitlementChange,
  type PlatformMembershipEntitlementChangeResult,
  type PlatformMembershipEntitlementCommand,
  type PlatformMembershipEntitlementSourceValue,
  type PlatformMembershipEntitlementStoredChangeKind
} from "../domain/platform-membership-entitlement";
import type {
  PlatformMembershipBenefitCodeValue,
  PlatformMembershipTheme,
  PlatformMembershipTierCodeValue
} from "../domain/platform-membership";
import type { MembershipRenewalExperienceSource } from "../domain/user-experience";
import { prisma } from "../prisma/client";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";

export interface ResolvedPlatformMembershipBenefit {
  code: PlatformMembershipBenefitCodeValue;
  configuration: unknown;
  tierBenefitId?: number;
  tierBenefitPublicId?: string;
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

export interface PlatformMembershipTierAdministrationPayload {
  tierCode: PlatformMembershipTierCodeValue;
  sortOrder: number;
  publishedVersion: PlatformMembershipTierVersionPayload | null;
  draftVersion: PlatformMembershipTierVersionPayload | null;
}

export interface PlatformMembershipBenefitAdministrationPayload {
  code: PlatformMembershipBenefitCodeValue;
  sortOrder: number;
  isGloballyEnabled: boolean;
  lockVersion: number;
}

export type PlatformMembershipTierMutationResult =
  | {
      kind: "saved" | "published";
      value: PlatformMembershipTierVersionPayload;
    }
  | { kind: "not_found" | "version_conflict" | "invalid_state" };

export type PlatformMembershipEntitlementMutationResult =
  | {
      kind: "changed" | "idempotent";
      value: PlatformMembershipEntitlementChangeResult;
    }
  | { kind: "not_found" | "version_conflict" | "invalid_state" };

export type PlatformMembershipBenefitMutationResult =
  | { kind: "updated"; value: PlatformMembershipBenefitAdministrationPayload }
  | { kind: "not_found" | "version_conflict" };

export interface PlatformMembershipRepositoryPort {
  listTiersForAdministration: () => Promise<PlatformMembershipTierAdministrationPayload[]>;
  listBenefitsForAdministration: () => Promise<PlatformMembershipBenefitAdministrationPayload[]>;
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
  changeEntitlementWithAudit: (input: {
    actorId: number;
    userId: number;
    occurredAt: Date;
    command: PlatformMembershipEntitlementCommand;
    audit: AuditLogCreateInput;
    onEntitlementCreated?: (
      source: MembershipRenewalExperienceSource & { transactionClient: unknown }
    ) => Promise<void>;
  }) => Promise<PlatformMembershipEntitlementMutationResult>;
  updateBenefitWithAudit: (input: {
    actorId: number;
    benefitCode: PlatformMembershipBenefitCodeValue;
    isGloballyEnabled: boolean;
    expectedLockVersion: number;
    audit: AuditLogCreateInput;
  }) => Promise<PlatformMembershipBenefitMutationResult>;
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
      id: true,
      publicId: true,
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

const entitlementResultSelect =
  Prisma.validator<Prisma.PlatformMembershipEntitlementSelect>()({
    id: true,
    publicId: true,
    changeKind: true,
    startsAt: true,
    expiresAt: true,
    experienceValueNdp: true,
    tierVersion: {
      select: {
        publicId: true,
        tier: { select: { code: true } }
      }
    }
  });

type EntitlementResultRecord =
  Prisma.PlatformMembershipEntitlementGetPayload<{
    select: typeof entitlementResultSelect;
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

const benefitCodeToDb: Readonly<
  Record<PlatformMembershipBenefitCodeValue, PlatformMembershipBenefitCode>
> = {
  ndp_experience: PlatformMembershipBenefitCode.NDP_EXPERIENCE,
  member_sign_in: PlatformMembershipBenefitCode.MEMBER_SIGN_IN,
  priority_request: PlatformMembershipBenefitCode.PRIORITY_REQUEST,
  support_service: PlatformMembershipBenefitCode.SUPPORT_SERVICE,
  exclusive_discount: PlatformMembershipBenefitCode.EXCLUSIVE_DISCOUNT,
  member_day: PlatformMembershipBenefitCode.MEMBER_DAY,
  birthday_gift: PlatformMembershipBenefitCode.BIRTHDAY_GIFT
};

const versionStatusFromDb = {
  [PlatformMembershipVersionStatus.DRAFT]: "draft",
  [PlatformMembershipVersionStatus.PUBLISHED]: "published",
  [PlatformMembershipVersionStatus.ARCHIVED]: "archived"
} as const;

const entitlementSourceToDb: Readonly<
  Record<PlatformMembershipEntitlementSourceValue, PlatformMembershipEntitlementSource>
> = {
  purchase: PlatformMembershipEntitlementSource.PURCHASE,
  operations: PlatformMembershipEntitlementSource.OPERATIONS,
  offline_transfer: PlatformMembershipEntitlementSource.OFFLINE_TRANSFER,
  internal: PlatformMembershipEntitlementSource.INTERNAL,
  migration: PlatformMembershipEntitlementSource.MIGRATION
};

const entitlementChangeKindToDb: Readonly<
  Record<PlatformMembershipEntitlementStoredChangeKind, PlatformMembershipEntitlementChangeKind>
> = {
  grant: PlatformMembershipEntitlementChangeKind.GRANT,
  renew: PlatformMembershipEntitlementChangeKind.RENEW,
  upgrade: PlatformMembershipEntitlementChangeKind.UPGRADE,
  downgrade: PlatformMembershipEntitlementChangeKind.DOWNGRADE
};

const entitlementChangeKindFromDb = {
  [PlatformMembershipEntitlementChangeKind.GRANT]: "grant",
  [PlatformMembershipEntitlementChangeKind.RENEW]: "renew",
  [PlatformMembershipEntitlementChangeKind.UPGRADE]: "upgrade",
  [PlatformMembershipEntitlementChangeKind.DOWNGRADE]: "schedule_downgrade"
} as const;

const entitlementVersionConflict = Symbol("platform-membership-entitlement-version-conflict");

export class PlatformMembershipRepository implements PlatformMembershipRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listTiersForAdministration(): Promise<
    PlatformMembershipTierAdministrationPayload[]
  > {
    const tiers = await this.client.platformMembershipTier.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        code: true,
        sortOrder: true,
        versions: {
          where: {
            status: {
              in: [
                PlatformMembershipVersionStatus.DRAFT,
                PlatformMembershipVersionStatus.PUBLISHED
              ]
            },
            deletedAt: null
          },
          orderBy: [{ version: "desc" }, { id: "desc" }],
          select: tierVersionAdministrationSelect
        }
      }
    });
    return tiers.map((tier) => {
      const published = tier.versions.find(
        (version) => version.status === PlatformMembershipVersionStatus.PUBLISHED
      );
      const draft = tier.versions.find(
        (version) => version.status === PlatformMembershipVersionStatus.DRAFT
      );
      return {
        tierCode: tierCodeFromDb[tier.code],
        sortOrder: tier.sortOrder,
        publishedVersion: published ? this.mapAdministrationVersion(published) : null,
        draftVersion: draft ? this.mapAdministrationVersion(draft) : null
      };
    });
  }

  public async listBenefitsForAdministration(): Promise<
    PlatformMembershipBenefitAdministrationPayload[]
  > {
    const benefits = await this.client.platformMembershipBenefit.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        code: true,
        sortOrder: true,
        isGloballyEnabled: true,
        lockVersion: true
      }
    });
    return benefits.map((benefit) => this.mapBenefitAdministration(benefit));
  }

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
          status: {
            in: [
              PlatformMembershipVersionStatus.PUBLISHED,
              PlatformMembershipVersionStatus.ARCHIVED
            ]
          },
          deletedAt: null,
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

  public async changeEntitlementWithAudit(input: {
    actorId: number;
    userId: number;
    occurredAt: Date;
    command: PlatformMembershipEntitlementCommand;
    audit: AuditLogCreateInput;
    onEntitlementCreated?: (
      source: MembershipRenewalExperienceSource & { transactionClient: unknown }
    ) => Promise<void>;
  }): Promise<PlatformMembershipEntitlementMutationResult> {
    const source = entitlementSourceToDb[input.command.source];
    const execute = async () =>
      this.client.$transaction(async (transaction) => {
        const existing = await transaction.platformMembershipEntitlement.findFirst({
          where: {
            userId: input.userId,
            source,
            sourceReference: input.command.sourceReference,
            deletedAt: null
          },
          select: entitlementResultSelect
        });
        if (existing) {
          return {
            kind: "idempotent" as const,
            value: this.mapEntitlementResult(existing, true)
          };
        }

        const customer = await transaction.customerProfile.findFirst({
          where: { userId: input.userId, deletedAt: null },
          select: { id: true, platformMembershipLockVersion: true }
        });
        if (!customer) return { kind: "not_found" as const };

        const future = await transaction.platformMembershipEntitlement.findFirst({
          where: {
            userId: input.userId,
            deletedAt: null,
            supersededAt: null,
            startsAt: { gt: input.occurredAt },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.occurredAt } }]
          },
          select: { id: true }
        });
        if (future) return { kind: "invalid_state" as const };

        const current = await transaction.platformMembershipEntitlement.findFirst({
          where: {
            userId: input.userId,
            deletedAt: null,
            supersededAt: null,
            startsAt: { lte: input.occurredAt },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.occurredAt } }],
            tierVersion: {
              status: {
                in: [
                  PlatformMembershipVersionStatus.PUBLISHED,
                  PlatformMembershipVersionStatus.ARCHIVED
                ]
              },
              deletedAt: null,
              tier: { deletedAt: null }
            }
          },
          orderBy: [{ startsAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            publicId: true,
            startsAt: true,
            expiresAt: true,
            lockVersion: true,
            tierVersion: {
              select: {
                monthlyValueNdp: true,
                tier: { select: { code: true } }
              }
            }
          }
        });

        const targetTierCode =
          input.command.kind === "expire" ? "free" : input.command.targetTierCode;
        const target = await transaction.platformMembershipTierVersion.findFirst({
          where: {
            status: PlatformMembershipVersionStatus.PUBLISHED,
            deletedAt: null,
            effectiveFrom: { lte: input.occurredAt },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.occurredAt } }],
            tier: { code: tierCodeToDb[targetTierCode], deletedAt: null }
          },
          orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
          select: {
            id: true,
            publicId: true,
            monthlyValueNdp: true,
            annualBillingMonths: true,
            durationDays: true,
            experienceMultiplier: true,
            benefits: {
              where: {
                isEnabled: true,
                deletedAt: null,
                benefit: { isGloballyEnabled: true, deletedAt: null }
              },
              select: { benefit: { select: { code: true } } }
            },
            tier: { select: { code: true } }
          }
        });
        if (!target) return { kind: "not_found" as const };

        let plan;
        try {
          plan = planPlatformMembershipEntitlementChange({
            occurredAt: input.occurredAt,
            current: current
              ? {
                  entitlementId: current.id,
                  entitlementPublicId: current.publicId,
                  tierCode: tierCodeFromDb[current.tierVersion.tier.code],
                  monthlyValueNdp: current.tierVersion.monthlyValueNdp,
                  startsAt: current.startsAt,
                  expiresAt: current.expiresAt,
                  lockVersion: current.lockVersion
                }
              : null,
            target: {
              tierCode: tierCodeFromDb[target.tier.code],
              tierVersionId: target.id,
              tierVersionPublicId: target.publicId,
              monthlyValueNdp: target.monthlyValueNdp,
              annualBillingMonths: target.annualBillingMonths,
              durationDays: target.durationDays
            },
            command:
              input.command.kind === "expire"
                ? {
                    kind: "expire",
                    expectedCurrentLockVersion:
                      input.command.expectedCurrentLockVersion
                  }
                : {
                    kind: input.command.kind,
                    billingCycle: input.command.billingCycle,
                    expectedCurrentLockVersion:
                      input.command.expectedCurrentLockVersion
                  }
          });
        } catch (error: unknown) {
          if (error instanceof RangeError) return { kind: "invalid_state" as const };
          throw error;
        }

        const customerLocked = await transaction.customerProfile.updateMany({
          where: {
            id: customer.id,
            platformMembershipLockVersion: customer.platformMembershipLockVersion,
            deletedAt: null
          },
          data: { platformMembershipLockVersion: { increment: 1 } }
        });
        if (customerLocked.count !== 1) throw entitlementVersionConflict;

        if (plan.currentUpdate) {
          const currentLocked = await transaction.platformMembershipEntitlement.updateMany({
            where: {
              id: plan.currentUpdate.entitlementId,
              lockVersion: plan.currentUpdate.expectedLockVersion,
              deletedAt: null
            },
            data: {
              supersededAt: plan.currentUpdate.supersededAt,
              expiresAt: plan.currentUpdate.expiresAt,
              lockVersion: { increment: 1 }
            }
          });
          if (currentLocked.count !== 1) throw entitlementVersionConflict;
        }

        const created = plan.create
          ? await transaction.platformMembershipEntitlement.create({
              data: {
                userId: input.userId,
                tierVersionId: plan.create.tierVersionId,
                source,
                sourceReference: input.command.sourceReference,
                changeKind: entitlementChangeKindToDb[plan.create.changeKind],
                billingMonths: plan.create.billingMonths,
                experienceValueNdp: plan.create.experienceValueNdp,
                startsAt: plan.create.startsAt,
                expiresAt: plan.create.expiresAt,
                createdById: input.actorId
              },
              select: entitlementResultSelect
            })
          : null;

        if (created && input.onEntitlementCreated) {
          await input.onEntitlementCreated({
            transactionClient: transaction,
            userId: input.userId,
            entitlementId: created.id,
            entitlementPublicId: created.publicId,
            experienceValueNdp: plan.experienceValueNdp,
            tierCode: tierCodeFromDb[target.tier.code],
            tierVersionPublicId: target.publicId,
            multiplier: Number(target.experienceMultiplier),
            benefits: target.benefits.map((benefit) => ({
              code: benefitCodeFromDb[benefit.benefit.code]
            })),
            occurredAt: input.occurredAt
          });
        }

        await transaction.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            targetId: created?.id ?? current?.id ?? null,
            metadata: {
              ...this.metadataObject(input.audit.metadata),
              userId: input.userId,
              commandKind: input.command.kind,
              source: input.command.source,
              sourceReference: input.command.sourceReference,
              tierCode: targetTierCode,
              tierVersionPublicId: target.publicId,
              entitlementPublicId: created?.publicId ?? current?.publicId ?? null,
              startsAt: created?.startsAt.toISOString() ?? input.occurredAt.toISOString(),
              expiresAt: created?.expiresAt?.toISOString() ?? null,
              experienceValueNdp: plan.experienceValueNdp
            }
          })
        });

        const value = created
          ? this.mapEntitlementResult(created, false)
          : {
              kind: "expire" as const,
              tierCode: "free" as const,
              tierVersionPublicId: target.publicId,
              entitlementPublicId: null,
              startsAt: input.occurredAt,
              expiresAt: null,
              experienceValueNdp: 0,
              idempotent: false
            };
        return { kind: "changed" as const, value };
      });

    try {
      return await execute();
    } catch (error: unknown) {
      if (error === entitlementVersionConflict) {
        return { kind: "version_conflict" };
      }
      if (!this.isUniqueConstraintError(error)) throw error;
      const existing = await this.findEntitlementBySource(
        input.userId,
        source,
        input.command.sourceReference
      );
      return existing
        ? { kind: "idempotent", value: this.mapEntitlementResult(existing, true) }
        : { kind: "version_conflict" };
    }
  }

  public async updateBenefitWithAudit(input: {
    actorId: number;
    benefitCode: PlatformMembershipBenefitCodeValue;
    isGloballyEnabled: boolean;
    expectedLockVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<PlatformMembershipBenefitMutationResult> {
    const result = await this.client.$transaction(async (transaction) => {
      const benefit = await transaction.platformMembershipBenefit.findFirst({
        where: { code: benefitCodeToDb[input.benefitCode], deletedAt: null },
        select: { id: true, publicId: true, lockVersion: true }
      });
      if (!benefit) return { kind: "not_found" as const };
      if (benefit.lockVersion !== input.expectedLockVersion) {
        return { kind: "version_conflict" as const };
      }
      const updated = await transaction.platformMembershipBenefit.updateMany({
        where: {
          id: benefit.id,
          lockVersion: input.expectedLockVersion,
          deletedAt: null
        },
        data: {
          isGloballyEnabled: input.isGloballyEnabled,
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) return { kind: "version_conflict" as const };
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: benefit.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            benefitPublicId: benefit.publicId,
            benefitCode: input.benefitCode,
            isGloballyEnabled: input.isGloballyEnabled,
            previousLockVersion: input.expectedLockVersion
          }
        })
      });
      return { kind: "updated" as const };
    });
    if (result.kind !== "updated") return result;
    const value = await this.findBenefit(input.benefitCode);
    return value ? { kind: "updated", value } : { kind: "not_found" };
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

  private async findBenefit(
    benefitCode: PlatformMembershipBenefitCodeValue
  ): Promise<PlatformMembershipBenefitAdministrationPayload | null> {
    const benefit = await this.client.platformMembershipBenefit.findFirst({
      where: { code: benefitCodeToDb[benefitCode], deletedAt: null },
      select: {
        code: true,
        sortOrder: true,
        isGloballyEnabled: true,
        lockVersion: true
      }
    });
    return benefit ? this.mapBenefitAdministration(benefit) : null;
  }

  private async findEntitlementBySource(
    userId: number,
    source: PlatformMembershipEntitlementSource,
    sourceReference: string
  ): Promise<EntitlementResultRecord | null> {
    return this.client.platformMembershipEntitlement.findFirst({
      where: { userId, source, sourceReference, deletedAt: null },
      select: entitlementResultSelect
    });
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

  private mapEntitlementResult(
    entitlement: EntitlementResultRecord,
    idempotent: boolean
  ): PlatformMembershipEntitlementChangeResult {
    return {
      kind: entitlementChangeKindFromDb[entitlement.changeKind],
      tierCode: tierCodeFromDb[entitlement.tierVersion.tier.code],
      tierVersionPublicId: entitlement.tierVersion.publicId,
      entitlementPublicId: entitlement.publicId,
      startsAt: entitlement.startsAt,
      expiresAt: entitlement.expiresAt,
      experienceValueNdp: entitlement.experienceValueNdp,
      idempotent
    };
  }

  private mapBenefitAdministration(benefit: {
    code: PlatformMembershipBenefitCode;
    sortOrder: number;
    isGloballyEnabled: boolean;
    lockVersion: number;
  }): PlatformMembershipBenefitAdministrationPayload {
    return {
      code: benefitCodeFromDb[benefit.code],
      sortOrder: benefit.sortOrder,
      isGloballyEnabled: benefit.isGloballyEnabled,
      lockVersion: benefit.lockVersion
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
        configuration: item.configurationJson,
        tierBenefitId: item.id,
        tierBenefitPublicId: item.publicId
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
