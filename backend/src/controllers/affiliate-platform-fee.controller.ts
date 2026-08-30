import type { NextFunction, Request, Response } from "express";
import type { AffiliatePlatformFeeService } from "../services/affiliate-platform-fee.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  affiliatePlatformFeeShopOptionQuerySchema,
  affiliatePlatformFeeRuleCreateBodySchema,
  affiliatePlatformFeeRuleListQuerySchema,
  affiliatePlatformFeeRuleSummaryQuerySchema
} from "../validators/affiliate-platform-fee.validator";

export class AffiliatePlatformFeeController {
  public constructor(private readonly service: AffiliatePlatformFeeService) {}

  public listRules = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listRules(
            getAuthenticatedAccess(response),
            affiliatePlatformFeeRuleListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public createRuleVersion = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createRuleVersion(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliatePlatformFeeRuleCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public getGlobalSummary = this.handle(async (request, response) => {
    affiliatePlatformFeeRuleSummaryQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getGlobalSummary(getAuthenticatedAccess(response))
        )
      );
  });

  public listEligibleShops = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listEligibleShops(
            getAuthenticatedAccess(response),
            affiliatePlatformFeeShopOptionQuerySchema.parse(request.query)
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
