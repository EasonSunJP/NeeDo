import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { ContentMediaMimeType } from "../services/content-media.storage";
import type { SocialMediaService } from "../services/social-media.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import { socialMediaUploadQuerySchema } from "../validators/social-media.validator";

const supportedMimeTypes = new Set<ContentMediaMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export class SocialMediaController {
  public constructor(private readonly service: SocialMediaService) {}

  public upload = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
      if (!mimeType || !supportedMimeTypes.has(mimeType as ContentMediaMimeType)) {
        throw this.invalid(415);
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw this.invalid(400);
      }
      const query = socialMediaUploadQuerySchema.parse(request.query);
      response.status(201).json(
        successResponse(
          await this.service.upload(getAuthenticatedAccess(response), getRequestContext(request), {
            bytes: request.body,
            fileName: query.fileName,
            mimeType: mimeType as ContentMediaMimeType,
            now: new Date()
          })
        )
      );
    } catch (error) {
      next(error);
    }
  };

  private invalid(statusCode: 400 | 415): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.social.media_invalid",
      statusCode
    });
  }
}
