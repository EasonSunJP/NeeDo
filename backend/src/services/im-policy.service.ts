import { ERROR_CODES } from "../constants/error-codes";
import type {
  ImPolicyMutationResult,
  ImPolicyRecord,
  ImPolicyRepositoryPort
} from "../repositories/im-policy.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

const DAY_SECONDS = 86_400;
const MAX_RETENTION_DAYS = 3_650;

export interface ImRetentionSettings {
  version: number;
  messageDays: number;
  mediaDays: number;
  updatedAt: Date;
}

export interface ImRetentionUpdateInput {
  expectedVersion: number;
  messageDays: number;
  mediaDays: number;
}

export class ImPolicyService {
  public constructor(
    private readonly repository: ImPolicyRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public async get(actor: AuthenticatedAccessContext): Promise<ImRetentionSettings> {
    this.assertOperationsIdentity(actor);
    return this.publicSettings(await this.requireActive());
  }

  public async update(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ImRetentionUpdateInput
  ): Promise<ImRetentionSettings> {
    this.assertOperationsIdentity(actor);
    this.assertInput(input);
    const current = await this.requireActive();
    const changedFields = (["messageDays", "mediaDays"] as const).filter(
      (field) => current[field] !== input[field]
    );
    const result = await this.repository.replaceWithAudit({
      expectedVersion: input.expectedVersion,
      actorUserId: actor.userId,
      messageRetentionSeconds: input.messageDays * DAY_SECONDS,
      mediaRetentionSeconds: input.mediaDays * DAY_SECONDS,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "backoffice.im_retention.updated",
        targetType: "ImPolicy",
        metadata: { expectedVersion: input.expectedVersion, changedFields }
      })
    });
    return this.publicSettings(this.unwrap(result));
  }

  private unwrap(result: ImPolicyMutationResult): ImPolicyRecord {
    if (result.kind === "updated") return result.value;
    throw new AppError({
      code: ERROR_CODES.IM_POLICY_VERSION_CONFLICT,
      message: "error.im.policy_version_conflict",
      statusCode: 409
    });
  }

  private async requireActive(): Promise<ImPolicyRecord> {
    const current = await this.repository.getActive();
    if (current) return current;
    throw new AppError({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency_unavailable",
      statusCode: 503
    });
  }

  private publicSettings(policy: ImPolicyRecord): ImRetentionSettings {
    return {
      version: policy.version,
      messageDays: policy.messageDays,
      mediaDays: policy.mediaDays,
      updatedAt: policy.updatedAt
    };
  }

  private assertInput(input: ImRetentionUpdateInput): void {
    if (
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1 ||
      !Number.isInteger(input.messageDays) ||
      input.messageDays < 1 ||
      input.messageDays > MAX_RETENTION_DAYS ||
      !Number.isInteger(input.mediaDays) ||
      input.mediaDays < 1 ||
      input.mediaDays > MAX_RETENTION_DAYS
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType === "global" ||
      actor.currentIdentityScopeType === "platform"
    ) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
