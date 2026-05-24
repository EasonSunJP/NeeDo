import type { NextFunction, Request, Response } from "express";
import type { UserService } from "../services/user.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  userAssignRolesBodySchema,
  userCreateBodySchema,
  userIdParamSchema,
  userListQuerySchema,
  userUpdateBodySchema
} from "../validators/user.validator";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.userService.list(this.getListQuery(request))));
    } catch (error) {
      next(error);
    }
  };

  public get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.userService.get(this.getId(request))));
    } catch (error) {
      next(error);
    }
  };

  public create = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.userService.create(
              userCreateBodySchema.parse(request.body),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public update = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.userService.update(
              this.getId(request),
              userUpdateBodySchema.parse(request.body),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public enable = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.userService.setActive(
              this.getId(request),
              true,
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public disable = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.userService.setActive(
              this.getId(request),
              false,
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public softDelete = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.userService.softDelete(
              this.getId(request),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public assignRoles = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = userAssignRolesBodySchema.parse(request.body);
      response
        .status(200)
        .json(
          successResponse(
            await this.userService.assignRoles(
              this.getId(request),
              body.roles,
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private getId(request: Request): number {
    return userIdParamSchema.parse(request.params).id;
  }

  private getListQuery(request: Request) {
    return userListQuerySchema.parse(request.query);
  }
}
