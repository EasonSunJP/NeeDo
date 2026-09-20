import type { NextFunction, Request, Response } from "express";
import type { UserFavoritesService } from "../services/user-favorites.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  userFavoriteItemParamsSchema,
  userFavoriteReactionBodySchema,
  userFavoritesListQuerySchema
} from "../validators/user-favorites.validator";

export class UserFavoritesController {
  public constructor(private readonly service: UserFavoritesService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const query = userFavoritesListQuerySchema.parse(request.query);
      response
        .status(200)
        .json(
          successResponse(await this.service.listFavorites(getAuthenticatedAccess(response), query))
        );
    } catch (error) {
      next(error);
    }
  };

  public pin = this.setPin(true);
  public unpin = this.setPin(false);

  public setReaction = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const params = userFavoriteItemParamsSchema.parse(request.params);
      const body = userFavoriteReactionBodySchema.parse(request.body);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.setReaction(
              getAuthenticatedAccess(response),
              params.type,
              params.itemKey,
              body.reaction,
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public clearReaction = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const params = userFavoriteItemParamsSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.setReaction(
              getAuthenticatedAccess(response),
              params.type,
              params.itemKey,
              null,
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private setPin(active: boolean) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const params = userFavoriteItemParamsSchema.parse(request.params);
        response
          .status(200)
          .json(
            successResponse(
              await this.service.setPin(
                getAuthenticatedAccess(response),
                params.type,
                params.itemKey,
                active,
                getRequestContext(request)
              )
            )
          );
      } catch (error) {
        next(error);
      }
    };
  }
}
