import { ERROR_CODES } from "../constants/error-codes";
import type {
  BackofficeUserReviewRepositoryPort,
  ReceivedUserReviewPage
} from "../repositories/backoffice-user-review.repository";
import { AppError } from "../utils/app-error";
import type {
  BackofficeUserReviewAmendmentBody,
  BackofficeUserReviewListQuery
} from "../validators/backoffice-user-review.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export class BackofficeUserReviewService {
  public constructor(
    private readonly repository: BackofficeUserReviewRepositoryPort,
    private readonly audit: AuditLogService
  ) {}

  public async listForOperations(
    actor: AuthenticatedAccessContext,
    userId: number,
    input: BackofficeUserReviewListQuery
  ): Promise<ReceivedUserReviewPage> {
    this.assertOperationsActor(actor);
    this.assertListInput(userId, input);
    return this.repository.listReceivedReviews({
      scope: "platform",
      userId,
      page: input.page,
      pageSize: 10
    });
  }

  public async listForMerchant(
    actor: AuthenticatedAccessContext,
    userId: number,
    input: BackofficeUserReviewListQuery
  ): Promise<ReceivedUserReviewPage> {
    this.assertListInput(userId, input);
    const shopId = requireMerchantShopId(actor);
    if (!(await this.repository.isUserVisibleInMerchantScope(userId, shopId))) {
      throw new AppError({
        code: ERROR_CODES.BACKOFFICE_USER_REVIEW_NOT_FOUND,
        message: "error.backoffice.user_review_user_not_found",
        statusCode: 404
      });
    }
    return this.repository.listReceivedReviews({
      scope: "merchant",
      shopId,
      userId,
      page: input.page,
      pageSize: 10
    });
  }

  public async amend(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    reviewId: number,
    input: BackofficeUserReviewAmendmentBody
  ): Promise<{ reviewId: number; version: number }> {
    this.assertOperationsActor(actor);
    if (!Number.isInteger(reviewId) || reviewId <= 0) throw this.validationError();
    const reason = input.reason.trim();
    const normalizedTags = input.tags?.map((tag) => tag.trim());
    if (
      reason.length < 1 ||
      reason.length > 500 ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      (input.rating === undefined && input.comment === undefined && input.tags === undefined) ||
      (input.rating !== undefined &&
        (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) ||
      (input.comment !== undefined &&
        input.comment !== null &&
        (typeof input.comment !== "string" || input.comment.length > 1000)) ||
      (normalizedTags !== undefined &&
        (normalizedTags.length > 20 ||
          normalizedTags.some((tag) => tag.length < 1 || tag.length > 40)))
    ) {
      throw this.validationError();
    }
    const result = await this.repository.createAmendmentWithAudit({
      actorId: actor.userId,
      reviewId,
      ...(input.rating === undefined ? {} : { rating: input.rating }),
      ...(input.comment === undefined ? {} : { comment: input.comment }),
      ...(normalizedTags === undefined ? {} : { tags: [...new Set(normalizedTags)] }),
      reason,
      expectedVersion: input.expectedVersion,
      audit: this.audit.createInput({
        actor,
        context,
        action: "backoffice.order_review.amend",
        targetType: "OrderReviewAmendment",
        metadata: {
          reviewId,
          expectedVersion: input.expectedVersion,
          reason,
          changedFields: [
            ...(input.rating === undefined ? [] : ["rating"]),
            ...(input.comment === undefined ? [] : ["comment"]),
            ...(input.tags === undefined ? [] : ["tags"])
          ]
        }
      })
    });
    if (result.kind === "created") return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.BACKOFFICE_USER_REVIEW_NOT_FOUND,
        message: "error.backoffice.user_review_not_found",
        statusCode: 404
      });
    }
    throw new AppError({
      code: ERROR_CODES.BACKOFFICE_USER_REVIEW_VERSION_CONFLICT,
      message: "error.backoffice.user_review_version_conflict",
      statusCode: 409
    });
  }

  private assertListInput(userId: number, input: BackofficeUserReviewListQuery): void {
    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Number.isInteger(input.page) ||
      input.page <= 0 ||
      input.page_size !== 10
    ) {
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

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }
}
