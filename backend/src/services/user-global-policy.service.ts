import { ERROR_CODES } from "../constants/error-codes";
import type {
  ResolvedUserGlobalPolicy,
  UserGlobalPolicyDraftInput,
  UserGlobalPolicyMutationResult,
  UserGlobalPolicyRepositoryPort
} from "../domain/user-global-policy";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class UserGlobalPolicyService {
  public constructor(
    private readonly repository: UserGlobalPolicyRepositoryPort,
    private readonly auditInputFactory?: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async resolvePolicyAt(occurredAt: Date): Promise<ResolvedUserGlobalPolicy> {
    if (Number.isNaN(occurredAt.getTime())) throw this.validationError();
    const policy = await this.repository.resolvePolicyAt(occurredAt);
    if (policy) return policy;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.user_global_policy.unavailable",
      statusCode: 500
    });
  }

  public async getCurrentAndDraft(actor: AuthenticatedAccessContext) {
    this.assertOperationsIdentity(actor);
    return this.repository.getCurrentAndDraft(this.now());
  }

  public async saveDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    draft: UserGlobalPolicyDraftInput
  ): Promise<ResolvedUserGlobalPolicy> {
    this.assertOperationsIdentity(actor);
    this.assertDraft(draft);
    const result = await this.repository.saveDraftWithAudit({
      actorId: actor.userId,
      draft,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.user_global_policy.draft_save",
        targetType: "UserGlobalPolicyVersion",
        metadata: {
          expectedCurrentVersion: draft.expectedCurrentVersion,
          expectedDraftLockVersion: draft.expectedDraftLockVersion,
          effectiveFrom: draft.effectiveFrom.toISOString(),
          requirePhone: draft.requirePhone,
          requireEmail: draft.requireEmail,
          requireHomeServiceEkyc: draft.requireHomeServiceEkyc,
          requireStoreServiceEkyc: draft.requireStoreServiceEkyc,
          requireMerchantApplicationEkyc: draft.requireMerchantApplicationEkyc,
          requireTechnicianApplicationEkyc: draft.requireTechnicianApplicationEkyc,
          ndpPerBaseExp: draft.ndpPerBaseExp,
          baseExpUnitsPerThreshold: draft.baseExpUnitsPerThreshold
        }
      })
    });
    return this.unwrap(result);
  }

  public async publishDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { expectedVersion: number; expectedLockVersion: number; effectiveImmediately?: boolean }
  ): Promise<ResolvedUserGlobalPolicy> {
    this.assertOperationsIdentity(actor);
    this.assertVersion(input.expectedVersion, input.expectedLockVersion);
    const publishedAt = this.now();
    const { draft } = await this.repository.getCurrentAndDraft(publishedAt);
    if (!draft) throw this.invalidState();
    if (
      draft.version !== input.expectedVersion ||
      draft.lockVersion !== input.expectedLockVersion
    ) {
      throw this.versionConflict();
    }
    if (!input.effectiveImmediately && draft.effectiveFrom.getTime() < publishedAt.getTime()) {
      throw this.invalidState();
    }
    const result = await this.repository.publishDraftWithAudit({
      actorId: actor.userId,
      expectedVersion: input.expectedVersion,
      expectedLockVersion: input.expectedLockVersion,
      publishedAt,
      effectiveImmediately: input.effectiveImmediately,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.user_global_policy.publish",
        targetType: "UserGlobalPolicyVersion",
        metadata: {
          versionPublicId: draft.versionPublicId,
          version: draft.version,
          effectiveFrom: (input.effectiveImmediately ? publishedAt : draft.effectiveFrom).toISOString(),
          effectiveImmediately: input.effectiveImmediately === true,
          publishedAt: publishedAt.toISOString()
        }
      })
    });
    return this.unwrap(result);
  }

  private assertDraft(draft: UserGlobalPolicyDraftInput): void {
    if (
      !Number.isInteger(draft.expectedCurrentVersion) ||
      draft.expectedCurrentVersion < 1 ||
      (draft.expectedDraftLockVersion !== null &&
        (!Number.isInteger(draft.expectedDraftLockVersion) ||
          draft.expectedDraftLockVersion < 1)) ||
      !Number.isInteger(draft.ndpPerBaseExp) ||
      draft.ndpPerBaseExp < 1 ||
      draft.ndpPerBaseExp > 1_000_000 ||
      !Number.isInteger(draft.baseExpUnitsPerThreshold) ||
      draft.baseExpUnitsPerThreshold < 1 ||
      draft.baseExpUnitsPerThreshold > 1_000_000_000 ||
      Number.isNaN(draft.effectiveFrom.getTime())
    ) {
      throw this.validationError();
    }
  }

  private assertVersion(expectedVersion: number, expectedLockVersion: number): void {
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !Number.isInteger(expectedLockVersion) ||
      expectedLockVersion < 1
    ) {
      throw this.validationError();
    }
  }

  private unwrap(result: UserGlobalPolicyMutationResult): ResolvedUserGlobalPolicy {
    if ("value" in result) return result.value;
    if (result.kind === "version_conflict") throw this.versionConflict();
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.user_global_policy.not_found",
        statusCode: 404
      });
    }
    throw this.invalidState();
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

  private requireAuditFactory(): AuditInputFactory {
    if (this.auditInputFactory) return this.auditInputFactory;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.user_global_policy.audit_unavailable",
      statusCode: 500
    });
  }

  private versionConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.USER_GLOBAL_POLICY_CONFLICT,
      message: "error.user_global_policy.version_conflict",
      statusCode: 409
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.USER_GLOBAL_POLICY_CONFLICT,
      message: "error.user_global_policy.invalid_state",
      statusCode: 409
    });
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }
}
