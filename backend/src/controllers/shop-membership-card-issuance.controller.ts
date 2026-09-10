import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardIssuanceService } from "../services/shop-membership-card-issuance.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopMembershipCardIssuanceParamSchema,
  type ShopMembershipCardIssuanceBody
} from "../validators/shop-membership-card-issuance.validator";

export class ShopMembershipCardIssuanceController {
  public constructor(private readonly service: ShopMembershipCardIssuanceService) {}

  public issue = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { publicId } = shopMembershipCardIssuanceParamSchema.parse(request.params);
      const result = await this.service.issue(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        publicId,
        request.body as ShopMembershipCardIssuanceBody
      );
      response.status(result.replayed ? 200 : 201).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };
}
