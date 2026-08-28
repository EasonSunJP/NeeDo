import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type OrderAcceptancePauseSubject = "merchant_account" | "shop";
export type OrderAcceptancePauseAuthority = "operations" | "merchant" | "shop";
export type OrderAcceptancePauseState = "active" | "released";

export type OrderAcceptancePauseActorScope =
  | { authorityType: "operations" }
  | {
      authorityType: "merchant";
      scopeType: "merchant_account";
      scopeId: number;
    }
  | { authorityType: "shop"; scopeType: "shop"; scopeId: number };

export interface OrderAcceptancePausePayload {
  id: number;
  subjectType: OrderAcceptancePauseSubject;
  subjectId: number;
  merchantAccountId: number | null;
  merchantAccountName: string | null;
  shopId: number | null;
  shopName: string | null;
  authorityType: OrderAcceptancePauseAuthority;
  status: OrderAcceptancePauseState;
  reasonCode: string;
  reasonDetail: string;
  startsAt: Date;
  releasedAt: Date | null;
  releaseReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderAcceptancePauseListInput extends PaginationInput {
  status?: OrderAcceptancePauseState;
  subjectType?: OrderAcceptancePauseSubject;
  subjectId?: number;
}

interface OrderAcceptancePauseMutationBase {
  actorUserId: number;
  actorScope: OrderAcceptancePauseActorScope;
  audit: AuditLogCreateInput;
}

export interface OrderAcceptancePauseCreateRepositoryInput extends OrderAcceptancePauseMutationBase {
  subjectType: OrderAcceptancePauseSubject;
  subjectId: number;
  reasonCode: string;
  reasonDetail: string;
}

export interface OrderAcceptancePauseReleaseRepositoryInput extends OrderAcceptancePauseMutationBase {
  pauseId: number;
  releaseReason: string;
}

export type OrderAcceptancePauseMutationResult =
  | {
      kind: "created" | "existing" | "released" | "already_released";
      value: OrderAcceptancePausePayload;
    }
  | { kind: "not_found" | "scope_forbidden" | "conflict" };

export interface OrderAcceptancePauseRepositoryPort {
  listPauses: (
    actorScope: OrderAcceptancePauseActorScope,
    input: OrderAcceptancePauseListInput
  ) => Promise<PaginatedResponse<OrderAcceptancePausePayload>>;
  createPause: (
    input: OrderAcceptancePauseCreateRepositoryInput
  ) => Promise<OrderAcceptancePauseMutationResult>;
  releasePause: (
    input: OrderAcceptancePauseReleaseRepositoryInput
  ) => Promise<OrderAcceptancePauseMutationResult>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class OrderAcceptancePauseService {
  public constructor(
    private readonly repository: OrderAcceptancePauseRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async listPauses(
    actor: AuthenticatedAccessContext,
    input: OrderAcceptancePauseListInput
  ): Promise<PaginatedResponse<OrderAcceptancePausePayload>> {
    return this.repository.listPauses(this.resolveActorScope(actor), input);
  }

  public async createPause(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: {
      subjectType: OrderAcceptancePauseSubject;
      subjectId: number;
      reasonCode: string;
      reasonDetail: string;
    }
  ): Promise<OrderAcceptancePausePayload> {
    const actorScope = this.resolveActorScope(actor);
    const result = await this.repository.createPause({
      ...input,
      actorUserId: actor.userId,
      actorScope,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: `${actorScope.authorityType === "operations" ? "backoffice" : "merchant_admin"}.order_acceptance_pause.create`,
          targetType: "OrderAcceptancePause",
          metadata: input
        })
      )
    });
    return this.unwrapMutation(result);
  }

  public async releasePause(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    pauseId: number,
    input: { releaseReason: string }
  ): Promise<OrderAcceptancePausePayload> {
    const actorScope = this.resolveActorScope(actor);
    const result = await this.repository.releasePause({
      pauseId,
      releaseReason: input.releaseReason,
      actorUserId: actor.userId,
      actorScope,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: `${actorScope.authorityType === "operations" ? "backoffice" : "merchant_admin"}.order_acceptance_pause.release`,
          targetType: "OrderAcceptancePause",
          targetId: pauseId,
          metadata: input
        })
      )
    });
    return this.unwrapMutation(result);
  }

  private resolveActorScope(actor: AuthenticatedAccessContext): OrderAcceptancePauseActorScope {
    if (
      actor.currentIdentityScopeType === "global" ||
      actor.currentIdentityScopeType === "platform"
    ) {
      return { authorityType: "operations" };
    }
    if (actor.currentIdentityScopeType === "merchant_account" && actor.currentIdentityScopeId) {
      return {
        authorityType: "merchant",
        scopeType: "merchant_account",
        scopeId: actor.currentIdentityScopeId
      };
    }
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return {
        authorityType: "shop",
        scopeType: "shop",
        scopeId: actor.currentIdentityScopeId
      };
    }
    throw this.identityForbiddenError();
  }

  private unwrapMutation(result: OrderAcceptancePauseMutationResult): OrderAcceptancePausePayload {
    if (
      result.kind === "created" ||
      result.kind === "existing" ||
      result.kind === "released" ||
      result.kind === "already_released"
    ) {
      return result.value;
    }
    if (result.kind === "scope_forbidden") {
      throw this.identityForbiddenError();
    }
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.order_acceptance_pause.not_found",
        statusCode: 404
      });
    }
    throw new AppError({
      code: ERROR_CODES.ORDER_ACCEPTANCE_PAUSE_CONFLICT,
      message: "error.order_acceptance_pause.conflict",
      statusCode: 409
    });
  }

  private auditRecord(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: Omit<AuditLogRecordInput, "actor" | "context">
  ): AuditLogRecordInput {
    return { ...input, actor, context };
  }

  private identityForbiddenError(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
