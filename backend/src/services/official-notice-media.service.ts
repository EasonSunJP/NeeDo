import { logger } from "../config/logger";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentMediaProjection } from "./content-media.service";
import {
  resolveNoticeIssuerScope,
  type NoticeIssuerScope
} from "./official-notice-scope";
import type {
  OfficialNoticeMediaMimeType,
  OfficialNoticeMediaStoragePort
} from "./official-notice-media.storage";

export interface CreateOfficialNoticeMediaRepositoryInput {
  entityType: "official_notice_upload";
  entityId: number;
  ownerUserId: number;
  ownerIdentityId: number | null;
  shopId: number | null;
  url: string;
  mimeType: OfficialNoticeMediaMimeType;
  usageType: "official_notice_attachment";
  fileName: string;
  altText: string | null;
  checksumSha256: string;
  createdAt: Date;
  context: AuthRequestContext;
}

export interface OfficialNoticeMediaLockedRepositoryPort {
  create(input: CreateOfficialNoticeMediaRepositoryInput): Promise<ContentMediaProjection>;
}

export interface OfficialNoticeMediaRepositoryPort {
  withChecksumLock<T>(
    checksumSha256: string,
    operation: (locked: OfficialNoticeMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T>;
}

export interface UploadOfficialNoticeMediaInput {
  bytes: Buffer;
  mimeType: OfficialNoticeMediaMimeType;
  fileName: string;
  caption: string | null;
  now: Date;
}

export class OfficialNoticeMediaService {
  public constructor(
    private readonly repository: OfficialNoticeMediaRepositoryPort,
    private readonly storage: OfficialNoticeMediaStoragePort
  ) {}

  public uploadPlatform(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadOfficialNoticeMediaInput
  ): Promise<ContentMediaProjection> {
    return this.upload(actor, context, input, { type: "platform" });
  }

  public uploadMerchant(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadOfficialNoticeMediaInput
  ): Promise<ContentMediaProjection> {
    return this.upload(actor, context, input, resolveNoticeIssuerScope(actor, "shop"));
  }

  private async upload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadOfficialNoticeMediaInput,
    issuerScope: NoticeIssuerScope
  ): Promise<ContentMediaProjection> {
    const prepared = await this.storage.prepare({ bytes: input.bytes, mimeType: input.mimeType });
    return this.repository.withChecksumLock(prepared.checksumSha256, async (locked) => {
      const stored = await this.storage.save({ bytes: input.bytes, mimeType: input.mimeType });
      try {
        return await locked.create({
          entityType: "official_notice_upload",
          entityId: actor.userId,
          ownerUserId: actor.userId,
          ownerIdentityId: actor.currentIdentityId ?? null,
          shopId: issuerScope.type === "shop" ? issuerScope.shopId : null,
          url: `/media/content/${stored.fileKey}`,
          mimeType: stored.mimeType,
          usageType: "official_notice_attachment",
          fileName: input.fileName,
          altText: input.caption,
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
                cleanupErrorName: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
                publicId: stored.checksumSha256
              },
              "Official notice media compensation cleanup failed"
            );
          }
        }
        throw persistenceError;
      }
    });
  }
}
