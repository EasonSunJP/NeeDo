import type { Request, Response, NextFunction } from "express";
import type { OperationsMemberService } from "../services/operations-member.service";
import { operationsMemberCreateSchema } from "../validators/operations-member.validator";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { successResponse } from "../utils/api-response";

export class OperationsMemberController {
  public constructor(private readonly service: OperationsMemberService) {}
  public create = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.create(operationsMemberCreateSchema.parse(request.body), getAuthenticatedAccess(response), getRequestContext(request));
      response.status(201).json(successResponse(result));
    } catch (error) { next(error); }
  };
}
