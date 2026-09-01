import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardRefundService } from "../services/shop-membership-card-refund.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopMembershipCardRefundCreateBodySchema,
  shopMembershipCardRefundPublicIdParamSchema
} from "../validators/shop-membership-card-refund.validator";

export class ShopMembershipCardRefundController {
  public constructor(private readonly service: ShopMembershipCardRefundService) {}

  public create = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { publicId } = shopMembershipCardRefundPublicIdParamSchema.parse(request.params);
      const result = await this.service.create(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        publicId,
        shopMembershipCardRefundCreateBodySchema.parse(request.body)
      );
      response.status(result.replayed ? 200 : 201).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };
}
