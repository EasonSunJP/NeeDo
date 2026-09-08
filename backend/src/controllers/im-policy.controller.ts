import type { NextFunction, Request, Response } from "express";
import type { ImPolicyService } from "../services/im-policy.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { imRetentionSettingsBodySchema } from "../validators/im-policy.validator";

export class ImPolicyController {
  public constructor(
    private readonly service: Pick<ImPolicyService, "get" | "update">
  ) {}

  public get = this.handle(async (_request, response) => {
    response.status(200).json(
      successResponse(await this.service.get(getAuthenticatedAccess(response)))
    );
  });

  public update = this.handle(async (request, response) => {
    response.status(200).json(
      successResponse(
        await this.service.update(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          imRetentionSettingsBodySchema.parse(request.body)
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
