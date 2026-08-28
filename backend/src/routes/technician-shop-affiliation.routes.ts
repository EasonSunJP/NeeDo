import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TechnicianShopAffiliationController } from "../controllers/technician-shop-affiliation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PublicIdentifierRepository } from "../repositories/public-identifier.repository";
import { TechnicianShopAffiliationRepository } from "../repositories/technician-shop-affiliation.repository";
import { AuditLogService } from "../services/audit-log.service";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { TechnicianShopAffiliationService } from "../services/technician-shop-affiliation.service";
import {
  merchantEmployeeAffiliationBodySchema,
  merchantEmployeeListQuerySchema,
  merchantEmployeeParamSchema,
  merchantEmployeeProfileBodySchema
} from "../validators/technician-shop-affiliation.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const EMPLOYEE_AFFILIATION_PERMISSIONS = {
  read: "merchant-admin:employee-affiliation:read",
  write: "merchant-admin:employee-affiliation:write"
} as const;

export const createTechnicianShopAffiliationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const identifierResolver = new IdentifierAllocator(
    dependencies.publicIdentifierRepository ?? new PublicIdentifierRepository()
  );
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new TechnicianShopAffiliationService(
    dependencies.technicianShopAffiliationRepository ?? new TechnicianShopAffiliationRepository(),
    identifierResolver,
    auditLogService
  );
  const controller = new TechnicianShopAffiliationController(service);

  router.get(
    "/merchant-admin/employees",
    authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.read),
    validateRequest({ query: merchantEmployeeListQuerySchema }),
    controller.list
  );
  router.get(
    "/merchant-admin/employees/:needoId",
    authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.read),
    validateRequest({ params: merchantEmployeeParamSchema }),
    controller.detail
  );
  router.put(
    "/merchant-admin/employees/:needoId/affiliation",
    authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.write),
    validateRequest({
      params: merchantEmployeeParamSchema,
      body: merchantEmployeeAffiliationBodySchema
    }),
    controller.upsertAffiliation
  );
  router.patch(
    "/merchant-admin/employees/:needoId/profile",
    authenticate(),
    createAuthorizeMiddleware(EMPLOYEE_AFFILIATION_PERMISSIONS.write),
    validateRequest({
      params: merchantEmployeeParamSchema,
      body: merchantEmployeeProfileBodySchema
    }),
    controller.updateProfile
  );

  return router;
};
