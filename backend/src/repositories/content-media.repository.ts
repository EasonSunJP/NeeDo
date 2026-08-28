import { Prisma, type PrismaClient } from "@prisma/client";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  ContentMediaLockedRepositoryPort,
  ContentMediaProjection,
  ContentMediaRepositoryPort,
  CreateContentMediaRepositoryInput
} from "../services/content-media.service";
import { AppError } from "../utils/app-error";

interface AdvisoryLockRow {
  acquired: bigint | number | string | null;
}

interface AdvisoryUnlockRow {
  released: bigint | number | string | null;
}

const DEFAULT_LOCK_TIMEOUT_SECONDS = 30;

export class ContentMediaRepository implements ContentMediaRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly lockTimeoutSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS
  ) {}

  public withChecksumLock<T>(
    checksumSha256: string,
    operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/u.test(checksumSha256)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.content.media_invalid",
        statusCode: 400
      });
    }

    return this.client.$transaction(
      async (transaction) => {
        const lockRows = await transaction.$queryRaw<AdvisoryLockRow[]>(
          Prisma.sql`SELECT GET_LOCK(${checksumSha256}, ${this.lockTimeoutSeconds}) AS acquired`
        );
        if (Number(lockRows[0]?.acquired) !== 1) {
          throw new AppError({
            code: ERROR_CODES.SAAS_BILLING_CONFLICT,
            message: "error.content.lock_conflict",
            statusCode: 409
          });
        }

        let result: T | undefined;
        let primaryError: unknown;
        try {
          result = await operation({
            create: (input) => this.createInTransaction(transaction, input)
          });
        } catch (error) {
          primaryError = error;
        }

        try {
          const releaseRows = await transaction.$queryRaw<AdvisoryUnlockRow[]>(
            Prisma.sql`SELECT RELEASE_LOCK(${checksumSha256}) AS released`
          );
          if (Number(releaseRows[0]?.released) !== 1) {
            this.logReleaseFailure(checksumSha256, "UnexpectedResult");
          }
        } catch (releaseError) {
          this.logReleaseFailure(
            checksumSha256,
            releaseError instanceof Error ? releaseError.name : typeof releaseError
          );
        }

        if (primaryError !== undefined) {
          throw primaryError;
        }
        return result as T;
      },
      {
        maxWait: 10_000,
        timeout: this.lockTimeoutSeconds * 1_000 + 10_000
      }
    );
  }

  private async createInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateContentMediaRepositoryInput
  ): Promise<ContentMediaProjection> {
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
  }

  private logReleaseFailure(checksumSha256: string, releaseErrorName: string): void {
    logger.warn(
      { releaseErrorName, publicId: checksumSha256 },
      "Content media advisory lock release failed"
    );
  }
}
