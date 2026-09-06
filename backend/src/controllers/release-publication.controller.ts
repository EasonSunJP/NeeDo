import type { NextFunction, Request, Response } from "express";
import type { ReleasePublicationService } from "../services/release-publication.service";
import { releaseTimelineQuerySchema } from "../domain/release-publication";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
export class ReleasePublicationController {
  constructor(private readonly service: ReleasePublicationService) {}
  list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json(
        successResponse(
          await this.service.list(
            getAuthenticatedAccess(response),
            releaseTimelineQuerySchema.parse(request.query)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
