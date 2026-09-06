import type { NextFunction, Request, Response } from "express";
import type { AdministrativeRegionService } from "../services/administrative-region.service";
import { successResponse } from "../utils/api-response";
import { administrativeRegionListQuerySchema } from "../validators/administrative-region.validator";

export class AdministrativeRegionController {
  public constructor(private readonly service: AdministrativeRegionService) {}

  public list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const list = await this.service.listChildren(
        administrativeRegionListQuerySchema.parse(request.query)
      );
      response.status(200).json(successResponse({ list }));
    } catch (error) {
      next(error);
    }
  };
}
