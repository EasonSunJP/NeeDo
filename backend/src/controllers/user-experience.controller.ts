import type { NextFunction, Request, Response } from "express";
import type { UserExperienceService } from "../services/user-experience.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  userExperienceEntriesParamSchema,
  userExperienceEntriesQuerySchema
} from "../validators/user-experience.validator";

export type UserExperienceControllerService = Pick<
  UserExperienceService,
  "getSummary" | "listEntries"
>;

export class UserExperienceController {
  public constructor(private readonly service: UserExperienceControllerService) {}

  public getMySummary = this.handle(async (_request, response) => {
    const auth = getAuthenticatedAccess(response);
    response.status(200).json(successResponse(await this.service.getSummary(auth.userId)));
  });

  public listUserEntries = this.handle(async (request, response) => {
    const { userId } = userExperienceEntriesParamSchema.parse(request.params);
    const query = userExperienceEntriesQuerySchema.parse(request.query);
    response.status(200).json(successResponse(await this.service.listEntries(userId, query)));
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
