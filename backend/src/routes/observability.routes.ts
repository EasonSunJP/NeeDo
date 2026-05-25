import { Router } from "express";
import type { AppConfig } from "../config/env";
import { ObservabilityController } from "../controllers/observability.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import type { ObservabilityMetricsPort } from "../services/observability.service";
import { metricsQuerySchema } from "../validators/observability.validator";

export const createObservabilityRoutes = (
  config: AppConfig,
  metricsService: ObservabilityMetricsPort
): Router => {
  const router = Router();
  const controller = new ObservabilityController(config, metricsService);

  router.get("/metrics", validateRequest({ query: metricsQuerySchema }), controller.getMetrics);

  return router;
};
