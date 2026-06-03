import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OrderFinanceController } from "../controllers/order-finance.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { OrderFinanceRepository } from "../repositories/order-finance.repository";
import { AuditLogService } from "../services/audit-log.service";
import { OrderFinanceService } from "../services/order-finance.service";
import {
  orderFinanceBookingOrderIdParamSchema,
  serviceIncomeReportBodySchema
} from "../validators/order-finance.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ORDER_FINANCE_ROUTE_PERMISSIONS = {
  merchantRead: "merchant-admin:finance-order:read",
  merchantIncomeReport: "merchant-admin:finance-income-report:write",
  backofficeRead: "backoffice:finance-order:read"
} as const;

export const createOrderFinanceRoutes = (
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
  const service = new OrderFinanceService(
    dependencies.orderFinanceRepository ?? new OrderFinanceRepository(),
    auditLogService
  );
  const controller = new OrderFinanceController(service);

  router.get(
    "/merchant-admin/finance/orders/:bookingOrderId",
    authenticate(),
    authorize(ORDER_FINANCE_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ params: orderFinanceBookingOrderIdParamSchema }),
    controller.getMerchantOrderFinance
  );
  router.put(
    "/merchant-admin/finance/orders/:bookingOrderId/service-income-report",
    authenticate(),
    authorize(ORDER_FINANCE_ROUTE_PERMISSIONS.merchantIncomeReport),
    validateRequest({
      params: orderFinanceBookingOrderIdParamSchema,
      body: serviceIncomeReportBodySchema
    }),
    controller.reportMerchantServiceIncome
  );
  router.get(
    "/backoffice/finance/orders/:bookingOrderId",
    authenticate(),
    authorize(ORDER_FINANCE_ROUTE_PERMISSIONS.backofficeRead),
    validateRequest({ params: orderFinanceBookingOrderIdParamSchema }),
    controller.getBackofficeOrderFinance
  );

  return router;
};
