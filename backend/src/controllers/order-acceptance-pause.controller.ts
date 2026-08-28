import type { NextFunction, Request, Response } from "express";
import type { OrderAcceptancePauseService } from "../services/order-acceptance-pause.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  orderAcceptancePauseCreateBodySchema,
  orderAcceptancePauseIdParamSchema,
  orderAcceptancePauseListQuerySchema,
  orderAcceptancePauseReleaseBodySchema
} from "../validators/order-acceptance-pause.validator";

export class OrderAcceptancePauseController {
  public constructor(private readonly service: OrderAcceptancePauseService) {}

  public listPauses = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listPauses(
            getAuthenticatedAccess(response),
            orderAcceptancePauseListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public createPause = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createPause(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            orderAcceptancePauseCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public releasePause = this.handle(async (request, response) => {
    const { id } = orderAcceptancePauseIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.releasePause(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            id,
            orderAcceptancePauseReleaseBodySchema.parse(request.body)
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
