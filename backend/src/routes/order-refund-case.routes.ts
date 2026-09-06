import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OrderRefundCaseController } from "../controllers/order-refund-case.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { OrderRefundCaseRepository } from "../repositories/order-refund-case.repository";
import { AuditLogService } from "../services/audit-log.service";
import { OrderRefundCaseService } from "../services/order-refund-case.service";
import {
  orderRefundCaseApproveBodySchema,
  orderRefundCaseComplaintBodySchema,
  orderRefundCaseDisputeParamSchema,
  orderRefundCaseDisputeResolutionBodySchema,
  orderRefundCaseEvidenceBodySchema,
  orderRefundCaseIdParamSchema,
  orderRefundCaseListQuerySchema,
  orderRefundCaseOrderIdParamSchema,
  orderRefundCaseReceiptConfirmationBodySchema,
  orderRefundCaseRejectBodySchema,
  orderRefundCaseRequestBodySchema
} from "../validators/order-refund-case.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ORDER_REFUND_CASE_ROUTE_PERMISSIONS = {
  userWrite: "user:order-refund:write",
  merchantWrite: "merchant-admin:order-refund:write",
  disputeRead: "backoffice:order-refund-dispute:read",
  disputeResolve: "backoffice:order-refund-dispute:resolve"
} as const;

export const createOrderRefundCaseRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new OrderRefundCaseService(
    dependencies.orderRefundCaseRepository ?? new OrderRefundCaseRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new OrderRefundCaseController(service);
  const orderCaseParams = {
    orderId: orderRefundCaseOrderIdParamSchema.shape.orderId,
    caseId: orderRefundCaseIdParamSchema.shape.caseId
  };

  router.post(
    "/orders/:orderId/refund-requests",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.userWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema, body: orderRefundCaseRequestBodySchema }),
    controller.request
  );
  router.post(
    "/orders/:orderId/refund-requests/:caseId/confirm-receipt",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.userWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseReceiptConfirmationBodySchema }),
    controller.confirmReceipt
  );
  router.post(
    "/orders/:orderId/refund-requests/:caseId/complaints",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.userWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseComplaintBodySchema }),
    controller.customerComplaint
  );

  router.post(
    "/merchant-admin/orders/:orderId/refund-requests/:caseId/approve",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseApproveBodySchema }),
    controller.merchantApprove
  );
  router.post(
    "/merchant-admin/orders/:orderId/refund-requests/:caseId/reject",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseRejectBodySchema }),
    controller.merchantReject
  );
  router.post(
    "/merchant-admin/orders/:orderId/refund-requests/:caseId/refund-evidence",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseEvidenceBodySchema }),
    controller.submitEvidence
  );
  router.post(
    "/merchant-admin/orders/:orderId/refund-requests/:caseId/complaints",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.merchantWrite),
    validateRequest({ params: orderRefundCaseOrderIdParamSchema.extend({ caseId: orderCaseParams.caseId }).strict(), body: orderRefundCaseComplaintBodySchema }),
    controller.merchantComplaint
  );

  router.get(
    "/backoffice/refund-disputes",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.disputeRead),
    validateRequest({ query: orderRefundCaseListQuerySchema }),
    controller.listDisputes
  );
  router.post(
    "/backoffice/refund-disputes/:disputeId/resolve",
    authenticate(),
    createAuthorizeMiddleware(ORDER_REFUND_CASE_ROUTE_PERMISSIONS.disputeResolve),
    validateRequest({ params: orderRefundCaseDisputeParamSchema, body: orderRefundCaseDisputeResolutionBodySchema }),
    controller.resolveDispute
  );

  return router;
};
