import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BackofficeUserUsageController } from "../controllers/backoffice-user-usage.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { BackofficeUserUsageRepository } from "../repositories/backoffice-user-usage.repository";
import { AuditLogService } from "../services/audit-log.service";
import { BackofficeUserUsageService } from "../services/backoffice-user-usage.service";
import {
  backofficeRefundAmendmentBodySchema,
  backofficeUserUsageCommentBodySchema,
  backofficeUserUsageListQuerySchema,
  backofficeUserUsageParamsSchema
} from "../validators/backoffice-user-usage.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BACKOFFICE_USER_USAGE_PERMISSIONS = {
  operationsRead: "backoffice:users:read",
  merchantRead: "merchant-admin:customers:list",
  comment: "backoffice:user-usage:comment",
  refundAmend: "backoffice:user-refund:amend"
} as const;

export const createBackofficeUserUsageRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const service =
    dependencies.backofficeUserUsageService ??
    new BackofficeUserUsageService(
      dependencies.backofficeUserUsageRepository ?? new BackofficeUserUsageRepository(),
      audit
    );
  const controller = new BackofficeUserUsageController(service as BackofficeUserUsageService);
  const readRoutes = [
    {
      prefix: "/backoffice",
      permission: BACKOFFICE_USER_USAGE_PERMISSIONS.operationsRead,
      list: controller.listForOperations,
      detail: controller.timelineForOperations
    },
    {
      prefix: "/merchant-admin",
      permission: BACKOFFICE_USER_USAGE_PERMISSIONS.merchantRead,
      list: controller.listForMerchant,
      detail: controller.timelineForMerchant
    }
  ] as const;
  readRoutes.forEach((entry) => {
    router.get(
      `${entry.prefix}/users/:userId/usages`,
      authenticate(),
      createAuthorizeMiddleware(entry.permission),
      validateRequest({
        params: backofficeUserUsageParamsSchema,
        query: backofficeUserUsageListQuerySchema
      }),
      entry.list
    );
    router.get(
      `${entry.prefix}/users/:userId/usages/:orderId`,
      authenticate(),
      createAuthorizeMiddleware(entry.permission),
      validateRequest({ params: backofficeUserUsageParamsSchema }),
      entry.detail
    );
  });
  router.post(
    "/backoffice/users/:userId/usages/:orderId/comments",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_USAGE_PERMISSIONS.comment),
    validateRequest({
      params: backofficeUserUsageParamsSchema,
      body: backofficeUserUsageCommentBodySchema
    }),
    controller.appendComment
  );
  router.post(
    "/backoffice/users/:userId/usages/:orderId/refund-amendments",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_USAGE_PERMISSIONS.refundAmend),
    validateRequest({
      params: backofficeUserUsageParamsSchema,
      body: backofficeRefundAmendmentBodySchema
    }),
    controller.amendRefund
  );
  return router;
};
