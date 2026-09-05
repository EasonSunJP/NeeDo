import type { NextFunction, Request, Response } from "express";
import type { BackofficeUserUsageService } from "../services/backoffice-user-usage.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  backofficeRefundAmendmentBodySchema,
  backofficeUserUsageCommentBodySchema,
  backofficeUserUsageListQuerySchema,
  backofficeUserUsageParamsSchema
} from "../validators/backoffice-user-usage.validator";

export class BackofficeUserUsageController {
  public constructor(private readonly service: BackofficeUserUsageService) {}

  public listForOperations = this.handle(async (request, response) => {
    const { userId } = backofficeUserUsageParamsSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listForOperations(
            getAuthenticatedAccess(response),
            userId,
            backofficeUserUsageListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public listForMerchant = this.handle(async (request, response) => {
    const { userId } = backofficeUserUsageParamsSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listForMerchant(
            getAuthenticatedAccess(response),
            userId,
            backofficeUserUsageListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public timelineForOperations = this.handle(async (request, response) => {
    const { userId, orderId } = backofficeUserUsageParamsSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getTimelineForOperations(
            getAuthenticatedAccess(response),
            userId,
            orderId as number
          )
        )
      );
  });

  public timelineForMerchant = this.handle(async (request, response) => {
    const { userId, orderId } = backofficeUserUsageParamsSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getTimelineForMerchant(
            getAuthenticatedAccess(response),
            userId,
            orderId as number
          )
        )
      );
  });

  public appendComment = this.handle(async (request, response) => {
    const { userId, orderId } = backofficeUserUsageParamsSchema.parse(request.params);
    const { body } = backofficeUserUsageCommentBodySchema.parse(request.body);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.appendComment(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            userId,
            orderId as number,
            body
          )
        )
      );
  });

  public amendRefund = this.handle(async (request, response) => {
    const { userId, orderId } = backofficeUserUsageParamsSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.amendRefund(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            userId,
            orderId as number,
            backofficeRefundAmendmentBodySchema.parse(request.body)
          )
        )
      );
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
