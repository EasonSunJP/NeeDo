import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BackofficeController } from "../controllers/backoffice.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { BackofficeRepository } from "../repositories/backoffice.repository";
import { DashboardRepository } from "../repositories/dashboard.repository";
import { MerchantShopContextRepository } from "../repositories/merchant-shop-context.repository";
import { AuditLogService } from "../services/audit-log.service";
import { BackofficeService } from "../services/backoffice.service";
import { CustomerAvatarFileStorage } from "../services/customer-avatar.storage";
import {
  backofficeCustomerMembershipGrantBodySchema,
  backofficeCustomerUpdateBodySchema,
  backofficeDashboardQuerySchema,
  backofficeDashboardMetricParamSchema,
  backofficeEntityIdParamSchema,
  backofficeListQuerySchema,
  backofficeNdpSummaryQuerySchema,
  backofficeTimelineQuerySchema,
  backofficeServiceCreateBodySchema,
  backofficeServiceUpdateBodySchema,
  backofficeShopCreateBodySchema,
  backofficeShopIdParamSchema,
  backofficeShopUpdateBodySchema,
  backofficeTechnicianApproveBodySchema,
  backofficeTechnicianUpdateBodySchema,
  merchantShopUpdateBodySchema,
  merchantDashboardQuerySchema,
  merchantAdminListQuerySchema,
  manageableMerchantShopsQuerySchema,
  technicianRankingQuerySchema
} from "../validators/backoffice.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BACKOFFICE_ROUTE_PERMISSIONS = {
  dashboard: "backoffice:dashboard:read",
  dashboardDetail: "backoffice:dashboard-detail:read",
  orders: "backoffice:orders:list",
  schedule: "backoffice:schedule:list",
  finance: "backoffice:finance:list",
  financeExport: "backoffice:finance:export",
  technicians: "backoffice:technicians:list",
  techniciansWrite: "backoffice:technicians:write",
  shops: "backoffice:shops:list",
  shopsWrite: "backoffice:shops:write",
  customers: "backoffice:customers:list",
  customersWrite: "backoffice:customers:write",
  services: "backoffice:services:list",
  servicesWrite: "backoffice:services:write",
  merchantDashboard: "merchant-admin:dashboard:read",
  merchantOrders: "merchant-admin:orders:list",
  merchantSchedule: "merchant-admin:schedule:list",
  merchantFinance: "merchant-admin:finance:list",
  merchantFinanceExport: "merchant-admin:finance:export",
  merchantTechnicians: "merchant-admin:technicians:list",
  merchantTechniciansWrite: "merchant-admin:technicians:write",
  merchantCustomers: "merchant-admin:customers:list",
  merchantServices: "merchant-admin:services:list",
  merchantServicesWrite: "merchant-admin:services:write",
  merchantShop: "merchant-admin:shop:read",
  merchantShopWrite: "merchant-admin:shop:write"
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
    auditLogService,
    dependencies.merchantShopContextRepository ?? new MerchantShopContextRepository(),
    undefined,
    dependencies.customerAvatarStorage ??
      new CustomerAvatarFileStorage(
        config.CUSTOMER_AVATAR_STORAGE_DIR,
        config.CUSTOMER_AVATAR_PUBLIC_BASE_URL
      ),
    new DashboardRepository()
  );
  const controller = new BackofficeController(service);

  router.get(
    "/backoffice/dashboard",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.dashboard),
    validateRequest({ query: backofficeDashboardQuerySchema }),
    controller.platformDashboard
  );
  router.get(
    "/backoffice/dashboard/overview",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.dashboard),
    validateRequest({ query: backofficeDashboardQuerySchema }),
    controller.dashboardOverview
  );
  router.get(
    "/backoffice/dashboard/metrics/:metricKey",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.dashboardDetail),
    validateRequest({
      params: backofficeDashboardMetricParamSchema,
      query: backofficeDashboardQuerySchema
    }),
    controller.dashboardMetricDetail
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
    "/backoffice/finance/ndp-summary",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.finance),
    validateRequest({ query: backofficeNdpSummaryQuerySchema }),
    controller.platformNdpSummary
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
    "/backoffice/technician-rankings/export",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
    validateRequest({ query: technicianRankingQuerySchema }),
    controller.platformTechnicianRankingsExport
  );
  router.get(
    "/backoffice/technician-rankings",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
    validateRequest({ query: technicianRankingQuerySchema }),
    controller.platformTechnicianRankings
  );
  router.get(
    "/backoffice/shops",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shops),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformShops
  );
  router.post(
    "/backoffice/shops",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shopsWrite),
    validateRequest({ body: backofficeShopCreateBodySchema }),
    controller.createPlatformShop
  );
  router.patch(
    "/backoffice/shops/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shopsWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeShopUpdateBodySchema
    }),
    controller.updatePlatformShop
  );
  router.post(
    "/backoffice/shops/:id/approve",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shopsWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.approvePlatformShop
  );
  router.delete(
    "/backoffice/shops/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.shopsWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deletePlatformShop
  );
  router.get(
    "/backoffice/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.platformTechnician
  );
  router.patch(
    "/backoffice/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.techniciansWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeTechnicianUpdateBodySchema
    }),
    controller.updatePlatformTechnician
  );
  router.post(
    "/backoffice/technicians/:id/approve",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.techniciansWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeTechnicianApproveBodySchema
    }),
    controller.approvePlatformTechnician
  );
  router.delete(
    "/backoffice/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.techniciansWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deletePlatformTechnician
  );
  router.get(
    "/backoffice/customers",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customers),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformCustomers
  );
  router.get(
    "/backoffice/customers/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customers),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.platformCustomer
  );
  router.get(
    "/backoffice/customers/:id/timeline",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customers),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      query: backofficeTimelineQuerySchema
    }),
    controller.platformCustomerTimeline
  );
  router.patch(
    "/backoffice/customers/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customersWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeCustomerUpdateBodySchema
    }),
    controller.updatePlatformCustomer
  );
  router.put(
    "/backoffice/customers/:id/membership",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customersWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeCustomerMembershipGrantBodySchema
    }),
    controller.assignPlatformCustomerMembership
  );
  router.delete(
    "/backoffice/customers/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.customersWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deletePlatformCustomer
  );
  router.get(
    "/backoffice/services",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.services),
    validateRequest({ query: backofficeListQuerySchema }),
    controller.platformServices
  );
  router.post(
    "/backoffice/shops/:shopId/services",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.servicesWrite),
    validateRequest({
      params: backofficeShopIdParamSchema,
      body: backofficeServiceCreateBodySchema
    }),
    controller.createPlatformService
  );
  router.patch(
    "/backoffice/services/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.servicesWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeServiceUpdateBodySchema
    }),
    controller.updatePlatformService
  );
  router.delete(
    "/backoffice/services/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.servicesWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deletePlatformService
  );

  router.get(
    "/merchant-admin/dashboard",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantDashboard),
    validateRequest({ query: merchantDashboardQuerySchema }),
    controller.merchantDashboard
  );
  router.get(
    "/merchant-admin/manageable-shops",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantDashboard),
    validateRequest({ query: manageableMerchantShopsQuerySchema }),
    controller.manageableMerchantShops
  );
  router.get(
    "/merchant-admin/orders",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantOrders),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantOrders
  );
  router.get(
    "/merchant-admin/schedule",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantSchedule),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantSchedule
  );
  router.get(
    "/merchant-admin/finance/settlements",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantFinance),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantFinance
  );
  router.get(
    "/merchant-admin/finance/settlements/export",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantFinanceExport),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantFinanceExport
  );
  router.get(
    "/merchant-admin/technicians",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechnicians),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantTechnicians
  );
  router.get(
    "/merchant-admin/shop",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantShop),
    controller.merchantShop
  );
  router.patch(
    "/merchant-admin/shop",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantShopWrite),
    validateRequest({ body: merchantShopUpdateBodySchema }),
    controller.updateMerchantShop
  );
  router.get(
    "/merchant-admin/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechnicians),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.merchantTechnician
  );
  router.patch(
    "/merchant-admin/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechniciansWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeTechnicianUpdateBodySchema
    }),
    controller.updateMerchantTechnician
  );
  router.post(
    "/merchant-admin/technicians/:id/approve",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechniciansWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.approveMerchantTechnician
  );
  router.delete(
    "/merchant-admin/technicians/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantTechniciansWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deleteMerchantTechnician
  );
  router.get(
    "/merchant-admin/customers",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantCustomers),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantCustomers
  );
  router.get(
    "/merchant-admin/customers/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantCustomers),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.merchantCustomer
  );
  router.get(
    "/merchant-admin/customers/:id/timeline",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantCustomers),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      query: backofficeTimelineQuerySchema
    }),
    controller.merchantCustomerTimeline
  );
  router.get(
    "/merchant-admin/services",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantServices),
    validateRequest({ query: merchantAdminListQuerySchema }),
    controller.merchantServices
  );
  router.post(
    "/merchant-admin/services",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantServicesWrite),
    validateRequest({ body: backofficeServiceCreateBodySchema }),
    controller.createMerchantService
  );
  router.patch(
    "/merchant-admin/services/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantServicesWrite),
    validateRequest({
      params: backofficeEntityIdParamSchema,
      body: backofficeServiceUpdateBodySchema
    }),
    controller.updateMerchantService
  );
  router.delete(
    "/merchant-admin/services/:id",
    authenticate(),
    authorize(BACKOFFICE_ROUTE_PERMISSIONS.merchantServicesWrite),
    validateRequest({ params: backofficeEntityIdParamSchema }),
    controller.deleteMerchantService
  );

  return router;
};
