import type { NextFunction, Request, Response } from "express";
import type { NdpExchangeRateService } from "../services/ndp-exchange-rate.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  ndpExchangeRateListQuerySchema,
  ndpExchangeRatePublishBodySchema
} from "../validators/ndp-exchange-rate.validator";

export class NdpExchangeRateController {
  public constructor(private readonly service: NdpExchangeRateService) {}

  public list = this.handle(async (request, response) => {
    const input = ndpExchangeRateListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.list(getAuthenticatedAccess(response), {
          ...input,
          at: input.at ?? new Date()
        })
      )
    );
  });

  public publish = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.publish(
            getAuthenticatedAccess(response),
            ndpExchangeRatePublishBodySchema.parse(request.body),
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
