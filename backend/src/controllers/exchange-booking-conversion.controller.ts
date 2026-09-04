import type { NextFunction, Request, Response } from "express";
import type { ExchangeBookingConversionService } from "../services/exchange-booking-conversion.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  exchangeBookingConversionBodySchema,
  exchangeBookingConversionPostIdParamSchema
} from "../validators/exchange-booking-conversion.validators";

export class ExchangeBookingConversionController {
  public constructor(private readonly service: ExchangeBookingConversionService) {}

  public createBookings = this.handle(async (request, response) => {
    const { id } = exchangeBookingConversionPostIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.createBookings(
            getAuthenticatedAccess(response),
            id,
            exchangeBookingConversionBodySchema.parse(request.body),
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
