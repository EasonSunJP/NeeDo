import type { NextFunction, Request, Response } from "express";
import type { TechnicianProfileService } from "../services/technician-profile.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { technicianProfileUpdateBodySchema } from "../validators/technician-profile.validator";

export class TechnicianProfileController {
  public constructor(private readonly service: TechnicianProfileService) {}

  public getMine = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.service.getMine(getAuthenticatedAccess(response))));
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
            await this.service.updateMine(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              technicianProfileUpdateBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
