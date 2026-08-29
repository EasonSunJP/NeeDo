import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

export interface AuditLogCreateInput {
  actorId?: number | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}

export interface AuditLogRepositoryPort {
  create: (input: AuditLogCreateInput) => Promise<void>;
}

export interface TransactionAwareAuditLogRepositoryPort extends AuditLogRepositoryPort {
  createInTransaction: (
    client: Pick<Prisma.TransactionClient, "auditLog">,
    input: AuditLogCreateInput
  ) => Promise<void>;
}

export const toAuditLogCreateData = (input: AuditLogCreateInput): Prisma.AuditLogUncheckedCreateInput => ({
  actorId: input.actorId ?? null,
  action: input.action,
  targetType: input.targetType,
  targetId: input.targetId ?? null,
  ip: input.ip ?? null,
  userAgent: input.userAgent ?? null,
  metadata: input.metadata as Prisma.InputJsonValue | undefined
});

export class AuditLogRepository implements TransactionAwareAuditLogRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async create(input: AuditLogCreateInput): Promise<void> {
    await this.client.auditLog.create({
      data: toAuditLogCreateData(input)
    });
  }

  public async createInTransaction(
    client: Pick<Prisma.TransactionClient, "auditLog">,
    input: AuditLogCreateInput
  ): Promise<void> {
    await client.auditLog.create({
      data: toAuditLogCreateData(input)
    });
  }
}
