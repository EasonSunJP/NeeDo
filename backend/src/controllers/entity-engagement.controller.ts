import type { NextFunction, Request, Response } from "express";
import type { EntityEngagementService } from "../services/entity-engagement.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  entityFavoriteListQuerySchema,
  entityFavoriteStatusesBodySchema,
  entityFavoriteTargetParamSchema
} from "../validators/entity-engagement.validator";

export class EntityEngagementController {
  public constructor(private readonly service: EntityEngagementService) {}

  public addFavorite = this.setFavorite(true);
  public removeFavorite = this.setFavorite(false);

  public listFavorites = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = entityFavoriteListQuerySchema.parse(request.query);
      response
        .status(200)
        .json(
          successResponse(await this.service.listFavorites(getAuthenticatedAccess(response), query))
        );
    } catch (error) {
      next(error);
    }
  };

  public getFavoriteStatuses = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = entityFavoriteStatusesBodySchema.parse(request.body);
      response.status(200).json(
        successResponse({
          list: await this.service.getFavoriteStatuses(
            getAuthenticatedAccess(response),
            body.targets
          )
        })
      );
    } catch (error) {
      next(error);
    }
  };

  private setFavorite(
    isFavorited: boolean
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        const target = entityFavoriteTargetParamSchema.parse(request.params);
        response
          .status(200)
          .json(
            successResponse(
              await this.service.setFavorite(
                getAuthenticatedAccess(response),
                target.targetType,
                target.publicId,
                isFavorited
              )
            )
          );
      } catch (error) {
        next(error);
      }
    };
  }
}
