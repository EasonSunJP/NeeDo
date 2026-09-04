import type { NextFunction, Request, Response } from "express";
import type { PlatformMembershipService } from "../services/platform-membership.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  platformMembershipBenefitParamSchema,
  platformMembershipBenefitLocaleQuerySchema,
  platformMembershipBenefitUpdateBodySchema,
  platformMembershipEntitlementCommandSchema,
  platformMembershipTierDraftBodySchema,
  platformMembershipTierParamSchema,
  platformMembershipTierPublishBodySchema,
  platformMembershipUserParamSchema
} from "../validators/platform-membership.validator";

export class PlatformMembershipController {
  public constructor(private readonly service: PlatformMembershipService) {}

  public getMine = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(successResponse(await this.service.getMyMembership(getAuthenticatedAccess(response))));
  });

  public getMyBenefits = this.handle(async (request, response) => {
    const { locale } = platformMembershipBenefitLocaleQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.getMyMembershipBenefits(getAuthenticatedAccess(response), locale)
        )
      );
  });

  public listTiers = this.handle(async (request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listTiersForAdministration(getAuthenticatedAccess(response))
        )
      );
  });

  public getDraft = this.handle(async (request, response) => {
    const { tierCode } = platformMembershipTierParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(await this.service.getTierDraft(getAuthenticatedAccess(response), tierCode))
      );
  });

  public saveDraft = this.handle(async (request, response) => {
    const { tierCode } = platformMembershipTierParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.saveTierDraft(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            tierCode,
            platformMembershipTierDraftBodySchema.parse(request.body)
          )
        )
      );
  });

  public publishDraft = this.handle(async (request, response) => {
    const { tierCode } = platformMembershipTierParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.publishTierVersion(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            tierCode,
            platformMembershipTierPublishBodySchema.parse(request.body)
          )
        )
      );
  });

  public listBenefits = this.handle(async (_request, response) => {
    response
      .status(200)
      .json(
        successResponse(
          await this.service.listBenefitsForAdministration(getAuthenticatedAccess(response))
        )
      );
  });

  public updateBenefit = this.handle(async (request, response) => {
    const { benefitCode } = platformMembershipBenefitParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.updateBenefit(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            benefitCode,
            platformMembershipBenefitUpdateBodySchema.parse(request.body)
          )
        )
      );
  });

  public changeEntitlement = this.handle(async (request, response) => {
    const { userId } = platformMembershipUserParamSchema.parse(request.params);
    response
      .status(200)
      .json(
        successResponse(
          await this.service.changeEntitlement(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            userId,
            platformMembershipEntitlementCommandSchema.parse(request.body)
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
