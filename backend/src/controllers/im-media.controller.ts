import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { ImMediaMimeType } from "../services/im-media.storage";
import type { ImMediaService } from "../services/im-media.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  imMediaUploadParamSchema,
  imMediaUploadQuerySchema
} from "../validators/im-media.validator";

const supportedMimeTypes = new Set<ImMediaMimeType>(["image/jpeg", "image/png", "image/webp"]);

export class ImMediaController {
  public constructor(private readonly service: ImMediaService) {}

  public upload = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { conversationId } = imMediaUploadParamSchema.parse(request.params);
      const { fileName } = imMediaUploadQuerySchema.parse(request.query);
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
      if (
        !mimeType ||
        !supportedMimeTypes.has(mimeType as ImMediaMimeType) ||
        !Buffer.isBuffer(request.body)
      ) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.im.media_invalid",
          statusCode: 415
        });
      }

      response.status(201).json(
        successResponse(
          await this.service.upload(getAuthenticatedAccess(response), {
            bytes: request.body,
            conversationId,
            fileName,
            mimeType: mimeType as ImMediaMimeType
          })
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
