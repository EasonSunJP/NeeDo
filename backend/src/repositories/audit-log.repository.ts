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

export class AuditLogRepository implements AuditLogRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async create(input: AuditLogCreateInput): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
