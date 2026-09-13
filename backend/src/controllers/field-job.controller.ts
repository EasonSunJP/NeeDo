import type { NextFunction, Request, Response } from "express";
import type { FieldJobService } from "../services/field-job.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { fieldJobIdParamSchema, fieldJobListQuerySchema } from "../validators/field-job.validator";

export class FieldJobController {
  public constructor(private readonly service: FieldJobService) {}

  public list = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.list(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            fieldJobListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public get = this.handle(async (request, response) => {
    const { id } = fieldJobIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.get(getAuthenticatedAccess(response), getRequestContext(request), id)
        )
      );
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
