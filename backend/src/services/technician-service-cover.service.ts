import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ContentMediaRepositoryPort } from "./content-media.service";
import {
  CONTENT_MEDIA_VALIDATION_PROFILES,
  type ContentMediaMimeType,
  type ContentMediaStoragePort
} from "./content-media.storage";
import type {
  PricingModeRepositoryPort,
  TechnicianServiceCoverTarget,
  TechnicianServicePayload
} from "./pricing-mode.service";

export class TechnicianServiceCoverService {
  public constructor(
    private readonly repository: PricingModeRepositoryPort,
    private readonly storage: ContentMediaStoragePort,
    private readonly checksumLock: Pick<ContentMediaRepositoryPort, "withChecksumLock">
  ) {}

  public async uploadCover(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number,
    input: { bytes: Buffer; mimeType: ContentMediaMimeType; now: Date }
  ): Promise<TechnicianServicePayload> {
    const { technicianId } = await this.getOwnedTarget(actor, shopId, serviceId);
    let prepared: Awaited<ReturnType<ContentMediaStoragePort["prepare"]>>;
    try {
      prepared = await this.storage.prepare({
        bytes: input.bytes,
        mimeType: input.mimeType,
        validationProfile: CONTENT_MEDIA_VALIDATION_PROFILES.decodedSingleFrame
      });
    } catch (error) {
      throw this.normalizeStorageError(error);
    }

    return this.checksumLock.withChecksumLock(prepared.checksumSha256, async () => {
      const target = await this.repository.findTechnicianServiceCoverTarget({
        shopId,
        technicianId,
        serviceId
      });
      if (!target) {
        throw this.notFound();
      }
      const expectedUrl = `/media/content/${prepared.fileKey}`;
      if (
        target.checksumSha256 === prepared.checksumSha256 &&
        target.mimeType === prepared.mimeType &&
        target.service.coverImageUrl === expectedUrl
      ) {
        return target.service;
      }

      let stored: Awaited<ReturnType<ContentMediaStoragePort["save"]>>;
      try {
        stored = await this.storage.save({ bytes: input.bytes, mimeType: input.mimeType });
      } catch (error) {
        throw this.normalizeStorageError(error);
      }

      const url = `/media/content/${stored.fileKey}`;
      try {
        const service = await this.repository.replaceTechnicianServiceCover({
          shopId,
          technicianId,
          serviceId,
          ownerUserId: actor.userId,
          ownerIdentityId: actor.currentIdentityId!,
          url,
          fileKey: stored.fileKey,
          mimeType: stored.mimeType,
          checksumSha256: stored.checksumSha256,
          fileSize: input.bytes.length,
          now: input.now,
          action: "technician.service.cover.updated",
          context
        });
        if (!service) {
          throw this.notFound();
        }
        return service;
      } catch (persistenceError) {
        await this.compensateStoredBlob(stored, url);
        throw persistenceError;
      }
    });
  }

  public async removeCover(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number,
    now: Date
  ): Promise<TechnicianServicePayload> {
    const { technicianId, target } = await this.getOwnedTarget(actor, shopId, serviceId);
    if (target.activeMediaAssetId === null && target.service.coverImageUrl === null) {
      return target.service;
    }

    const service = await this.repository.removeTechnicianServiceCover({
      shopId,
      technicianId,
      serviceId,
      ownerUserId: actor.userId,
      ownerIdentityId: actor.currentIdentityId!,
      now,
      action: "technician.service.cover.removed",
      context
    });
    if (!service) {
      throw this.notFound();
    }
    return service;
  }

  private async getOwnedTarget(
    actor: AuthenticatedAccessContext,
    shopId: number,
    serviceId: number
  ): Promise<{ technicianId: number; target: TechnicianServiceCoverTarget }> {
    if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId ||
      !actor.currentIdentityId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }

    const scope = await this.repository.findTechnicianShopScope(actor.currentIdentityScopeId);
    if (!scope || scope.shopId !== shopId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }

    const target = await this.repository.findTechnicianServiceCoverTarget({
      shopId,
      technicianId: scope.technicianId,
      serviceId
    });
    if (!target) {
      throw this.notFound();
    }

    return { technicianId: scope.technicianId, target };
  }

  private async compensateStoredBlob(
    stored: Awaited<ReturnType<ContentMediaStoragePort["save"]>>,
    url: string
  ): Promise<void> {
    if (!stored.created) {
      return;
    }

    try {
      if (!(await this.repository.hasActiveMediaUrl(url))) {
        await this.storage.delete(stored.fileKey);
      }
    } catch (cleanupError) {
      logger.warn(
        {
          cleanupErrorName: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
          publicId: stored.checksumSha256
        },
        "Technician service cover compensation cleanup failed"
      );
    }
  }

  private normalizeStorageError(error: unknown): unknown {
    if (error instanceof AppError && error.message === "error.content.media_too_large") {
      return new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.technician_service.cover_too_large",
        statusCode: 413,
        cause: error
      });
    }
    if (error instanceof AppError && error.message === "error.content.media_invalid") {
      return new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.technician_service.cover_invalid",
        statusCode: 400,
        cause: error
      });
    }
    return error;
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.technician_service.not_found",
      statusCode: 404
    });
  }
}
