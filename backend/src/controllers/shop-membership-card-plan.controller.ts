import type { NextFunction, Request, Response } from "express";
import type { ShopMembershipCardPlanService } from "../services/shop-membership-card-plan.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  membershipRewardFeePolicyListQuerySchema,
  shopMembershipCardPlanListQuerySchema,
  shopMembershipCardPlanPublicIdParamSchema,
  shopMembershipCardPlanRetireBodySchema,
  type MembershipRewardFeePolicyCreateBody,
  type ShopMembershipCardPlanDraftBody,
  type ShopMembershipCardPlanPreviewBody,
  type ShopMembershipCardPlanPublishBody
} from "../validators/shop-membership-card-plan.validator";

export class ShopMembershipCardPlanController {
  public constructor(private readonly service: ShopMembershipCardPlanService) {}

  public list = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listPlans(
            getAuthenticatedAccess(response),
            shopMembershipCardPlanListQuerySchema.parse(request.query)
          )
        )
      );
  });

  public get = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardPlanPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(await this.service.getPlan(getAuthenticatedAccess(response), publicId))
      );
  });

  public create = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createPlan(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            request.body as ShopMembershipCardPlanDraftBody
          )
        )
      );
  });

  public updateDraft = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardPlanPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            publicId,
            request.body as ShopMembershipCardPlanDraftBody
          )
        )
      );
  });

  public preview = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardPlanPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.previewPlan(
            getAuthenticatedAccess(response),
            publicId,
            request.body as ShopMembershipCardPlanPreviewBody
          )
        )
      );
  });

  public publish = this.handle(async (request, response) => {
    const { publicId } = shopMembershipCardPlanPublicIdParamSchema.parse(request.params);
    response
      .status(201)
      .json(
        successResponse(
          await this.service.publishPlan(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            publicId,
            request.body as ShopMembershipCardPlanPublishBody
          )
        )
      );
  });

  public retire = this.handle(async (request, response) => {
    shopMembershipCardPlanRetireBodySchema.parse(request.body);
    const { publicId } = shopMembershipCardPlanPublicIdParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.retirePlan(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            publicId
          )
        )
      );
  });

  public getFeePolicy = this.handle(async (request, response) => {
    const actor = getAuthenticatedAccess(response);
    const input = membershipRewardFeePolicyListQuerySchema.parse(request.query);
    const [summary, history] = await Promise.all([
      this.service.getFeePolicySummary(actor),
      this.service.listFeePolicies(actor, input)
    ]);
    response.status(200).json(successResponse({ summary, history }));
  });

  public createFeePolicyVersion = this.handle(async (request, response) => {
    response
      .status(201)
      .json(
        successResponse(
          await this.service.createFeePolicyVersion(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            request.body as MembershipRewardFeePolicyCreateBody
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
