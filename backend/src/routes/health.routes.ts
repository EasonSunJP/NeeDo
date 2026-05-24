import { Router } from "express";
import type { AppConfig } from "../config/env";
import { HealthController } from "../controllers/health.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { healthQuerySchema } from "../validators/health.validator";

export const createHealthRoutes = (config: AppConfig): Router => {
  const router = Router();
  const controller = new HealthController(config);

  router.get("/health", validateRequest({ query: healthQuerySchema }), controller.getHealth);

  return router;
};
