import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
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
  entityType: "content_publication_upload" | "official_notice_upload" | "shop_presentation_upload" | "exchange_demand_cover_pending";
  entityId: number;
  ownerUserId: number;
  ownerIdentityId?: number | null;
  shopId?: number | null;
  url: string;
  mimeType: string;
  usageType?: "content_publication_public" | "official_notice_attachment" | "shop_presentation_draft" | "exchange_demand_cover_pending";
  fileName?: string;
  altText: string | null;
  checksumSha256: string;
  width?: number | null;
  height?: number | null;
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

interface ShopPresentationUploadScope {
  entityType: "shop_presentation_upload";
  entityId: number;
  shopId: number;
  ownerIdentityId: number;
  usageType: "shop_presentation_draft";
}

export type UploadContentMediaScope = ShopPresentationUploadScope | {
  entityType: "exchange_demand_cover_pending";
  entityId: number;
  ownerIdentityId: number;
  usageType: "exchange_demand_cover_pending";
};

export class ContentMediaService {
  public constructor(
    private readonly repository: ContentMediaRepositoryPort,
    private readonly storage: ContentMediaStoragePort
  ) {}

  public async upload(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: UploadContentMediaInput,
    scope?: UploadContentMediaScope
  ): Promise<ContentMediaProjection> {
    const isExchangeCover = scope?.entityType === "exchange_demand_cover_pending";
    if (isExchangeCover && (
      !actor.currentIdentityId || actor.currentIdentityId !== scope.entityId ||
      actor.currentIdentityId !== scope.ownerIdentityId || actor.currentIdentityType !== "customer" ||
      !actor.roles.includes("customer")
    )) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
    const purpose = isExchangeCover ? "social" : scope ? "shop-presentation" : "carousel";
    const storageInput = { bytes: input.bytes, mimeType: input.mimeType, purpose } as const;
    let prepared;
    try {
      prepared = await this.storage.prepare(storageInput);
    } catch (error) {
      if (isExchangeCover && error instanceof AppError && error.message.startsWith("error.content.media_")) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: error.statusCode === 413 ? "error.exchange.demand_cover_too_large" : "error.exchange.demand_cover_invalid",
          statusCode: error.statusCode,
          cause: error
        });
      }
      throw error;
    }
    if (isExchangeCover && (
      !prepared.width || !prepared.height ||
      Math.abs(prepared.width * 9 / 16 - prepared.height) > 1
    )) {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.exchange.demand_cover_invalid", statusCode: 400 });
    }
    return this.repository.withChecksumLock(prepared.checksumSha256, async (locked) => {
      let stored;
      try {
        stored = await this.storage.save(storageInput);
      } catch (error) {
        if (isExchangeCover && error instanceof AppError && error.message.startsWith("error.content.media_")) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: error.statusCode === 413 ? "error.exchange.demand_cover_too_large" : "error.exchange.demand_cover_invalid",
            statusCode: error.statusCode,
            cause: error
          });
        }
        throw error;
      }
      try {
        return await locked.create({
          entityType: scope?.entityType ?? "content_publication_upload",
          entityId: scope?.entityId ?? actor.userId,
          ownerUserId: actor.userId,
          ownerIdentityId: scope?.ownerIdentityId ?? null,
          shopId: scope?.entityType === "shop_presentation_upload" ? scope.shopId : null,
          url: `/media/content/${stored.fileKey}`,
          mimeType: stored.mimeType,
          usageType: scope?.usageType,
          altText: input.altText,
          checksumSha256: stored.checksumSha256,
          width: stored.width ?? prepared.width ?? null,
          height: stored.height ?? prepared.height ?? null,
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
