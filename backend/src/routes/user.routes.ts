import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { UserController } from "../controllers/user.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { UserRepository } from "../repositories/user.repository";
import { AuditLogService } from "../services/audit-log.service";
import { UserService } from "../services/user.service";
import {
  userAssignRolesBodySchema,
  userCreateBodySchema,
  userIdParamSchema,
  userListQuerySchema,
  userUpdateBodySchema
} from "../validators/user.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const USER_ROUTE_PERMISSIONS = {
  list: "user:list",
  get: "user:list",
  create: "user:create",
  update: "user:update",
  delete: "user:delete",
  enable: "user:status:update",
  disable: "user:status:update",
  assignRoles: "user:assign-role"
} as const;

export const createUserRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const userService = new UserService(
    dependencies.userRepository ?? new UserRepository(),
    auditLogService
  );
  const controller = new UserController(userService);

  router.get(
    "/users",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.list),
    validateRequest({ query: userListQuerySchema }),
    controller.list
  );
  router.get(
    "/users/:id",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.get),
    validateRequest({ params: userIdParamSchema }),
    controller.get
  );
  router.post(
    "/users",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.create),
    validateRequest({ body: userCreateBodySchema }),
    controller.create
  );
  router.patch(
    "/users/:id",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.update),
    validateRequest({ params: userIdParamSchema, body: userUpdateBodySchema }),
    controller.update
  );
  router.post(
    "/users/:id/enable",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.enable),
    validateRequest({ params: userIdParamSchema }),
    controller.enable
  );
  router.post(
    "/users/:id/disable",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.disable),
    validateRequest({ params: userIdParamSchema }),
    controller.disable
  );
  router.delete(
    "/users/:id",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.delete),
    validateRequest({ params: userIdParamSchema }),
    controller.softDelete
  );
  router.put(
    "/users/:id/roles",
    authenticate(),
    authorize(USER_ROUTE_PERMISSIONS.assignRoles),
    validateRequest({ params: userIdParamSchema, body: userAssignRolesBodySchema }),
    controller.assignRoles
  );

  return router;
};
