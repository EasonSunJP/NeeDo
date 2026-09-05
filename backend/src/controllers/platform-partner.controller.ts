import type { NextFunction, Request, Response } from "express";
import type { PlatformPartnerService } from "../services/platform-partner.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  agentListQuerySchema,
  agentParamSchema,
  agentShopReferralBodySchema,
  agentShopReferralListQuerySchema,
  platformPartnerProfileBodySchema,
  platformPartnerUserParamSchema
} from "../validators/platform-partner.validator";

export class PlatformPartnerController {
  public constructor(private readonly service: PlatformPartnerService) {}

  public markProfile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId } = platformPartnerUserParamSchema.parse(request.params);
      response
        .status(201)
        .json(
          successResponse(
            await this.service.markPartnerProfile(
              userId,
              platformPartnerProfileBodySchema.parse(request.body),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listAgents = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listAgents(
              agentListQuerySchema.parse(request.query),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public linkShop = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentPublicId } = agentParamSchema.parse(request.params);
      response
        .status(201)
        .json(
          successResponse(
            await this.service.linkAgentShop(
              agentPublicId,
              agentShopReferralBodySchema.parse(request.body),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listShopReferrals = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { agentPublicId } = agentParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listAgentShopReferrals(
              agentPublicId,
              agentShopReferralListQuerySchema.parse(request.query),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
