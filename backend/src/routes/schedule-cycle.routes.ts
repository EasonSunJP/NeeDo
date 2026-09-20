import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ScheduleCycleController } from "../controllers/schedule-cycle.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ScheduleCycleRepository } from "../repositories/schedule-cycle.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ScheduleCycleService } from "../services/schedule-cycle.service";
import {
  scheduleCycleCommandBodySchema,
  scheduleCycleCreateBodySchema,
  scheduleCycleFeedbackBodySchema,
  scheduleCycleListQuerySchema,
  scheduleCycleOperationsListQuerySchema,
  scheduleCycleParamsSchema,
  scheduleCycleUpdateBodySchema
} from "../validators/schedule-cycle.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createScheduleCycleRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const controller = new ScheduleCycleController(new ScheduleCycleService(
    dependencies.scheduleCycleRepository ?? new ScheduleCycleRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  ));

  router.get(
    "/merchant-admin/schedule-cycles",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:list"),
    validateRequest({ query: scheduleCycleListQuerySchema }),
    controller.listForMerchant
  );
  router.post(
    "/merchant-admin/schedule-cycles",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ body: scheduleCycleCreateBodySchema }),
    controller.createDraft
  );
  router.put(
    "/merchant-admin/schedule-cycles/:cycleId",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema, body: scheduleCycleUpdateBodySchema }),
    controller.updateDraft
  );
  router.post(
    "/merchant-admin/schedule-cycles/:cycleId/launch",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema, body: scheduleCycleCommandBodySchema }),
    controller.launch
  );
  router.post(
    "/merchant-admin/schedule-cycles/:cycleId/close-feedback",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema }),
    controller.closeFeedback
  );
  router.post(
    "/merchant-admin/schedule-cycles/:cycleId/auto-confirm",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema, body: scheduleCycleCommandBodySchema }),
    controller.autoConfirm
  );
  router.post(
    "/merchant-admin/schedule-cycles/:cycleId/finalize",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema, body: scheduleCycleCommandBodySchema }),
    controller.finalize
  );
  router.delete(
    "/merchant-admin/schedule-cycles/:cycleId",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema }),
    controller.cancel
  );
  router.get(
    "/technician/schedule-cycles",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:list"),
    validateRequest({ query: scheduleCycleListQuerySchema }),
    controller.listForTechnician
  );
  router.put(
    "/technician/schedule-cycles/:cycleId/feedback",
    authenticate(),
    createAuthorizeMiddleware("schedule:slots:write"),
    validateRequest({ params: scheduleCycleParamsSchema, body: scheduleCycleFeedbackBodySchema }),
    controller.submitTechnicianFeedback
  );
  router.get(
    "/backoffice/schedule-cycles",
    authenticate(),
    createAuthorizeMiddleware("backoffice:schedule:list"),
    validateRequest({ query: scheduleCycleOperationsListQuerySchema }),
    controller.listForOperations
  );

  return router;
};
