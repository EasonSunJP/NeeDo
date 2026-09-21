import type { NextFunction, Request, Response } from "express";
import type { BackofficePreferenceService } from "../services/backoffice-preference.service";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { successResponse } from "../utils/api-response";
import { backofficeTestNdpPreferenceBodySchema } from "../validators/backoffice-preference.validator";

export class BackofficePreferenceController {
  public constructor(private readonly service: BackofficePreferenceService) {}

  public getTestNdpVisibility = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const actor = getAuthenticatedAccess(response);
      response.json(successResponse(await this.service.getEffective(actor.userId)));
    } catch (error) {
      next(error);
    }
  };

  public updateTestNdpVisibility = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.json(successResponse(await this.service.update(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        backofficeTestNdpPreferenceBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };
}
