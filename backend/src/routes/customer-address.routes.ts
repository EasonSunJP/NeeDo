import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CustomerAddressController } from "../controllers/customer-address.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AdministrativeRegionRepository } from "../repositories/administrative-region.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { CustomerAddressRepository } from "../repositories/customer-address.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CustomerAddressService } from "../services/customer-address.service";
import {
  customerAddressCreateBodySchema,
  customerAddressListQuerySchema,
  customerAddressPublicIdParamSchema,
  customerAddressUpdateBodySchema
} from "../validators/customer-address.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { CUSTOMER_PROFILE_ROUTE_PERMISSIONS } from "./customer-profile.routes";

export const createCustomerAddressRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new CustomerAddressService(
    dependencies.customerAddressRepository ?? new CustomerAddressRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.personalIdentityScopeService,
    dependencies.administrativeRegionRepository ?? new AdministrativeRegionRepository()
  );
  const controller = new CustomerAddressController(service);

  router.get(
    "/customer-profile/me/addresses",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: customerAddressListQuerySchema }),
    controller.listMine
  );
  router.post(
    "/customer-profile/me/addresses",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: customerAddressCreateBodySchema }),
    controller.createMine
  );
  router.patch(
    "/customer-profile/me/addresses/:publicId",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ params: customerAddressPublicIdParamSchema, body: customerAddressUpdateBodySchema }),
    controller.updateMine
  );
  router.delete(
    "/customer-profile/me/addresses/:publicId",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ params: customerAddressPublicIdParamSchema }),
    controller.deleteMine
  );

  return router;
};
