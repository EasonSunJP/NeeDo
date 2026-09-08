import type { NextFunction, Request, Response } from "express";
import type { TechnicianServiceBookingContextService } from "../services/technician-service-booking-context.service";
import { successResponse } from "../utils/api-response";
import { technicianServiceBookingContextParamSchema } from "../validators/technician-service-booking-context.validator";

export class TechnicianServiceBookingContextController {
  public constructor(private readonly service: TechnicianServiceBookingContextService) {}

  public getContext = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { id } = technicianServiceBookingContextParamSchema.parse(request.params);
      response.status(200).json(successResponse(await this.service.getContext(id)));
    } catch (error) {
      next(error);
    }
  };
}
