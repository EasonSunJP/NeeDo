import type { NextFunction, Request, Response } from "express";
import type { OperatingCostService } from "../services/operating-cost.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  operatingCostCreateBodySchema,
  operatingCostDeleteBodySchema,
  operatingCostListQuerySchema,
  operatingCostParamSchema,
  operatingCostPublishBodySchema,
  operatingCostUpdateBodySchema
} from "../validators/operating-cost.validator";

export class OperatingCostController {
  public constructor(private readonly service: OperatingCostService) {}

  public list = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listCosts(
            getAuthenticatedAccess(response),
            operatingCostListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public create = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createCost(
            getAuthenticatedAccess(response),
            operatingCostCreateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  public update = this.handle(async (request, response) => {
    const { publicId } = operatingCostParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateCost(
            getAuthenticatedAccess(response),
            publicId,
            operatingCostUpdateBodySchema.parse(request.body),
            getRequestContext(request)
          )
        )
      );
  });

  public remove = this.handle(async (request, response) => {
    const { publicId } = operatingCostParamSchema.parse(request.params);
    const { reason } = operatingCostDeleteBodySchema.parse(request.body);
    await this.service.deleteCost(
      getAuthenticatedAccess(response),
      publicId,
      reason,
      getRequestContext(request)
    );
    response.status(204).send();
  });

  public publish = this.handle(async (request, response) => {
    const { publicId } = operatingCostParamSchema.parse(request.params);
    const { reason } = operatingCostPublishBodySchema.parse(request.body);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.publishCost(
            getAuthenticatedAccess(response),
            publicId,
            reason,
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
