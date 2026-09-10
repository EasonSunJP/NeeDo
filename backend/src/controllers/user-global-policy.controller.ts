import type { NextFunction, Request, Response } from "express";
import type { NdpExperienceCampaignService } from "../services/ndp-experience-campaign.service";
import type { UserGlobalPolicyService } from "../services/user-global-policy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  ndpExperienceCampaignArchiveBodySchema,
  ndpExperienceCampaignDraftBodySchema,
  ndpExperienceCampaignListQuerySchema,
  ndpExperienceCampaignParamSchema,
  userGlobalPolicyDraftBodySchema,
  userGlobalPolicyPublishBodySchema,
  versionPublishBodySchema
} from "../validators/user-global-policy.validator";

export type UserGlobalPolicyControllerService = Pick<
  UserGlobalPolicyService,
  "getCurrentAndDraft" | "saveDraft" | "publishDraft"
>;
export type NdpExperienceCampaignControllerService = Pick<
  NdpExperienceCampaignService,
  "listCampaigns" | "saveDraft" | "publishDraft" | "archiveCampaign"
>;

export class UserGlobalPolicyController {
  public constructor(private readonly service: UserGlobalPolicyControllerService) {}

  public getSettings = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(
        successResponse(await this.service.getCurrentAndDraft(getAuthenticatedAccess(response)))
      );
  });

  public saveDraft = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.saveDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            userGlobalPolicyDraftBodySchema.parse(request.body)
          )
        )
      );
  });

  public publishDraft = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.publishDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            userGlobalPolicyPublishBodySchema.parse(request.body)
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

export class NdpExperienceCampaignController {
  public constructor(private readonly service: NdpExperienceCampaignControllerService) {}

  public listCampaigns = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listCampaigns(
            getAuthenticatedAccess(response),
            ndpExperienceCampaignListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public saveDraft = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.saveDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            ndpExperienceCampaignDraftBodySchema.parse(request.body)
          )
        )
      );
  });

  public publishDraft = this.handle(async (request, response) => {
    const { versionPublicId } = ndpExperienceCampaignParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.publishDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            { versionPublicId, ...versionPublishBodySchema.parse(request.body) }
          )
        )
      );
  });

  public archiveCampaign = this.handle(async (request, response) => {
    const { versionPublicId } = ndpExperienceCampaignParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.archiveCampaign(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            { versionPublicId, ...ndpExperienceCampaignArchiveBodySchema.parse(request.body) }
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
