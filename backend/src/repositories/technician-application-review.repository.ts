import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { buildIdentityActivationTransactionInput } from "../services/identity-activation.service";
import type {
  ApproveTechnicianApplicationRepositoryInput,
  RejectTechnicianApplicationRepositoryInput,
  TechnicianApplicationContactAuditInput,
  TechnicianApplicationReviewRecord,
  TechnicianApplicationReviewListQuery,
  TechnicianApplicationReviewPage,
  TechnicianApplicationReviewRepositoryPort,
  TechnicianApprovalResult,
  TechnicianRejectionResult
} from "../services/technician-application-review.service";
import { AppError } from "../utils/app-error";
import { IdentityActivationRepository } from "./identity-activation.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const technicianReviewSelect = {
  id: true,
  userId: true,
  status: true,
  version: true,
  submittedAt: true,
  createdAt: true,
  technicianDetail: {
    select: {
      targetShopId: true,
      applicantName: true,
      phone: true,
      city: true,
      serviceAreas: true,
      skills: true,
      yearsExperience: true,
      bio: true,
      gender: true,
      birthDate: true,
      targetShop: { select: { ownerUserId: true } }
    }
  },
  media: {
    where: {
      deletedAt: null,
      mediaAsset: { deletedAt: null, purgedAt: null }
    },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: {
      purpose: true,
      mediaAsset: { select: { id: true, url: true, mimeType: true } }
    }
  }
} satisfies Prisma.IdentityApplicationSelect;

type TechnicianReviewRow = Prisma.IdentityApplicationGetPayload<{
  select: typeof technicianReviewSelect;
}>;

const asStringArray = (value: Prisma.JsonValue | null): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class TechnicianApplicationReviewRepository
  implements TechnicianApplicationReviewRepositoryPort
{
  private readonly identityActivation: IdentityActivationRepository;

  public constructor(private readonly client: PrismaClient = prisma) {
    this.identityActivation = new IdentityActivationRepository(client);
  }

  public async listForShop(
    shopId: number,
    query: TechnicianApplicationReviewListQuery
  ): Promise<TechnicianApplicationReviewPage> {
    const where: Prisma.IdentityApplicationWhereInput = {
      type: "technician",
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      technicianDetail: { targetShopId: shopId, deletedAt: null }
    };
    const [rows, total] = await this.client.$transaction([
      this.client.identityApplication.findMany({
        where,
        select: technicianReviewSelect,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.client.identityApplication.count({ where })
    ]);
    return {
      list: rows.flatMap((row) => {
        const mapped = this.mapReview(row);
        return mapped ? [mapped] : [];
      }),
      total,
      page: query.page,
      page_size: query.pageSize
    };
  }

  public async findForShop(
    applicationId: number,
    shopId: number
  ): Promise<TechnicianApplicationReviewRecord | null> {
    const application = await this.client.identityApplication.findFirst({
      where: {
        id: applicationId,
        type: "technician",
        deletedAt: null,
        technicianDetail: { targetShopId: shopId, deletedAt: null }
      },
      select: technicianReviewSelect
    });
    return application ? this.mapReview(application) : null;
  }

  public approveInTransaction(
    input: ApproveTechnicianApplicationRepositoryInput
  ): Promise<TechnicianApprovalResult> {
    return this.client.$transaction(async (transaction) => {
      await this.closeForReview(transaction, input, "approved", null);
      const profile = await transaction.technicianProfile.upsert({
        where: { userId: input.applicantUserId },
        create: {
          userId: input.applicantUserId,
          shopId: input.targetShopId,
          displayName: input.applicantName,
          bio: input.bio,
          city: input.city ?? "",
          status: "published",
          verifiedAt: input.reviewedAt
        },
        update: {
          shopId: input.targetShopId,
          displayName: input.applicantName,
          bio: input.bio,
          city: input.city ?? "",
          status: "published",
          verifiedAt: input.reviewedAt,
          deletedAt: null
        }
      });
      const identity = await this.identityActivation.activateWithTransaction(
        transaction,
        buildIdentityActivationTransactionInput({
          kind: "technician",
          userId: input.applicantUserId,
          actorUserId: input.reviewerUserId,
          displayName: input.applicantName,
          scopeId: profile.id,
          applicationId: input.applicationId,
          contractAcceptanceId: null,
          activatedAt: input.reviewedAt
        })
      );
      await transaction.auditLog.create({
        data: {
          actorId: input.reviewerUserId,
          action: "identity_application.technician.approved",
          targetType: "IdentityApplication",
          targetId: input.applicationId,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            targetShopId: input.targetShopId,
            technicianProfileId: profile.id,
            identityId: identity.identityId,
            version: input.expectedVersion + 1
          },
          createdAt: input.reviewedAt
        }
      });

      return {
        applicationId: input.applicationId,
        status: "approved",
        version: input.expectedVersion + 1,
        technicianProfileId: profile.id,
        identityId: identity.identityId,
        reviewedAt: input.reviewedAt
      };
    });
  }

  public rejectInTransaction(
    input: RejectTechnicianApplicationRepositoryInput
  ): Promise<TechnicianRejectionResult> {
    return this.client.$transaction(async (transaction) => {
      await this.closeForReview(transaction, input, "rejected", input.rejectionReason);
      const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
        transaction,
        input.applicantUserId
      );
      const actorIdentityId = await resolveCanonicalPersonalIdentityId(
        transaction,
        input.reviewerUserId
      );
      if (!recipientIdentityId || !actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      await transaction.notification.create({
        data: {
          recipientUserId: input.applicantUserId,
          recipientIdentityId,
          actorUserId: input.reviewerUserId,
          actorIdentityId,
          type: "SYSTEM",
          title: "identity.application.rejected.title",
          body: "identity.application.rejected.body",
          payload: {
            applicationId: input.applicationId,
            rejectionReason: input.rejectionReason
          },
          createdAt: input.reviewedAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.reviewerUserId,
          action: "identity_application.technician.rejected",
          targetType: "IdentityApplication",
          targetId: input.applicationId,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            targetShopId: input.targetShopId,
            version: input.expectedVersion + 1,
            result: "rejected"
          },
          createdAt: input.reviewedAt
        }
      });

      return {
        applicationId: input.applicationId,
        status: "rejected",
        version: input.expectedVersion + 1,
        rejectionReason: input.rejectionReason,
        reviewedAt: input.reviewedAt
      };
    });
  }

  public async recordContactAudit(input: TechnicianApplicationContactAuditInput): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.reviewerUserId,
        action: "identity_application.technician.contacted",
        targetType: "IdentityApplication",
        targetId: input.applicationId,
        ip: null,
        userAgent: null,
        metadata: {
          applicationId: input.applicationId,
          targetShopId: input.targetShopId,
          conversationId: input.conversationId
        },
        createdAt: input.contactedAt
      }
    });
  }

  private async closeForReview(
    transaction: Prisma.TransactionClient,
    input:
      | ApproveTechnicianApplicationRepositoryInput
      | RejectTechnicianApplicationRepositoryInput,
    status: "approved" | "rejected",
    rejectionReason: string | null
  ): Promise<void> {
    const updated = await transaction.identityApplication.updateMany({
      where: {
        id: input.applicationId,
        userId: input.applicantUserId,
        version: input.expectedVersion,
        status: { in: ["submitted", "under_review"] },
        deletedAt: null,
        technicianDetail: { targetShopId: input.targetShopId }
      },
      data: {
        status,
        activeKey: null,
        version: { increment: 1 },
        reviewedAt: input.reviewedAt,
        reviewerUserId: input.reviewerUserId,
        rejectionReason,
        closedAt: input.reviewedAt,
        purgeAt: input.purgeAt
      }
    });
    if (updated.count !== 1) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.version_conflict",
        statusCode: 409
      });
    }
  }

  private mapReview(row: TechnicianReviewRow): TechnicianApplicationReviewRecord | null {
    if (!row.technicianDetail) {
      return null;
    }
    return {
      applicationId: row.id,
      applicantUserId: row.userId,
      targetShopId: row.technicianDetail.targetShopId,
      targetShopServiceUserId: row.technicianDetail.targetShop.ownerUserId,
      status: row.status,
      version: row.version,
      applicantName: row.technicianDetail.applicantName,
      phone: row.technicianDetail.phone,
      city: row.technicianDetail.city,
      serviceAreas: asStringArray(row.technicianDetail.serviceAreas),
      skills: asStringArray(row.technicianDetail.skills),
      yearsExperience: row.technicianDetail.yearsExperience,
      bio: row.technicianDetail.bio,
      gender: row.technicianDetail.gender,
      birthDate: row.technicianDetail.birthDate,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      media: row.media.map((item) => ({
        id: item.mediaAsset.id,
        purpose: item.purpose,
        url: `/api/v1/identity-applications/${row.id}/media/${item.mediaAsset.id}`,
        mimeType: item.mediaAsset.mimeType
      }))
    };
  }
}
