import { ERROR_CODES } from "../constants/error-codes";
import type {
  BackofficeUserUsageRepositoryPort,
  UserUsagePage,
  UserUsageTimeline
} from "../repositories/backoffice-user-usage.repository";
import { AppError } from "../utils/app-error";
import type {
  BackofficeRefundAmendmentBody,
  BackofficeUserUsageListQuery
} from "../validators/backoffice-user-usage.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { resolveUsagePeriod } from "./backoffice-user-usage-period";
import { requireMerchantShopId } from "./merchant-shop-scope";

export class BackofficeUserUsageService {
  public constructor(
    private readonly repository: BackofficeUserUsageRepositoryPort,
    private readonly audit: AuditLogService,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listForOperations(
    actor: AuthenticatedAccessContext,
    userId: number,
    input: BackofficeUserUsageListQuery,
    showTestNdpData = true
  ): Promise<UserUsagePage> {
    this.assertOperationsActor(actor);
    return this.list({ scope: "platform", showTestNdpData }, userId, input);
  }

  public async listForMerchant(
    actor: AuthenticatedAccessContext,
    userId: number,
    input: BackofficeUserUsageListQuery
  ): Promise<UserUsagePage> {
    return this.list({ scope: "merchant", shopId: requireMerchantShopId(actor) }, userId, input);
  }

  public async getTimelineForOperations(
    actor: AuthenticatedAccessContext,
    userId: number,
    orderId: number,
    showTestNdpData = true
  ): Promise<UserUsageTimeline> {
    this.assertOperationsActor(actor);
    return this.getTimeline({ scope: "platform", showTestNdpData }, userId, orderId);
  }

  public async getTimelineForMerchant(
    actor: AuthenticatedAccessContext,
    userId: number,
    orderId: number
  ): Promise<UserUsageTimeline> {
    return this.getTimeline(
      { scope: "merchant", shopId: requireMerchantShopId(actor) },
      userId,
      orderId
    );
  }

  public async appendComment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    userId: number,
    orderId: number,
    body: string
  ): Promise<{ commentId: number }> {
    this.assertOperationsActor(actor);
    const normalized = body.trim();
    this.assertIds(userId, orderId);
    if (!normalized || normalized.length > 2000) throw this.validationError();
    const result = await this.repository.createCommentWithAudit({
      actorId: actor.userId,
      userId,
      orderId,
      body: normalized,
      audit: this.audit.createInput({
        actor,
        context,
        action: "backoffice.user_usage.comment.append",
        targetType: "OrderTimelineComment",
        metadata: { userId, orderId }
      })
    });
    if (result.kind === "created") return result.value;
    throw this.notFound();
  }

  public async amendRefund(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    userId: number,
    orderId: number,
    input: BackofficeRefundAmendmentBody
  ): Promise<{ orderId: number; version: number }> {
    this.assertOperationsActor(actor);
    this.assertIds(userId, orderId);
    const reason = input.reason.trim();
    if (
      !reason ||
      reason.length > 500 ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      (input.displayReference === undefined && input.note === undefined) ||
      (input.displayReference !== undefined &&
        input.displayReference !== null &&
        input.displayReference.length > 120) ||
      (input.note !== undefined && input.note !== null && input.note.length > 500)
    )
      throw this.validationError();
    const result = await this.repository.createRefundAmendmentWithAudit({
      actorId: actor.userId,
      userId,
      orderId,
      ...(input.displayReference === undefined ? {} : { displayReference: input.displayReference }),
      ...(input.note === undefined ? {} : { note: input.note }),
      reason,
      expectedVersion: input.expectedVersion,
      audit: this.audit.createInput({
        actor,
        context,
        action: "backoffice.user_usage.refund.amend",
        targetType: "OrderRefundAmendment",
        metadata: { userId, orderId, expectedVersion: input.expectedVersion, reason }
      })
    });
    if (result.kind === "created") return result.value;
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "refund_not_found") {
      throw new AppError({
        code: ERROR_CODES.BACKOFFICE_USER_REFUND_NOT_FOUND,
        message: "error.backoffice.user_refund_not_found",
        statusCode: 422
      });
    }
    throw new AppError({
      code: ERROR_CODES.BACKOFFICE_USER_REFUND_VERSION_CONFLICT,
      message: "error.backoffice.user_refund_version_conflict",
      statusCode: 409
    });
  }

  private async list(
    scope: { scope: "platform"; showTestNdpData?: boolean } | { scope: "merchant"; shopId: number },
    userId: number,
    input: BackofficeUserUsageListQuery
  ): Promise<UserUsagePage> {
    if (!Number.isInteger(userId) || userId <= 0 || input.page_size !== 10) {
      throw this.validationError();
    }
    const bounds = resolveUsagePeriod(input.period, this.now(), {
      from: input.from,
      to: input.to
    });
    return this.repository.listUsage({
      ...scope,
      userId,
      page: input.page,
      pageSize: 10,
      ...(input.keyword ? { keyword: input.keyword } : {}),
      ...bounds
    });
  }

  private async getTimeline(
    scope: { scope: "platform"; showTestNdpData?: boolean } | { scope: "merchant"; shopId: number },
    userId: number,
    orderId: number
  ): Promise<UserUsageTimeline> {
    this.assertIds(userId, orderId);
    const result = await this.repository.getTimeline({ ...scope, userId, orderId });
    if (!result) throw this.notFound();
    return result;
  }

  private assertIds(userId: number, orderId: number): void {
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(orderId) || orderId <= 0) {
      throw this.validationError();
    }
  }

  private assertOperationsActor(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "platform" &&
      actor.currentIdentityScopeType !== "global"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.BACKOFFICE_USER_USAGE_NOT_FOUND,
      message: "error.backoffice.user_usage_not_found",
      statusCode: 404
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
