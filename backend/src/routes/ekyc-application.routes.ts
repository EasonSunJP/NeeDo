import { Router } from "express";
import type { AppConfig } from "../config/env";
import type { AppDependencies } from "../app";
import { EkycApplicationController } from "../controllers/ekyc-application.controller";
import { EkycApplicationRepository } from "../repositories/ekyc-application.repository";
import { EkycApplicationService } from "../services/ekyc-application.service";
import { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  approveEkycBodySchema,
  createEkycBodySchema,
  ekycIdSchema,
  ekycListSchema,
  ekycVersionSchema,
  rejectEkycBodySchema
} from "../validators/ekyc-application.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
export const EKYC_APPLICATION_ROUTE_PERMISSIONS = {
  own: "ekyc-application:own",
  read: "ops:ekyc-application:read",
  review: "ops:ekyc-application:review"
} as const;
export const createEkycApplicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies,
  operations = false
): Router => {
  const router = Router(),
    controller = new EkycApplicationController(
      dependencies.ekycApplicationService ??
        new EkycApplicationService(
          dependencies.ekycApplicationRepository ?? new EkycApplicationRepository(),
          new SensitiveFieldCipherService(config.SENSITIVE_DATA_ENCRYPTION_KEY)
        )
    );
  const auth = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const own = createAuthorizeMiddleware(EKYC_APPLICATION_ROUTE_PERMISSIONS.own),
    read = createAuthorizeMiddleware(EKYC_APPLICATION_ROUTE_PERMISSIONS.read),
    review = createAuthorizeMiddleware(EKYC_APPLICATION_ROUTE_PERMISSIONS.review);
  if (operations) {
    router.get(
      "/ops/ekyc-applications",
      auth(),
      read,
      validateRequest({ query: ekycListSchema }),
      controller.listOps
    );
    router.get(
      "/ops/ekyc-applications/:id",
      auth(),
      read,
      validateRequest({ params: ekycIdSchema }),
      controller.detailOps
    );
    router.post(
      "/ops/ekyc-applications/:id/approve",
      auth(),
      review,
      validateRequest({ params: ekycIdSchema, body: approveEkycBodySchema }),
      controller.approve
    );
    router.post(
      "/ops/ekyc-applications/:id/reject",
      auth(),
      review,
      validateRequest({ params: ekycIdSchema, body: rejectEkycBodySchema }),
      controller.reject
    );
  } else {
    router.get(
      "/ekyc-applications/mine",
      auth(),
      own,
      validateRequest({ query: ekycListSchema }),
      controller.listMine
    );
    router.get(
      "/ekyc-applications/:id",
      auth(),
      own,
      validateRequest({ params: ekycIdSchema }),
      controller.detailMine
    );
    router.post(
      "/ekyc-applications",
      auth(),
      own,
      validateRequest({ body: createEkycBodySchema }),
      controller.create
    );
    router.post(
      "/ekyc-applications/:id/withdraw",
      auth(),
      own,
      validateRequest({ params: ekycIdSchema, body: ekycVersionSchema }),
      controller.withdraw
    );
  }
  return router;
};
