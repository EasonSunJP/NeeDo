import type { NextFunction, Request, Response } from "express";
import type { TravelOperationsService } from "../services/travel-operations.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { travelFarePolicyListQuerySchema } from "../validators/travel-operations.validator";

export class TravelOperationsController {
  public constructor(private readonly service: TravelOperationsService) {}
  public providerStatus = this.handle(async (request, response) => { response.status(200).json(successResponse(await this.service.getProviderStatus(getAuthenticatedAccess(response), getRequestContext(request)))); });
  public listFarePolicies = this.handle(async (request, response) => { response.status(200).json(successResponse(await this.service.listFarePolicies(getAuthenticatedAccess(response), getRequestContext(request), travelFarePolicyListQuerySchema.parse(request.query)))); });
  private handle(handler: (request: Request, response: Response) => Promise<void>) { return async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { await handler(request, response); } catch (error) { next(error); } }; }
}
