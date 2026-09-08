import type { NextFunction, Request, Response } from "express";
import type { ReleasePublicationService } from "../services/release-publication.service";
import {
  editReleaseSchema,
  manualReleaseSchema,
  releaseIdSchema,
  releaseTimelineQuerySchema
} from "../domain/release-publication";
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
  createManual = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(201)
        .json(
          successResponse(
            await this.service.createManual(
              getAuthenticatedAccess(response),
              manualReleaseSchema.parse(request.body)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };
  edit = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = releaseIdSchema.parse(request.params);
      response.json(
        successResponse(
          await this.service.edit(
            getAuthenticatedAccess(response),
            id,
            editReleaseSchema.parse(request.body)
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
