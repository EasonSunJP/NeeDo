import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { HealthController } from "../controllers/health.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { healthQuerySchema } from "../validators/health.validator";

export const createHealthRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const controller = new HealthController(config, dependencies);

  router.get("/health", validateRequest({ query: healthQuerySchema }), controller.getHealth);

  return router;
};
