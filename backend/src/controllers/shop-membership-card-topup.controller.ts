import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardTopUpService } from "../services/shop-membership-card-topup.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopMembershipCardTopUpCreateBodySchema,
  shopMembershipCardTopUpListQuerySchema,
  shopMembershipCardTopUpPublicIdParamSchema
} from "../validators/shop-membership-card-topup.validator";

export class ShopMembershipCardTopUpController {
  public constructor(private readonly service: ShopMembershipCardTopUpService) {}

  public create = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardTopUpPublicIdParamSchema.parse(request.params);
    const result = await this.service.create(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      publicId,
      shopMembershipCardTopUpCreateBodySchema.parse(request.body)
    );
    response.status(result.replayed ? 200 : 201).json(successResponse(result));
  });

  public merchantList = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listMerchant(
      getAuthenticatedAccess(response),
      shopMembershipCardTopUpListQuerySchema.parse(request.query)
    )));
  });

  public customerList = this.handle(async (request, response) => {
    response.status(200).json(successResponse(await this.service.listCustomer(
      getAuthenticatedAccess(response),
      shopMembershipCardTopUpListQuerySchema.parse(request.query)
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
