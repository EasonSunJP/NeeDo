import { logger } from "../config/logger";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentMediaMimeType, ContentMediaStoragePort } from "./content-media.storage";

export interface ContentMediaProjection {
  publicId: string;
  mediaAssetId: number;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  checksumSha256: string;
}

export interface CreateContentMediaRepositoryInput {
  entityType: "content_publication_upload" | "official_notice_upload";
  entityId: number;
  ownerUserId: number;
  ownerIdentityId?: number | null;
  shopId?: number | null;
  url: string;
  mimeType: string;
  usageType?: "content_publication_public" | "official_notice_attachment";
  fileName?: string;
  altText: string | null;
  checksumSha256: string;
  createdAt: Date;
  context: AuthRequestContext;
}

export interface ContentMediaRepositoryPort {
  withChecksumLock<T>(
    checksumSha256: string,
    operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T>;
}

export interface ContentMediaLockedRepositoryPort {
  create(input: CreateContentMediaRepositoryInput): Promise<ContentMediaProjection>;
}

export interface UploadContentMediaInput {
  bytes: Buffer;
  mimeType: ContentMediaMimeType;
  altText: string | null;
  now: Date;
}

export class ContentMediaService {
  public constructor(
    private readonly repository: ContentMediaRepositoryPort,
    private readonly storage: ContentMediaStoragePort
  ) {}

  public async upload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadContentMediaInput
  ): Promise<ContentMediaProjection> {
    const prepared = await this.storage.prepare({ bytes: input.bytes, mimeType: input.mimeType });
    return this.repository.withChecksumLock(prepared.checksumSha256, async (locked) => {
      const stored = await this.storage.save({ bytes: input.bytes, mimeType: input.mimeType });
      try {
        return await locked.create({
          entityType: "content_publication_upload",
          entityId: actor.userId,
          ownerUserId: actor.userId,
          url: `/media/content/${stored.fileKey}`,
          mimeType: stored.mimeType,
          altText: input.altText,
          checksumSha256: stored.checksumSha256,
          createdAt: input.now,
          context
        });
      } catch (persistenceError) {
        if (stored.created) {
          try {
            await this.storage.delete(stored.fileKey);
          } catch (cleanupError) {
            logger.warn(
              {
                cleanupErrorName:
                  cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
                publicId: stored.checksumSha256
              },
              "Content media compensation cleanup failed"
            );
          }
        }
        throw persistenceError;
      }
    });
  }
}
