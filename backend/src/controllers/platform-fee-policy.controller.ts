import type { NextFunction, Request, Response } from "express";
import type { PlatformFeePolicyService } from "../services/platform-fee-policy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  globalPlatformFeeUpdateBodySchema,
  platformFeeShopIdParamSchema,
  shopFeeEnabledUpdateBodySchema,
  shopFeePayerUpdateBodySchema,
  shopPlatformFeePolicyListQuerySchema
} from "../validators/platform-fee-policy.validator";

export class PlatformFeePolicyController {
  public constructor(private readonly service: PlatformFeePolicyService) {}

  public getGlobalPolicy = this.handle(async (_request, response) => {
    response.status(200).json(successResponse(await this.service.getGlobalPolicy()));
  });

  public updateGlobalPolicy = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateGlobalAmount(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            globalPlatformFeeUpdateBodySchema.parse(request.body)
          )
        )
      );
  });

  public listShopPolicies = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listShopPolicies(
            getAuthenticatedAccess(response),
            shopPlatformFeePolicyListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public updateShopFeeEnabled = this.handle(async (request, response) => {
    const { shopId } = platformFeeShopIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateShopFeeEnabled(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopId,
            shopFeeEnabledUpdateBodySchema.parse(request.body)
          )
        )
      );
  });

  public getMerchantShopPolicy = this.handle(async (request, response) => {
    const { shopId } = platformFeeShopIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getShopPolicy(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopId
          )
        )
      );
  });

  public updateShopPayerType = this.handle(async (request, response) => {
    const { shopId } = platformFeeShopIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateShopPayerType(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopId,
            shopFeePayerUpdateBodySchema.parse(request.body)
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
