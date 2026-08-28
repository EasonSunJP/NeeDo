import { Router } from "express";
import { z } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CONTENT_PUBLICATION_PERMISSIONS } from "../constants/permissions.constants";
import { CarouselPublicationController } from "../controllers/carousel-publication.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateMarketplaceRepository } from "../repositories/affiliate-marketplace.repository";
import { CarouselPublicationRepository } from "../repositories/carousel-publication.repository";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import { AffiliateMarketplaceService } from "../services/affiliate-marketplace.service";
import {
  CarouselPublicationService,
  type CarouselSceneCode
} from "../services/carousel-publication.service";
import {
  carouselCopyAllBodySchema,
  carouselDraftBodySchemaByScene,
  carouselLocaleUpdateBodySchema,
  carouselSlideLocaleParamSchema,
  carouselSlideParamSchema,
  carouselTargetSearchQuerySchemaByScene,
  contentHistoryQuerySchema,
  contentPublicationValidationErrorMessage,
  disableBodySchema,
  publishBodySchema,
  rollbackBodySchema,
  scheduleBodySchema
} from "../validators/content-publication.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS } from "./affiliate-marketplace.routes";

const releaseParamSchema = z.object({ releaseId: z.coerce.number().int().positive() }).strict();
const localeQuerySchema = z
  .object({
    locale: z.enum(["zh-CN", "zh-TW", "en", "ja", "ko"], {
      errorMap: () => ({ message: "error.content.locale_invalid" })
    })
  })
  .strict();
const validate = (schemas: Parameters<typeof validateRequest>[0]) =>
  validateRequest({ ...schemas, validationErrorMessage: contentPublicationValidationErrorMessage });

export const createCarouselPublicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const marketplaceRepository =
    dependencies.affiliateMarketplaceRepository ?? new AffiliateMarketplaceRepository();
  const marketplace =
    dependencies.affiliateMarketplaceService ??
    new AffiliateMarketplaceService(
      marketplaceRepository,
      new AffiliateLinkTokenService({
        secret: config.AFFILIATE_LINK_SECRET,
        publicBaseUrl: config.AFFILIATE_PUBLIC_BASE_URL
      })
    );
  const service =
    dependencies.carouselPublicationService ??
    new CarouselPublicationService(
      dependencies.carouselPublicationRepository ?? new CarouselPublicationRepository(),
      marketplace
    );

  const register = (
    slug: "user-home" | "affiliate-home-notice",
    scene: CarouselSceneCode,
    permissions: { read: string; edit: string; publish: string }
  ) => {
    const controller = new CarouselPublicationController(service, scene);
    const base = `/backoffice/content/carousels/${slug}`;
    const read = createAuthorizeMiddleware(permissions.read);
    const edit = createAuthorizeMiddleware(permissions.edit);
    const publish = createAuthorizeMiddleware(permissions.publish);
    router.get(base, authenticate(), read, controller.getScene);
    router.post(
      `${base}/releases`,
      authenticate(),
      edit,
      validate({ body: carouselDraftBodySchemaByScene[slug].create }),
      controller.createDraft
    );
    router.get(
      `${base}/history`,
      authenticate(),
      read,
      validate({ query: contentHistoryQuerySchema }),
      controller.history
    );
    router.get(
      `${base}/targets`,
      authenticate(),
      read,
      validate({ query: carouselTargetSearchQuerySchemaByScene[slug] }),
      controller.searchTargets
    );
    router.get(
      `${base}/releases/:releaseId`,
      authenticate(),
      read,
      validate({ params: releaseParamSchema }),
      controller.getRelease
    );
    router.patch(
      `${base}/releases/:releaseId`,
      authenticate(),
      edit,
      validate({ params: releaseParamSchema, body: carouselDraftBodySchemaByScene[slug].update }),
      controller.replaceDraft
    );
    router.patch(
      `${base}/releases/:releaseId/slides/:slidePublicId/locales/:locale`,
      authenticate(),
      edit,
      validate({ params: carouselSlideLocaleParamSchema, body: carouselLocaleUpdateBodySchema }),
      controller.updateLocale
    );
    router.post(
      `${base}/releases/:releaseId/slides/:slidePublicId/copy-to-all`,
      authenticate(),
      edit,
      validate({ params: carouselSlideParamSchema, body: carouselCopyAllBodySchema }),
      controller.copyLocaleToAll
    );
    router.get(
      `${base}/releases/:releaseId/preview`,
      authenticate(),
      read,
      validate({ params: releaseParamSchema }),
      controller.preview
    );
    router.post(
      `${base}/releases/:releaseId/publish`,
      authenticate(),
      publish,
      validate({ params: releaseParamSchema, body: publishBodySchema }),
      controller.publish
    );
    router.post(
      `${base}/releases/:releaseId/schedule`,
      authenticate(),
      publish,
      validate({ params: releaseParamSchema, body: scheduleBodySchema }),
      controller.schedule
    );
    router.post(
      `${base}/releases/:releaseId/disable`,
      authenticate(),
      publish,
      validate({ params: releaseParamSchema, body: disableBodySchema }),
      controller.disable
    );
    router.post(
      `${base}/releases/:releaseId/rollback`,
      authenticate(),
      publish,
      validate({ params: releaseParamSchema, body: rollbackBodySchema }),
      controller.rollback
    );
  };

  register("user-home", "USER_HOME", {
    read: CONTENT_PUBLICATION_PERMISSIONS.userHomeRead,
    edit: CONTENT_PUBLICATION_PERMISSIONS.userHomeEdit,
    publish: CONTENT_PUBLICATION_PERMISSIONS.userHomePublish
  });
  register("affiliate-home-notice", "AFFILIATE_HOME_NOTICE", {
    read: CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeRead,
    edit: CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeEdit,
    publish: CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticePublish
  });

  router.get(
    "/content/carousels/user-home",
    authenticate(),
    validate({ query: localeQuerySchema }),
    new CarouselPublicationController(service, "USER_HOME").getPublished
  );
  router.get(
    "/affiliate/content/carousel",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validate({ query: localeQuerySchema }),
    new CarouselPublicationController(service, "AFFILIATE_HOME_NOTICE").getPublished
  );
  return router;
};
