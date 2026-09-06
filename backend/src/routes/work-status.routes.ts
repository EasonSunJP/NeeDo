import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { WorkStatusController } from "../controllers/work-status.controller";
import { WorkStatusService } from "../services/work-status.service";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import {
  workStatusChangeSchema,
  workStatusCommentSchema,
  workStatusIdSchema,
  workStatusQuerySchema
} from "../validators/work-status.validator";
export const WORK_STATUS_ROUTE_PERMISSIONS = {
  technician: { read: "technician-profile:read", write: "technician-profile:write" },
  merchant: { read: "merchant-admin:technicians:list", write: "merchant-admin:technicians:write" },
  operations: { read: "backoffice:technicians:list", write: "backoffice:technicians:write" }
} as const;
export function createWorkStatusRoutes(config: AppConfig, dependencies: AppDependencies) {
  const router = Router(),
    authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service =
    dependencies.workStatusService ??
    new WorkStatusService(undefined, undefined, dependencies.realtimeEventGateway);
  for (const portal of ["technician", "merchant", "operations"] as const) {
    const base =
      portal === "technician"
        ? "/technician-work-status/me"
        : portal === "merchant"
          ? "/merchant-admin/technicians/:id/work-status"
          : "/backoffice/technicians/:id/work-status";
    const controller = new WorkStatusController(service, portal),
      permissions = WORK_STATUS_ROUTE_PERMISSIONS[portal];
    const params = portal === "technician" ? {} : { params: workStatusIdSchema };
    router.get(
      base,
      authenticate(),
      createAuthorizeMiddleware(permissions.read),
      validateRequest(params),
      controller.snapshot
    );
    router.get(
      `${base}/events`,
      authenticate(),
      createAuthorizeMiddleware(permissions.read),
      validateRequest({ ...params, query: workStatusQuerySchema }),
      controller.events
    );
    router.post(
      `${base}/comments`,
      authenticate(),
      createAuthorizeMiddleware(permissions.write),
      validateRequest({ ...params, body: workStatusCommentSchema }),
      controller.comment
    );
    if (portal === "technician")
      router.patch(
        base,
        authenticate(),
        createAuthorizeMiddleware(permissions.write),
        validateRequest({ body: workStatusChangeSchema }),
        controller.change
      );
  }
  return router;
}
