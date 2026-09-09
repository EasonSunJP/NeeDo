import type { NextFunction, Request, Response } from "express";
import type { CoreReadService } from "../services/core-read.service";
import { successResponse } from "../utils/api-response";
import {
  categoryListQuerySchema,
  coreReadCoordinateQuerySchema,
  coreReadIdParamSchema,
  coreReadServiceIdParamSchema,
  coreReadShopIdParamSchema,
  coreReadTechnicianIdParamSchema,
  coreSearchQuerySchema,
  homeRecommendationsQuerySchema,
  serviceListQuerySchema,
  serviceReviewListQuerySchema
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
        .json(
          successResponse(await this.coreReadService.getServiceDetail(this.getServiceId(request)))
        );
    } catch (error) {
      next(error);
    }
  };

  public listServiceReviews = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.listServiceReviews(
              this.getServiceId(request),
              serviceReviewListQuerySchema.parse(request.query)
            )
          )
        );
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
            await this.coreReadService.search(
              coreSearchQuerySchema.parse(request.query),
              this.getSearchSessionId(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getSearchSessionId(request: Request): string | undefined {
    const value = request.get("X-Search-Session")?.trim();
    return value && /^[A-Za-z0-9_-]{8,128}$/u.test(value) ? value : undefined;
  }

  public getShopDetail = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.coreReadService.getShopDetail(this.getShopId(request))));
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
      const coordinates = coreReadCoordinateQuerySchema.parse(request.query);
      response
        .status(200)
        .json(
          successResponse(
            await this.coreReadService.getTechnicianDetail(
              this.getTechnicianId(request),
              coordinates
            )
          )
        );
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

  private getServiceId(request: Request): number | string {
    return coreReadServiceIdParamSchema.parse(request.params).id;
  }

  private getShopId(request: Request): number | string {
    return coreReadShopIdParamSchema.parse(request.params).id;
  }

  private getTechnicianId(request: Request): number | string {
    return coreReadTechnicianIdParamSchema.parse(request.params).id;
  }
}
