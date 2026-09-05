import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  DueIdentityApplicationPurgeRecord,
  IdentityApplicationPurgeRepositoryPort
} from "../services/identity-application-purge.service";
import { AppError } from "../utils/app-error";

const CLOSED_APPLICATION_STATUSES = ["approved", "rejected", "withdrawn"] as const;

export class IdentityApplicationPurgeRepository implements IdentityApplicationPurgeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listDue(input: {
    now: Date;
    retryBefore: Date;
    limit: number;
  }): Promise<DueIdentityApplicationPurgeRecord[]> {
    const applications = await this.client.identityApplication.findMany({
      where: {
        status: { in: [...CLOSED_APPLICATION_STATUSES] },
        purgeAt: { lte: input.now },
        purgedAt: null,
        deletedAt: null,
        OR: [{ purgeStartedAt: null }, { purgeStartedAt: { lte: input.retryBefore } }]
      },
      orderBy: [{ purgeAt: "asc" }, { id: "asc" }],
      take: input.limit,
      select: {
        id: true,
        version: true,
        media: {
          where: {
            mediaAsset: {
              entityType: "identity_application",
              deletedAt: null,
              purgedAt: null
            }
          },
          select: { mediaAsset: { select: { url: true } } }
        }
      }
    });

    return applications.map((application) => ({
      applicationId: application.id,
      version: application.version,
      fileKeys: application.media.map((link) => link.mediaAsset.url)
    }));
  }

  public async claim(input: {
    applicationId: number;
    expectedVersion: number;
    claimedAt: Date;
    retryBefore: Date;
  }): Promise<boolean> {
    const updated = await this.client.identityApplication.updateMany({
      where: {
        id: input.applicationId,
        version: input.expectedVersion,
        status: { in: [...CLOSED_APPLICATION_STATUSES] },
        purgeAt: { lte: input.claimedAt },
        purgedAt: null,
        deletedAt: null,
        OR: [{ purgeStartedAt: null }, { purgeStartedAt: { lte: input.retryBefore } }]
      },
      data: { purgeStartedAt: input.claimedAt, version: { increment: 1 } }
    });
    return updated.count === 1;
  }

  public complete(input: {
    applicationId: number;
    claimedVersion: number;
    purgedAt: Date;
  }): Promise<void> {
    return this.client.$transaction(async (transaction) => {
      const application = await transaction.identityApplication.findFirst({
        where: {
          id: input.applicationId,
          version: input.claimedVersion,
          status: { in: [...CLOSED_APPLICATION_STATUSES] },
          purgeAt: { lte: input.purgedAt },
          purgeStartedAt: { not: null },
          purgedAt: null,
          deletedAt: null
        },
        select: {
          id: true,
          userId: true,
          type: true,
          merchantDetail: { select: { bankAccountId: true } },
          media: { select: { mediaAssetId: true } }
        }
      });
      if (!application) {
        throw this.conflict();
      }

      const mediaAssetIds = application.media.map((link) => link.mediaAssetId);
      await transaction.identityApplicationMedia.deleteMany({
        where: { applicationId: application.id }
      });
      if (mediaAssetIds.length > 0) {
        await transaction.mediaAsset.deleteMany({
          where: {
            id: { in: mediaAssetIds },
            entityType: "identity_application",
            entityId: application.id
          }
        });
      }
      await transaction.technicianApplicationDetail.deleteMany({
        where: { applicationId: application.id }
      });
      await transaction.merchantApplicationDetail.deleteMany({
        where: { applicationId: application.id }
      });

      const bankAccountId = application.merchantDetail?.bankAccountId;
      if (bankAccountId) {
        await transaction.protectedBankAccount.deleteMany({
          where: {
            id: bankAccountId,
            merchantApplications: { none: {} },
            settlementMerchantAccounts: { none: { deletedAt: null } }
          }
        });
      }

      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: application.id,
          version: input.claimedVersion,
          purgeStartedAt: { not: null },
          purgedAt: null
        },
        data: {
          purgedAt: input.purgedAt,
          purgeStartedAt: null,
          rejectionReason: null,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw this.conflict();
      }

      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "identity_application.private_data.purged",
          targetType: "IdentityApplication",
          targetId: application.id,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: application.id,
            applicationType: application.type,
            applicantUserId: application.userId,
            mediaCount: mediaAssetIds.length
          } as Prisma.InputJsonValue,
          createdAt: input.purgedAt
        }
      });
    });
  }

  public async release(input: { applicationId: number; claimedVersion: number }): Promise<void> {
    await this.client.identityApplication.updateMany({
      where: {
        id: input.applicationId,
        version: input.claimedVersion,
        purgeStartedAt: { not: null },
        purgedAt: null
      },
      data: { purgeStartedAt: null }
    });
  }

  private conflict(): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message: "error.identity_application.purge_conflict",
      statusCode: 409
    });
  }
}
