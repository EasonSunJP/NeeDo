import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { RoleController } from "../controllers/role.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { RoleRepository } from "../repositories/role.repository";
import { AuditLogService } from "../services/audit-log.service";
import { RoleService } from "../services/role.service";
import {
  roleAssignPermissionsBodySchema,
  roleCreateBodySchema,
  roleIdParamSchema,
  roleListQuerySchema,
  roleUpdateBodySchema
} from "../validators/role.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ROLE_ROUTE_PERMISSIONS = {
  list: "role:list",
  get: "role:list",
  create: "role:create",
  update: "role:update",
  delete: "role:delete",
  assignPermissions: "role:assign-permission"
} as const;

export const createRoleRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const roleService = new RoleService(
    dependencies.roleRepository ?? new RoleRepository(),
    auditLogService
  );
  const controller = new RoleController(roleService);

  router.get(
    "/roles",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.list),
    validateRequest({ query: roleListQuerySchema }),
    controller.list
  );
  router.get(
    "/roles/:id",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.get),
    validateRequest({ params: roleIdParamSchema }),
    controller.get
  );
  router.post(
    "/roles",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.create),
    validateRequest({ body: roleCreateBodySchema }),
    controller.create
  );
  router.patch(
    "/roles/:id",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.update),
    validateRequest({ params: roleIdParamSchema, body: roleUpdateBodySchema }),
    controller.update
  );
  router.delete(
    "/roles/:id",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.delete),
    validateRequest({ params: roleIdParamSchema }),
    controller.softDelete
  );
  router.put(
    "/roles/:id/permissions",
    authenticate(),
    authorize(ROLE_ROUTE_PERMISSIONS.assignPermissions),
    validateRequest({ params: roleIdParamSchema, body: roleAssignPermissionsBodySchema }),
    controller.assignPermissions
  );

  return router;
};
