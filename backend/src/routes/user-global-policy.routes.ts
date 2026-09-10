import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import {
  NdpExperienceCampaignController,
  UserGlobalPolicyController
} from "../controllers/user-global-policy.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { NdpExperienceCampaignRepository } from "../repositories/ndp-experience-campaign.repository";
import { UserGlobalPolicyRepository } from "../repositories/user-global-policy.repository";
import { AuditLogService } from "../services/audit-log.service";
import { NdpExperienceCampaignService } from "../services/ndp-experience-campaign.service";
import { UserGlobalPolicyService } from "../services/user-global-policy.service";
import {
  ndpExperienceCampaignArchiveBodySchema,
  ndpExperienceCampaignDraftBodySchema,
  ndpExperienceCampaignListQuerySchema,
  ndpExperienceCampaignParamSchema,
  userGlobalPolicyDraftBodySchema,
  userGlobalPolicyPublishBodySchema,
  versionPublishBodySchema
} from "../validators/user-global-policy.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const USER_GLOBAL_POLICY_ROUTE_PERMISSIONS = {
  policyRead: "backoffice:user-policy:read",
  policyPublish: "backoffice:user-policy:publish",
  campaignRead: "backoffice:ndp-experience-campaign:read",
  campaignPublish: "backoffice:ndp-experience-campaign:publish"
} as const;

export const createUserGlobalPolicyRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const policyService =
    dependencies.userGlobalPolicyService ??
    new UserGlobalPolicyService(
      dependencies.userGlobalPolicyRepository ?? new UserGlobalPolicyRepository(),
      audit
    );
  const campaignService =
    dependencies.ndpExperienceCampaignService ??
    new NdpExperienceCampaignService(
      dependencies.ndpExperienceCampaignRepository ?? new NdpExperienceCampaignRepository(),
      audit
    );
  const policyController = new UserGlobalPolicyController(policyService);
  const campaignController = new NdpExperienceCampaignController(campaignService);

  router.get(
    "/backoffice/user-global-settings",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.policyRead),
    policyController.getSettings
  );
  router.put(
    "/backoffice/user-global-settings/draft",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.policyPublish),
    validateRequest({ body: userGlobalPolicyDraftBodySchema }),
    policyController.saveDraft
  );
  router.post(
    "/backoffice/user-global-settings/publish",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.policyPublish),
    validateRequest({ body: userGlobalPolicyPublishBodySchema }),
    policyController.publishDraft
  );
  router.get(
    "/backoffice/ndp-experience-campaigns",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.campaignRead),
    validateRequest({ query: ndpExperienceCampaignListQuerySchema }),
    campaignController.listCampaigns
  );
  router.put(
    "/backoffice/ndp-experience-campaigns/draft",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.campaignPublish),
    validateRequest({ body: ndpExperienceCampaignDraftBodySchema }),
    campaignController.saveDraft
  );
  router.post(
    "/backoffice/ndp-experience-campaigns/:versionPublicId/publish",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.campaignPublish),
    validateRequest({
      params: ndpExperienceCampaignParamSchema,
      body: versionPublishBodySchema
    }),
    campaignController.publishDraft
  );
  router.post(
    "/backoffice/ndp-experience-campaigns/:versionPublicId/archive",
    authenticate(),
    createAuthorizeMiddleware(USER_GLOBAL_POLICY_ROUTE_PERMISSIONS.campaignPublish),
    validateRequest({
      params: ndpExperienceCampaignParamSchema,
      body: ndpExperienceCampaignArchiveBodySchema
    }),
    campaignController.archiveCampaign
  );

  return router;
};
