import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import {
  releaseDateRange,
  releasePublicationItemSchema,
  type EditReleaseInput,
  type ManualReleaseInput,
  type ReleasePublicationInput,
  type ReleasePublicationItem,
  type ReleaseTimelineQuery
} from "../domain/release-publication";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";

export interface ReleasePublicationRepositoryPort {
  list(
    environment: string,
    query: ReleaseTimelineQuery
  ): Promise<{ list: ReleasePublicationItem[]; total: number; page: number; page_size: number }>;
  publish(input: ReleasePublicationInput): Promise<{ id: number; replayed: boolean }>;
  createManual(
    environment: string,
    actorUserId: number,
    input: ManualReleaseInput
  ): Promise<ReleasePublicationItem>;
  edit(
    environment: string,
    actorUserId: number,
    id: number,
    input: EditReleaseInput
  ): Promise<ReleasePublicationItem>;
}
const payloadHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const toItem = (row: {
  id: number;
  deploymentId: string;
  environment: string;
  sourceRevision: string | null;
  previousRevision: string | null;
  version: string;
  kind: string;
  publishedAt: Date;
  changes: Prisma.JsonValue;
  origin: string;
  lockVersion: number;
}): ReleasePublicationItem =>
  releasePublicationItemSchema.parse({
    id: row.id,
    deploymentId: row.deploymentId,
    environment: row.environment,
    sourceRevision: row.sourceRevision,
    previousRevision: row.previousRevision,
    version: row.version,
    kind: row.kind,
    publishedAt: row.publishedAt.toISOString(),
    changes: row.changes,
    origin: row.origin,
    lockVersion: row.lockVersion
  });
const snapshot = (row: ReleasePublicationItem): Prisma.InputJsonObject => ({
  deploymentId: row.deploymentId,
  environment: row.environment,
  sourceRevision: row.sourceRevision,
  previousRevision: row.previousRevision,
  version: row.version,
  kind: row.kind,
  publishedAt: row.publishedAt,
  changes: row.changes,
  origin: row.origin,
  lockVersion: row.lockVersion
});
const conflict = (message: string) =>
  new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 409 });

export class ReleasePublicationRepository implements ReleasePublicationRepositoryPort {
  constructor(private readonly client: PrismaClient = prisma) {}
  async list(environment: string, query: ReleaseTimelineQuery) {
    const range = releaseDateRange(query);
    const where: Prisma.ReleasePublicationWhereInput = {
      environment,
      deletedAt: null,
      ...(Object.keys(range).length ? { publishedAt: range } : {})
    };
    return this.client.$transaction(
      async (tx) => {
        const total = await tx.releasePublication.count({ where });
        const rows = await tx.releasePublication.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        });
        return { total, page: query.page, page_size: query.pageSize, list: rows.map(toItem) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async publish(input: ReleasePublicationInput) {
    const hash = payloadHash(input);
    return this.client.$transaction(async (tx) => {
      const inserted = await tx.releasePublication.createMany({
        data: [
          {
            ...input,
            publishedAt: new Date(input.publishedAt),
            payloadHash: hash,
            changes: input.changes,
            origin: "deployment"
          }
        ],
        skipDuplicates: true
      });
      const row = await tx.releasePublication.findUniqueOrThrow({
        where: { deploymentId: input.deploymentId }
      });
      if (inserted.count === 0) {
        if (row.payloadHash !== hash) throw conflict("error.release.deployment_id_conflict");
        return { id: row.id, replayed: true };
      }
      const item = toItem(row);
      await tx.releasePublicationRevision.create({
        data: {
          releasePublicationId: row.id,
          revisionVersion: row.lockVersion,
          action: "published",
          reason: "Verified deployment receipt",
          afterSnapshot: snapshot(item)
        }
      });
      await tx.auditLog.create({
        data: {
          action: "release.published",
          targetType: "ReleasePublication",
          targetId: row.id,
          metadata: snapshot(item)
        }
      });
      return { id: row.id, replayed: false };
    });
  }
  async createManual(environment: string, actorUserId: number, input: ManualReleaseInput) {
    const data = {
      deploymentId: input.deploymentId,
      environment,
      sourceRevision: input.sourceRevision,
      previousRevision: null,
      version: input.version,
      kind: "release",
      publishedAt: new Date(input.publishedAt),
      changes: input.changes,
      origin: "manual",
      lockVersion: 1,
      payloadHash: payloadHash({ environment, ...input })
    };
    try {
      return await this.client.$transaction(async (tx) => {
        const row = await tx.releasePublication.create({ data });
        const item = toItem(row);
        await tx.releasePublicationRevision.create({
          data: {
            releasePublicationId: row.id,
            revisionVersion: 1,
            action: "manual_created",
            reason: input.reason,
            afterSnapshot: snapshot(item),
            actorUserId
          }
        });
        await tx.auditLog.create({
          data: {
            action: "release.manual_created",
            targetType: "ReleasePublication",
            targetId: row.id,
            actorId: actorUserId,
            metadata: { reason: input.reason, release: snapshot(item) }
          }
        });
        return item;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw conflict("error.release.deployment_id_conflict");
      throw error;
    }
  }
  async edit(environment: string, actorUserId: number, id: number, input: EditReleaseInput) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.releasePublication.findFirst({
        where: { id, environment, deletedAt: null }
      });
      if (!current)
        throw new AppError({
          code: ERROR_CODES.NOT_FOUND,
          message: "error.release.not_found",
          statusCode: 404
        });
      if (current.origin === "deployment") throw conflict("error.release.deployment_immutable");
      const before = toItem(current);
      const updated = await tx.releasePublication.updateMany({
        where: { id, environment, deletedAt: null, lockVersion: input.expectedVersion },
        data: {
          version: input.version,
          changes: input.changes,
          payloadHash: payloadHash({
            deploymentId: current.deploymentId,
            environment,
            version: input.version,
            changes: input.changes,
            publishedAt: current.publishedAt.toISOString()
          }),
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) throw conflict("error.release.version_conflict");
      const row = await tx.releasePublication.findUniqueOrThrow({ where: { id } });
      const after = toItem(row);
      await tx.releasePublicationRevision.create({
        data: {
          releasePublicationId: id,
          revisionVersion: after.lockVersion,
          action: "corrected",
          reason: input.reason,
          beforeSnapshot: snapshot(before),
          afterSnapshot: snapshot(after),
          actorUserId
        }
      });
      await tx.auditLog.create({
        data: {
          action: "release.corrected",
          targetType: "ReleasePublication",
          targetId: id,
          actorId: actorUserId,
          metadata: { reason: input.reason, before: snapshot(before), after: snapshot(after) }
        }
      });
      return after;
    });
  }
}
