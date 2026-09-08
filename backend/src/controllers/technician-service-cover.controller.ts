import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import { CONTENT_IMAGE_MIME_TYPES } from "../middlewares/content-image-upload.middleware";
import type { ContentMediaMimeType } from "../services/content-media.storage";
import type { TechnicianServiceCoverService } from "../services/technician-service-cover.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { technicianServiceIdParamSchema } from "../validators/pricing-mode.validator";

const supportedMimeTypes = new Set<string>(CONTENT_IMAGE_MIME_TYPES);

export class TechnicianServiceCoverController {
  public constructor(private readonly service: TechnicianServiceCoverService) {}

  public upload = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, serviceId } = technicianServiceIdParamSchema.parse(request.params);
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
      if (!mimeType || !supportedMimeTypes.has(mimeType)) {
        throw this.invalid(415);
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw this.invalid(400);
      }

      response.status(200).json(
        successResponse(
          await this.service.uploadCover(
            getAuthenticatedAccess(response),
            getRequestContext(request),
            shopId,
            serviceId,
            {
              bytes: request.body,
              mimeType: mimeType as ContentMediaMimeType,
              now: new Date()
            }
          )
        )
      );
    } catch (error) {
      next(error);
    }
  };

  public remove = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { shopId, serviceId } = technicianServiceIdParamSchema.parse(request.params);
      response
        .status(200)
        .json(
          successResponse(
            await this.service.removeCover(
              getAuthenticatedAccess(response),
              getRequestContext(request),
              shopId,
              serviceId,
              new Date()
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  private invalid(statusCode: 400 | 415): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.technician_service.cover_invalid",
      statusCode
    });
  }
}
