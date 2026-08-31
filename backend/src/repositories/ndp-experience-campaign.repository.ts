import { Prisma, UserPolicyPublicationStatus, type PrismaClient } from "@prisma/client";
import type {
  NdpExperienceCampaignDraftInput,
  NdpExperienceCampaignMutationResult,
  NdpExperienceCampaignPayload,
  NdpExperienceCampaignRepositoryPort
} from "../domain/ndp-experience-campaign";
import { prisma } from "../prisma/client";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

const campaignSelect = Prisma.validator<Prisma.NdpExperienceCampaignSelect>()({
  publicId: true,
  version: true,
  status: true,
  name: true,
  description: true,
  factorBps: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  lockVersion: true
});

type CampaignRecord = Prisma.NdpExperienceCampaignGetPayload<{
  select: typeof campaignSelect;
}>;

export class NdpExperienceCampaignRepository implements NdpExperienceCampaignRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async resolveCampaignAt(occurredAt: Date): Promise<NdpExperienceCampaignPayload | null> {
    const campaign = await this.client.ndpExperienceCampaign.findFirst({
      where: {
        status: UserPolicyPublicationStatus.PUBLISHED,
        deletedAt: null,
        effectiveFrom: { lte: occurredAt },
        effectiveTo: { gt: occurredAt }
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: campaignSelect
    });
    return campaign ? this.mapCampaign(campaign) : null;
  }

  public async listCampaigns(
    query: PaginationInput
  ): Promise<PaginatedResponse<NdpExperienceCampaignPayload>> {
    const pagination = toPrismaPagination(query);
    const where: Prisma.NdpExperienceCampaignWhereInput = { deletedAt: null };
    const [list, total] = await Promise.all([
      this.client.ndpExperienceCampaign.findMany({
        where,
        select: campaignSelect,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
      }),
      this.client.ndpExperienceCampaign.count({ where })
    ]);
    return buildPaginatedResponse(
      list.map((campaign) => this.mapCampaign(campaign)),
      total,
      query
    );
  }

  public async saveDraftWithAudit(input: {
    actorId: number;
    draft: NdpExperienceCampaignDraftInput;
    audit: AuditLogCreateInput;
  }): Promise<NdpExperienceCampaignMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const [latestPublished, latestVersion, existingDraft] = await Promise.all([
          transaction.ndpExperienceCampaign.findFirst({
            where: { status: UserPolicyPublicationStatus.PUBLISHED, deletedAt: null },
            orderBy: [{ version: "desc" }],
            select: { version: true }
          }),
          transaction.ndpExperienceCampaign.findFirst({
            where: { deletedAt: null },
            orderBy: [{ version: "desc" }],
            select: { version: true }
          }),
          transaction.ndpExperienceCampaign.findFirst({
            where: { status: UserPolicyPublicationStatus.DRAFT, deletedAt: null },
            orderBy: [{ version: "desc" }],
            select: { id: true, version: true, lockVersion: true }
          })
        ]);
        if ((latestPublished?.version ?? 0) !== input.draft.expectedPublishedVersion) {
          return { kind: "version_conflict" as const };
        }
        let saved: CampaignRecord | null;
        if (existingDraft) {
          if (
            input.draft.expectedDraftLockVersion === null ||
            input.draft.expectedDraftLockVersion !== existingDraft.lockVersion
          ) {
            return { kind: "version_conflict" as const };
          }
          const updated = await transaction.ndpExperienceCampaign.updateMany({
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
          saved = await transaction.ndpExperienceCampaign.findUnique({
            where: { id: existingDraft.id },
            select: campaignSelect
          });
        } else {
          if (input.draft.expectedDraftLockVersion !== null) {
            return { kind: "version_conflict" as const };
          }
          saved = await transaction.ndpExperienceCampaign.create({
            data: {
              version: (latestVersion?.version ?? 0) + 1,
              status: UserPolicyPublicationStatus.DRAFT,
              ...this.draftData(input.draft),
              createdById: input.actorId
            },
            select: campaignSelect
          });
        }
        if (!saved) return { kind: "not_found" as const };
        await transaction.auditLog.create({ data: toAuditLogCreateData(input.audit) });
        return { kind: "saved" as const, value: this.mapCampaign(saved) };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return { kind: "version_conflict" };
      throw error;
    }
  }

  public async publishDraftWithAudit(input: {
    actorId: number;
    versionPublicId: string;
    expectedVersion: number;
    expectedLockVersion: number;
    publishedAt: Date;
    audit: AuditLogCreateInput;
  }): Promise<NdpExperienceCampaignMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const draft = await transaction.ndpExperienceCampaign.findFirst({
        where: {
          publicId: input.versionPublicId,
          version: input.expectedVersion,
          status: UserPolicyPublicationStatus.DRAFT,
          deletedAt: null
        },
        select: {
          id: true,
          publicId: true,
          version: true,
          status: true,
          lockVersion: true,
          effectiveFrom: true,
          effectiveTo: true
        }
      });
      if (!draft) return { kind: "not_found" as const };
      if (draft.lockVersion !== input.expectedLockVersion) {
        return { kind: "version_conflict" as const };
      }
      if (draft.effectiveFrom.getTime() < input.publishedAt.getTime()) {
        return { kind: "invalid_state" as const };
      }

      const overlaps = await transaction.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        SELECT \`id\`
        FROM \`ndp_experience_campaigns\` FORCE INDEX (\`ndp_experience_campaign_resolution_idx\`)
        WHERE \`status\` = 'published'
          AND \`deleted_at\` IS NULL
          AND \`effective_from\` < ${draft.effectiveTo}
          AND \`effective_to\` > ${draft.effectiveFrom}
        FOR UPDATE
      `);
      if (overlaps.length > 0) return { kind: "overlap" as const };

      const updated = await transaction.ndpExperienceCampaign.updateMany({
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
      const published = await transaction.ndpExperienceCampaign.findUnique({
        where: { id: draft.id },
        select: campaignSelect
      });
      if (!published) return { kind: "not_found" as const };
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: draft.id })
      });
      return { kind: "published" as const, value: this.mapCampaign(published) };
    });
  }

  public async archiveCampaignWithAudit(input: {
    actorId: number;
    versionPublicId: string;
    expectedVersion: number;
    expectedLockVersion: number;
    reason: string;
    archivedAt: Date;
    audit: AuditLogCreateInput;
  }): Promise<NdpExperienceCampaignMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.ndpExperienceCampaign.findFirst({
        where: {
          publicId: input.versionPublicId,
          version: input.expectedVersion,
          status: UserPolicyPublicationStatus.PUBLISHED,
          deletedAt: null
        },
        select: { id: true, lockVersion: true }
      });
      if (!current) return { kind: "not_found" as const };
      if (current.lockVersion !== input.expectedLockVersion) {
        return { kind: "version_conflict" as const };
      }
      const updated = await transaction.ndpExperienceCampaign.updateMany({
        where: {
          id: current.id,
          status: UserPolicyPublicationStatus.PUBLISHED,
          lockVersion: input.expectedLockVersion,
          deletedAt: null
        },
        data: {
          status: UserPolicyPublicationStatus.ARCHIVED,
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) return { kind: "version_conflict" as const };
      const archived = await transaction.ndpExperienceCampaign.findUnique({
        where: { id: current.id },
        select: campaignSelect
      });
      if (!archived) return { kind: "not_found" as const };
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: current.id })
      });
      return { kind: "archived" as const, value: this.mapCampaign(archived) };
    });
  }

  private draftData(input: NdpExperienceCampaignDraftInput) {
    return {
      name: input.name,
      description: input.description,
      factorBps: input.factorBps,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo
    };
  }

  private mapCampaign(campaign: CampaignRecord): NdpExperienceCampaignPayload {
    return {
      versionPublicId: campaign.publicId,
      version: campaign.version,
      status: campaign.status.toLowerCase() as NdpExperienceCampaignPayload["status"],
      name: campaign.name,
      description: campaign.description,
      factorBps: campaign.factorBps,
      effectiveFrom: campaign.effectiveFrom,
      effectiveTo: campaign.effectiveTo,
      publishedAt: campaign.publishedAt,
      lockVersion: campaign.lockVersion
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
