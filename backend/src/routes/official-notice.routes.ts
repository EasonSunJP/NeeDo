import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OFFICIAL_NOTICE_PERMISSIONS } from "../constants/permissions.constants";
import { OfficialNoticeController } from "../controllers/official-notice.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { OfficialNoticeRepository } from "../repositories/official-notice.repository";
import { OfficialNoticeService } from "../services/official-notice.service";
import {
  officialNoticeCreateBodySchema,
  officialNoticeLifecycleBodySchema,
  officialNoticeListQuerySchema,
  officialNoticePublicIdParamSchema,
  officialNoticeReadQuerySchema
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
