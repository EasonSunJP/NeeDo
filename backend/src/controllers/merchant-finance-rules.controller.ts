import type { NextFunction, Request, Response } from "express";
import type { MerchantFinanceRulesService } from "../services/merchant-finance-rules.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  merchantFinanceShopIdParamSchema,
  shopFinanceRulePreviewBodySchema,
  shopFinanceRuleSetBodySchema
} from "../validators/merchant-finance-rules.validator";

export class MerchantFinanceRulesController {
  public constructor(private readonly service: MerchantFinanceRulesService) {}

  public getShopFinanceRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = merchantFinanceShopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getShopFinanceRuleSet(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateShopFinanceRuleSet = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = merchantFinanceShopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateShopFinanceRuleSet(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              shopFinanceRuleSetBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public previewShopFinanceRule = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = merchantFinanceShopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.previewShopFinanceRule(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              shopFinanceRulePreviewBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
