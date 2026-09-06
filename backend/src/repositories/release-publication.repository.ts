import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  releasePublicationSchema,
  type ReleasePublicationInput,
  type ReleasePublicationItem,
  type ReleaseTimelineQuery
} from "../domain/release-publication";

export interface ReleasePublicationRepositoryPort {
  list(
    environment: string,
    query: ReleaseTimelineQuery
  ): Promise<{ list: ReleasePublicationItem[]; total: number; page: number; page_size: number }>;
  publish(input: ReleasePublicationInput): Promise<{ id: number; replayed: boolean }>;
}
export class ReleasePublicationRepository implements ReleasePublicationRepositoryPort {
  constructor(private readonly client: PrismaClient = prisma) {}
  async list(environment: string, query: ReleaseTimelineQuery) {
    return this.client.$transaction(
      async (tx) => {
        const where = { environment, deletedAt: null };
        const total = await tx.releasePublication.count({ where });
        const rows = await tx.releasePublication.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        });
        return {
          total,
          page: query.page,
          page_size: query.pageSize,
          list: rows.map((row) => ({
            id: row.id,
            ...releasePublicationSchema.parse({
              deploymentId: row.deploymentId,
              environment: row.environment,
              sourceRevision: row.sourceRevision,
              previousRevision: row.previousRevision,
              version: row.version,
              kind: row.kind,
              publishedAt: row.publishedAt.toISOString(),
              changes: row.changes
            })
          }))
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async publish(input: ReleasePublicationInput) {
    const payloadHash = (await import("node:crypto"))
      .createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const existing = await this.client.releasePublication.findUnique({
      where: { deploymentId: input.deploymentId }
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new Error("release.deployment_id_conflict");
      return { id: existing.id, replayed: true };
    }
    try {
      return await this.client.$transaction(async (tx) => {
        const row = await tx.releasePublication.create({
          data: {
            ...input,
            publishedAt: new Date(input.publishedAt),
            payloadHash,
            changes: input.changes
          }
        });
        await tx.auditLog.create({
          data: {
            action: "release.published",
            targetType: "ReleasePublication",
            targetId: row.id,
            metadata: {
              deploymentId: input.deploymentId,
              environment: input.environment,
              sourceRevision: input.sourceRevision,
              publishedAt: input.publishedAt,
              kind: input.kind
            }
          }
        });
        return { id: row.id, replayed: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const row = await this.client.releasePublication.findUnique({
          where: { deploymentId: input.deploymentId }
        });
        if (row?.payloadHash === payloadHash) return { id: row.id, replayed: true };
      }
      throw error;
    }
  }
}
