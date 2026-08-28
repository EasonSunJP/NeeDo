import type { NextFunction, Request, Response } from "express";
import type { AffiliateProfileService } from "../services/affiliate-profile.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  affiliateChannelCreateBodySchema,
  affiliateChannelDeleteQuerySchema,
  affiliateChannelIdParamSchema,
  affiliateChannelUpdateBodySchema,
  affiliateProfileUpdateBodySchema
} from "../validators/affiliate-profile.validator";

export class AffiliateProfileController {
  public constructor(private readonly service: AffiliateProfileService) {}

  public getMine = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(await this.service.getMine(getAuthenticatedAccess(response))));
  });

  public updateMine = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateMine(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliateProfileUpdateBodySchema.parse(request.body)
          )
        )
      );
  });

  public createChannel = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.createChannel(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            affiliateChannelCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public updateChannel = this.handle(async (request, response) => {
    const { channelId } = affiliateChannelIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateChannel(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            channelId,
            affiliateChannelUpdateBodySchema.parse(request.body)
          )
        )
      );
  });

  public deleteChannel = this.handle(async (request, response) => {
    const { channelId } = affiliateChannelIdParamSchema.parse(request.params);
    const { expected_profile_version: expectedProfileVersion } =
      affiliateChannelDeleteQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.deleteChannel(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            channelId,
            expectedProfileVersion
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
