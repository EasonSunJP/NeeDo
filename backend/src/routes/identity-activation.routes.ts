import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { IdentityActivationController } from "../controllers/identity-activation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  activateAffiliateIdentityBodySchema,
  acceptMerchantContractBodySchema,
  bindAffiliateWithdrawalBankAccountBodySchema,
  contractLanguageQuerySchema,
  contractReceiptIdParamSchema,
  merchantContractApplicationIdParamSchema
} from "../validators/identity-activation.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import {
  createAffiliateIdentityActivationServiceForRoutes,
  createAffiliateBankAccountServiceForRoutes,
  createContractCatalogForRoutes,
  createContractReceiptServiceForRoutes,
  createMerchantContractAcceptanceServiceForRoutes
} from "./identity-activation-service.factory";

export const IDENTITY_ACTIVATION_ROUTE_PERMISSIONS = {
  contractRead: "contract:read",
  contractAccept: "contract:accept",
  bankAccountOwn: "bank-account:own"
} as const;

export const createIdentityActivationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const catalog = createContractCatalogForRoutes();
  const controller = new IdentityActivationController(
    createAffiliateIdentityActivationServiceForRoutes(dependencies, catalog),
    catalog,
    createAffiliateBankAccountServiceForRoutes(config, dependencies),
    createMerchantContractAcceptanceServiceForRoutes(dependencies, catalog),
    createContractReceiptServiceForRoutes(dependencies)
  );

  router.get(
    "/contracts/acceptances/:receiptId/receipt",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.contractRead),
    validateRequest({ params: contractReceiptIdParamSchema }),
    controller.getContractReceipt
  );
  router.get(
    "/contracts/affiliate/current",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.contractRead),
    validateRequest({ query: contractLanguageQuerySchema }),
    controller.getCurrentAffiliateContract
  );
  router.get(
    "/contracts/merchant/current",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.contractRead),
    validateRequest({ query: contractLanguageQuerySchema }),
    controller.getCurrentMerchantContract
  );
  router.post(
    "/identity-activations/affiliate",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.contractAccept),
    validateRequest({ body: activateAffiliateIdentityBodySchema }),
    controller.activateAffiliate
  );
  router.put(
    "/bank-accounts/affiliate-withdrawal",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.bankAccountOwn),
    validateRequest({ body: bindAffiliateWithdrawalBankAccountBodySchema }),
    controller.bindAffiliateWithdrawalBankAccount
  );
  router.post(
    "/identity-applications/:id/merchant-contract-acceptance",
    authenticate(),
    createAuthorizeMiddleware(IDENTITY_ACTIVATION_ROUTE_PERMISSIONS.contractAccept),
    validateRequest({
      params: merchantContractApplicationIdParamSchema,
      body: acceptMerchantContractBodySchema
    }),
    controller.acceptMerchantContract
  );

  return router;
};
