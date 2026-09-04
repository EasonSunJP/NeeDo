import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PricingModeController } from "../controllers/pricing-mode.controller";
import { TechnicianServiceCoverController } from "../controllers/technician-service-cover.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import {
  createContentImageBodyErrorHandler,
  createContentImageBodyParser
} from "../middlewares/content-image-upload.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ContentMediaRepository } from "../repositories/content-media.repository";
import { PricingModeRepository } from "../repositories/pricing-mode.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PricingModeService } from "../services/pricing-mode.service";
import { ContentMediaFileStorage } from "../services/content-media.storage";
import { TechnicianServiceCoverService } from "../services/technician-service-cover.service";
import {
  bookingNavigationQuerySchema,
  pricingModeBodySchema,
  publicTechnicianServicesParamSchema,
  shopIdParamSchema,
  technicianServiceBodySchema,
  technicianServiceIdParamSchema,
  technicianServiceListQuerySchema,
  technicianServiceOrderBodySchema
} from "../validators/pricing-mode.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PRICING_MODE_ROUTE_PERMISSIONS = {
  pricingModeRead: "merchant-admin:shop:pricing-mode:read",
  pricingModeUpdate: "merchant-admin:shop:pricing-mode:update",
  technicianServicesList: "technician:services:list",
  technicianServicesWrite: "technician:services:write"
} as const;

export const createPricingModeRoutes = (
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
  const repository = dependencies.pricingModeRepository ?? new PricingModeRepository();
  const service = new PricingModeService(repository, auditLogService);
  const controller = new PricingModeController(service);
  const contentStorage =
    dependencies.contentMediaStorage ??
    new ContentMediaFileStorage(config.CONTENT_MEDIA_STORAGE_DIR, {
      identityStorageDirectory: config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
    });
  const contentMediaRepository =
    dependencies.contentMediaRepository ?? new ContentMediaRepository();
  const coverController = new TechnicianServiceCoverController(
    new TechnicianServiceCoverService(repository, contentStorage, contentMediaRepository)
  );

  router.get(
    "/shops/:shopId/pricing-mode",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.pricingModeRead),
    validateRequest({ params: shopIdParamSchema }),
    controller.getShopPricingMode
  );
  router.put(
    "/shops/:shopId/pricing-mode",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.pricingModeUpdate),
    validateRequest({ params: shopIdParamSchema, body: pricingModeBodySchema }),
    controller.updateShopPricingMode
  );
  router.get(
    "/technicians/me/services",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesList),
    validateRequest({ query: technicianServiceListQuerySchema }),
    controller.listMyTechnicianServices
  );
  router.put(
    "/technicians/me/services/order",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({ body: technicianServiceOrderBodySchema }),
    controller.reorderMyTechnicianServices
  );
  router.get(
    "/technicians/me/shops/:shopId/services",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesList),
    validateRequest({ params: shopIdParamSchema, query: technicianServiceListQuerySchema }),
    controller.listTechnicianServices
  );
  router.post(
    "/technicians/me/shops/:shopId/services",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({ params: shopIdParamSchema, body: technicianServiceBodySchema }),
    controller.createTechnicianService
  );
  router.put(
    "/technicians/me/shops/:shopId/services/:serviceId",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({
      params: technicianServiceIdParamSchema,
      body: technicianServiceBodySchema.partial()
    }),
    controller.updateTechnicianService
  );
  router.delete(
    "/technicians/me/shops/:shopId/services/:serviceId",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({ params: technicianServiceIdParamSchema }),
    controller.deleteTechnicianService
  );
  router.put(
    "/technicians/me/shops/:shopId/services/:serviceId/cover",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({ params: technicianServiceIdParamSchema }),
    createContentImageBodyParser(),
    createContentImageBodyErrorHandler({
      invalid: "error.technician_service.cover_invalid",
      tooLarge: "error.technician_service.cover_too_large"
    }),
    coverController.upload
  );
  router.delete(
    "/technicians/me/shops/:shopId/services/:serviceId/cover",
    authenticate(),
    authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
    validateRequest({ params: technicianServiceIdParamSchema }),
    coverController.remove
  );
  router.get(
    "/shops/:shopId/booking-navigation",
    validateRequest({ params: shopIdParamSchema, query: bookingNavigationQuerySchema }),
    controller.getBookingNavigation
  );
  router.get(
    "/shops/:shopId/technicians/:technicianId/services",
    validateRequest({
      params: publicTechnicianServicesParamSchema,
      query: bookingNavigationQuerySchema
    }),
    controller.listPublicTechnicianServices
  );

  return router;
};
