import type { NextFunction, Request, Response } from "express";
import type { ExchangeIntelligenceServiceService } from "../services/exchange-intelligence-service.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import { exchangeIntelligenceServiceOptionListQuerySchema } from "../validators/exchange-intelligence-service.validators";

export class ExchangeIntelligenceServiceController {
  public constructor(private readonly service: ExchangeIntelligenceServiceService) {}

  public listOptions = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(
        successResponse(
          await this.service.listOptions(
            getAuthenticatedAccess(response),
            exchangeIntelligenceServiceOptionListQuerySchema.parse(request.query)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
