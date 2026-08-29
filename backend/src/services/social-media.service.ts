import { basename } from "node:path";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentMediaMimeType, ContentMediaStoragePort } from "./content-media.storage";

export interface SocialMediaProjection {
  publicId: string;
  url: string;
  mimeType: ContentMediaMimeType;
  fileSize: number;
}

export interface CreateSocialMediaUploadInput {
  ownerUserId: number;
  entityType: "social_post_upload";
  usageType: "social_post_public";
  fileKey: string;
  mimeType: ContentMediaMimeType;
  fileName: string;
  fileSize: number;
  checksumSha256: string;
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
    private readonly storage: ContentMediaStoragePort
  ) {}

  public async upload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadSocialMediaInput
  ): Promise<SocialMediaProjection> {
    let stored: Awaited<ReturnType<ContentMediaStoragePort["save"]>>;
    try {
      stored = await this.storage.save({ bytes: input.bytes, mimeType: input.mimeType });
    } catch (error) {
      throw this.normalizeStorageError(error);
    }

    const fileName = basename(input.fileName).trim().slice(0, 255);
    try {
      return await this.repository.createUpload({
        ownerUserId: actor.userId,
        entityType: "social_post_upload",
        usageType: "social_post_public",
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        fileName,
        fileSize: input.bytes.length,
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
