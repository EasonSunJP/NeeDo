import type { NextFunction, Request, Response } from "express";
import type { ExchangeCancellationAction } from "../domain/exchange-cancellation";
import type { ExchangeCancellationService } from "../services/exchange-cancellation.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  exchangeCancellationDecisionBodySchema,
  exchangeCancellationOrderIdParamSchema,
  exchangeCancellationRequestBodySchema
} from "../validators/exchange-cancellation.validators";

export class ExchangeCancellationController {
  public constructor(private readonly service: ExchangeCancellationService) {}

  public get = this.handle(async (request, response) => {
    const { id } = exchangeCancellationOrderIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(successResponse(await this.service.getCancellation(getAuthenticatedAccess(response), id)));
  });

  public request = this.handle(async (request, response) => {
    const { id } = exchangeCancellationOrderIdParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.requestCancellation(
          getAuthenticatedAccess(response),
          id,
          exchangeCancellationRequestBodySchema.parse(request.body),
          response.locals.exchangeIdempotencyKey as string,
          getRequestContext(request)
        )
      )
    );
  });

  public accept = this.decision("accept");
  public reject = this.decision("reject");
  public withdraw = this.decision("withdraw");

  private decision(action: Exclude<ExchangeCancellationAction, "request">) {
    return this.handle(async (request, response) => {
      const { id } = exchangeCancellationOrderIdParamSchema.parse(request.params);
      response.status(200).json(
        successResponse(
          await this.service.decideCancellation(
            getAuthenticatedAccess(response),
            id,
            action,
            exchangeCancellationDecisionBodySchema.parse(request.body),
            response.locals.exchangeIdempotencyKey as string,
            getRequestContext(request)
          )
        )
      );
    });
  }

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
