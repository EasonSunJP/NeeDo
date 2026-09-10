import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardAdjustmentService } from "../services/shop-membership-card-adjustment.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  shopMembershipCardAdjustmentCreateBodySchema,
  shopMembershipCardAdjustmentDecisionBodySchema,
  shopMembershipCardAdjustmentListQuerySchema,
  shopMembershipCardAdjustmentPublicIdParamSchema
} from "../validators/shop-membership-card-adjustment.validator";

export class ShopMembershipCardAdjustmentController {
  public constructor(private readonly service: ShopMembershipCardAdjustmentService) {}

  public create = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardAdjustmentPublicIdParamSchema.parse(request.params);
    const result = await this.service.create(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      publicId,
      shopMembershipCardAdjustmentCreateBodySchema.parse(request.body)
    );
    response.status(result.replayed ? 200 : 201).json(successResponse(result));
  });

  public merchantList = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listMerchant(
            getAuthenticatedAccess(response),
            shopMembershipCardAdjustmentListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public cancel = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardAdjustmentPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.cancel(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            publicId
          )
        )
      );
  });

  public customerList = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listCustomer(
            getAuthenticatedAccess(response),
            shopMembershipCardAdjustmentListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public decide = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardAdjustmentPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.decide(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            publicId,
            shopMembershipCardAdjustmentDecisionBodySchema.parse(request.body)
          )
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
