import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MerchantAffiliateTaskContextController } from "../controllers/merchant-affiliate-task-context.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliatePlatformFeeRepository } from "../repositories/affiliate-platform-fee.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { MerchantAffiliateTaskContextRepository } from "../repositories/merchant-affiliate-task-context.repository";
import { AffiliatePlatformFeeService } from "../services/affiliate-platform-fee.service";
import { AuditLogService } from "../services/audit-log.service";
import { MerchantAffiliateTaskContextService } from "../services/merchant-affiliate-task-context.service";
import {
  merchantAffiliateFeePreviewBodySchema,
  merchantAffiliatePublishersQuerySchema,
  merchantAffiliateServicesQuerySchema,
  merchantAffiliateShopsQuerySchema
} from "../validators/merchant-affiliate-task-context.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const MERCHANT_AFFILIATE_TASK_CONTEXT_PERMISSION = "page:merchant-affiliate-task";

export const createMerchantAffiliateTaskContextRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const platformFeeService =
    dependencies.affiliatePlatformFeeService ??
    new AffiliatePlatformFeeService(
      dependencies.affiliatePlatformFeeRepository ?? new AffiliatePlatformFeeRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const service =
    dependencies.merchantAffiliateTaskContextService ??
    new MerchantAffiliateTaskContextService(
      dependencies.merchantAffiliateTaskContextRepository ??
        new MerchantAffiliateTaskContextRepository(),
      platformFeeService
    );
  const controller = new MerchantAffiliateTaskContextController(service);
  const authorize = createAuthorizeMiddleware(MERCHANT_AFFILIATE_TASK_CONTEXT_PERMISSION);

  router.get(
    "/merchant-admin/affiliate/publishers",
    authenticate(),
    authorize,
    validateRequest({ query: merchantAffiliatePublishersQuerySchema }),
    controller.listPublishers
  );
  router.get(
    "/merchant-admin/affiliate/shops",
    authenticate(),
    authorize,
    validateRequest({ query: merchantAffiliateShopsQuerySchema }),
    controller.listShops
  );
  router.get(
    "/merchant-admin/affiliate/services",
    authenticate(),
    authorize,
    validateRequest({ query: merchantAffiliateServicesQuerySchema }),
    controller.listServices
  );
  router.post(
    "/merchant-admin/affiliate/tasks/fee-preview",
    authenticate(),
    authorize,
    validateRequest({ body: merchantAffiliateFeePreviewBodySchema }),
    controller.previewFee
  );

  return router;
};
