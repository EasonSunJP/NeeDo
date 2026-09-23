import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopEmployeeDirectoryController } from "../controllers/shop-employee-directory.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopEmployeeDirectoryRepository } from "../repositories/shop-employee-directory.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopEmployeeDirectoryService } from "../services/shop-employee-directory.service";
import { shopEmployeeCreateBodySchema, shopEmployeeDirectoryQuerySchema, shopEmployeeShopParamSchema } from "../validators/shop-employee-directory.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { EMPLOYEE_AFFILIATION_PERMISSIONS } from "./technician-shop-affiliation.routes";

export const createShopEmployeeDirectoryRoutes = (
  config: AppConfig,
  dependencies: AppDependencies,
  portal: "merchant-admin" | "backoffice" = "merchant-admin"
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new ShopEmployeeDirectoryService(
    dependencies.shopEmployeeDirectoryRepository ?? new ShopEmployeeDirectoryRepository(),
    auditLogService
  );
  const controller = new ShopEmployeeDirectoryController(service);

  if (portal === "backoffice") {
    router.get("/backoffice/shops/:shopId/employees", authenticate(),
      createAuthorizeMiddleware("backoffice:shops:list"),
      validateRequest({ params: shopEmployeeShopParamSchema, query: shopEmployeeDirectoryQuerySchema }),
      controller.listForShop);
    router.post("/backoffice/shops/:shopId/employees", authenticate(),
      createAuthorizeMiddleware("backoffice:shops:write"),
      validateRequest({ params: shopEmployeeShopParamSchema, body: shopEmployeeCreateBodySchema }),
      controller.createForShop);
    return router;
  }

  router.get(
    "/merchant-admin/employee-directory",
    authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.read),
    validateRequest({ query: shopEmployeeDirectoryQuerySchema }),
    controller.list
  );

  router.post("/merchant-admin/employee-directory", authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.write),
    validateRequest({ body: shopEmployeeCreateBodySchema }), controller.create);

  return router;
};
