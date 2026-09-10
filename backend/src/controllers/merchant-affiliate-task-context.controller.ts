import type { NextFunction, Request, Response } from "express";
import type { MerchantAffiliateTaskContextService } from "../services/merchant-affiliate-task-context.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  merchantAffiliateFeePreviewBodySchema,
  merchantAffiliatePublishersQuerySchema,
  merchantAffiliateServicesQuerySchema,
  merchantAffiliateShopsQuerySchema
} from "../validators/merchant-affiliate-task-context.validator";

export class MerchantAffiliateTaskContextController {
  public constructor(private readonly service: MerchantAffiliateTaskContextService) {}

  public listPublishers = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listPublishers(
          getAuthenticatedAccess(response),
          merchantAffiliatePublishersQuerySchema.parse(request.query)
        )
      )
    );
  });

  public listShops = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listShops(
          getAuthenticatedAccess(response),
          merchantAffiliateShopsQuerySchema.parse(request.query)
        )
      )
    );
  });

  public listServices = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listServices(
          getAuthenticatedAccess(response),
          merchantAffiliateServicesQuerySchema.parse(request.query)
        )
      )
    );
  });

  public previewFee = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.previewFee(
          getAuthenticatedAccess(response),
          merchantAffiliateFeePreviewBodySchema.parse(request.body)
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
