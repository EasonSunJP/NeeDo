import express, { Router } from "express";
import { z } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import {
  MERCHANT_NOTICE_PERMISSIONS,
  OFFICIAL_NOTICE_PERMISSIONS
} from "../constants/permissions.constants";
import { OfficialNoticeController } from "../controllers/official-notice.controller";
import { OfficialNoticeMediaController } from "../controllers/official-notice-media.controller";
import { createContentImageBodyErrorHandler } from "../middlewares/content-image-upload.middleware";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { OfficialNoticeRepository } from "../repositories/official-notice.repository";
import { ContentMediaRepository } from "../repositories/content-media.repository";
import { OfficialNoticeService } from "../services/official-notice.service";
import {
  OFFICIAL_NOTICE_MEDIA_MIME_TYPES,
  OfficialNoticeMediaFileStorage
} from "../services/official-notice-media.storage";
import { OfficialNoticeMediaService } from "../services/official-notice-media.service";
import {
  officialNoticeCreateBodySchema,
  officialNoticeDraftCreateBodySchema,
  officialNoticeDraftUpdateBodySchema,
  officialNoticeLifecycleBodySchema,
  officialNoticeListQuerySchema,
  officialNoticePublicIdParamSchema,
  officialNoticePlanBodySchema,
  officialNoticeReadQuerySchema,
  merchantNoticeCreateBodySchema,
  merchantNoticeDraftCreateBodySchema,
  merchantNoticeDraftUpdateBodySchema
} from "../validators/official-notice.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const validationErrorMessage = (error: {
  issues: Array<{ message: string }>;
}): string | undefined => error.issues.find((issue) => issue.message.startsWith("error."))?.message;

const validate = (schemas: Parameters<typeof validateRequest>[0]) =>
  validateRequest({
    ...schemas,
    validationErrorMessage
  });

const noticeMediaUploadQuerySchema = z.object({
  file_name: z.string().trim().min(1, "error.official_notice.media_invalid").max(255),
  caption: z.string().trim().min(1, "error.official_notice.media_invalid").max(255).optional()
}).strict("error.official_notice.media_invalid");

const createNoticeMediaController = (config: AppConfig, dependencies: AppDependencies) => {
  if (dependencies.officialNoticeMediaService) {
    return new OfficialNoticeMediaController(dependencies.officialNoticeMediaService);
  }
  const repository = dependencies.officialNoticeMediaRepository ?? new ContentMediaRepository();
  const storage = dependencies.officialNoticeMediaStorage ??
    new OfficialNoticeMediaFileStorage(config.CONTENT_MEDIA_STORAGE_DIR);
  return new OfficialNoticeMediaController(new OfficialNoticeMediaService(repository, storage));
};

const noticeMediaBodyParser = express.raw({
  type: [...OFFICIAL_NOTICE_MEDIA_MIME_TYPES],
  limit: "50mb"
});

const noticeMediaBodyErrorHandler = createContentImageBodyErrorHandler({
  invalid: "error.official_notice.media_invalid",
  tooLarge: "error.official_notice.media_too_large"
});

const createNoticeController = (config: AppConfig, dependencies: AppDependencies) => {
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.officialNoticeService ??
    new OfficialNoticeService(
      dependencies.officialNoticeRepository ??
        new OfficialNoticeRepository(
          undefined,
          config.OFFICIAL_NOTICE_MAX_DELIVERY_ATTEMPTS,
          dependencies.realtimeEventGateway
        )
    );
  const controller = new OfficialNoticeController(service);
  return { controller, authenticate };
};

export const createOfficialNoticeManagementRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const { controller, authenticate } = createNoticeController(config, dependencies);
  const mediaController = createNoticeMediaController(config, dependencies);

  router.post(
    "/backoffice/official-notices/media",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.create),
    validate({ query: noticeMediaUploadQuerySchema }),
    noticeMediaBodyParser,
    noticeMediaBodyErrorHandler,
    mediaController.uploadPlatform
  );

  router.get(
    "/backoffice/official-notices",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.read),
    validate({ query: officialNoticeListQuerySchema }),
    controller.listBackoffice
  );
  router.post(
    "/backoffice/official-notices",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.create),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.send),
    validate({ body: officialNoticeCreateBodySchema }),
    controller.createAndPlan
  );
  router.post(
    "/backoffice/official-notices/drafts",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.create),
    validate({ body: officialNoticeDraftCreateBodySchema }),
    controller.createDraft
  );
  router.get(
    "/backoffice/official-notices/:publicId",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.read),
    validate({ params: officialNoticePublicIdParamSchema }),
    controller.getDraft
  );
  router.put(
    "/backoffice/official-notices/:publicId/draft",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.create),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticeDraftUpdateBodySchema }),
    controller.updateDraft
  );
  router.post(
    "/backoffice/official-notices/:publicId/plan",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.create),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.send),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticePlanBodySchema }),
    controller.planDraft
  );
  router.post(
    "/backoffice/official-notices/:publicId/cancel",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.review),
    validate({
      params: officialNoticePublicIdParamSchema,
      body: officialNoticeLifecycleBodySchema
    }),
    controller.cancel
  );
  router.post(
    "/backoffice/official-notices/:publicId/archive",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.review),
    validate({
      params: officialNoticePublicIdParamSchema,
      body: officialNoticeLifecycleBodySchema
    }),
    controller.archive
  );
  router.post(
    "/backoffice/official-notices/:publicId/retry-failures",
    authenticate(),
    createAuthorizeMiddleware(OFFICIAL_NOTICE_PERMISSIONS.send),
    validate({
      params: officialNoticePublicIdParamSchema,
      body: officialNoticeLifecycleBodySchema
    }),
    controller.retryFailures
  );
  return router;
};

export const createOfficialNoticeRecipientRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const { controller, authenticate } = createNoticeController(config, dependencies);
  router.get(
    "/official-notices",
    authenticate(),
    validate({ query: officialNoticeReadQuerySchema }),
    controller.listMine
  );
  router.post(
    "/official-notices/:publicId/read",
    authenticate(),
    validate({ params: officialNoticePublicIdParamSchema }),
    controller.markRead
  );

  return router;
};

export const createMerchantOfficialNoticeManagementRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const { controller, authenticate } = createNoticeController(config, dependencies);
  const mediaController = createNoticeMediaController(config, dependencies);

  router.post(
    "/merchant-admin/official-notices/media",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.create),
    validate({ query: noticeMediaUploadQuerySchema }),
    noticeMediaBodyParser,
    noticeMediaBodyErrorHandler,
    mediaController.uploadMerchant
  );

  router.get(
    "/merchant-admin/official-notices",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.read),
    validate({ query: officialNoticeListQuerySchema }),
    controller.listMerchant
  );
  router.post(
    "/merchant-admin/official-notices",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.create),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.send),
    validate({ body: merchantNoticeCreateBodySchema }),
    controller.createAndPlanMerchant
  );
  router.post(
    "/merchant-admin/official-notices/drafts",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.create),
    validate({ body: merchantNoticeDraftCreateBodySchema }),
    controller.createDraftMerchant
  );
  router.get(
    "/merchant-admin/official-notices/:publicId",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.read),
    validate({ params: officialNoticePublicIdParamSchema }),
    controller.getMerchantDraft
  );
  router.put(
    "/merchant-admin/official-notices/:publicId/draft",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.create),
    validate({ params: officialNoticePublicIdParamSchema, body: merchantNoticeDraftUpdateBodySchema }),
    controller.updateDraftMerchant
  );
  router.post(
    "/merchant-admin/official-notices/:publicId/plan",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.create),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.send),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticePlanBodySchema }),
    controller.planDraftMerchant
  );
  router.post(
    "/merchant-admin/official-notices/:publicId/cancel",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.review),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticeLifecycleBodySchema }),
    controller.cancelMerchant
  );
  router.post(
    "/merchant-admin/official-notices/:publicId/archive",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.review),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticeLifecycleBodySchema }),
    controller.archiveMerchant
  );
  router.post(
    "/merchant-admin/official-notices/:publicId/retry-failures",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_NOTICE_PERMISSIONS.send),
    validate({ params: officialNoticePublicIdParamSchema, body: officialNoticeLifecycleBodySchema }),
    controller.retryMerchantFailures
  );
  return router;
};
