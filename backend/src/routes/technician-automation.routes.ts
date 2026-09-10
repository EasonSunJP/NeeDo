import { Router } from "express";
import type { AppConfig } from "../config/env";
import type { AppDependencies } from "../app";
import { TECHNICIAN_AUTOMATION_PERMISSIONS } from "../constants/permissions.constants";
import { TechnicianAutomationController } from "../controllers/technician-automation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { TechnicianAutomationRepository } from "../repositories/technician-automation.repository";
import { TechnicianAutomationService } from "../services/technician-automation.service";
import {
  technicianAutomationContactListQuerySchema,
  technicianAutomationKindParamSchema,
  technicianAutomationSettingsUpdateSchema
} from "../validators/technician-automation.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createTechnicianAutomationRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = dependencies.technicianAutomationService ?? new TechnicianAutomationService(
    dependencies.technicianAutomationRepository ?? new TechnicianAutomationRepository()
  );
  const controller = new TechnicianAutomationController(service);

  router.get(
    "/technician/automation-settings/contacts",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_AUTOMATION_PERMISSIONS.read),
    validateRequest({ query: technicianAutomationContactListQuerySchema }),
    controller.listContacts
  );
  router.get(
    "/technician/automation-settings/:kind",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_AUTOMATION_PERMISSIONS.read),
    validateRequest({ params: technicianAutomationKindParamSchema }),
    controller.getSetting
  );
  router.put(
    "/technician/automation-settings/:kind",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_AUTOMATION_PERMISSIONS.write),
    validateRequest({ params: technicianAutomationKindParamSchema, body: technicianAutomationSettingsUpdateSchema }),
    controller.updateSetting
  );
  return router;
};
