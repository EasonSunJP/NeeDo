import { basename } from "node:path";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ContentMediaRepositoryPort } from "./content-media.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentMediaMimeType, ContentMediaStoragePort } from "./content-media.storage";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";

export interface SocialMediaProjection {
  publicId: string;
  url: string;
  mimeType: ContentMediaMimeType;
  fileSize: number;
}

export interface CreateSocialMediaUploadInput {
  ownerUserId: number;
  ownerIdentityId: number;
  entityType: "social_post_upload";
  usageType: "social_post_public";
  fileKey: string;
  mimeType: ContentMediaMimeType;
  fileName: string;
  fileSize: number;
  checksumSha256: string;
  width?: number | null;
  height?: number | null;
  createdAt: Date;
  context: AuthRequestContext;
}

export interface SocialMediaRepositoryPort {
  createUpload(input: CreateSocialMediaUploadInput): Promise<SocialMediaProjection>;
}

export interface UploadSocialMediaInput {
  bytes: Buffer;
  fileName: string;
  mimeType: ContentMediaMimeType;
  now: Date;
}

export class SocialMediaService {
  public constructor(
    private readonly repository: SocialMediaRepositoryPort,
    private readonly storage: ContentMediaStoragePort,
    private readonly personalIdentityScope: Pick<PersonalIdentityScopeService, "resolve"> | undefined,
    private readonly checksumLock: ContentMediaRepositoryPort
  ) {}

  public async upload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadSocialMediaInput
  ): Promise<SocialMediaProjection> {
    const identityScope = this.personalIdentityScope
      ? await this.personalIdentityScope.resolve(actor)
      : { identityId: actor.currentIdentityId ?? actor.userId };
    let prepared;
    try {
      prepared = await this.storage.prepare({ bytes: input.bytes, mimeType: input.mimeType, purpose: "social" });
    } catch (error) {
      throw this.normalizeStorageError(error);
    }
    return this.checksumLock.withChecksumLock(prepared.checksumSha256, () =>
      this.saveUpload(actor, context, input, identityScope.identityId)
    );
  }

  private async saveUpload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadSocialMediaInput,
    ownerIdentityId: number
  ): Promise<SocialMediaProjection> {
    let stored: Awaited<ReturnType<ContentMediaStoragePort["save"]>>;
    try {
      stored = await this.storage.save({
        bytes: input.bytes,
        mimeType: input.mimeType,
        purpose: "social"
      });
    } catch (error) {
      throw this.normalizeStorageError(error);
    }

    const fileName = basename(input.fileName).trim().slice(0, 255);
    try {
      return await this.repository.createUpload({
        ownerUserId: actor.userId,
        ownerIdentityId,
        entityType: "social_post_upload",
        usageType: "social_post_public",
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        fileName,
        fileSize: input.bytes.length,
        checksumSha256: stored.checksumSha256,
        width: stored.width ?? null,
        height: stored.height ?? null,
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
            "Social media compensation cleanup failed"
          );
        }
      }
      throw persistenceError;
    }
  }

  private normalizeStorageError(error: unknown): unknown {
    if (error instanceof AppError && error.message === "error.content.media_too_large") {
      return new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.social.media_too_large",
        statusCode: 413,
        cause: error
      });
    }
    if (error instanceof AppError && error.message === "error.content.media_invalid") {
      return new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.social.media_invalid",
        statusCode: 400,
        cause: error
      });
    }
    return error;
  }
}
