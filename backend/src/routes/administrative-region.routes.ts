import { Router } from "express";
import type { AppDependencies } from "../app";
import { AdministrativeRegionController } from "../controllers/administrative-region.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AdministrativeRegionRepository } from "../repositories/administrative-region.repository";
import { AdministrativeRegionService } from "../services/administrative-region.service";
import { administrativeRegionListQuerySchema } from "../validators/administrative-region.validator";

export const createAdministrativeRegionRoutes = (dependencies: AppDependencies): Router => {
  const router = Router();
  const service = new AdministrativeRegionService(
    dependencies.administrativeRegionRepository ?? new AdministrativeRegionRepository()
  );
  const controller = new AdministrativeRegionController(service);

  router.get(
    "/reference/administrative-regions",
    validateRequest({ query: administrativeRegionListQuerySchema }),
    controller.list
  );

  return router;
};
