import {
  MembershipRewardFeePolicyStatus,
  Prisma,
  ShopMembershipCardPlanStatus,
  ShopMembershipCardPlanValidityMode,
  ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardType,
  ShopMembershipRewardRuleGroup,
  ShopMembershipRewardRuleKind,
  type PrismaClient
} from "@prisma/client";
import {
  membershipRewardCapsSchema,
  membershipRewardRuleSchema,
  type MembershipRewardCaps,
  type MembershipRewardRuleInput
} from "../domain/shop-membership-reward-rule";
import { prisma } from "../prisma/client";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type ShopMembershipCardPlanStatusPayload = "draft" | "active" | "retired";
export type ShopMembershipCardPlanVersionStatusPayload = "draft" | "published" | "retired";
export type ShopMembershipCardTypePayload = "stored_value" | "count" | "benefit";
export type ShopMembershipRewardRuleGroupPayload = "base" | "bonus";

export type ShopMembershipCardPlanRulePayload = MembershipRewardRuleInput & {
  publicId: string;
  ruleGroup: ShopMembershipRewardRuleGroupPayload;
  sortOrder: number;
};

export type ShopMembershipCardPlanValidityPayload =
  | { mode: "never" }
  | { mode: "fixed_days"; days: number }
  | { mode: "fixed_date"; expiresAt: Date };

export interface ShopMembershipCardPlanIssuancePayload {
  minInitialPrincipalJpy: number | null;
  maxInitialPrincipalJpy: number | null;
  minInitialUses: number | null;
  maxInitialUses: number | null;
}

export interface ShopMembershipCardPlanVersionPayload {
  internalId: number;
  publicId: string;
  version: number;
  status: ShopMembershipCardPlanVersionStatusPayload;
  lockVersion: number;
  name: string;
  description: string | null;
  cardType: ShopMembershipCardTypePayload;
  validity: ShopMembershipCardPlanValidityPayload;
  issuance: ShopMembershipCardPlanIssuancePayload;
  caps: MembershipRewardCaps;
  platformFeePolicyPublicId: string | null;
  platformFeeRateBps: number | null;
  publishedAt: Date | null;
  rules: ShopMembershipCardPlanRulePayload[];
}

export interface ShopMembershipCardPlanPayload {
  internalId: number;
  publicId: string;
  status: ShopMembershipCardPlanStatusPayload;
  currentVersion: ShopMembershipCardPlanVersionPayload | null;
  draftVersion: ShopMembershipCardPlanVersionPayload | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopMembershipCardPlanDraftPersistenceInput {
  expectedLockVersion: number;
  name: string;
  description: string | null;
  cardType: ShopMembershipCardTypePayload;
  validity: ShopMembershipCardPlanValidityPayload;
  issuance: ShopMembershipCardPlanIssuancePayload;
  caps: MembershipRewardCaps;
  rules: MembershipRewardRuleInput[];
}

export interface MembershipRewardFeePolicyPayload {
  publicId: string;
  version: number;
  feeRateBps: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: string;
  createdByNeedoId: string | null;
  createdAt: Date;
}

export interface MembershipRewardFeePolicySummaryPayload {
  evaluatedAt: Date;
  current: MembershipRewardFeePolicyPayload | null;
  nextScheduled: MembershipRewardFeePolicyPayload | null;
  latestVersion: number;
}

interface PlanWriteInput {
  actorId: number;
  shopId: number;
  planPublicId: string;
  audit: AuditLogCreateInput;
}

export type PlanMutationResult =
  | { kind: "updated" | "published" | "retired"; value: ShopMembershipCardPlanPayload }
  | { kind: "not_found" | "version_conflict" | "invalid_state" | "fee_policy_conflict" };

export type FeePolicyMutationResult =
  | { kind: "created"; value: MembershipRewardFeePolicyPayload }
  | { kind: "version_conflict" | "policy_conflict" };

export interface ShopMembershipCardPlanRepositoryPort {
  listPlans: (
    shopId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ShopMembershipCardPlanPayload>>;
  findPlan: (shopId: number, publicId: string) => Promise<ShopMembershipCardPlanPayload | null>;
  createPlanWithDraft: (input: {
    actorId: number;
    shopId: number;
    draft: ShopMembershipCardPlanDraftPersistenceInput;
    audit: AuditLogCreateInput;
  }) => Promise<ShopMembershipCardPlanPayload>;
  updateDraftWithAudit: (
    input: PlanWriteInput & { draft: ShopMembershipCardPlanDraftPersistenceInput }
  ) => Promise<PlanMutationResult>;
  publishDraftWithAudit: (
    input: PlanWriteInput & { expectedLockVersion: number }
  ) => Promise<PlanMutationResult>;
  retirePlanWithAudit: (input: PlanWriteInput) => Promise<PlanMutationResult>;
  validateShopRuleReferences: (
    shopId: number,
    servicePublicIds: string[],
    categoryCodes: string[]
  ) => Promise<boolean>;
  getEffectiveFeePolicy: (at: Date) => Promise<MembershipRewardFeePolicyPayload | null>;
  listFeePolicies: (
    input: PaginationInput
  ) => Promise<PaginatedResponse<MembershipRewardFeePolicyPayload>>;
  getFeePolicySummary: (at: Date) => Promise<MembershipRewardFeePolicySummaryPayload>;
  createFeePolicyVersionWithAudit: (input: {
    actorId: number;
    feeRateBps: number;
    expectedVersion: number;
    effectiveFrom: Date;
    reason: string;
    audit: AuditLogCreateInput;
  }) => Promise<FeePolicyMutationResult>;
}

const ruleSelect = Prisma.validator<Prisma.ShopMembershipRewardRuleSelect>()({
  id: true,
  publicId: true,
  kind: true,
  ruleGroup: true,
  config: true,
  sortOrder: true
});

const versionSelect = Prisma.validator<Prisma.ShopMembershipCardPlanVersionSelect>()({
  id: true,
  publicId: true,
  planId: true,
  version: true,
  status: true,
  draftKey: true,
  lockVersion: true,
  name: true,
  description: true,
  cardType: true,
  validityMode: true,
  validityDays: true,
  fixedExpiryAt: true,
  minInitialPrincipalJpy: true,
  maxInitialPrincipalJpy: true,
  minInitialUses: true,
  maxInitialUses: true,
  rewardCaps: true,
  platformFeePolicyId: true,
  platformFeeRateBps: true,
  publishedAt: true,
  platformFeePolicy: { select: { publicId: true } },
  rules: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: ruleSelect
  }
});

const planSelect = Prisma.validator<Prisma.ShopMembershipCardPlanSelect>()({
  id: true,
  publicId: true,
  shopId: true,
  status: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: { select: versionSelect },
  versions: {
    where: { status: ShopMembershipCardPlanVersionStatus.DRAFT, deletedAt: null },
    orderBy: { version: "desc" },
    take: 1,
    select: versionSelect
  }
});

type PlanRecord = Prisma.ShopMembershipCardPlanGetPayload<{ select: typeof planSelect }>;
type VersionRecord = Prisma.ShopMembershipCardPlanVersionGetPayload<{
  select: typeof versionSelect;
}>;

const feePolicySelect = Prisma.validator<Prisma.MembershipRewardFeePolicyVersionSelect>()({
  id: true,
  publicId: true,
  version: true,
  feeRateBps: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  activeKey: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { needoId: true } },
  updatedBy: { select: { needoId: true } }
});

type FeePolicyRecord = Prisma.MembershipRewardFeePolicyVersionGetPayload<{
  select: typeof feePolicySelect;
}>;

const cardTypeToDb = {
  stored_value: ShopMembershipCardType.STORED_VALUE,
  count: ShopMembershipCardType.COUNT,
  benefit: ShopMembershipCardType.BENEFIT
} as const;

const validityModeToDb = {
  never: ShopMembershipCardPlanValidityMode.NEVER,
  fixed_days: ShopMembershipCardPlanValidityMode.FIXED_DAYS,
  fixed_date: ShopMembershipCardPlanValidityMode.FIXED_DATE
} as const;

const ruleKindToDb = {
  fixed_per_completion: ShopMembershipRewardRuleKind.FIXED_PER_COMPLETION,
  percent_of_eligible_amount: ShopMembershipRewardRuleKind.PERCENT_OF_ELIGIBLE_AMOUNT,
  spend_block: ShopMembershipRewardRuleKind.SPEND_BLOCK,
  first_card_use_bonus: ShopMembershipRewardRuleKind.FIRST_CARD_USE_BONUS,
  service_scope_bonus: ShopMembershipRewardRuleKind.SERVICE_SCOPE_BONUS,
  completion_milestone_bonus: ShopMembershipRewardRuleKind.COMPLETION_MILESTONE_BONUS,
  spend_milestone_bonus: ShopMembershipRewardRuleKind.SPEND_MILESTONE_BONUS,
  birthday_month_bonus: ShopMembershipRewardRuleKind.BIRTHDAY_MONTH_BONUS,
  schedule_window_bonus: ShopMembershipRewardRuleKind.SCHEDULE_WINDOW_BONUS,
  consecutive_month_bonus: ShopMembershipRewardRuleKind.CONSECUTIVE_MONTH_BONUS
} as const;

const baseKinds = new Set<MembershipRewardRuleInput["kind"]>([
  "fixed_per_completion",
  "percent_of_eligible_amount",
  "spend_block"
]);

export class ShopMembershipCardPlanRepository implements ShopMembershipCardPlanRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listPlans(
    shopId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ShopMembershipCardPlanPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ShopMembershipCardPlanWhereInput = { shopId, deletedAt: null };
    const [records, total] = await Promise.all([
      this.client.shopMembershipCardPlan.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: planSelect
      }),
      this.client.shopMembershipCardPlan.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapPlan(record)),
      total,
      input
    );
  }

  public async findPlan(
    shopId: number,
    publicId: string
  ): Promise<ShopMembershipCardPlanPayload | null> {
    const record = await this.client.shopMembershipCardPlan.findFirst({
      where: { publicId, shopId, deletedAt: null },
      select: planSelect
    });
    return record ? this.mapPlan(record) : null;
  }

  public async createPlanWithDraft(input: {
    actorId: number;
    shopId: number;
    draft: ShopMembershipCardPlanDraftPersistenceInput;
    audit: AuditLogCreateInput;
  }): Promise<ShopMembershipCardPlanPayload> {
    const created = await this.client.$transaction(async (transaction) => {
      const plan = await transaction.shopMembershipCardPlan.create({
        data: {
          shopId: input.shopId,
          status: ShopMembershipCardPlanStatus.DRAFT,
          createdById: input.actorId,
          updatedById: input.actorId
        },
        select: { id: true, publicId: true }
      });
      const version = await transaction.shopMembershipCardPlanVersion.create({
        data: this.versionCreateData(plan.id, 1, input.draft),
        select: { id: true, publicId: true }
      });
      await transaction.shopMembershipRewardRule.createMany({
        data: this.ruleCreateManyData(version.id, input.draft.rules)
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: plan.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            planPublicId: plan.publicId,
            planVersionPublicId: version.publicId,
            version: 1
          }
        })
      });
      return plan.publicId;
    });
    const result = await this.findPlan(input.shopId, created);
    if (!result) throw new Error("created membership card plan was not readable");
    return result;
  }

  public async updateDraftWithAudit(
    input: PlanWriteInput & { draft: ShopMembershipCardPlanDraftPersistenceInput }
  ): Promise<PlanMutationResult> {
    const result = await this.client.$transaction(async (transaction) => {
      const plan = await transaction.shopMembershipCardPlan.findFirst({
        where: { publicId: input.planPublicId, shopId: input.shopId, deletedAt: null },
        select: planSelect
      });
      if (!plan) return { kind: "not_found" as const };
      if (plan.status === ShopMembershipCardPlanStatus.RETIRED)
        return { kind: "invalid_state" as const };
      let draft = plan.versions[0];
      if (!draft) {
        const nextVersion = (plan.currentVersion?.version ?? 0) + 1;
        draft = await transaction.shopMembershipCardPlanVersion.create({
          data: this.versionCreateData(plan.id, nextVersion, input.draft),
          select: versionSelect
        });
        await transaction.shopMembershipRewardRule.createMany({
          data: this.ruleCreateManyData(draft.id, input.draft.rules)
        });
      } else {
        if (draft.lockVersion !== input.draft.expectedLockVersion)
          return { kind: "version_conflict" as const };
        const updated = await transaction.shopMembershipCardPlanVersion.updateMany({
          where: {
            id: draft.id,
            status: ShopMembershipCardPlanVersionStatus.DRAFT,
            lockVersion: input.draft.expectedLockVersion,
            deletedAt: null
          },
          data: { ...this.versionMutableData(input.draft), lockVersion: { increment: 1 } }
        });
        if (updated.count !== 1) return { kind: "version_conflict" as const };
        const deletedAt = this.now();
        await transaction.shopMembershipRewardRule.updateMany({
          where: { planVersionId: draft.id, deletedAt: null },
          data: { deletedAt }
        });
        await transaction.shopMembershipRewardRule.createMany({
          data: this.ruleCreateManyData(draft.id, input.draft.rules)
        });
      }
      await transaction.shopMembershipCardPlan.update({
        where: { id: plan.id },
        data: { updatedById: input.actorId }
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: plan.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            planPublicId: plan.publicId,
            version: draft.version
          }
        })
      });
      return { kind: "updated" as const };
    });
    if (result.kind !== "updated") return result;
    const value = await this.findPlan(input.shopId, input.planPublicId);
    return value ? { kind: "updated", value } : { kind: "not_found" };
  }

  public async publishDraftWithAudit(
    input: PlanWriteInput & { expectedLockVersion: number }
  ): Promise<PlanMutationResult> {
    const at = this.now();
    const result = await this.client.$transaction(async (transaction) => {
      const plan = await transaction.shopMembershipCardPlan.findFirst({
        where: { publicId: input.planPublicId, shopId: input.shopId, deletedAt: null },
        select: planSelect
      });
      if (!plan) return { kind: "not_found" as const };
      if (plan.status === ShopMembershipCardPlanStatus.RETIRED)
        return { kind: "invalid_state" as const };
      const draft = plan.versions[0];
      if (!draft) return { kind: "invalid_state" as const };
      if (draft.lockVersion !== input.expectedLockVersion)
        return { kind: "version_conflict" as const };
      const feePolicy = await transaction.membershipRewardFeePolicyVersion.findFirst({
        where: {
          deletedAt: null,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        select: feePolicySelect
      });
      if (!feePolicy) return { kind: "fee_policy_conflict" as const };
      const published = await transaction.shopMembershipCardPlanVersion.updateMany({
        where: {
          id: draft.id,
          status: ShopMembershipCardPlanVersionStatus.DRAFT,
          lockVersion: input.expectedLockVersion,
          deletedAt: null
        },
        data: {
          status: ShopMembershipCardPlanVersionStatus.PUBLISHED,
          draftKey: null,
          platformFeePolicyId: feePolicy.id,
          platformFeeRateBps: feePolicy.feeRateBps,
          publishedById: input.actorId,
          publishedAt: at,
          lockVersion: { increment: 1 }
        }
      });
      if (published.count !== 1) return { kind: "version_conflict" as const };
      const planUpdated = await transaction.shopMembershipCardPlan.updateMany({
        where: { id: plan.id, shopId: input.shopId, deletedAt: null },
        data: {
          status: ShopMembershipCardPlanStatus.ACTIVE,
          currentVersionId: draft.id,
          updatedById: input.actorId
        }
      });
      if (planUpdated.count !== 1) return { kind: "version_conflict" as const };
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: plan.id,
          metadata: {
            ...this.metadataObject(input.audit.metadata),
            planPublicId: plan.publicId,
            planVersionPublicId: draft.publicId,
            version: draft.version,
            platformFeePolicyPublicId: feePolicy.publicId,
            platformFeeRateBps: feePolicy.feeRateBps
          }
        })
      });
      return { kind: "published" as const };
    });
    if (result.kind !== "published") return result;
    const value = await this.findPlan(input.shopId, input.planPublicId);
    return value ? { kind: "published", value } : { kind: "not_found" };
  }

  public async retirePlanWithAudit(input: PlanWriteInput): Promise<PlanMutationResult> {
    const result = await this.client.$transaction(async (transaction) => {
      const plan = await transaction.shopMembershipCardPlan.findFirst({
        where: { publicId: input.planPublicId, shopId: input.shopId, deletedAt: null },
        select: { id: true, publicId: true, status: true, currentVersionId: true }
      });
      if (!plan) return { kind: "not_found" as const };
      if (plan.status === ShopMembershipCardPlanStatus.RETIRED)
        return { kind: "invalid_state" as const };
      await transaction.shopMembershipCardPlan.update({
        where: { id: plan.id },
        data: { status: ShopMembershipCardPlanStatus.RETIRED, updatedById: input.actorId }
      });
      if (plan.currentVersionId)
        await transaction.shopMembershipCardPlanVersion.update({
          where: { id: plan.currentVersionId },
          data: { status: ShopMembershipCardPlanVersionStatus.RETIRED }
        });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: plan.id,
          metadata: { ...this.metadataObject(input.audit.metadata), planPublicId: plan.publicId }
        })
      });
      return { kind: "retired" as const };
    });
    if (result.kind !== "retired") return result;
    const value = await this.findPlan(input.shopId, input.planPublicId);
    return value ? { kind: "retired", value } : { kind: "not_found" };
  }

  public async validateShopRuleReferences(
    shopId: number,
    servicePublicIds: string[],
    categoryCodes: string[]
  ): Promise<boolean> {
    const [serviceCount, categoryCount] = await Promise.all([
      servicePublicIds.length === 0
        ? 0
        : this.client.service.count({
            where: { shopId, publicId: { in: servicePublicIds }, deletedAt: null }
          }),
      categoryCodes.length === 0
        ? 0
        : this.client.category.count({
            where: {
              code: { in: categoryCodes },
              deletedAt: null,
              services: { some: { shopId, deletedAt: null } }
            }
          })
    ]);
    return serviceCount === servicePublicIds.length && categoryCount === categoryCodes.length;
  }

  public async getEffectiveFeePolicy(at: Date): Promise<MembershipRewardFeePolicyPayload | null> {
    const record = await this.client.membershipRewardFeePolicyVersion.findFirst({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: feePolicySelect
    });
    return record ? this.mapFeePolicy(record) : null;
  }

  public async listFeePolicies(
    input: PaginationInput
  ): Promise<PaginatedResponse<MembershipRewardFeePolicyPayload>> {
    const pagination = toPrismaPagination(input);
    const where = { deletedAt: null } as const;
    const [records, total] = await Promise.all([
      this.client.membershipRewardFeePolicyVersion.findMany({
        where,
        orderBy: [{ version: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: feePolicySelect
      }),
      this.client.membershipRewardFeePolicyVersion.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapFeePolicy(record)),
      total,
      input
    );
  }

  public async getFeePolicySummary(at: Date): Promise<MembershipRewardFeePolicySummaryPayload> {
    const [current, next, latest] = await Promise.all([
      this.client.membershipRewardFeePolicyVersion.findFirst({
        where: {
          deletedAt: null,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        select: feePolicySelect
      }),
      this.client.membershipRewardFeePolicyVersion.findFirst({
        where: { deletedAt: null, effectiveFrom: { gt: at } },
        orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }],
        select: feePolicySelect
      }),
      this.client.membershipRewardFeePolicyVersion.findFirst({
        where: { deletedAt: null },
        orderBy: { version: "desc" },
        select: { version: true }
      })
    ]);
    return {
      evaluatedAt: at,
      current: current ? this.mapFeePolicy(current) : null,
      nextScheduled: next ? this.mapFeePolicy(next) : null,
      latestVersion: latest?.version ?? 0
    };
  }

  public async createFeePolicyVersionWithAudit(input: {
    actorId: number;
    feeRateBps: number;
    expectedVersion: number;
    effectiveFrom: Date;
    reason: string;
    audit: AuditLogCreateInput;
  }): Promise<FeePolicyMutationResult> {
    const now = this.now();
    try {
      return await this.client.$transaction(async (transaction) => {
        const latest = await transaction.membershipRewardFeePolicyVersion.findFirst({
          where: { deletedAt: null },
          orderBy: { version: "desc" },
          select: feePolicySelect
        });
        if ((latest?.version ?? 0) !== input.expectedVersion)
          return { kind: "version_conflict" as const };
        const current = await transaction.membershipRewardFeePolicyVersion.findFirst({
          where: {
            deletedAt: null,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
          },
          orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
          select: feePolicySelect
        });
        if (current && current.effectiveFrom >= input.effectiveFrom)
          return { kind: "policy_conflict" as const };
        if (current) {
          await transaction.membershipRewardFeePolicyVersion.updateMany({
            where: { id: current.id, version: current.version, deletedAt: null },
            data: {
              activeKey: null,
              effectiveTo: input.effectiveFrom,
              status:
                input.effectiveFrom <= now
                  ? MembershipRewardFeePolicyStatus.SUPERSEDED
                  : MembershipRewardFeePolicyStatus.ACTIVE,
              updatedById: input.actorId
            }
          });
        }
        const created = await transaction.membershipRewardFeePolicyVersion.create({
          data: {
            version: input.expectedVersion + 1,
            feeRateBps: input.feeRateBps,
            status: MembershipRewardFeePolicyStatus.ACTIVE,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            activeKey: input.effectiveFrom <= now ? "membership_reward" : null,
            reason: input.reason,
            createdById: input.actorId,
            updatedById: input.actorId
          },
          select: feePolicySelect
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            targetId: created.id,
            metadata: {
              ...this.metadataObject(input.audit.metadata),
              previous: current
                ? { feeRateBps: current.feeRateBps, version: current.version }
                : null,
              next: { feeRateBps: created.feeRateBps, version: created.version },
              effectiveFrom: created.effectiveFrom.toISOString(),
              reason: created.reason
            }
          })
        });
        return { kind: "created" as const, value: this.mapFeePolicy(created) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return { kind: "version_conflict" };
      throw error;
    }
  }

  private versionCreateData(
    planId: number,
    version: number,
    draft: ShopMembershipCardPlanDraftPersistenceInput
  ): Prisma.ShopMembershipCardPlanVersionUncheckedCreateInput {
    return {
      planId,
      version,
      status: ShopMembershipCardPlanVersionStatus.DRAFT,
      draftKey: `plan:${planId}`,
      ...this.versionMutableData(draft)
    };
  }

  private versionMutableData(draft: ShopMembershipCardPlanDraftPersistenceInput) {
    return {
      name: draft.name,
      description: draft.description,
      cardType: cardTypeToDb[draft.cardType],
      validityMode: validityModeToDb[draft.validity.mode],
      validityDays: draft.validity.mode === "fixed_days" ? draft.validity.days : null,
      fixedExpiryAt: draft.validity.mode === "fixed_date" ? draft.validity.expiresAt : null,
      ...draft.issuance,
      rewardCaps: draft.caps as unknown as Prisma.InputJsonValue
    };
  }

  private ruleCreateManyData(
    planVersionId: number,
    rules: MembershipRewardRuleInput[]
  ): Prisma.ShopMembershipRewardRuleCreateManyInput[] {
    return rules.map((rule, sortOrder) => ({
      planVersionId,
      kind: ruleKindToDb[rule.kind],
      ruleGroup: baseKinds.has(rule.kind)
        ? ShopMembershipRewardRuleGroup.BASE
        : ShopMembershipRewardRuleGroup.BONUS,
      config: rule as unknown as Prisma.InputJsonValue,
      sortOrder
    }));
  }

  private mapPlan(record: PlanRecord): ShopMembershipCardPlanPayload {
    return {
      internalId: record.id,
      publicId: record.publicId,
      status: record.status.toLowerCase() as ShopMembershipCardPlanStatusPayload,
      currentVersion: record.currentVersion ? this.mapVersion(record.currentVersion) : null,
      draftVersion: record.versions[0] ? this.mapVersion(record.versions[0]) : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  private mapVersion(record: VersionRecord): ShopMembershipCardPlanVersionPayload {
    const validity: ShopMembershipCardPlanValidityPayload =
      record.validityMode === ShopMembershipCardPlanValidityMode.NEVER
        ? { mode: "never" }
        : record.validityMode === ShopMembershipCardPlanValidityMode.FIXED_DAYS
          ? { mode: "fixed_days", days: record.validityDays as number }
          : { mode: "fixed_date", expiresAt: record.fixedExpiryAt as Date };
    return {
      internalId: record.id,
      publicId: record.publicId,
      version: record.version,
      status: record.status.toLowerCase() as ShopMembershipCardPlanVersionStatusPayload,
      lockVersion: record.lockVersion,
      name: record.name,
      description: record.description,
      cardType: record.cardType.toLowerCase() as ShopMembershipCardTypePayload,
      validity,
      issuance: {
        minInitialPrincipalJpy: record.minInitialPrincipalJpy,
        maxInitialPrincipalJpy: record.maxInitialPrincipalJpy,
        minInitialUses: record.minInitialUses,
        maxInitialUses: record.maxInitialUses
      },
      caps: membershipRewardCapsSchema.parse(record.rewardCaps),
      platformFeePolicyPublicId: record.platformFeePolicy?.publicId ?? null,
      platformFeeRateBps: record.platformFeeRateBps,
      publishedAt: record.publishedAt,
      rules: record.rules.map((rule) => ({
        ...membershipRewardRuleSchema.parse(rule.config),
        publicId: rule.publicId,
        ruleGroup: rule.ruleGroup.toLowerCase() as ShopMembershipRewardRuleGroupPayload,
        sortOrder: rule.sortOrder
      }))
    };
  }

  private mapFeePolicy(record: FeePolicyRecord): MembershipRewardFeePolicyPayload {
    return {
      publicId: record.publicId,
      version: record.version,
      feeRateBps: record.feeRateBps,
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo,
      reason: record.reason,
      createdByNeedoId: record.createdBy?.needoId ?? null,
      createdAt: record.createdAt
    };
  }

  private metadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
