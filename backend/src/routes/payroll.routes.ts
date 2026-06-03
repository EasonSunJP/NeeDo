import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PayrollController } from "../controllers/payroll.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PayrollRepository } from "../repositories/payroll.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PayrollService } from "../services/payroll.service";
import {
  payrollAdjustmentBodySchema,
  payrollAdjustmentIdParamSchema,
  payrollAdjustmentListQuerySchema,
  payrollAdjustmentRejectBodySchema,
  payRunCreateBodySchema,
  payRunIdParamSchema,
  payrollListQuerySchema,
  payoutRecordConfirmParamSchema,
  payoutRecordBodySchema,
  payslipDisputeBodySchema,
  payslipDisputeResolveBodySchema,
  payslipIdParamSchema
} from "../validators/payroll.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PAYROLL_ROUTE_PERMISSIONS = {
  merchantRead: "merchant-admin:payroll:read",
  merchantWrite: "merchant-admin:payroll:write",
  merchantPublish: "merchant-admin:payroll:publish",
  merchantPayoutWrite: "merchant-admin:payroll:payout-record:write",
  merchantDisputeResolve: "merchant-admin:payroll-dispute:resolve",
  merchantAdjustmentRead: "merchant-admin:payroll-adjustment:read",
  merchantAdjustmentWrite: "merchant-admin:payroll-adjustment:write",
  merchantAdjustmentApprove: "merchant-admin:payroll-adjustment:approve",
  technicianRead: "technician:payslip:read",
  technicianConfirm: "technician:payslip:confirm",
  technicianDispute: "technician:payslip:dispute",
  technicianPayoutConfirm: "technician:payout-record:confirm",
  backofficeRead: "backoffice:payroll:read"
} as const;

export const createPayrollRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new PayrollService(
    dependencies.payrollRepository ?? new PayrollRepository(),
    auditLogService
  );
  const controller = new PayrollController(service);

  router.get(
    "/merchant-admin/pay-runs",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.listMerchantPayRuns
  );
  router.post(
    "/merchant-admin/pay-runs",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ body: payRunCreateBodySchema }),
    controller.createMerchantPayRun
  );
  router.get(
    "/merchant-admin/pay-runs/export",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.exportMerchantPayRuns
  );
  router.get(
    "/merchant-admin/pay-runs/:id",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ params: payRunIdParamSchema }),
    controller.getMerchantPayRun
  );
  router.post(
    "/merchant-admin/pay-runs/:id/recalculate",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ params: payRunIdParamSchema }),
    controller.recalculateMerchantPayRun
  );
  router.post(
    "/merchant-admin/pay-runs/:id/publish",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantPublish),
    validateRequest({ params: payRunIdParamSchema }),
    controller.publishMerchantPayRun
  );
  router.post(
    "/merchant-admin/pay-runs/:id/approve",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantPublish),
    validateRequest({ params: payRunIdParamSchema }),
    controller.approveMerchantPayRun
  );
  router.post(
    "/merchant-admin/pay-runs/:id/lock",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantPublish),
    validateRequest({ params: payRunIdParamSchema }),
    controller.lockMerchantPayRun
  );
  router.post(
    "/merchant-admin/payslips/:id/payout-records",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantPayoutWrite),
    validateRequest({ params: payslipIdParamSchema, body: payoutRecordBodySchema }),
    controller.recordMerchantPayout
  );
  router.post(
    "/merchant-admin/payslips/:id/resolve-dispute",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantDisputeResolve),
    validateRequest({
      params: payslipIdParamSchema,
      body: payslipDisputeResolveBodySchema
    }),
    controller.resolveMerchantPayslipDispute
  );
  router.get(
    "/merchant-admin/payroll-adjustments",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantAdjustmentRead),
    validateRequest({ query: payrollAdjustmentListQuerySchema }),
    controller.listMerchantPayrollAdjustments
  );
  router.post(
    "/merchant-admin/payroll-adjustments",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantAdjustmentWrite),
    validateRequest({ body: payrollAdjustmentBodySchema }),
    controller.createMerchantPayrollAdjustment
  );
  router.post(
    "/merchant-admin/payroll-adjustments/:id/submit",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantAdjustmentWrite),
    validateRequest({ params: payrollAdjustmentIdParamSchema }),
    controller.submitMerchantPayrollAdjustment
  );
  router.post(
    "/merchant-admin/payroll-adjustments/:id/approve",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantAdjustmentApprove),
    validateRequest({ params: payrollAdjustmentIdParamSchema }),
    controller.approveMerchantPayrollAdjustment
  );
  router.post(
    "/merchant-admin/payroll-adjustments/:id/reject",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.merchantAdjustmentApprove),
    validateRequest({
      params: payrollAdjustmentIdParamSchema,
      body: payrollAdjustmentRejectBodySchema
    }),
    controller.rejectMerchantPayrollAdjustment
  );
  router.get(
    "/technician/payslips",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.listTechnicianPayslips
  );
  router.get(
    "/technician/payslips/export",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.exportTechnicianPayslips
  );
  router.get(
    "/technician/payslips/:id",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianRead),
    validateRequest({ params: payslipIdParamSchema }),
    controller.getTechnicianPayslip
  );
  router.post(
    "/technician/payslips/:id/confirm",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianConfirm),
    validateRequest({ params: payslipIdParamSchema }),
    controller.confirmTechnicianPayslip
  );
  router.post(
    "/technician/payslips/:id/dispute",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianDispute),
    validateRequest({ params: payslipIdParamSchema, body: payslipDisputeBodySchema }),
    controller.disputeTechnicianPayslip
  );
  router.post(
    "/technician/payslips/:payslipId/payout-records/:payoutRecordId/confirm",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.technicianPayoutConfirm),
    validateRequest({ params: payoutRecordConfirmParamSchema }),
    controller.confirmTechnicianPayoutRecord
  );
  router.get(
    "/backoffice/pay-runs",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.backofficeRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.listBackofficePayRuns
  );
  router.get(
    "/backoffice/pay-runs/export",
    authenticate(),
    authorize(PAYROLL_ROUTE_PERMISSIONS.backofficeRead),
    validateRequest({ query: payrollListQuerySchema }),
    controller.exportBackofficePayRuns
  );

  return router;
};
