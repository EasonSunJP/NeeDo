import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MerchantFinanceRulesController } from "../controllers/merchant-finance-rules.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { MerchantFinanceRulesRepository } from "../repositories/merchant-finance-rules.repository";
import { AuditLogService } from "../services/audit-log.service";
import { MerchantFinanceRulesService } from "../services/merchant-finance-rules.service";
import {
  merchantFinanceShopIdParamSchema,
  shopFinanceRulePreviewBodySchema,
  shopFinanceRuleSetBodySchema
} from "../validators/merchant-finance-rules.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const MERCHANT_FINANCE_RULE_ROUTE_PERMISSIONS = {
  read: "merchant-admin:finance-rules:read",
  write: "merchant-admin:finance-rules:write",
  preview: "merchant-admin:finance-rules:preview"
} as const;

export const createMerchantFinanceRulesRoutes = (
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
  const service = new MerchantFinanceRulesService(
    dependencies.merchantFinanceRulesRepository ?? new MerchantFinanceRulesRepository(),
    auditLogService
  );
  const controller = new MerchantFinanceRulesController(service);

  router.get(
    "/merchant-admin/shops/:shopId/finance/rules",
    authenticate(),
    authorize(MERCHANT_FINANCE_RULE_ROUTE_PERMISSIONS.read),
    validateRequest({ params: merchantFinanceShopIdParamSchema }),
    controller.getShopFinanceRuleSet
  );
  router.put(
    "/merchant-admin/shops/:shopId/finance/rules",
    authenticate(),
    authorize(MERCHANT_FINANCE_RULE_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: merchantFinanceShopIdParamSchema,
      body: shopFinanceRuleSetBodySchema
    }),
    controller.updateShopFinanceRuleSet
  );
  router.post(
    "/merchant-admin/shops/:shopId/finance/rules/preview",
    authenticate(),
    authorize(MERCHANT_FINANCE_RULE_ROUTE_PERMISSIONS.preview),
    validateRequest({
      params: merchantFinanceShopIdParamSchema,
      body: shopFinanceRulePreviewBodySchema
    }),
    controller.previewShopFinanceRule
  );

  return router;
};
