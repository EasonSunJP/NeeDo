import type { NextFunction, Request, Response } from "express";
import type {
  BillingSubjectType,
  MerchantSaasBillingService
} from "../services/merchant-saas-billing.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  billingSubjectParamSchema,
  createMerchantAccountBodySchema,
  createSuspensionBodySchema,
  dissolveMerchantBodySchema,
  extendTrialBodySchema,
  freePeriodListQuerySchema,
  interruptTrialBodySchema,
  invoiceIdParamSchema,
  linkMerchantShopBodySchema,
  manualPaymentBodySchema,
  merchantAccountIdParamSchema,
  merchantAccountListQuerySchema,
  merchantMembershipParamSchema,
  releaseSuspensionBodySchema,
  releaseSuspensionParamSchema,
  saasInvoiceListQuerySchema,
  shopBillingParamSchema,
  updateBillingProfileBodySchema,
  updatePaymentResponsibilityBodySchema
} from "../validators/merchant-saas-billing.validator";

export class MerchantSaasBillingController {
  public constructor(private readonly service: MerchantSaasBillingService) {}

  public listAccounts = this.handle(async (request, response) =>
    this.service.listAccounts(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAccountListQuerySchema.parse(request.query)
    )
  );

  public getMerchantAccount = this.handle(async (request, response) => {
    const { id } = merchantAccountIdParamSchema.parse(request.params);
    return this.service.getMerchantAccount(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id
    );
  });

  public createMerchantAccount = this.handle(
    async (request, response) =>
      this.service.createMerchantAccount(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        createMerchantAccountBodySchema.parse(request.body)
      ),
    201
  );

  public updateMerchantBilling = this.handle(async (request, response) => {
    const { id } = merchantAccountIdParamSchema.parse(request.params);
    return this.updateBilling(request, response, "merchant_account", id);
  });

  public updateShopBilling = this.handle(async (request, response) => {
    const { id } = shopBillingParamSchema.parse(request.params);
    return this.updateBilling(request, response, "shop", id);
  });

  public updatePaymentResponsibility = this.handle(async (request, response) => {
    const { id } = merchantAccountIdParamSchema.parse(request.params);
    return this.service.updatePaymentResponsibility(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id,
      updatePaymentResponsibilityBodySchema.parse(request.body)
    );
  });

  public linkShop = this.handle(async (request, response) => {
    const { id } = merchantAccountIdParamSchema.parse(request.params);
    return this.service.linkShop(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id,
      linkMerchantShopBodySchema.parse(request.body)
    );
  });

  public unlinkShop = this.handle(async (request, response) => {
    const { id, shopId } = merchantMembershipParamSchema.parse(request.params);
    return this.service.unlinkShop(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id,
      shopId
    );
  });

  public extendTrial = this.handle(async (request, response) => {
    const { subjectType, subjectId } = billingSubjectParamSchema.parse(request.params);
    return this.service.extendTrial(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      extendTrialBodySchema.parse(request.body)
    );
  });

  public interruptTrial = this.handle(async (request, response) => {
    const { subjectType, subjectId } = billingSubjectParamSchema.parse(request.params);
    return this.service.interruptTrial(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      interruptTrialBodySchema.parse(request.body)
    );
  });

  public listFreePeriods = this.handle(async (request, response) => {
    const { subjectType, subjectId } = billingSubjectParamSchema.parse(request.params);
    return this.service.listFreePeriods(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      freePeriodListQuerySchema.parse(request.query)
    );
  });

  public listInvoices = this.handle(async (request, response) =>
    this.service.listInvoices(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      saasInvoiceListQuerySchema.parse(request.query)
    )
  );

  public getInvoice = this.handle(async (request, response) => {
    const { id } = invoiceIdParamSchema.parse(request.params);
    return this.service.getInvoice(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id
    );
  });

  public reviewManualPayment = this.handle(async (request, response) => {
    const { id } = invoiceIdParamSchema.parse(request.params);
    return this.service.reviewManualPayment(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id,
      manualPaymentBodySchema.parse(request.body)
    );
  });

  public createSuspension = this.handle(async (request, response) => {
    const { subjectType, subjectId } = billingSubjectParamSchema.parse(request.params);
    return this.service.createSuspension(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      createSuspensionBodySchema.parse(request.body)
    );
  });

  public releaseSuspension = this.handle(async (request, response) => {
    const { subjectType, subjectId, suspensionId } = releaseSuspensionParamSchema.parse(
      request.params
    );
    return this.service.releaseSuspension(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      suspensionId,
      releaseSuspensionBodySchema.parse(request.body)
    );
  });

  public dissolveMerchant = this.handle(async (request, response) => {
    const { id } = merchantAccountIdParamSchema.parse(request.params);
    return this.service.dissolveMerchant(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id,
      dissolveMerchantBodySchema.parse(request.body)
    );
  });

  public dissolveShop = this.handle(async (request, response) => {
    const { id } = shopBillingParamSchema.parse(request.params);
    return this.service.dissolveShop(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      id
    );
  });

  private updateBilling(
    request: Request,
    response: Response,
    subjectType: BillingSubjectType,
    subjectId: number
  ) {
    return this.service.updateBillingProfile(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      subjectType,
      subjectId,
      updateBillingProfileBodySchema.parse(request.body)
    );
  }

  private handle<TResult>(
    handler: (request: Request, response: Response) => Promise<TResult>,
    statusCode = 200
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        response.status(statusCode).json(successResponse(await handler(request, response)));
      } catch (error) {
        next(error);
      }
    };
  }
}
