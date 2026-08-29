import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  CreateSocialMediaUploadInput,
  SocialMediaProjection,
  SocialMediaRepositoryPort
} from "../services/social-media.service";

export class SocialMediaRepository implements SocialMediaRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public createUpload(input: CreateSocialMediaUploadInput): Promise<SocialMediaProjection> {
    return this.client.$transaction(async (transaction) => {
      const mediaAsset = await transaction.mediaAsset.create({
        data: {
          entityType: input.entityType,
          entityId: input.ownerUserId,
          ownerUserId: input.ownerUserId,
          ownerIdentityId: input.ownerIdentityId,
          url: `/media/content/${input.fileKey}`,
          mimeType: input.mimeType,
          usageType: input.usageType,
          width: null,
          height: null,
          altText: null,
          checksumSha256: input.checksumSha256,
          isActive: true,
          createdAt: input.createdAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.ownerUserId,
          action: "social.media.uploaded",
          targetType: "MediaAsset",
          targetId: mediaAsset.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            publicId: input.checksumSha256,
            mediaAssetId: mediaAsset.id,
            mimeType: input.mimeType,
            fileName: input.fileName,
            fileSize: input.fileSize
          } satisfies Prisma.InputJsonValue,
          createdAt: input.createdAt
        }
      });

      return {
        publicId: input.checksumSha256,
        url: `/media/content/${input.fileKey}`,
        mimeType: input.mimeType,
        fileSize: input.fileSize
      };
    });
  }
}
