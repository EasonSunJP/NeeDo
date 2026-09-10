import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AffiliateTaskController } from "../controllers/affiliate-task.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateTaskRepository } from "../repositories/affiliate-task.repository";
import { AffiliatePlatformFeeRepository } from "../repositories/affiliate-platform-fee.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { MerchantAffiliateTaskContextRepository } from "../repositories/merchant-affiliate-task-context.repository";
import { AffiliateTaskService } from "../services/affiliate-task.service";
import { AffiliatePlatformFeeService } from "../services/affiliate-platform-fee.service";
import { AuditLogService } from "../services/audit-log.service";
import { LedgerService } from "../services/ledger.service";
import { MerchantAffiliateTaskContextService } from "../services/merchant-affiliate-task-context.service";
import {
  affiliateTaskIdParamSchema,
  affiliateTaskLocaleParamSchema,
  affiliateTaskListQuerySchema,
  backofficeAffiliateTaskListQuerySchema,
  createAffiliateTaskBodySchema,
  rejectAffiliateTaskBodySchema,
  updateAffiliateTaskBodySchema,
  updateAffiliateTaskTranslationBodySchema
} from "../validators/affiliate-task.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AFFILIATE_TASK_ROUTE_PERMISSIONS = {
  merchantRead: "page:merchant-affiliate-task",
  merchantCreate: "button:merchant-affiliate-task-create",
  merchantSubmit: "button:merchant-affiliate-task-submit",
  backofficeRead: "page:backoffice-affiliate",
  backofficeReview: "button:backoffice-affiliate-review"
} as const;

export const createAffiliateTaskRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const taskRepository = dependencies.affiliateTaskRepository ?? new AffiliateTaskRepository();
  const ledgerService = new LedgerService(dependencies.ledgerRepository ?? new LedgerRepository());
  const platformFeeService =
    dependencies.affiliatePlatformFeeService ??
    new AffiliatePlatformFeeService(
      dependencies.affiliatePlatformFeeRepository ?? new AffiliatePlatformFeeRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const service =
    dependencies.affiliateTaskService ??
    new AffiliateTaskService(taskRepository, ledgerService, { platformFeeService });
  const presenter =
    dependencies.merchantAffiliateTaskContextService ??
    new MerchantAffiliateTaskContextService(
      dependencies.merchantAffiliateTaskContextRepository ??
        new MerchantAffiliateTaskContextRepository(),
      platformFeeService
    );
  const controller = new AffiliateTaskController(service, presenter);

  router.get(
    "/merchant-admin/affiliate/tasks",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ query: affiliateTaskListQuerySchema }),
    controller.listPublisherTasks
  );
  router.post(
    "/merchant-admin/affiliate/tasks",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantCreate),
    validateRequest({ body: createAffiliateTaskBodySchema }),
    controller.createDraft
  );
  router.get(
    "/merchant-admin/affiliate/tasks/:taskId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ params: affiliateTaskIdParamSchema }),
    controller.getPublisherTask
  );
  router.patch(
    "/merchant-admin/affiliate/tasks/:taskId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantCreate),
    validateRequest({
      params: affiliateTaskIdParamSchema,
      body: updateAffiliateTaskBodySchema
    }),
    controller.updateDraft
  );
  router.put(
    "/merchant-admin/affiliate/tasks/:taskId/locales/:locale",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantCreate),
    validateRequest({
      params: affiliateTaskLocaleParamSchema,
      body: updateAffiliateTaskTranslationBodySchema
    }),
    controller.updateDraftLocale
  );
  router.post(
    "/merchant-admin/affiliate/tasks/:taskId/submit",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.merchantSubmit),
    validateRequest({ params: affiliateTaskIdParamSchema }),
    controller.submit
  );

  router.get(
    "/backoffice/affiliate/tasks",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.backofficeRead),
    validateRequest({ query: backofficeAffiliateTaskListQuerySchema }),
    controller.listBackofficeTasks
  );
  router.get(
    "/backoffice/affiliate/tasks/:taskId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.backofficeRead),
    validateRequest({ params: affiliateTaskIdParamSchema }),
    controller.getBackofficeTask
  );
  router.post(
    "/backoffice/affiliate/tasks/:taskId/approve",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.backofficeReview),
    validateRequest({ params: affiliateTaskIdParamSchema }),
    controller.approve
  );
  router.post(
    "/backoffice/affiliate/tasks/:taskId/reject",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_TASK_ROUTE_PERMISSIONS.backofficeReview),
    validateRequest({
      params: affiliateTaskIdParamSchema,
      body: rejectAffiliateTaskBodySchema
    }),
    controller.reject
  );

  return router;
};
