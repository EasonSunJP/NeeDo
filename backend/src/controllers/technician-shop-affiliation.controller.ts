import type { NextFunction, Request, Response } from "express";
import type { TechnicianShopAffiliationService } from "../services/technician-shop-affiliation.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  merchantEmployeeAffiliationBodySchema,
  merchantEmployeeListQuerySchema,
  merchantEmployeeParamSchema
} from "../validators/technician-shop-affiliation.validator";

export class TechnicianShopAffiliationController {
  public constructor(private readonly service: TechnicianShopAffiliationService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listCurrentShopEmployees(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              merchantEmployeeListQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public detail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { needoId } = merchantEmployeeParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.getCurrentShopEmployee(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              needoId
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public upsertAffiliation = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { needoId } = merchantEmployeeParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.upsertCurrentShopAffiliation(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              needoId,
              merchantEmployeeAffiliationBodySchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
