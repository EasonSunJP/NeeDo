import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopPresentationController } from "../controllers/shop-presentation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { createContentImageBodyErrorHandler, createContentImageBodyParser } from "../middlewares/content-image-upload.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ContentMediaRepository } from "../repositories/content-media.repository";
import { ShopPresentationRepository } from "../repositories/shop-presentation.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ContentMediaFileStorage } from "../services/content-media.storage";
import { ContentMediaService } from "../services/content-media.service";
import { ShopPresentationService } from "../services/shop-presentation.service";
import { shopPresentationLocaleParamSchema, shopPresentationLocaleSyncBodySchema, shopPresentationLocaleUpdateBodySchema, shopPresentationMediaQuerySchema } from "../validators/shop-presentation.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const SHOP_PRESENTATION_PERMISSIONS = {
  read: "merchant-admin:shop:read",
  write: "merchant-admin:shop:write"
} as const;

export const createShopPresentationRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const media = dependencies.contentMediaService ?? new ContentMediaService(
    dependencies.contentMediaRepository ?? new ContentMediaRepository(),
    dependencies.contentMediaStorage ?? new ContentMediaFileStorage(config.CONTENT_MEDIA_STORAGE_DIR, {
      identityStorageDirectory: config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
    })
  );
  const service = dependencies.shopPresentationService ?? new ShopPresentationService(
    dependencies.shopPresentationRepository ?? new ShopPresentationRepository(),
    audit,
    undefined,
    media
  );
  const controller = new ShopPresentationController(service);

  router.get(
    "/merchant-admin/shop/presentation",
    authenticate(),
    createAuthorizeMiddleware(SHOP_PRESENTATION_PERMISSIONS.read),
    controller.workspace
  );
  router.put(
    "/merchant-admin/shop/presentation/locales/:locale",
    authenticate(),
    createAuthorizeMiddleware(SHOP_PRESENTATION_PERMISSIONS.write),
    validateRequest({ params: shopPresentationLocaleParamSchema, body: shopPresentationLocaleUpdateBodySchema }),
    controller.updateLocale
  );
  router.post(
    "/merchant-admin/shop/presentation/locales/:locale/sync",
    authenticate(),
    createAuthorizeMiddleware(SHOP_PRESENTATION_PERMISSIONS.write),
    validateRequest({ params: shopPresentationLocaleParamSchema, body: shopPresentationLocaleSyncBodySchema }),
    controller.syncLocale
  );
  router.post(
    "/merchant-admin/shop/presentation/media",
    authenticate(),
    createAuthorizeMiddleware(SHOP_PRESENTATION_PERMISSIONS.write),
    validateRequest({ query: shopPresentationMediaQuerySchema }),
    createContentImageBodyParser(),
    createContentImageBodyErrorHandler({ invalid: "error.shop_presentation.media_invalid", tooLarge: "error.shop_presentation.media_too_large" }),
    controller.uploadMedia
  );
  return router;
};
