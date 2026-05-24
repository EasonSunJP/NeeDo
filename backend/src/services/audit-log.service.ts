import type { AuditLogRepositoryPort } from "../repositories/audit-log.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface AuditLogRecordInput {
  actor: AuthenticatedAccessContext;
  action: string;
  targetType: string;
  targetId?: number | null;
  context: AuthRequestContext;
  metadata?: unknown;
}

export class AuditLogService {
  public constructor(private readonly repository: AuditLogRepositoryPort) {}

  public async record(input: AuditLogRecordInput): Promise<void> {
    await this.repository.create({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    });
  }
}
