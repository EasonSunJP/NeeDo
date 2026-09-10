import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { NdpExchangeRateController } from "../controllers/ndp-exchange-rate.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { NdpExchangeRateRepository } from "../repositories/ndp-exchange-rate.repository";
import { AuditLogService } from "../services/audit-log.service";
import { NdpExchangeRateService } from "../services/ndp-exchange-rate.service";
import {
  ndpExchangeRateListQuerySchema,
  ndpExchangeRatePublishBodySchema
} from "../validators/ndp-exchange-rate.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS = {
  read: "backoffice:ndp-exchange-rate:read",
  write: "backoffice:ndp-exchange-rate:write"
} as const;

export const createNdpExchangeRateRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.ndpExchangeRateService ??
    new NdpExchangeRateService(
      dependencies.ndpExchangeRateRepository ?? new NdpExchangeRateRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new NdpExchangeRateController(service);

  router.get(
    "/backoffice/ndp-exchange-rates",
    authenticate(),
    createAuthorizeMiddleware(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: ndpExchangeRateListQuerySchema }),
    controller.list
  );
  router.post(
    "/backoffice/ndp-exchange-rates",
    authenticate(),
    createAuthorizeMiddleware(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: ndpExchangeRatePublishBodySchema }),
    controller.publish
  );

  return router;
};
