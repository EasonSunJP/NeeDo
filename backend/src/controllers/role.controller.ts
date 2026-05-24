import type { NextFunction, Request, Response } from "express";
import type { RoleService } from "../services/role.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  roleAssignPermissionsBodySchema,
  roleCreateBodySchema,
  roleIdParamSchema,
  roleListQuerySchema,
  roleUpdateBodySchema
} from "../validators/role.validator";

export class RoleController {
  public constructor(private readonly roleService: RoleService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.roleService.list(this.getListQuery(request))));
    } catch (error) {
      next(error);
    }
  };

  public get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.roleService.get(this.getId(request))));
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
            await this.roleService.create(
              roleCreateBodySchema.parse(request.body),
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
            await this.roleService.update(
              this.getId(request),
              roleUpdateBodySchema.parse(request.body),
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
            await this.roleService.softDelete(
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

  public assignPermissions = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = roleAssignPermissionsBodySchema.parse(request.body);
      response
        .status(200)
        .json(
          successResponse(
            await this.roleService.assignPermissions(
              this.getId(request),
              body.permissionIds,
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
    return roleIdParamSchema.parse(request.params).id;
  }

  private getListQuery(request: Request) {
    return roleListQuerySchema.parse(request.query);
  }
}
