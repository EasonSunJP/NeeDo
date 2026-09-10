import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipService } from "../services/shop-membership.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  customerShopMembershipListQuerySchema,
  shopMembershipActivityQuerySchema,
  shopMembershipAnalyticsQuerySchema,
  shopMembershipCandidateQuerySchema,
  shopMembershipCardListQuerySchema,
  shopMembershipCreateBodySchema,
  shopMembershipListQuerySchema,
  shopMembershipPublicIdParamSchema
} from "../validators/shop-membership.validator";

export class ShopMembershipController {
  public constructor(private readonly service: ShopMembershipService) {}

  public merchantOverview = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(
        successResponse(await this.service.getMerchantOverview(getAuthenticatedAccess(response)))
      );
  });

  public merchantList = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchantMemberships(
            getAuthenticatedAccess(response),
            shopMembershipListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public merchantDetail = this.handle(async (request, response) => {
    const { publicId } = shopMembershipPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getMerchantMembershipDetail(getAuthenticatedAccess(response), publicId)
        )
      );
  });

  public merchantCandidates = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchantCandidates(
            getAuthenticatedAccess(response),
            shopMembershipCandidateQuerySchema.parse(request.query)
          )
        )
      );
  });

  public merchantCreate = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.enrollMerchantMembership(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopMembershipCreateBodySchema.parse(request.body)
          )
        )
      );
  });

  public merchantCards = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchantCards(
            getAuthenticatedAccess(response),
            shopMembershipCardListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public merchantActivities = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchantActivities(
            getAuthenticatedAccess(response),
            shopMembershipActivityQuerySchema.parse(request.query)
          )
        )
      );
  });

  public merchantAnalytics = this.handle(async (request, response) => {
    const { period } = shopMembershipAnalyticsQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getMerchantAnalytics(getAuthenticatedAccess(response), period)
        )
      );
  });

  public customerList = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listCustomerMemberships(
            getAuthenticatedAccess(response),
            customerShopMembershipListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public customerDetail = this.handle(async (request, response) => {
    const { publicId } = shopMembershipPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getCustomerMembershipDetail(getAuthenticatedAccess(response), publicId)
        )
      );
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
