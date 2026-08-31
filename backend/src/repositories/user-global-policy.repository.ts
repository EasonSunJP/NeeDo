import {
  Prisma,
  UserPolicyPublicationStatus,
  type PrismaClient
} from "@prisma/client";
import type {
  ResolvedUserGlobalPolicy,
  UserGlobalPolicyDraftInput,
  UserGlobalPolicyMutationResult,
  UserGlobalPolicyRepositoryPort
} from "../domain/user-global-policy";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

const policySelect = Prisma.validator<Prisma.UserGlobalPolicyVersionSelect>()({
  publicId: true,
  version: true,
  status: true,
  lockVersion: true,
  requirePhone: true,
  requireEmail: true,
  requireHomeServiceEkyc: true,
  requireStoreServiceEkyc: true,
  ndpPerBaseExp: true,
  baseExpUnitsPerThreshold: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true
});

type PolicyRecord = Prisma.UserGlobalPolicyVersionGetPayload<{
  select: typeof policySelect;
}>;

export class UserGlobalPolicyRepository implements UserGlobalPolicyRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async resolvePolicyAt(occurredAt: Date): Promise<ResolvedUserGlobalPolicy | null> {
    const policy = await this.client.userGlobalPolicyVersion.findFirst({
      where: {
        status: UserPolicyPublicationStatus.PUBLISHED,
        deletedAt: null,
        effectiveFrom: { lte: occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }]
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: policySelect
    });
    return policy ? this.mapPolicy(policy) : null;
  }

  public async getCurrentAndDraft(occurredAt: Date): Promise<{
    current: ResolvedUserGlobalPolicy | null;
    draft: ResolvedUserGlobalPolicy | null;
  }> {
    const [current, draft] = await Promise.all([
      this.resolvePolicyAt(occurredAt),
      this.client.userGlobalPolicyVersion.findFirst({
        where: { status: UserPolicyPublicationStatus.DRAFT, deletedAt: null },
        orderBy: [{ version: "desc" }],
        select: policySelect
      })
    ]);
    return { current, draft: draft ? this.mapPolicy(draft) : null };
  }

  public async saveDraftWithAudit(input: {
    actorId: number;
    draft: UserGlobalPolicyDraftInput;
    audit: AuditLogCreateInput;
  }): Promise<UserGlobalPolicyMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const latestPublished = await transaction.userGlobalPolicyVersion.findFirst({
          where: { status: UserPolicyPublicationStatus.PUBLISHED, deletedAt: null },
          orderBy: [{ version: "desc" }],
          select: { version: true }
        });
        if (!latestPublished || latestPublished.version !== input.draft.expectedCurrentVersion) {
          return { kind: "version_conflict" as const };
        }
        const existingDraft = await transaction.userGlobalPolicyVersion.findFirst({
          where: { status: UserPolicyPublicationStatus.DRAFT, deletedAt: null },
          orderBy: [{ version: "desc" }],
          select: { id: true, version: true, lockVersion: true }
        });
        let saved: PolicyRecord | null;
        if (existingDraft) {
          if (
            input.draft.expectedDraftLockVersion === null ||
            input.draft.expectedDraftLockVersion !== existingDraft.lockVersion
          ) {
            return { kind: "version_conflict" as const };
          }
          const updated = await transaction.userGlobalPolicyVersion.updateMany({
            where: {
              id: existingDraft.id,
              status: UserPolicyPublicationStatus.DRAFT,
              lockVersion: input.draft.expectedDraftLockVersion,
              deletedAt: null
            },
            data: {
              ...this.draftData(input.draft),
              createdById: input.actorId,
              lockVersion: { increment: 1 }
            }
          });
          if (updated.count !== 1) return { kind: "version_conflict" as const };
          saved = await transaction.userGlobalPolicyVersion.findUnique({
            where: { id: existingDraft.id },
            select: policySelect
          });
        } else {
          if (input.draft.expectedDraftLockVersion !== null) {
            return { kind: "version_conflict" as const };
          }
          saved = await transaction.userGlobalPolicyVersion.create({
            data: {
              version: latestPublished.version + 1,
              status: UserPolicyPublicationStatus.DRAFT,
              ...this.draftData(input.draft),
              createdById: input.actorId
            },
            select: policySelect
          });
        }
        if (!saved) return { kind: "not_found" as const };
        await transaction.auditLog.create({
          data: toAuditLogCreateData(input.audit)
        });
        return { kind: "saved" as const, value: this.mapPolicy(saved) };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return { kind: "version_conflict" };
      throw error;
    }
  }

  public async publishDraftWithAudit(input: {
    actorId: number;
    expectedVersion: number;
    expectedLockVersion: number;
    publishedAt: Date;
    audit: AuditLogCreateInput;
  }): Promise<UserGlobalPolicyMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const draft = await transaction.userGlobalPolicyVersion.findFirst({
        where: {
          version: input.expectedVersion,
          status: UserPolicyPublicationStatus.DRAFT,
          deletedAt: null
        },
        select: {
          id: true,
          publicId: true,
          version: true,
          lockVersion: true,
          status: true,
          effectiveFrom: true
        }
      });
      if (!draft) return { kind: "not_found" as const };
      if (draft.lockVersion !== input.expectedLockVersion) {
        return { kind: "version_conflict" as const };
      }
      if (draft.effectiveFrom.getTime() < input.publishedAt.getTime()) {
        return { kind: "invalid_state" as const };
      }
      const updated = await transaction.userGlobalPolicyVersion.updateMany({
        where: {
          id: draft.id,
          status: UserPolicyPublicationStatus.DRAFT,
          lockVersion: input.expectedLockVersion,
          deletedAt: null
        },
        data: {
          status: UserPolicyPublicationStatus.PUBLISHED,
          publishedAt: input.publishedAt,
          publishedById: input.actorId,
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) return { kind: "version_conflict" as const };
      const published = await transaction.userGlobalPolicyVersion.findUnique({
        where: { id: draft.id },
        select: policySelect
      });
      if (!published) return { kind: "not_found" as const };
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: draft.id })
      });
      return { kind: "published" as const, value: this.mapPolicy(published) };
    });
  }

  private draftData(input: UserGlobalPolicyDraftInput) {
    return {
      requirePhone: input.requirePhone,
      requireEmail: input.requireEmail,
      requireHomeServiceEkyc: input.requireHomeServiceEkyc,
      requireStoreServiceEkyc: input.requireStoreServiceEkyc,
      ndpPerBaseExp: input.ndpPerBaseExp,
      baseExpUnitsPerThreshold: input.baseExpUnitsPerThreshold,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null
    };
  }

  private mapPolicy(policy: PolicyRecord): ResolvedUserGlobalPolicy {
    return {
      versionPublicId: policy.publicId,
      version: policy.version,
      status: policy.status.toLowerCase() as ResolvedUserGlobalPolicy["status"],
      lockVersion: policy.lockVersion,
      requirePhone: policy.requirePhone,
      requireEmail: policy.requireEmail,
      requireHomeServiceEkyc: policy.requireHomeServiceEkyc,
      requireStoreServiceEkyc: policy.requireStoreServiceEkyc,
      ndpPerBaseExp: policy.ndpPerBaseExp,
      baseExpUnitsPerThreshold: policy.baseExpUnitsPerThreshold,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      publishedAt: policy.publishedAt
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(
      error && typeof error === "object" && "code" in error && error.code === "P2002"
    );
  }
}
