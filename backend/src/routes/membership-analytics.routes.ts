import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MembershipAnalyticsController } from "../controllers/membership-analytics.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { MembershipAnalyticsRepository } from "../repositories/membership-analytics.repository";
import { prisma } from "../prisma/client";
import { AuditLogService } from "../services/audit-log.service";
import { MembershipAnalyticsService } from "../services/membership-analytics.service";
import {
  backofficeMembershipListQuerySchema,
  backofficeMembershipTrendQuerySchema,
  merchantMembershipListQuerySchema,
  merchantMembershipTrendQuerySchema
} from "../validators/membership-analytics.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS = {
  backoffice: "backoffice.member.analytics.view",
  merchant: "shop.member.analytics.view"
} as const;

export const createMembershipAnalyticsRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new MembershipAnalyticsService(
    dependencies.membershipAnalyticsRepository ?? new MembershipAnalyticsRepository(prisma),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new MembershipAnalyticsController(service);

  router.get(
    "/backoffice/analytics/members/trend",
    authenticate(),
    createAuthorizeMiddleware(MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice),
    validateRequest({ query: backofficeMembershipTrendQuerySchema }),
    controller.backofficeTrend
  );
  router.get(
    "/backoffice/analytics/members",
    authenticate(),
    createAuthorizeMiddleware(MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice),
    validateRequest({ query: backofficeMembershipListQuerySchema }),
    controller.backofficeList
  );
  router.get(
    "/merchant-admin/analytics/members/trend",
    authenticate(),
    createAuthorizeMiddleware(MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.merchant),
    validateRequest({ query: merchantMembershipTrendQuerySchema }),
    controller.merchantTrend
  );
  router.get(
    "/merchant-admin/analytics/members",
    authenticate(),
    createAuthorizeMiddleware(MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.merchant),
    validateRequest({ query: merchantMembershipListQuerySchema }),
    controller.merchantList
  );

  return router;
};
