import type { NextFunction, Request, Response } from "express";
import type { IdentityApplicationService } from "../services/identity-application.service";
import type { ProtectedBankAccountService } from "../services/protected-bank-account.service";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import {
  createMerchantApplicationBodySchema,
  bindMerchantBankAccountBodySchema,
  createTechnicianApplicationBodySchema,
  eligibleMerchantSearchQuerySchema,
  identityApplicationIdParamSchema,
  identityApplicationListQuerySchema,
  identityApplicationVersionBodySchema,
  updateMerchantShowcaseBodySchema,
  updateTechnicianApplicationBodySchema
} from "../validators/identity-application.validator";

export class IdentityApplicationController {
  public constructor(
    private readonly service: IdentityApplicationService,
    private readonly protectedBankAccounts: ProtectedBankAccountService
  ) {}

  public listMine = this.handle(async (request, response) => {
    const query = identityApplicationListQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.listMine(this.userId(response), {
          page: query.page,
          pageSize: query.page_size,
          type: query.type,
          status: query.status
        })
      )
    );
  });

  public searchEligibleShops = this.handle(async (request, response) => {
    const query = eligibleMerchantSearchQuerySchema.parse(request.query);
    response.status(200).json(
      successResponse(
        await this.service.searchEligibleShops({
          page: query.page,
          pageSize: query.page_size,
          query: query.query
        })
      )
    );
  });

  public createTechnicianDraft = this.handle(async (request, response) => {
    const body = createTechnicianApplicationBodySchema.parse(request.body);
    response.status(201).json(
      successResponse(
        await this.service.createTechnicianDraft({ userId: this.userId(response), ...body })
      )
    );
  });

  public updateTechnicianDraft = this.handle(async (request, response) => {
    const { id } = identityApplicationIdParamSchema.parse(request.params);
    const body = updateTechnicianApplicationBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.service.updateTechnicianDraft({
          userId: this.userId(response),
          applicationId: id,
          expectedVersion: body.expectedVersion,
          detail: {
            targetShopId: body.targetShopId,
            applicantName: body.applicantName,
            phone: body.phone,
            city: body.city,
            serviceAreas: body.serviceAreas,
            skills: body.skills,
            yearsExperience: body.yearsExperience,
            bio: body.bio,
            gender: body.gender,
            birthDate:
              body.birthDate === null ? null : new Date(`${body.birthDate}T00:00:00.000Z`)
          }
        })
      )
    );
  });

  public createMerchantDraft = this.handle(async (request, response) => {
    const body = createMerchantApplicationBodySchema.parse(request.body);
    response.status(201).json(
      successResponse(
        await this.service.createMerchantDraft({
          userId: this.userId(response),
          detail: {
            ...body,
            bankAccountId: null,
            contractAcceptanceId: null,
            mediaPurposes: [],
            bankVerificationStatus: null,
            eKycVerified: false
          }
        })
      )
    );
  });

  public updateMerchantShowcase = this.handle(async (request, response) => {
    const { id } = identityApplicationIdParamSchema.parse(request.params);
    const body = updateMerchantShowcaseBodySchema.parse(request.body);
    const { expectedVersion, ...detail } = body;
    response.status(200).json(
      successResponse(
        await this.service.updateMerchantShowcase({
          userId: this.userId(response),
          applicationId: id,
          expectedVersion,
          detail
        })
      )
    );
  });

  public bindMerchantBankAccount = this.handle(async (request, response) => {
    const { id } = identityApplicationIdParamSchema.parse(request.params);
    const body = bindMerchantBankAccountBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.protectedBankAccounts.bindMerchantAccount({
          userId: this.userId(response),
          applicationId: id,
          ...body,
          now: new Date()
        })
      )
    );
  });

  public submit = this.handle(async (request, response) => {
    const { id } = identityApplicationIdParamSchema.parse(request.params);
    const body = identityApplicationVersionBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.service.submit({
          userId: this.userId(response),
          applicationId: id,
          expectedVersion: body.expectedVersion,
          now: new Date()
        })
      )
    );
  });

  public withdraw = this.handle(async (request, response) => {
    const { id } = identityApplicationIdParamSchema.parse(request.params);
    const body = identityApplicationVersionBodySchema.parse(request.body);
    response.status(200).json(
      successResponse(
        await this.service.withdraw({
          userId: this.userId(response),
          applicationId: id,
          expectedVersion: body.expectedVersion,
          now: new Date()
        })
      )
    );
  });

  private userId(response: Response): number {
    return (response.locals.auth as AuthenticatedAccessContext).userId;
  }

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
