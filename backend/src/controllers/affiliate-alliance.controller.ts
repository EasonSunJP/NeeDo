import type { NextFunction, Request, Response } from "express";
import type { AffiliateAllianceService } from "../services/affiliate-alliance.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { affiliateAllianceCreateBodySchema } from "../validators/affiliate-alliance.validator";

export class AffiliateAllianceController {
  public constructor(private readonly service: AffiliateAllianceService) {}

  public getMine = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(await this.service.getMine(getAuthenticatedAccess(response))));
  });

  public createMine = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createMine(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliateAllianceCreateBodySchema.parse(request.body)
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
