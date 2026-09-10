import type { NextFunction, Request, Response } from "express";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import type { TechnicianAutomationService } from "../services/technician-automation.service";
import {
  technicianAutomationContactListQuerySchema,
  technicianAutomationKindParamSchema,
  technicianAutomationSettingsUpdateSchema
} from "../validators/technician-automation.validator";

export class TechnicianAutomationController {
  public constructor(private readonly service: TechnicianAutomationService) {}

  public getSetting = this.handle(async (request, response) => {
    const { kind } = technicianAutomationKindParamSchema.parse(request.params);
    response.status(200).json(successResponse(await this.service.getSetting(getAuthenticatedAccess(response), kind)));
  });

  public updateSetting = this.handle(async (request, response) => {
    const { kind } = technicianAutomationKindParamSchema.parse(request.params);
    response.status(200).json(successResponse(await this.service.updateSetting(
      getAuthenticatedAccess(response),
      kind,
      technicianAutomationSettingsUpdateSchema.parse(request.body),
      getRequestContext(request)
    )));
  });

  public listContacts = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listContacts(
      getAuthenticatedAccess(response),
      technicianAutomationContactListQuerySchema.parse(request.query)
    )));
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try { await handler(request, response); } catch (error) { next(error); }
    };
  }
}
