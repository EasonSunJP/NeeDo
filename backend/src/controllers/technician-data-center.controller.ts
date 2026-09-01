import type { NextFunction, Request, Response } from "express";
import type { TechnicianDataCenterService } from "../services/technician-data-center.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { technicianDataCenterQuerySchema } from "../validators/technician-data-center.validator";

export class TechnicianDataCenterController {
  public constructor(private readonly service: TechnicianDataCenterService) {}

  public getMine = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = technicianDataCenterQuerySchema.parse(request.query);
      response.status(200).json(successResponse(
        await this.service.getMine(
          getAuthenticatedAccess(response),
          getRequestContext(request),
          query.period
        )
      ));
    } catch (error) {
      next(error);
    }
  };
}
