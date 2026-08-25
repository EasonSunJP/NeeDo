import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { AffiliateIdentityActivationService } from "../services/affiliate-identity-activation.service";
import type { AffiliateBankAccountService } from "../services/affiliate-bank-account.service";
import type { ContractCatalogPort } from "../services/contract-acceptance.service";
import { successResponse } from "../utils/api-response";
import {
  activateAffiliateIdentityBodySchema,
  bindAffiliateWithdrawalBankAccountBodySchema,
  contractLanguageQuerySchema
} from "../validators/identity-activation.validator";

export class IdentityActivationController {
  public constructor(
    private readonly affiliate: AffiliateIdentityActivationService,
    private readonly contracts: ContractCatalogPort,
    private readonly affiliateBankAccounts: AffiliateBankAccountService
  ) {}

  public getCurrentAffiliateContract = this.handle(async (request, response) => {
    const { language } = contractLanguageQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.affiliate.getCurrentContract(language)));
  });

  public getCurrentMerchantContract = this.handle(async (request, response) => {
    const { language } = contractLanguageQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.contracts.getCurrent("merchant", language)));
  });

  public activateAffiliate = this.handle(async (request, response) => {
    const body = activateAffiliateIdentityBodySchema.parse(request.body);
    const auth = response.locals.auth as AuthenticatedAccessContext;
    response.status(200).json(
      successResponse(
        await this.affiliate.activate({
          userId: auth.userId,
          sessionId: auth.accessTokenJti,
          acceptedAt: new Date(),
          ...body
        })
      )
    );
  });

  public bindAffiliateWithdrawalBankAccount = this.handle(async (request, response) => {
    const body = bindAffiliateWithdrawalBankAccountBodySchema.parse(request.body);
    const auth = response.locals.auth as AuthenticatedAccessContext;
    response.status(200).json(
      successResponse(
        await this.affiliateBankAccounts.bind({
          userId: auth.userId,
          ...body,
          now: new Date()
        })
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
