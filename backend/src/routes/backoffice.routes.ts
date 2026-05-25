import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BackofficeController } from "../controllers/backoffice.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { BackofficeRepository } from "../repositories/backoffice.repository";
import { AuditLogService } from "../services/audit-log.service";
import { BackofficeService } from "../services/backoffice.service";
import { backofficeListQuerySchema } from "../validators/backoffice.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BACKOFFICE_ROUTE_PERMISSIONS = {
  dashboard: "backoffice:dashboard:read",
  orders: "backoffice:orders:list",
  schedule: "backoffice:schedule:list",
  finance: "backoffice:finance:list",
  financeExport: "backoffice:finance:export",
  technicians: "backoffice:technicians:list",
  shops: "backoffice:shops:list",
  merchantDashboard: "merchant-admin:dashboard:read",
  merchantOrders: "merchant-admin:orders:list",
  merchantSchedule: "merchant-admin:schedule:list",
  merchantFinance: "merchant-admin:finance:list",
  merchantFinanceExport: "merchant-admin:finance:export",
  merchantTechnicians: "merchant-admin:technicians:list",
  merchantShop: "merchant-admin:shop:read"
} as const;

export const createBackofficeRoutes = (
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
  const service = new BackofficeService(
    dependencies.backofficeRepository ?? new BackofficeRepository(),
    auditLogService
  );
  const controller = new BackofficeController(service);

  router.get(
    "/backoffice/dashboard",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.dashboard),
    controller.platformDashboard
  );
  router.get(
    "/backoffice/orders",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.orders),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformOrders
  );
  router.get(
    "/backoffice/schedule",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.schedule),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformSchedule
  );
  router.get(
    "/backoffice/finance/settlements",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.finance),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformFinance
  );
  router.get(
    "/backoffice/finance/settlements/export",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.financeExport),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformFinanceExport
  );
  router.get(
    "/backoffice/technicians",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformTechnicians
  );
  router.get(
    "/backoffice/shops",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shops),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformShops
  );

  router.get(
    "/merchant-admin/dashboard",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantDashboard),
    controller.merchantDashboard
  );
  router.get(
    "/merchant-admin/orders",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantOrders),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.merchantOrders
  );
  router.get(
    "/merchant-admin/schedule",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantSchedule),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.merchantSchedule
  );
  router.get(
    "/merchant-admin/finance/settlements",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantFinance),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.merchantFinance
  );
  router.get(
    "/merchant-admin/finance/settlements/export",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantFinanceExport),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.merchantFinanceExport
  );
  router.get(
    "/merchant-admin/technicians",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechnicians),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.merchantTechnicians
  );
  router.get(
    "/merchant-admin/shop",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantShop),
    controller.merchantShop
  );

  return router;
};
