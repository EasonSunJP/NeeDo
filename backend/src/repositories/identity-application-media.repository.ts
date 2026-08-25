import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  AttachIdentityApplicationMediaRepositoryInput,
  IdentityApplicationMediaAccessRecord,
  IdentityApplicationMediaEditableContext,
  IdentityApplicationMediaProjection,
  IdentityApplicationMediaRepositoryPort
} from "../services/identity-application-media.service";
import { AppError } from "../utils/app-error";

export class IdentityApplicationMediaRepository
  implements IdentityApplicationMediaRepositoryPort
{
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findEditableContext(
    applicationId: number
  ): Promise<IdentityApplicationMediaEditableContext | null> {
    const application = await this.client.identityApplication.findFirst({
      where: { id: applicationId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        version: true,
        _count: {
          select: {
            media: {
              where: {
                deletedAt: null,
                mediaAsset: { isActive: true, deletedAt: null, purgedAt: null }
              }
            }
          }
        }
      }
    });
    if (!application || (application.type !== "technician" && application.type !== "merchant")) {
      return null;
    }
    return {
      applicationId: application.id,
      userId: application.userId,
      type: application.type,
      status: application.status,
      version: application.version,
      activeMediaCount: application._count.media
    };
  }

  public attachInTransaction(
    input: AttachIdentityApplicationMediaRepositoryInput
  ): Promise<IdentityApplicationMediaProjection> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: input.applicationId,
          userId: input.userId,
          version: input.expectedVersion,
          status: { in: ["draft", "rejected"] },
          deletedAt: null
        },
        data: { version: { increment: 1 } }
      });
      if (updated.count !== 1) {
        throw new AppError({
          code: ERROR_CODES.SAAS_BILLING_CONFLICT,
          message: "error.identity_application.version_conflict",
          statusCode: 409
        });
      }
      const mediaAsset = await transaction.mediaAsset.create({
        data: {
          entityType: "identity_application",
          entityId: input.applicationId,
          ownerUserId: input.userId,
          url: input.fileKey,
          mimeType: input.mimeType,
          usageType: "identity_application_private",
          checksumSha256: input.checksumSha256,
          isActive: true,
          createdAt: input.createdAt
        }
      });
      await transaction.identityApplicationMedia.create({
        data: {
          applicationId: input.applicationId,
          mediaAssetId: mediaAsset.id,
          purpose: input.purpose,
          createdAt: input.createdAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "identity_application.media.uploaded",
          targetType: "MediaAsset",
          targetId: mediaAsset.id,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            mediaAssetId: mediaAsset.id,
            purpose: input.purpose,
            mimeType: input.mimeType,
            version: input.expectedVersion + 1
          },
          createdAt: input.createdAt
        }
      });
      return {
        id: mediaAsset.id,
        applicationId: input.applicationId,
        purpose: input.purpose,
        mimeType: mediaAsset.mimeType,
        applicationVersion: input.expectedVersion + 1,
        createdAt: mediaAsset.createdAt
      };
    });
  }

  public async findMediaAccess(
    applicationId: number,
    mediaAssetId: number
  ): Promise<IdentityApplicationMediaAccessRecord | null> {
    const link = await this.client.identityApplicationMedia.findFirst({
      where: {
        applicationId,
        mediaAssetId,
        deletedAt: null,
        application: { deletedAt: null, purgedAt: null },
        mediaAsset: {
          entityType: "identity_application",
          entityId: applicationId,
          isActive: true,
          deletedAt: null,
          purgedAt: null
        }
      },
      select: {
        application: {
          select: {
            id: true,
            userId: true,
            technicianDetail: { select: { targetShopId: true } }
          }
        },
        mediaAsset: { select: { id: true, url: true, mimeType: true } }
      }
    });
    if (!link) {
      return null;
    }
    return {
      mediaAssetId: link.mediaAsset.id,
      applicationId: link.application.id,
      applicantUserId: link.application.userId,
      targetShopId: link.application.technicianDetail?.targetShopId ?? null,
      fileKey: link.mediaAsset.url,
      mimeType: link.mediaAsset.mimeType
    };
  }
}
