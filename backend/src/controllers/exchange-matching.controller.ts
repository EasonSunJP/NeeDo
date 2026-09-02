import type { NextFunction, Request, Response } from "express";
import type { ExchangeMatchingService } from "../services/exchange-matching.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  exchangeMatchingPostIdParamSchema,
  selectExchangeMatchSchema
} from "../validators/exchange-matching.validators";

export class ExchangeMatchingController {
  public constructor(private readonly service: ExchangeMatchingService) {}

  public get = this.handle(async (request, response) => {
    const { id } = exchangeMatchingPostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(successResponse(await this.service.getMatching(getAuthenticatedAccess(response), id)));
  });

  public select = this.handle(async (request, response) => {
    const { id } = exchangeMatchingPostIdParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.selectMatching(
          getAuthenticatedAccess(response),
          id,
          selectExchangeMatchSchema.parse(request.body),
          response.locals.exchangeIdempotencyKey as string,
          getRequestContext(request)
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
