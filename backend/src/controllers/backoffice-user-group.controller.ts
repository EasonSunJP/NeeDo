import type { NextFunction, Request, Response } from "express";
import type { BackofficeUserGroupService } from "../services/backoffice-user-group.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  backofficeUserGroupArchiveBodySchema,
  backofficeUserGroupCreateBodySchema,
  backofficeUserGroupListQuerySchema,
  backofficeUserGroupMembersBodySchema,
  backofficeUserGroupParamSchema,
  backofficeUserGroupUpdateBodySchema
} from "../validators/backoffice-user-group.validator";

export type BackofficeUserGroupControllerService = Pick<
  BackofficeUserGroupService,
  | "listGroups"
  | "listGroupMembers"
  | "createCustomGroup"
  | "updateCustomGroup"
  | "archiveCustomGroup"
  | "setCustomGroupMembers"
>;

export class BackofficeUserGroupController {
  public constructor(private readonly service: BackofficeUserGroupControllerService) {}

  public listGroups = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.listGroups(
          getAuthenticatedAccess(response),
          backofficeUserGroupListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public listMembers = this.handle(async (request, response) => {
    const { groupCode } = backofficeUserGroupParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.listGroupMembers(
          getAuthenticatedAccess(response),
          groupCode,
          backofficeUserGroupListQuerySchema.parse(request.query)
        )
      )
    );
  });

  public createGroup = this.handle(async (request, response) => {
    response.status(201).json(
      successResponse(
        await this.service.createCustomGroup(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          backofficeUserGroupCreateBodySchema.parse(request.body)
        )
      )
    );
  });

  public updateGroup = this.handle(async (request, response) => {
    const { groupCode } = backofficeUserGroupParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.updateCustomGroup(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          groupCode,
          backofficeUserGroupUpdateBodySchema.parse(request.body)
        )
      )
    );
  });

  public archiveGroup = this.handle(async (request, response) => {
    const { groupCode } = backofficeUserGroupParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.archiveCustomGroup(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          groupCode,
          backofficeUserGroupArchiveBodySchema.parse(request.body)
        )
      )
    );
  });

  public setMembers = this.handle(async (request, response) => {
    const { groupCode } = backofficeUserGroupParamSchema.parse(request.params);
    response.status(200).json(
      successResponse(
        await this.service.setCustomGroupMembers(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          groupCode,
          backofficeUserGroupMembersBodySchema.parse(request.body)
        )
      )
    );
  });

  private handle(
    handler: (request: Request, response: Response) => Promise<void>
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
