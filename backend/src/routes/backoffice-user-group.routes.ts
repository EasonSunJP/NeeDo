import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BackofficeUserGroupController } from "../controllers/backoffice-user-group.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { BackofficeUserGroupRepository } from "../repositories/backoffice-user-group.repository";
import { AuditLogService } from "../services/audit-log.service";
import { BackofficeUserGroupService } from "../services/backoffice-user-group.service";
import {
  backofficeUserGroupArchiveBodySchema,
  backofficeUserGroupCreateBodySchema,
  backofficeUserGroupListQuerySchema,
  backofficeUserGroupMembersBodySchema,
  backofficeUserGroupParamSchema,
  backofficeUserGroupUpdateBodySchema
} from "../validators/backoffice-user-group.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS = {
  read: "backoffice:user-group:read",
  write: "backoffice:user-group:write"
} as const;

export const createBackofficeUserGroupRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const service =
    dependencies.backofficeUserGroupService ??
    new BackofficeUserGroupService(
      dependencies.backofficeUserGroupRepository ?? new BackofficeUserGroupRepository(),
      audit
    );
  const controller = new BackofficeUserGroupController(service);

  router.get(
    "/backoffice/user-groups",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.read),
    validateRequest({ query: backofficeUserGroupListQuerySchema }),
    controller.listGroups
  );
  router.post(
    "/backoffice/user-groups",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.write),
    validateRequest({ body: backofficeUserGroupCreateBodySchema }),
    controller.createGroup
  );
  router.get(
    "/backoffice/user-groups/:groupCode/members",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.read),
    validateRequest({
      params: backofficeUserGroupParamSchema,
      query: backofficeUserGroupListQuerySchema
    }),
    controller.listMembers
  );
  router.put(
    "/backoffice/user-groups/:groupCode/members",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: backofficeUserGroupParamSchema,
      body: backofficeUserGroupMembersBodySchema
    }),
    controller.setMembers
  );
  router.put(
    "/backoffice/user-groups/:groupCode",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: backofficeUserGroupParamSchema,
      body: backofficeUserGroupUpdateBodySchema
    }),
    controller.updateGroup
  );
  router.post(
    "/backoffice/user-groups/:groupCode/archive",
    authenticate(),
    createAuthorizeMiddleware(BACKOFFICE_USER_GROUP_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: backofficeUserGroupParamSchema,
      body: backofficeUserGroupArchiveBodySchema
    }),
    controller.archiveGroup
  );

  return router;
};
