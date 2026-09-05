import type { NextFunction, Request, Response } from "express";
import type { BackofficeService } from "../services/backoffice.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  backofficeCustomerMembershipGrantBodySchema,
  backofficeCustomerUpdateBodySchema,
  backofficeDashboardQuerySchema,
  backofficeDashboardMetricParamSchema,
  backofficeEntityIdParamSchema,
  backofficeListQuerySchema,
  backofficeManagedUserListQuerySchema,
  backofficeManagedUserParamSchema,
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

export class BackofficeController {
  public constructor(private readonly service: BackofficeService) {}

  public platformDashboard = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getPlatformDashboard(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              backofficeDashboardQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public dashboardOverview = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getDashboardOverview(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              backofficeDashboardQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public dashboardMetricDetail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { metricKey } = backofficeDashboardMetricParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getDashboardMetricDetail(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              metricKey,
              backofficeDashboardQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public managedUsers = this.createListHandler((service, request, response) =>
    service.listManagedUsers(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeManagedUserListQuerySchema.parse(request.query)
    )
  );

  public managedUser = this.createListHandler((service, request, response) =>
    service.getManagedUser(
      backofficeManagedUserParamSchema.parse(request.params).userId,
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  public merchantManagedUsers = this.createListHandler((service, request, response) =>
    service.listMerchantManagedUsers(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeManagedUserListQuerySchema.parse(request.query)
    )
  );

  public merchantManagedUser = this.createListHandler((service, request, response) =>
    service.getMerchantManagedUser(
      backofficeManagedUserParamSchema.parse(request.params).userId,
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  public merchantDashboard = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getMerchantDashboard(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              merchantDashboardQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public manageableMerchantShops = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listManageableMerchantShops(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              manageableMerchantShopsQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public platformOrders = this.createListHandler((service, request, response) =>
    service.listPlatformOrders(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public platformOrder = this.createListHandler((service, request, response) =>
    service.getPlatformOrder(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  public merchantOrders = this.createListHandler((service, request, response) =>
    service.listMerchantOrders(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );

  public platformSchedule = this.createListHandler((service, request, response) =>
    service.listPlatformSchedule(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public merchantSchedule = this.createListHandler((service, request, response) =>
    service.listMerchantSchedule(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );

  public platformFinance = this.createListHandler((service, request, response) =>
    service.listPlatformFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public platformNdpSummary = this.createListHandler((service, request, response) =>
    service.getPlatformNdpSummary(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeNdpSummaryQuerySchema.parse(request.query)
    )
  );

  public merchantFinance = this.createListHandler((service, request, response) =>
    service.listMerchantFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );

  public platformFinanceExport = this.createListHandler((service, request, response) =>
    service.exportPlatformFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public merchantFinanceExport = this.createListHandler((service, request, response) =>
    service.exportMerchantFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );

  public platformTechnicians = this.createListHandler((service, request, response) =>
    service.listPlatformTechnicians(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public platformTechnicianRankings = this.createListHandler((service, request, response) =>
    service.listPlatformTechnicianRankings(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      technicianRankingQuerySchema.parse(request.query)
    )
  );

  public platformTechnicianRankingsExport = this.createListHandler((service, request, response) =>
    service.exportPlatformTechnicianRankings(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      technicianRankingQuerySchema.parse(request.query)
    )
  );

  public merchantTechnicians = this.createListHandler((service, request, response) =>
    service.listMerchantTechnicians(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );

  public platformTechnician = this.createListHandler((service, request, response) =>
    service.getPlatformTechnician(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  public merchantTechnician = this.createListHandler((service, request, response) =>
    service.getMerchantTechnician(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  public platformShops = this.createListHandler((service, request, response) =>
    service.listPlatformShops(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public merchantShop = this.createListHandler((service, request, response) =>
    service.getMerchantShop(getAuthenticatedAccess(response), getRequestContext(request))
  );

  public createPlatformShop = this.createMutationHandler(201, (service, request, response) =>
    service.createPlatformShop(
      backofficeShopCreateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updatePlatformShop = this.createMutationHandler(200, (service, request, response) =>
    service.updatePlatformShop(
      this.getId(request),
      backofficeShopUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updateMerchantShop = this.createMutationHandler(200, (service, request, response) =>
    service.updateMerchantShop(
      merchantShopUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public approvePlatformShop = this.createMutationHandler(200, (service, request, response) =>
    service.approvePlatformShop(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public deletePlatformShop = this.createMutationHandler(200, (service, request, response) =>
    service.deletePlatformShop(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updatePlatformTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.updatePlatformTechnician(
      this.getId(request),
      backofficeTechnicianUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updateMerchantTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.updateMerchantTechnician(
      this.getId(request),
      backofficeTechnicianUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public approvePlatformTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.approvePlatformTechnician(
      this.getId(request),
      backofficeTechnicianApproveBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public approveMerchantTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.approveMerchantTechnician(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public deletePlatformTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.deletePlatformTechnician(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public deleteMerchantTechnician = this.createMutationHandler(200, (service, request, response) =>
    service.deleteMerchantTechnician(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public platformCustomers = this.createListHandler((service, request, response) =>
    service.listPlatformCustomers(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );
  public merchantCustomers = this.createListHandler((service, request, response) =>
    service.listMerchantCustomers(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );
  public platformCustomer = this.createListHandler((service, request, response) =>
    service.getPlatformCustomer(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public merchantCustomer = this.createListHandler((service, request, response) =>
    service.getMerchantCustomer(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public platformCustomerTimeline = this.createListHandler((service, request, response) =>
    service.getPlatformCustomerTimeline(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeTimelineQuerySchema.parse(request.query)
    )
  );
  public merchantCustomerTimeline = this.createListHandler((service, request, response) =>
    service.getMerchantCustomerTimeline(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeTimelineQuerySchema.parse(request.query)
    )
  );
  public updatePlatformCustomer = this.createMutationHandler(200, (service, request, response) =>
    service.updatePlatformCustomer(
      this.getId(request),
      backofficeCustomerUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public assignPlatformCustomerMembership = this.createMutationHandler(
    200,
    (service, request, response) =>
      service.assignPlatformCustomerMembership(
        this.getId(request),
        backofficeCustomerMembershipGrantBodySchema.parse(request.body),
        getAuthenticatedAccess(response),
        getRequestContext(request)
      )
  );
  public deletePlatformCustomer = this.createMutationHandler(200, (service, request, response) =>
    service.deletePlatformCustomer(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public platformServices = this.createListHandler((service, request, response) =>
    service.listPlatformServices(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );
  public merchantServices = this.createListHandler((service, request, response) =>
    service.listMerchantServices(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      merchantAdminListQuerySchema.parse(request.query)
    )
  );
  public createPlatformService = this.createMutationHandler(201, (service, request, response) =>
    service.createPlatformService(
      this.getShopId(request),
      backofficeServiceCreateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public createMerchantService = this.createMutationHandler(201, (service, request, response) =>
    service.createMerchantService(
      backofficeServiceCreateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updatePlatformService = this.createMutationHandler(200, (service, request, response) =>
    service.updatePlatformService(
      this.getId(request),
      backofficeServiceUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public updateMerchantService = this.createMutationHandler(200, (service, request, response) =>
    service.updateMerchantService(
      this.getId(request),
      backofficeServiceUpdateBodySchema.parse(request.body),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public deletePlatformService = this.createMutationHandler(200, (service, request, response) =>
    service.deletePlatformService(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );
  public deleteMerchantService = this.createMutationHandler(200, (service, request, response) =>
    service.deleteMerchantService(
      this.getId(request),
      getAuthenticatedAccess(response),
      getRequestContext(request)
    )
  );

  private getId(request: Request): number {
    return backofficeEntityIdParamSchema.parse(request.params).id;
  }

  private getShopId(request: Request): number {
    return backofficeShopIdParamSchema.parse(request.params).shopId;
  }

  private createMutationHandler<TPayload>(
    statusCode: number,
    handler: (service: BackofficeService, request: Request, response: Response) => Promise<TPayload>
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        response
          .status(statusCode)
          .json(successResponse(await handler(this.service, request, response)));
      } catch (error) {
        next(error);
      }
    };
  }

  private createListHandler<TPayload>(
    handler: (service: BackofficeService, request: Request, response: Response) => Promise<TPayload>
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        response.status(200).json(successResponse(await handler(this.service, request, response)));
      } catch (error) {
        next(error);
      }
    };
  }
}
