import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MerchantSaasBillingController } from "../controllers/merchant-saas-billing.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { MerchantSaasBillingRepository } from "../repositories/merchant-saas-billing.repository";
import { AuditLogService } from "../services/audit-log.service";
import {
  ManualReviewPaymentProvider,
  MerchantSaasBillingService
} from "../services/merchant-saas-billing.service";
import { SaasBillingPolicyService } from "../services/saas-billing-policy.service";
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
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS = {
  list: "backoffice:merchant-accounts:list",
  read: "backoffice:merchant-accounts:read",
  manage: "backoffice:merchant-accounts:manage",
  billingRead: "backoffice:saas-billing:read",
  billingWrite: "backoffice:saas-billing:write",
  paymentReview: "backoffice:saas-payment:review",
  suspensionWrite: "backoffice:entity-suspension:write",
  suspensionRelease: "backoffice:entity-suspension:release",
  dissolutionWrite: "backoffice:entity-dissolution:write"
} as const;

export const createMerchantSaasBillingRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new MerchantSaasBillingService(
    dependencies.merchantSaasBillingRepository ?? new MerchantSaasBillingRepository(),
    auditLogService,
    new SaasBillingPolicyService(),
    dependencies.paymentProvider ?? new ManualReviewPaymentProvider()
  );
  const controller = new MerchantSaasBillingController(service);

  router.get(
    "/backoffice/merchant-accounts",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.list),
    validateRequest({ query: merchantAccountListQuerySchema }),
    controller.listAccounts
  );
  router.post(
    "/backoffice/merchant-accounts",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.manage),
    validateRequest({ body: createMerchantAccountBodySchema }),
    controller.createMerchantAccount
  );
  router.get(
    "/backoffice/merchant-accounts/:id",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.read),
    validateRequest({ params: merchantAccountIdParamSchema }),
    controller.getMerchantAccount
  );
  router.patch(
    "/backoffice/merchant-accounts/:id/billing-profile",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingWrite),
    validateRequest({ params: merchantAccountIdParamSchema, body: updateBillingProfileBodySchema }),
    controller.updateMerchantBilling
  );
  router.patch(
    "/backoffice/merchant-accounts/:id/payment-responsibility",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingWrite),
    validateRequest({
      params: merchantAccountIdParamSchema,
      body: updatePaymentResponsibilityBodySchema
    }),
    controller.updatePaymentResponsibility
  );
  router.post(
    "/backoffice/merchant-accounts/:id/shops",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.manage),
    validateRequest({ params: merchantAccountIdParamSchema, body: linkMerchantShopBodySchema }),
    controller.linkShop
  );
  router.delete(
    "/backoffice/merchant-accounts/:id/shops/:shopId",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.manage),
    validateRequest({ params: merchantMembershipParamSchema }),
    controller.unlinkShop
  );
  router.patch(
    "/backoffice/shops/:id/billing-profile",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingWrite),
    validateRequest({ params: shopBillingParamSchema, body: updateBillingProfileBodySchema }),
    controller.updateShopBilling
  );
  router.post(
    "/backoffice/billing-subjects/:subjectType/:subjectId/trial/extensions",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingWrite),
    validateRequest({ params: billingSubjectParamSchema, body: extendTrialBodySchema }),
    controller.extendTrial
  );
  router.post(
    "/backoffice/billing-subjects/:subjectType/:subjectId/trial/interrupt",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingWrite),
    validateRequest({ params: billingSubjectParamSchema, body: interruptTrialBodySchema }),
    controller.interruptTrial
  );
  router.get(
    "/backoffice/billing-subjects/:subjectType/:subjectId/free-periods",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingRead),
    validateRequest({ params: billingSubjectParamSchema, query: freePeriodListQuerySchema }),
    controller.listFreePeriods
  );
  router.get(
    "/backoffice/saas-invoices",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingRead),
    validateRequest({ query: saasInvoiceListQuerySchema }),
    controller.listInvoices
  );
  router.get(
    "/backoffice/saas-invoices/:id",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.billingRead),
    validateRequest({ params: invoiceIdParamSchema }),
    controller.getInvoice
  );
  router.post(
    "/backoffice/saas-invoices/:id/manual-payments",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.paymentReview),
    validateRequest({ params: invoiceIdParamSchema, body: manualPaymentBodySchema }),
    controller.reviewManualPayment
  );
  router.post(
    "/backoffice/entities/:subjectType/:subjectId/suspensions",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.suspensionWrite),
    validateRequest({ params: billingSubjectParamSchema, body: createSuspensionBodySchema }),
    controller.createSuspension
  );
  router.post(
    "/backoffice/entities/:subjectType/:subjectId/suspensions/:suspensionId/release",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.suspensionRelease),
    validateRequest({
      params: releaseSuspensionParamSchema,
      body: releaseSuspensionBodySchema
    }),
    controller.releaseSuspension
  );
  router.delete(
    "/backoffice/merchant-accounts/:id",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.dissolutionWrite),
    validateRequest({ params: merchantAccountIdParamSchema, body: dissolveMerchantBodySchema }),
    controller.dissolveMerchant
  );
  router.delete(
    "/backoffice/shops/:id",
    authenticate(),
    authorize(MERCHANT_SAAS_BILLING_ROUTE_PERMISSIONS.dissolutionWrite),
    validateRequest({ params: shopBillingParamSchema }),
    controller.dissolveShop
  );

  return router;
};
