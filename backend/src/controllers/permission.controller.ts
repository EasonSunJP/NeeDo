import type { NextFunction, Request, Response } from "express";
import type { PermissionService } from "../services/permission.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  permissionCreateBodySchema,
  permissionIdParamSchema,
  permissionListQuerySchema,
  permissionUpdateBodySchema
} from "../validators/permission.validator";

export class PermissionController {
  public constructor(private readonly permissionService: PermissionService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.permissionService.list(this.getListQuery(request))));
    } catch (error) {
      next(error);
    }
  };

  public tree = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.permissionService.tree()));
    } catch (error) {
      next(error);
    }
  };

  public get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.permissionService.get(this.getId(request))));
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
            await this.permissionService.create(
              permissionCreateBodySchema.parse(request.body),
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
            await this.permissionService.update(
              this.getId(request),
              permissionUpdateBodySchema.parse(request.body),
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
            await this.permissionService.softDelete(
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

  private getId(request: Request): number {
    return permissionIdParamSchema.parse(request.params).id;
  }

  private getListQuery(request: Request) {
    return permissionListQuerySchema.parse(request.query);
  }
}
