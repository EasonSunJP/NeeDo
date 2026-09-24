import type { NextFunction, Request, Response } from "express";
import type { PlatformSettingsService } from "../services/platform-settings.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  platformBasicSettingsBodySchema,
  platformPaymentSettingsBodySchema
} from "../validators/platform-settings.validator";

export type PlatformSettingsControllerService = Pick<
  PlatformSettingsService,
  "getPublic" | "getForOperations" | "updateBasic" | "updatePayment"
>;

export class PlatformSettingsController {
  public constructor(private readonly service: PlatformSettingsControllerService) {}

  public getPublic = this.handle(async (request, response) => {
    const settings = await this.service.getPublic();
    const { membershipCardFollowUiTheme, ...legacySettings } = settings;
    response.status(200).json(successResponse(request.query.cardTheme === "1"
      ? { ...legacySettings, membershipCardFollowUiTheme }
      : legacySettings));
  });

  public getForOperations = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(await this.service.getForOperations(getAuthenticatedAccess(response))));
  });

  public updateBasic = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateBasic(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            platformBasicSettingsBodySchema.parse(request.body)
          )
        )
      );
  });

  public updatePayment = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updatePayment(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            platformPaymentSettingsBodySchema.parse(request.body)
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
