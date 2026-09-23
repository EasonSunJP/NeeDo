import type { NextFunction, Request, Response } from "express";
import type { ShopEmployeeDirectoryService } from "../services/shop-employee-directory.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { shopEmployeeCreateBodySchema, shopEmployeeDirectoryQuerySchema, shopEmployeeShopParamSchema } from "../validators/shop-employee-directory.validator";

export class ShopEmployeeDirectoryController {
  public constructor(private readonly service: ShopEmployeeDirectoryService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.service.listCurrentShopEmployees(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopEmployeeDirectoryQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listForShop = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.service.listShopEmployees(
        getAuthenticatedAccess(response), getRequestContext(request),
        shopEmployeeShopParamSchema.parse(request.params).shopId,
        shopEmployeeDirectoryQuerySchema.parse(request.query)
      )));
    } catch (error) { next(error); }
  };

  public create = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.service.createEmployee(
        getAuthenticatedAccess(response), getRequestContext(request), shopEmployeeCreateBodySchema.parse(request.body)
      )));
    } catch (error) { next(error); }
  };

  public createForShop = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(successResponse(await this.service.createEmployee(
        getAuthenticatedAccess(response), getRequestContext(request), shopEmployeeCreateBodySchema.parse(request.body),
        shopEmployeeShopParamSchema.parse(request.params).shopId
      )));
    } catch (error) { next(error); }
  };
}
