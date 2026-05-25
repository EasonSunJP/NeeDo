import type { NextFunction, Request, Response } from "express";
import type { BackofficeService } from "../services/backoffice.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { backofficeListQuerySchema } from "../validators/backoffice.validator";

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
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

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
              getRequestContext(request)
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

  public merchantOrders = this.createListHandler((service, request, response) =>
    service.listMerchantOrders(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
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
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public platformFinance = this.createListHandler((service, request, response) =>
    service.listPlatformFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public merchantFinance = this.createListHandler((service, request, response) =>
    service.listMerchantFinance(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
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
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public platformTechnicians = this.createListHandler((service, request, response) =>
    service.listPlatformTechnicians(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
    )
  );

  public merchantTechnicians = this.createListHandler((service, request, response) =>
    service.listMerchantTechnicians(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      backofficeListQuerySchema.parse(request.query)
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

  private createListHandler<TPayload>(
    handler: (
      service: BackofficeService,
      request: Request,
      response: Response
    ) => Promise<TPayload>
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
