import type { NextFunction, Request, Response } from "express";
import type { PricingModeService } from "../services/pricing-mode.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  bookingNavigationQuerySchema,
  myTechnicianServiceIdParamSchema,
  pricingModeBodySchema,
  publicTechnicianServicesParamSchema,
  shopIdParamSchema,
  technicianServiceBodySchema,
  technicianServiceIdParamSchema,
  technicianServiceListQuerySchema,
  technicianServiceOrderBodySchema
} from "../validators/pricing-mode.validator";

export class PricingModeController {
  public constructor(private readonly service: PricingModeService) {}

  public getShopPricingMode = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getShopPricingMode(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateShopPricingMode = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopIdParamSchema.parse(request.params);
      const { pricingMode, technicianPricingRatePercent } = pricingModeBodySchema.parse(
        request.body
      );
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateShopPricingMode(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              pricingMode,
              technicianPricingRatePercent
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listTechnicianServices = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listTechnicianServices(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              technicianServiceListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopIdParamSchema.parse(request.params);
      response
        .status(201)
        .json(
          successResponse(
            await this.service.createTechnicianService(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              technicianServiceBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listMyTechnicianServices = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listMyTechnicianServices(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              technicianServiceListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public createMyTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.service.createMyTechnicianService(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        technicianServiceBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };

  public updateMyTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { serviceId } = myTechnicianServiceIdParamSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.updateMyTechnicianService(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        serviceId,
        technicianServiceBodySchema.partial().parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };

  public deleteMyTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { serviceId } = myTechnicianServiceIdParamSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.deleteMyTechnicianService(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        serviceId
      )));
    } catch (error) {
      next(error);
    }
  };

  public reorderMyTechnicianServices = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.reorderMyTechnicianServices(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              technicianServiceOrderBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public updateTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, serviceId } = technicianServiceIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.updateTechnicianService(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              serviceId,
              technicianServiceBodySchema.partial().parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public deleteTechnicianService = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, serviceId } = technicianServiceIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.deleteTechnicianService(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              serviceId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getBookingNavigation = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId } = shopIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getBookingNavigation(
              shopId,
              bookingNavigationQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listPublicTechnicianServices = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, technicianId } = publicTechnicianServicesParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listPublicTechnicianServices(
              shopId,
              technicianId,
              bookingNavigationQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
