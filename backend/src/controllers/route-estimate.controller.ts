import type { NextFunction, Request, Response } from "express";
import type { RouteEstimateService } from "../services/route-estimate.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { routeEstimateCreateBodySchema } from "../validators/route-estimate.validator";

export class RouteEstimateController {
  public constructor(private readonly service: RouteEstimateService) {}
  public create = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.service.create(
        getAuthenticatedAccess(response), getRequestContext(request), routeEstimateCreateBodySchema.parse(request.body)
      )));
    } catch (error) { next(error); }
  };
}
