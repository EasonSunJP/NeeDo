import type {
  AuditLogCreateInput,
  AuditLogRepositoryPort
} from "../repositories/audit-log.repository";
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
    await this.repository.create(this.createInput(input));
  }

  public createInput(input: AuditLogRecordInput): AuditLogCreateInput {
    const metadata = input.actor.isReadOnlyMerchantPreview
      ? {
          ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
          readOnlyMerchantPreview: true,
          previewShopId: input.actor.merchantPreviewShopId
        }
      : input.metadata;

    return {
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata
    };
  }
}
