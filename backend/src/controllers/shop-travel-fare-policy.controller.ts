import type { NextFunction, Request, Response } from "express";
import type { ShopTravelFarePolicyService } from "../services/shop-travel-fare-policy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopTravelFarePolicyHistoryQuerySchema,
  shopTravelFarePolicyPublishBodySchema
} from "../validators/shop-travel-fare-policy.validator";

export class ShopTravelFarePolicyController {
  public constructor(private readonly service: ShopTravelFarePolicyService) {}

  public getPolicy = this.handle(async (_request, response) => {
    response.status(200).json(successResponse(await this.service.getPolicy(getAuthenticatedAccess(response))));
  });

  public listVersions = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listVersions(
      getAuthenticatedAccess(response),
      shopTravelFarePolicyHistoryQuerySchema.parse(request.query)
    )));
  });

  public publishVersion = this.handle(async (request, response) => {
    response.status(201).json(successResponse(await this.service.publishVersion(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      shopTravelFarePolicyPublishBodySchema.parse(request.body)
    )));
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try { await handler(request, response); } catch (error) { next(error); }
    };
  }
}
