import type { NextFunction, Request, Response } from "express";
import type { CustomerAddressService } from "../services/customer-address.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  customerAddressCreateBodySchema,
  customerAddressListQuerySchema,
  customerAddressPublicIdParamSchema,
  customerAddressUpdateBodySchema
} from "../validators/customer-address.validator";

export class CustomerAddressController {
  public constructor(private readonly service: CustomerAddressService) {}

  public listMine = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.listMine(
        getAuthenticatedAccess(response),
        customerAddressListQuerySchema.parse(request.query)
      )));
    } catch (error) {
      next(error);
    }
  };

  public createMine = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.service.createMine(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        customerAddressCreateBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };

  public updateMine = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicId } = customerAddressPublicIdParamSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.updateMine(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        publicId,
        customerAddressUpdateBodySchema.parse(request.body)
      )));
    } catch (error) {
      next(error);
    }
  };

  public deleteMine = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicId } = customerAddressPublicIdParamSchema.parse(request.params);
      await this.service.deleteMine(getAuthenticatedAccess(response), getRequestContext(request), publicId);
      response.status(200).json(successResponse({ deleted: true }));
    } catch (error) {
      next(error);
    }
  };
}
