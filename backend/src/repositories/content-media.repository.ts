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
import { EXCHANGE_PENDING_COVER_TTL_MS, type ContentMediaPurgeRepositoryPort, type PendingContentMedia } from "../services/content-media-purge.service";

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

export class ContentMediaRepository implements ContentMediaRepositoryPort, ContentMediaPurgeRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly connectionFactory: ContentMediaAdvisoryLockConnectionFactory = createContentMediaAdvisoryLockConnectionFactory(),
    private readonly lockTimeoutSeconds: number = DEFAULT_LOCK_TIMEOUT_SECONDS
  ) {}

  public async listDuePendingCovers(input: { now: Date; limit: number; afterId?: number }): Promise<PendingContentMedia[]> {
    const rows = await this.client.mediaAsset.findMany({
      where: {
        ...this.pendingPurgeWhere(input.now),
        id: { gt: input.afterId ?? 0 },
        checksumSha256: { not: null },
        OR: [
          { entityType: "exchange_demand_cover_pending", isActive: true },
          { entityType: "exchange_demand_cover_purging", isActive: false }
        ]
      },
      orderBy: { id: "asc" }, take: input.limit,
      select: { id: true, checksumSha256: true, url: true }
    });
    return rows.flatMap((row) => row.checksumSha256 ? [{ ...row, checksumSha256: row.checksumSha256 }] : []);
  }

  public claimPendingCoverPurge(candidate: PendingContentMedia, now: Date): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const claimed = await transaction.mediaAsset.updateMany({
        where: { ...this.pendingPurgeWhere(now), ...candidate, entityType: "exchange_demand_cover_pending", isActive: true },
        data: { entityType: "exchange_demand_cover_purging", isActive: false, updatedAt: now }
      });
      if (claimed.count === 1) {
        await this.createPurgeAudit(transaction, candidate, now, "exchange.demand_cover.purge_started");
        return true;
      }
      return Boolean(await transaction.mediaAsset.findFirst({
        where: { ...this.pendingPurgeWhere(now), ...candidate, entityType: "exchange_demand_cover_purging", isActive: false },
        select: { id: true }
      }));
    });
  }

  public async hasContentMediaReferences(candidate: PendingContentMedia): Promise<boolean> {
    // A fresh query after the retirement transaction commits avoids an old snapshot.
    // The checksum lock also prevents new uploads until this check and unlink finish.
    return await this.client.mediaAsset.count({ where: {
      AND: [
        { OR: [{ url: candidate.url }, { checksumSha256: candidate.checksumSha256 }] },
        { OR: [{ isActive: true, deletedAt: null, purgedAt: null }, { exchangeDemandCover: { isNot: null } }] }
      ]
    } }) > 0;
  }

  public completePendingCoverPurge(candidate: PendingContentMedia, now: Date): Promise<void> {
    return this.client.$transaction(async (transaction) => {
      const completed = await transaction.mediaAsset.updateMany({
        where: { ...this.pendingPurgeWhere(now), ...candidate, entityType: "exchange_demand_cover_purging", isActive: false },
        data: { purgedAt: now, deletedAt: now, updatedAt: now }
      });
      if (completed.count === 1) await this.createPurgeAudit(transaction, candidate, now, "exchange.demand_cover.purged");
    });
  }

  private pendingPurgeWhere(now: Date): Prisma.MediaAssetWhereInput {
    return {
      usageType: "exchange_demand_cover_pending", deletedAt: null, purgedAt: null, exchangeDemandCover: null,
      // Covers uploaded before the pending TTL was introduced use their creation
      // time as the same 24-hour deadline; no data backfill is required.
      AND: [{ OR: [
        { purgeAt: { lte: now } },
        { purgeAt: null, createdAt: { lte: new Date(now.getTime() - EXCHANGE_PENDING_COVER_TTL_MS) } }
      ] }]
    };
  }

  private async createPurgeAudit(transaction: Prisma.TransactionClient, candidate: PendingContentMedia, now: Date, action: string): Promise<void> {
    await transaction.auditLog.create({ data: {
      actorId: null, action, targetType: "MediaAsset", targetId: candidate.id, ip: null, userAgent: null,
      metadata: { publicId: candidate.checksumSha256, mediaAssetId: candidate.id }, createdAt: now
    } });
  }

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
        width: input.width ?? null,
        height: input.height ?? null,
        altText: input.altText,
        checksumSha256: input.checksumSha256,
        isActive: true,
        purgeAt: input.entityType === "exchange_demand_cover_pending"
          ? new Date(input.createdAt.getTime() + EXCHANGE_PENDING_COVER_TTL_MS) : null,
        createdAt: input.createdAt
      }
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.ownerUserId,
        action:
          input.entityType === "official_notice_upload"
            ? "official_notice.media_uploaded"
            : input.entityType === "exchange_demand_cover_pending"
              ? "exchange.demand_cover.uploaded"
            : input.entityType === "shop_presentation_upload"
              ? "merchant_admin.shop_presentation.media_uploaded"
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
      width: input.width ?? null,
      height: input.height ?? null,
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
