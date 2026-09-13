import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BackofficeUserReviewController } from "../controllers/backoffice-user-review.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { BackofficeUserReviewRepository } from "../repositories/backoffice-user-review.repository";
import { AuditLogService } from "../services/audit-log.service";
import { BackofficeUserReviewService } from "../services/backoffice-user-review.service";
import {
  backofficeOperationsReviewListQuerySchema,
  backofficeUserReviewAmendmentBodySchema,
  backofficeUserReviewListQuerySchema,
  backofficeUserReviewParamSchema,
  backofficeUserReviewUserParamSchema
} from "../validators/backoffice-user-review.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BACKOFFICE_USER_REVIEW_PERMISSIONS = {
  operationsRead: "backoffice:users:read",
  operationsWrite: "backoffice:customers:write",
  merchantRead: "merchant-admin:customers:list"
} as const;

export const createBackofficeUserReviewRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const service =
    dependencies.backofficeUserReviewService ??
    new BackofficeUserReviewService(
      dependencies.backofficeUserReviewRepository ?? new BackofficeUserReviewRepository(),
      audit
    );
  const controller = new BackofficeUserReviewController(service as BackofficeUserReviewService);

  router.get(
    "/backoffice/reviews",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_REVIEW_PERMISSIONS.operationsRead),
    validateRequest({ query: backofficeOperationsReviewListQuerySchema }),
    controller.listOperationsReviews
  );
  router.get(
    "/backoffice/reviews/:reviewId",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_REVIEW_PERMISSIONS.operationsRead),
    validateRequest({ params: backofficeUserReviewParamSchema }),
    controller.getOperationsReview
  );

  router.get(
    "/backoffice/users/:userId/received-reviews",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_REVIEW_PERMISSIONS.operationsRead),
    validateRequest({
      params: backofficeUserReviewUserParamSchema,
      query: backofficeUserReviewListQuerySchema
    }),
    controller.listForOperations
  );
  router.get(
    "/merchant-admin/users/:userId/received-reviews",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_REVIEW_PERMISSIONS.merchantRead),
    validateRequest({
      params: backofficeUserReviewUserParamSchema,
      query: backofficeUserReviewListQuerySchema
    }),
    controller.listForMerchant
  );
  router.post(
    "/backoffice/reviews/:reviewId/amendments",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_REVIEW_PERMISSIONS.operationsWrite),
    validateRequest({
      params: backofficeUserReviewParamSchema,
      body: backofficeUserReviewAmendmentBodySchema
    }),
    controller.amend
  );

  return router;
};
