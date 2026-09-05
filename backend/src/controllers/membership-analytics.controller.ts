import type { NextFunction, Request, Response } from "express";
import type { MembershipAnalyticsService } from "../services/membership-analytics.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  backofficeMembershipListQuerySchema,
  backofficeMembershipTrendQuerySchema,
  merchantMembershipListQuerySchema,
  merchantMembershipTrendQuerySchema
} from "../validators/membership-analytics.validator";

export class MembershipAnalyticsController {
  public constructor(private readonly service: MembershipAnalyticsService) {}

  public backofficeTrend = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getBackofficeTrend(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              backofficeMembershipTrendQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public backofficeList = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listBackofficeMembers(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              backofficeMembershipListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public merchantTrend = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getMerchantTrend(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              merchantMembershipTrendQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public merchantList = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listMerchantMembers(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              merchantMembershipListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
