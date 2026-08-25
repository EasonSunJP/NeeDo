import type { NextFunction, Request, Response } from "express";
import type { CustomerProfileService } from "../services/customer-profile.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { customerProfileUpdateBodySchema } from "../validators/customer-profile.validator";

export class CustomerProfileController {
  public constructor(private readonly customerProfileService: CustomerProfileService) {}

  public getMine = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.customerProfileService.getMine(getAuthenticatedAccess(response))
          )
        );
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
      response
        .status(200)
        .json(
          successResponse(
            await this.customerProfileService.updateMine(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              customerProfileUpdateBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
