import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OrderAcceptancePauseController } from "../controllers/order-acceptance-pause.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { OrderAcceptancePauseRepository } from "../repositories/order-acceptance-pause.repository";
import { AuditLogService } from "../services/audit-log.service";
import { OrderAcceptancePauseService } from "../services/order-acceptance-pause.service";
import {
  orderAcceptancePauseCreateBodySchema,
  orderAcceptancePauseIdParamSchema,
  orderAcceptancePauseListQuerySchema,
  orderAcceptancePauseReleaseBodySchema
} from "../validators/order-acceptance-pause.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ORDER_ACCEPTANCE_PAUSE_ROUTE_PERMISSIONS = {
  backofficeRead: "backoffice:order-acceptance-pause:read",
  backofficeWrite: "backoffice:order-acceptance-pause:write",
  merchantRead: "merchant-admin:order-acceptance-pause:read",
  merchantWrite: "merchant-admin:order-acceptance-pause:write"
} as const;

export const createOrderAcceptancePauseRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new OrderAcceptancePauseService(
    dependencies.orderAcceptancePauseRepository ?? new OrderAcceptancePauseRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new OrderAcceptancePauseController(service);

  const register = (
    prefix: "/backoffice" | "/merchant-admin",
    permissions: {
      read: string;
      write: string;
    }
  ) => {
    router.get(
      `${prefix}/order-acceptance-pauses`,
      authenticate(),
      createAuthorizeMiddleware(permissions.read),
      validateRequest({ query: orderAcceptancePauseListQuerySchema }),
      controller.listPauses
    );
    router.post(
      `${prefix}/order-acceptance-pauses`,
      authenticate(),
      createAuthorizeMiddleware(permissions.write),
      validateRequest({ body: orderAcceptancePauseCreateBodySchema }),
      controller.createPause
    );
    router.post(
      `${prefix}/order-acceptance-pauses/:id/release`,
      authenticate(),
      createAuthorizeMiddleware(permissions.write),
      validateRequest({
        params: orderAcceptancePauseIdParamSchema,
        body: orderAcceptancePauseReleaseBodySchema
      }),
      controller.releasePause
    );
  };

  register("/backoffice", {
    read: ORDER_ACCEPTANCE_PAUSE_ROUTE_PERMISSIONS.backofficeRead,
    write: ORDER_ACCEPTANCE_PAUSE_ROUTE_PERMISSIONS.backofficeWrite
  });
  register("/merchant-admin", {
    read: ORDER_ACCEPTANCE_PAUSE_ROUTE_PERMISSIONS.merchantRead,
    write: ORDER_ACCEPTANCE_PAUSE_ROUTE_PERMISSIONS.merchantWrite
  });

  return router;
};
