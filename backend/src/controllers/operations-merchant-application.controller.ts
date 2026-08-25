import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { MerchantApplicationReviewService } from "../services/merchant-application-review.service";
import { successResponse } from "../utils/api-response";
import {
  operationsMerchantApplicationIdParamSchema,
  operationsMerchantApplicationListQuerySchema,
  operationsMerchantApplicationRejectBodySchema,
  operationsMerchantApplicationReviewBodySchema
} from "../validators/operations-merchant-application.validator";

const SENSITIVE_DOCUMENT_PERMISSION = "identity-application-media:sensitive-read";

export class OperationsMerchantApplicationController {
  public constructor(private readonly service: MerchantApplicationReviewService) {}

  public list = this.handle(async (request, response) => {
    const query = operationsMerchantApplicationListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.list(
          { page: query.page, pageSize: query.page_size, status: query.status },
          this.canReadSensitiveDocuments(response)
        )
      )
    );
  });

  public get = this.handle(async (request, response) => {
    const { id } = operationsMerchantApplicationIdParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(await this.service.get(id, this.canReadSensitiveDocuments(response)))
    );
  });

  public approve = this.handle(async (request, response) => {
    const { id } = operationsMerchantApplicationIdParamSchema.parse(request.params);
    const body = operationsMerchantApplicationReviewBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.service.approve({
          applicationId: id,
          reviewerUserId: this.auth(response).userId,
          expectedVersion: body.expectedVersion,
          now: new Date()
        })
      )
    );
  });

  public reject = this.handle(async (request, response) => {
    const { id } = operationsMerchantApplicationIdParamSchema.parse(request.params);
    const body = operationsMerchantApplicationRejectBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.service.reject({
          applicationId: id,
          reviewerUserId: this.auth(response).userId,
          expectedVersion: body.expectedVersion,
          rejectionReason: body.rejectionReason,
          now: new Date()
        })
      )
    );
  });

  private auth(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private canReadSensitiveDocuments(response: Response): boolean {
    return this.auth(response).permissions.includes(SENSITIVE_DOCUMENT_PERMISSION);
  }

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
