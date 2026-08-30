import type { NextFunction, Request, Response } from "express";
import type { TestAccountService } from "../services/test-account.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { userIdParamSchema } from "../validators/user.validator";
import { testAccountUpdateBodySchema } from "../validators/test-account.validator";

export class TestAccountController {
  public constructor(private readonly service: TestAccountService) {}

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
            await this.service.updateClassification(
              userIdParamSchema.parse(request.params).id,
              testAccountUpdateBodySchema.parse(request.body),
              getAuthenticatedAccess(response),
              getRequestContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
}
