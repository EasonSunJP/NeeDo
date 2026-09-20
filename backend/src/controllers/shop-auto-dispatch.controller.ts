import type { NextFunction, Request, Response } from "express";
import type { ShopAutoDispatchService } from "../services/shop-auto-dispatch.service";
import { shopAutoDispatchRuleBodySchema } from "../validators/shop-auto-dispatch.validator";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";

export class ShopAutoDispatchController {
  public constructor(private readonly service: ShopAutoDispatchService) {}

  public read = async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.read(getAuthenticatedAccess(response))));
    } catch (error) {
      next(error);
    }
  };

  public update = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.update(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        shopAutoDispatchRuleBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };
}
