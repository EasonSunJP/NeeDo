import type { NextFunction, Request, Response } from "express";
import type { ShopVisibilityService } from "../services/shop-visibility.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopVisibilityBodySchema,
  shopVisibilityParamsSchema
} from "../validators/shop-visibility.validator";

export class ShopVisibilityController {
  public constructor(private readonly service: ShopVisibilityService) {}

  public get = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopVisibilityParamsSchema.parse(request.params);
      response
        .status(200)
        .json(successResponse(await this.service.get(getAuthenticatedAccess(response), shopId)));
    } catch (error) {
      next(error);
    }
  };

  public update = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopVisibilityParamsSchema.parse(request.params);
      const { visibility } = shopVisibilityBodySchema.parse(request.body);
      response.status(200).json(
        successResponse(
          await this.service.update(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopId,
            visibility
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
