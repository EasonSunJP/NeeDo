import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PayrollSchedulePolicyController } from "../controllers/payroll-schedule-policy.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PayrollSchedulePolicyRepository } from "../repositories/payroll-schedule-policy.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PayrollSchedulePolicyService } from "../services/payroll-schedule-policy.service";
import {
  employeePayrollSchedulePolicyBodySchema,
  employeePayrollSchedulePolicyParamSchema,
  payrollSchedulePolicyQuerySchema,
  shopPayrollSchedulePolicyBodySchema
} from "../validators/payroll-schedule-policy.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PAYROLL_SCHEDULE_POLICY_ROUTE_PERMISSIONS = {
  read: "merchant-admin:payroll:read",
  write: "merchant-admin:payroll:write"
} as const;

export const createPayrollSchedulePolicyRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new PayrollSchedulePolicyService(
    dependencies.payrollSchedulePolicyRepository ?? new PayrollSchedulePolicyRepository(),
    auditLogService
  );
  const controller = new PayrollSchedulePolicyController(service);

  router.get(
    "/merchant-admin/payroll-schedule-policy",
    authenticate(),
    authorize(PAYROLL_SCHEDULE_POLICY_ROUTE_PERMISSIONS.read),
    validateRequest({ query: payrollSchedulePolicyQuerySchema }),
    controller.getShopPolicy
  );
  router.put(
    "/merchant-admin/payroll-schedule-policy",
    authenticate(),
    authorize(PAYROLL_SCHEDULE_POLICY_ROUTE_PERMISSIONS.write),
    validateRequest({ body: shopPayrollSchedulePolicyBodySchema }),
    controller.updateShopPolicy
  );
  router.get(
    "/merchant-admin/employees/:needoId/payroll-schedule-policy",
    authenticate(),
    authorize(PAYROLL_SCHEDULE_POLICY_ROUTE_PERMISSIONS.read),
    validateRequest({
      params: employeePayrollSchedulePolicyParamSchema,
      query: payrollSchedulePolicyQuerySchema
    }),
    controller.getEmployeePolicy
  );
  router.put(
    "/merchant-admin/employees/:needoId/payroll-schedule-policy",
    authenticate(),
    authorize(PAYROLL_SCHEDULE_POLICY_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: employeePayrollSchedulePolicyParamSchema,
      body: employeePayrollSchedulePolicyBodySchema
    }),
    controller.updateEmployeePolicy
  );

  return router;
};
