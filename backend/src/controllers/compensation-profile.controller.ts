import type { NextFunction, Request, Response } from "express";
import type { CompensationProfileService } from "../services/compensation-profile.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  compensationProfileBodySchema,
  compensationProfileParamSchema,
  compensationProfilePreviewBodySchema
} from "../validators/compensation-profile.validator";

export class CompensationProfileController {
  public constructor(private readonly service: CompensationProfileService) {}

  public getCompensationProfile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, technicianProfileId } = compensationProfileParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getCompensationProfile(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              technicianProfileId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateCompensationProfile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, technicianProfileId } = compensationProfileParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateCompensationProfile(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              technicianProfileId,
              compensationProfileBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public previewCompensationProfile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, technicianProfileId } = compensationProfileParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.previewCompensationProfile(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              technicianProfileId,
              compensationProfilePreviewBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
