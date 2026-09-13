import type { NextFunction, Request, Response } from "express";
import type { ExchangeOperationsService } from "../services/exchange-operations.service";
import { successResponse } from "../utils/api-response";
import {
  type ExchangeOperationsListQuery,
  exchangeOperationsPostIdParamSchema
} from "../validators/exchange-operations.validator";

export class ExchangeOperationsController {
  public constructor(private readonly service: ExchangeOperationsService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.list(request.query as unknown as ExchangeOperationsListQuery)
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public detail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = exchangeOperationsPostIdParamSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.detail(id)));
    } catch (error) {
      next(error);
    }
  };
}
