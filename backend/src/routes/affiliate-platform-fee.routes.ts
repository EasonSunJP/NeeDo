import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AffiliatePlatformFeeController } from "../controllers/affiliate-platform-fee.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AffiliatePlatformFeeRepository } from "../repositories/affiliate-platform-fee.repository";
import { AffiliatePlatformFeeService } from "../services/affiliate-platform-fee.service";
import { AuditLogService } from "../services/audit-log.service";
import {
  affiliatePlatformFeeShopOptionQuerySchema,
  affiliatePlatformFeeRuleCreateBodySchema,
  affiliatePlatformFeeRuleListQuerySchema,
  affiliatePlatformFeeRuleSummaryQuerySchema
} from "../validators/affiliate-platform-fee.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AFFILIATE_PLATFORM_FEE_ROUTE_PERMISSIONS = {
  read: "page:backoffice-affiliate-fee-rule",
  write: "button:backoffice-affiliate-fee-rule-create"
} as const;

export const createAffiliatePlatformFeeRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.affiliatePlatformFeeService ??
    new AffiliatePlatformFeeService(
      dependencies.affiliatePlatformFeeRepository ?? new AffiliatePlatformFeeRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new AffiliatePlatformFeeController(service);

  router.get(
    "/backoffice/affiliate/fee-rules/summary",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PLATFORM_FEE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: affiliatePlatformFeeRuleSummaryQuerySchema }),
    controller.getGlobalSummary
  );
  router.get(
    "/backoffice/affiliate/fee-rule-shops",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PLATFORM_FEE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: affiliatePlatformFeeShopOptionQuerySchema }),
    controller.listEligibleShops
  );
  router.get(
    "/backoffice/affiliate/fee-rules",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PLATFORM_FEE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: affiliatePlatformFeeRuleListQuerySchema }),
    controller.listRules
  );
  router.post(
    "/backoffice/affiliate/fee-rules",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PLATFORM_FEE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: affiliatePlatformFeeRuleCreateBodySchema }),
    controller.createRuleVersion
  );

  return router;
};
