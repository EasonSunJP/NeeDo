import type { Prisma, PrismaClient } from "@prisma/client";
import { createConnection, type ConnectionConfig } from "mariadb";
import { createMariaDbPoolConfig, type DatabaseEnvConfig } from "../config/database";
import { env } from "../config/env";
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

export interface ContentMediaAdvisoryLockConnection {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
  end(): Promise<void>;
  destroy(): void;
}

export type ContentMediaAdvisoryLockConnectionFactory =
  () => Promise<ContentMediaAdvisoryLockConnection>;

const DEFAULT_LOCK_TIMEOUT_SECONDS = 30;

export const createContentMediaAdvisoryLockConnectionFactory = (
  config: DatabaseEnvConfig = env
): ContentMediaAdvisoryLockConnectionFactory => {
  const runtimeConfig = createMariaDbPoolConfig(config);
  const connectionConfig: ConnectionConfig = {
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    user: runtimeConfig.user,
    password: runtimeConfig.password,
    database: runtimeConfig.database,
    charset: runtimeConfig.charset,
    collation: runtimeConfig.collation,
    timezone: runtimeConfig.timezone,
    allowPublicKeyRetrieval: runtimeConfig.allowPublicKeyRetrieval,
    connectTimeout: runtimeConfig.connectTimeout
  };
  return async () => createConnection(connectionConfig);
};

export class ContentMediaRepository implements ContentMediaRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly connectionFactory: ContentMediaAdvisoryLockConnectionFactory = createContentMediaAdvisoryLockConnectionFactory(),
    private readonly lockTimeoutSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS
  ) {}

  public async withChecksumLock<T>(
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

    const connection = await this.connectionFactory();
    let forceClose = false;
    try {
      let lockRows: AdvisoryLockRow[];
      try {
        lockRows = (await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [
          checksumSha256,
          this.lockTimeoutSeconds
        ])) as AdvisoryLockRow[];
      } catch (acquisitionError) {
        forceClose = true;
        throw acquisitionError;
      }
      if (Number(lockRows[0]?.acquired) !== 1) {
        throw new AppError({
          code: ERROR_CODES.SAAS_BILLING_CONFLICT,
          message: "error.content.lock_conflict",
          statusCode: 409
        });
      }

      let result: T | undefined;
      let primaryError: unknown;
      let operationFailed = false;
      try {
        result = await operation({
          create: (input) => this.create(input)
        });
      } catch (error) {
        operationFailed = true;
        primaryError = error;
      }

      try {
        const releaseRows = (await connection.query("SELECT RELEASE_LOCK(?) AS released", [
          checksumSha256
        ])) as AdvisoryUnlockRow[];
        if (Number(releaseRows[0]?.released) !== 1) {
          forceClose = true;
          this.logConnectionFailure(checksumSha256, "release", "UnexpectedResult");
        }
      } catch (releaseError) {
        forceClose = true;
        this.logConnectionFailure(
          checksumSha256,
          "release",
          releaseError instanceof Error ? releaseError.name : typeof releaseError
        );
      }

      if (operationFailed) {
        throw primaryError;
      }
      return result as T;
    } finally {
      if (forceClose) {
        this.destroyConnection(connection, checksumSha256);
      } else {
        await this.endConnection(connection, checksumSha256);
      }
    }
  }

  private create(input: CreateContentMediaRepositoryInput): Promise<ContentMediaProjection> {
    return this.client.$transaction((transaction) => this.createInTransaction(transaction, input));
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
        ownerIdentityId: input.ownerIdentityId ?? null,
        shopId: input.shopId ?? null,
        url: input.url,
        mimeType: input.mimeType,
        usageType: input.usageType ?? "content_publication_public",
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
        action:
          input.entityType === "official_notice_upload"
            ? "official_notice.media_uploaded"
            : "content.media.uploaded",
        targetType: "MediaAsset",
        targetId: mediaAsset.id,
        ip: input.context.ip,
        userAgent: input.context.userAgent ?? null,
        metadata: {
          publicId: input.checksumSha256,
          mediaAssetId: mediaAsset.id,
          url: input.url,
          mimeType: input.mimeType,
          altText: input.altText,
          fileName: input.fileName ?? null,
          shopId: input.shopId ?? null,
          ownerIdentityId: input.ownerIdentityId ?? null
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

  private async endConnection(
    connection: ContentMediaAdvisoryLockConnection,
    checksumSha256: string
  ): Promise<void> {
    try {
      await connection.end();
    } catch (closeError) {
      this.logConnectionFailure(
        checksumSha256,
        "close",
        closeError instanceof Error ? closeError.name : typeof closeError
      );
      this.destroyConnection(connection, checksumSha256);
    }
  }

  private destroyConnection(
    connection: ContentMediaAdvisoryLockConnection,
    checksumSha256: string
  ): void {
    try {
      connection.destroy();
    } catch (destroyError) {
      this.logConnectionFailure(
        checksumSha256,
        "destroy",
        destroyError instanceof Error ? destroyError.name : typeof destroyError
      );
    }
  }

  private logConnectionFailure(
    checksumSha256: string,
    phase: "release" | "close" | "destroy",
    errorName: string
  ): void {
    logger.warn(
      { phase, errorName, publicId: checksumSha256 },
      "Content media advisory lock connection operation failed"
    );
  }
}
