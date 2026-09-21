import type { NextFunction, Request, Response } from "express";
import type { BackofficeUserReviewService } from "../services/backoffice-user-review.service";
import type { BackofficePreferenceService } from "../services/backoffice-preference.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  backofficeOperationsReviewListQuerySchema,
  backofficeUserReviewAmendmentBodySchema,
  backofficeUserReviewListQuerySchema,
  backofficeUserReviewParamSchema,
  backofficeUserReviewUserParamSchema
} from "../validators/backoffice-user-review.validator";

export class BackofficeUserReviewController {
  public constructor(
    private readonly service: BackofficeUserReviewService,
    private readonly preference?: Pick<BackofficePreferenceService, "getEffective">
  ) {}

  private async showTestNdpData(response: Response): Promise<boolean> {
    const actor = getAuthenticatedAccess(response);
    return (await this.preference?.getEffective(actor.userId))?.showTestNdpData ?? true;
  }

  public listOperationsReviews = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listOperationsReviews(
            getAuthenticatedAccess(response),
            backofficeOperationsReviewListQuerySchema.parse(request.query),
            await this.showTestNdpData(response)
          )
        )
      );
  });

  public getOperationsReview = this.handle(async (request, response) => {
    const { reviewId } = backofficeUserReviewParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getOperationsReview(
            getAuthenticatedAccess(response),
            reviewId,
            await this.showTestNdpData(response)
          )
        )
      );
  });

  public listForOperations = this.handle(async (request, response) => {
    const { userId } = backofficeUserReviewUserParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listForOperations(
            getAuthenticatedAccess(response),
            userId,
            backofficeUserReviewListQuerySchema.parse(request.query),
            await this.showTestNdpData(response)
          )
        )
      );
  });

  public listForMerchant = this.handle(async (request, response) => {
    const { userId } = backofficeUserReviewUserParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listForMerchant(
            getAuthenticatedAccess(response),
            userId,
            backofficeUserReviewListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public amend = this.handle(async (request, response) => {
    const { reviewId } = backofficeUserReviewParamSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.amend(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            reviewId,
            backofficeUserReviewAmendmentBodySchema.parse(request.body)
          )
        )
      );
  });

  private handle(
    handler: (request: Request, response: Response) => Promise<void>
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
