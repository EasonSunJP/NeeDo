import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PlatformMembershipController } from "../controllers/platform-membership.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PlatformMembershipRepository } from "../repositories/platform-membership.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PlatformMembershipService } from "../services/platform-membership.service";
import {
  platformMembershipBenefitParamSchema,
  platformMembershipBenefitLocaleQuerySchema,
  platformMembershipBenefitUpdateBodySchema,
  platformMembershipEntitlementCommandSchema,
  platformMembershipTierDraftBodySchema,
  platformMembershipTierParamSchema,
  platformMembershipTierPublishBodySchema,
  platformMembershipUserParamSchema
} from "../validators/platform-membership.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS = {
  tierRead: "backoffice:membership-tier:read",
  tierPublish: "backoffice:membership-tier:publish",
  benefitRead: "backoffice:membership-benefit:read",
  benefitWrite: "backoffice:membership-benefit:write",
  userMembershipWrite: "backoffice:user-membership:write"
} as const;

export const createPlatformMembershipRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const service =
    dependencies.platformMembershipAdministrationService ??
    new PlatformMembershipService(
      dependencies.platformMembershipRepository ?? new PlatformMembershipRepository(),
      audit,
      undefined,
      dependencies.userExperienceService
    );
  const controller = new PlatformMembershipController(service as PlatformMembershipService);

  router.get("/me/platform-membership", authenticate(), controller.getMine);
  router.get(
    "/me/membership-benefits",
    authenticate(),
    validateRequest({ query: platformMembershipBenefitLocaleQuerySchema }),
    controller.getMyBenefits
  );

  router.get(
    "/backoffice/membership-tiers",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.tierRead),
    controller.listTiers
  );
  router.get(
    "/backoffice/membership-tiers/:tierCode/draft",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.tierRead),
    validateRequest({ params: platformMembershipTierParamSchema }),
    controller.getDraft
  );
  router.put(
    "/backoffice/membership-tiers/:tierCode/draft",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.tierPublish),
    validateRequest({
      params: platformMembershipTierParamSchema,
      body: platformMembershipTierDraftBodySchema
    }),
    controller.saveDraft
  );
  router.post(
    "/backoffice/membership-tiers/:tierCode/publish",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.tierPublish),
    validateRequest({
      params: platformMembershipTierParamSchema,
      body: platformMembershipTierPublishBodySchema
    }),
    controller.publishDraft
  );
  router.get(
    "/backoffice/membership-benefits",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.benefitRead),
    controller.listBenefits
  );
  router.patch(
    "/backoffice/membership-benefits/:benefitCode",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.benefitWrite),
    validateRequest({
      params: platformMembershipBenefitParamSchema,
      body: platformMembershipBenefitUpdateBodySchema
    }),
    controller.updateBenefit
  );
  router.post(
    "/backoffice/users/:userId/platform-membership",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_MEMBERSHIP_ROUTE_PERMISSIONS.userMembershipWrite),
    validateRequest({
      params: platformMembershipUserParamSchema,
      body: platformMembershipEntitlementCommandSchema
    }),
    controller.changeEntitlement
  );

  return router;
};
