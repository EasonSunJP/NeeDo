import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardRedemptionService } from "../services/shop-membership-card-redemption.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopMembershipCardRedemptionCandidateQuerySchema,
  shopMembershipCardRedemptionCreateBodySchema,
  shopMembershipCardRedemptionListQuerySchema,
  shopMembershipCardRedemptionPublicIdParamSchema
} from "../validators/shop-membership-card-redemption.validator";

export class ShopMembershipCardRedemptionController {
  public constructor(private readonly service: ShopMembershipCardRedemptionService) {}

  public create = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardRedemptionPublicIdParamSchema.parse(request.params);
    const result = await this.service.create(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      publicId,
      shopMembershipCardRedemptionCreateBodySchema.parse(request.body)
    );
    response.status(result.replayed ? 200 : 201).json(successResponse(result));
  });

  public candidates = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardRedemptionPublicIdParamSchema.parse(request.params);
    response.status(200).json(successResponse(await this.service.listCandidates(
      getAuthenticatedAccess(response),
      publicId,
      shopMembershipCardRedemptionCandidateQuerySchema.parse(request.query)
    )));
  });

  public merchantList = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listMerchant(
      getAuthenticatedAccess(response),
      shopMembershipCardRedemptionListQuerySchema.parse(request.query)
    )));
  });

  public customerList = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listCustomer(
      getAuthenticatedAccess(response),
      shopMembershipCardRedemptionListQuerySchema.parse(request.query)
    )));
  });

  private handle(handler: (request: Request, response: Response) => Promise<void>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
