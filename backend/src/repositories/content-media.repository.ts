import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ContentMediaProjection,
  ContentMediaRepositoryPort,
  CreateContentMediaRepositoryInput
} from "../services/content-media.service";

export class ContentMediaRepository implements ContentMediaRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public create(input: CreateContentMediaRepositoryInput): Promise<ContentMediaProjection> {
    return this.client.$transaction(async (transaction) => {
      const mediaAsset = await transaction.mediaAsset.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          ownerUserId: input.ownerUserId,
          url: input.url,
          mimeType: input.mimeType,
          usageType: "content_publication_public",
          width: null,
          height: null,
          altText: input.altText,
          checksumSha256: input.checksumSha256,
          isActive: true,
          createdAt: input.createdAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.ownerUserId,
          action: "content.media.uploaded",
          targetType: "MediaAsset",
          targetId: mediaAsset.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            publicId: input.checksumSha256,
            mediaAssetId: mediaAsset.id,
            url: input.url,
            mimeType: input.mimeType,
            altText: input.altText
          } satisfies Prisma.InputJsonValue,
          createdAt: input.createdAt
        }
      });

      return {
        publicId: input.checksumSha256,
        mediaAssetId: mediaAsset.id,
        url: input.url,
        mimeType: input.mimeType,
        width: null,
        height: null,
        checksumSha256: input.checksumSha256
      };
    });
  }
}
