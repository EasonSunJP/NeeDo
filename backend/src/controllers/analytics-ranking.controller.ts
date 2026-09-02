import type { NextFunction, Request, Response } from "express";
import type { AnalyticsRankingService } from "../services/analytics-ranking.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  analyticsRankingParamsSchema,
  analyticsRankingQuerySchema
} from "../validators/analytics-ranking.validator";

export class AnalyticsRankingController {
  public constructor(private readonly service: AnalyticsRankingService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.list(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        analyticsRankingParamsSchema.parse(request.params),
        analyticsRankingQuerySchema.parse(request.query)
      )));
    } catch (error) {
      next(error);
    }
  };
}
