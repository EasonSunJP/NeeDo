import type { NextFunction, Request, Response } from "express";
import type { CoreReadService } from "../services/core-read.service";
import { successResponse } from "../utils/api-response";
import {
  categoryListQuerySchema,
  coreReadIdParamSchema,
  coreSearchQuerySchema,
  homeRecommendationsQuerySchema,
  serviceListQuerySchema
} from "../validators/core-read.validator";

export class CoreReadController {
  public constructor(private readonly coreReadService: CoreReadService) {}

  public listCategories = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.listCategories(categoryListQuerySchema.parse(request.query))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public listServices = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.listServices(serviceListQuerySchema.parse(request.query))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getServiceDetail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.coreReadService.getServiceDetail(this.getId(request))));
    } catch (error) {
      next(error);
    }
  };

  public getHomeRecommendations = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.getHomeRecommendations(
              homeRecommendationsQuerySchema.parse(request.query)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public search = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.search(coreSearchQuerySchema.parse(request.query))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getShopDetail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.coreReadService.getShopDetail(this.getId(request))));
    } catch (error) {
      next(error);
    }
  };

  public getTechnicianDetail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.coreReadService.getTechnicianDetail(this.getId(request))));
    } catch (error) {
      next(error);
    }
  };

  public getCustomerProfile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.coreReadService.getCustomerProfile(this.getId(request))));
    } catch (error) {
      next(error);
    }
  };

  private getId(request: Request): number {
    return coreReadIdParamSchema.parse(request.params).id;
  }
}
