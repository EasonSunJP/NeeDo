import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PermissionController } from "../controllers/permission.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PermissionService } from "../services/permission.service";
import {
  permissionCreateBodySchema,
  permissionIdParamSchema,
  permissionListQuerySchema,
  permissionUpdateBodySchema
} from "../validators/permission.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PERMISSION_ROUTE_PERMISSIONS = {
  list: "permission:list",
  tree: "permission:list",
  get: "permission:list",
  create: "permission:create",
  update: "permission:update",
  delete: "permission:delete"
} as const;

export const createPermissionRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const permissionService = new PermissionService(
    dependencies.permissionRepository ?? new PermissionRepository(),
    auditLogService
  );
  const controller = new PermissionController(permissionService);

  router.get(
    "/permissions",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.list),
    validateRequest({ query: permissionListQuerySchema }),
    controller.list
  );
  router.get(
    "/permissions/tree",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.tree),
    controller.tree
  );
  router.get(
    "/permissions/:id",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.get),
    validateRequest({ params: permissionIdParamSchema }),
    controller.get
  );
  router.post(
    "/permissions",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.create),
    validateRequest({ body: permissionCreateBodySchema }),
    controller.create
  );
  router.patch(
    "/permissions/:id",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.update),
    validateRequest({ params: permissionIdParamSchema, body: permissionUpdateBodySchema }),
    controller.update
  );
  router.delete(
    "/permissions/:id",
    authenticate(),
    authorize(PERMISSION_ROUTE_PERMISSIONS.delete),
    validateRequest({ params: permissionIdParamSchema }),
    controller.softDelete
  );

  return router;
};
