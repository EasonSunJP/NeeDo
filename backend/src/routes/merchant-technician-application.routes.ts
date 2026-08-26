import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MerchantTechnicianApplicationController } from "../controllers/merchant-technician-application.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  merchantTechnicianApplicationContactBodySchema,
  merchantTechnicianApplicationIdParamSchema,
  merchantTechnicianApplicationListQuerySchema,
  merchantTechnicianApplicationRejectBodySchema,
  merchantTechnicianApplicationReviewBodySchema
} from "../validators/merchant-technician-application.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import {
  createTechnicianApplicationReviewServiceForRoutes,
  createTechnicianResumeExportServiceForRoutes
} from "./merchant-technician-application-service.factory";

export const MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS = {
  read: "merchant:technician-application:read",
  review: "merchant:technician-application:review",
  contact: "merchant:technician-application:contact",
  export: "merchant:technician-application:export"
} as const;

export const createMerchantTechnicianApplicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const controller = new MerchantTechnicianApplicationController(
    createTechnicianApplicationReviewServiceForRoutes(dependencies),
    createTechnicianResumeExportServiceForRoutes(config, dependencies)
  );

  router.get(
    "/merchant/technician-applications",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.read),
    validateRequest({ query: merchantTechnicianApplicationListQuerySchema }),
    controller.list
  );
  router.get(
    "/merchant/technician-applications/:id",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.read),
    validateRequest({ params: merchantTechnicianApplicationIdParamSchema }),
    controller.get
  );
  router.post(
    "/merchant/technician-applications/:id/approve",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.review),
    validateRequest({
      params: merchantTechnicianApplicationIdParamSchema,
      body: merchantTechnicianApplicationReviewBodySchema
    }),
    controller.approve
  );
  router.post(
    "/merchant/technician-applications/:id/reject",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.review),
    validateRequest({
      params: merchantTechnicianApplicationIdParamSchema,
      body: merchantTechnicianApplicationRejectBodySchema
    }),
    controller.reject
  );
  router.post(
    "/merchant/technician-applications/:id/contact",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.contact),
    validateRequest({
      params: merchantTechnicianApplicationIdParamSchema,
      body: merchantTechnicianApplicationContactBodySchema
    }),
    controller.contact
  );
  router.get(
    "/merchant/technician-applications/:id/resume.xlsx",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_TECHNICIAN_APPLICATION_ROUTE_PERMISSIONS.export),
    validateRequest({ params: merchantTechnicianApplicationIdParamSchema }),
    controller.exportResume
  );

  return router;
};
