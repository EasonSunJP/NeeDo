import { Router } from "express";
import { z } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CONTENT_PUBLICATION_PERMISSIONS } from "../constants/permissions.constants";
import { OfficialAnnouncementController } from "../controllers/official-announcement.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateMarketplaceRepository } from "../repositories/affiliate-marketplace.repository";
import { OfficialAnnouncementRepository } from "../repositories/official-announcement.repository";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import { AffiliateMarketplaceService } from "../services/affiliate-marketplace.service";
import { OfficialAnnouncementService } from "../services/official-announcement.service";
import {
  announcementDraftCreateBodySchema,
  announcementDraftUpdateBodySchema,
  contentHistoryQuerySchema,
  contentPublicationValidationErrorMessage,
  disableBodySchema,
  publishBodySchema,
  rollbackBodySchema,
  scheduleBodySchema
} from "../validators/content-publication.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS } from "./affiliate-marketplace.routes";

const publicIdParamSchema = z.object({ publicId: z.string().uuid() }).strict();
const releaseParamSchema = z
  .object({ publicId: z.string().uuid(), releaseId: z.coerce.number().int().positive() })
  .strict();
const publicLocaleQuerySchema = z
  .object({
    locale: z.enum(["zh-CN", "zh-TW", "en", "ja", "ko"], {
      errorMap: () => ({ message: "error.content.locale_invalid" })
    })
  })
  .strict();

const validate = (schemas: Parameters<typeof validateRequest>[0]) =>
  validateRequest({
    ...schemas,
    validationErrorMessage: contentPublicationValidationErrorMessage
  });

export const createOfficialAnnouncementRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const marketplaceRepository =
    dependencies.affiliateMarketplaceRepository ?? new AffiliateMarketplaceRepository();
  const marketplacePolicy =
    dependencies.affiliateMarketplaceService ??
    new AffiliateMarketplaceService(
      marketplaceRepository,
      new AffiliateLinkTokenService({
        secret: config.AFFILIATE_LINK_SECRET,
        publicBaseUrl: config.AFFILIATE_PUBLIC_BASE_URL
      })
    );
  const service =
    dependencies.officialAnnouncementService ??
    new OfficialAnnouncementService(
      dependencies.officialAnnouncementRepository ?? new OfficialAnnouncementRepository(),
      marketplacePolicy
    );
  const controller = new OfficialAnnouncementController(service);
  const read = createAuthorizeMiddleware(CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementRead);
  const edit = createAuthorizeMiddleware(CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementEdit);
  const publish = createAuthorizeMiddleware(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementPublish
  );

  router.get(
    "/backoffice/affiliate/announcements",
    authenticate(),
    read,
    validate({ query: contentHistoryQuerySchema }),
    controller.list
  );
  router.post(
    "/backoffice/affiliate/announcements",
    authenticate(),
    edit,
    validate({ body: announcementDraftCreateBodySchema }),
    controller.createDraft
  );
  router.get(
    "/backoffice/affiliate/announcements/:publicId/history",
    authenticate(),
    read,
    validate({ params: publicIdParamSchema, query: contentHistoryQuerySchema }),
    controller.history
  );
  router.get(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId",
    authenticate(),
    read,
    validate({ params: releaseParamSchema }),
    controller.getRelease
  );
  router.patch(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId",
    authenticate(),
    edit,
    validate({ params: releaseParamSchema, body: announcementDraftUpdateBodySchema }),
    controller.updateLocale
  );
  router.get(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId/preview",
    authenticate(),
    read,
    validate({ params: releaseParamSchema }),
    controller.preview
  );
  router.post(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId/publish",
    authenticate(),
    publish,
    validate({ params: releaseParamSchema, body: publishBodySchema }),
    controller.publish
  );
  router.post(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId/schedule",
    authenticate(),
    publish,
    validate({ params: releaseParamSchema, body: scheduleBodySchema }),
    controller.schedule
  );
  router.post(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId/disable",
    authenticate(),
    publish,
    validate({ params: releaseParamSchema, body: disableBodySchema }),
    controller.disable
  );
  router.post(
    "/backoffice/affiliate/announcements/:publicId/releases/:releaseId/rollback",
    authenticate(),
    edit,
    validate({ params: releaseParamSchema, body: rollbackBodySchema }),
    controller.rollback
  );
  router.get(
    "/affiliate/announcements/:publicId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validate({ params: publicIdParamSchema, query: publicLocaleQuerySchema }),
    controller.getPublished
  );

  return router;
};
