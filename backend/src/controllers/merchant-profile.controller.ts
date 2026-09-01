import type { NextFunction, Request, Response } from "express";
import type { MerchantProfileService } from "../services/merchant-profile.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { merchantProfileUpdateBodySchema } from "../validators/merchant-profile.validator";

export class MerchantProfileController {
  public constructor(private readonly service: MerchantProfileService) {}

  public getMine = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(
        await this.service.getMine(getAuthenticatedAccess(response))
      ));
    } catch (error) {
      next(error);
    }
  };

  public updateMine = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(
        await this.service.updateMine(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          merchantProfileUpdateBodySchema.parse(request.body)
        )
      ));
    } catch (error) {
      next(error);
    }
  };
}
