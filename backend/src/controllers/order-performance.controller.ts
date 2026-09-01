import type { NextFunction, Request, Response } from "express";
import type { OrderPerformanceService } from "../services/order-performance.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  orderPerformanceCommandBodySchema,
  orderPerformanceOrderParamSchema
} from "../validators/order-performance.validator";

export class OrderPerformanceController {
  public constructor(private readonly service: OrderPerformanceService) {}

  public classifyTechnicianUncompleted = this.command("classifyTechnicianUncompleted");
  public applySpecialExclusion = this.command("applySpecialExclusion");
  public revokeSpecialExclusion = this.command("revokeSpecialExclusion");

  private command(
    method: "classifyTechnicianUncompleted" | "applySpecialExclusion" | "revokeSpecialExclusion"
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        const { id } = orderPerformanceOrderParamSchema.parse(request.params);
        const body = orderPerformanceCommandBodySchema.parse(request.body);
        response
          .status(200)
          .json(
            successResponse(
              await this.service[method](
                getAuthenticatedAccess(response),
                getRequestContext(request),
                id,
                body
              )
            )
          );
      } catch (error) {
        next(error);
      }
    };
  }
}
