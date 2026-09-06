import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import {
  OFFICIAL_NOTICE_MEDIA_MIME_TYPES,
  type OfficialNoticeMediaMimeType
} from "../services/official-notice-media.storage";
import type { OfficialNoticeMediaService } from "../services/official-notice-media.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getRequestContext } from "../utils/request-context";

const supportedMimeTypes = new Set<OfficialNoticeMediaMimeType>(OFFICIAL_NOTICE_MEDIA_MIME_TYPES);

export class OfficialNoticeMediaController {
  public constructor(private readonly service: OfficialNoticeMediaService) {}

  public uploadPlatform = this.upload("platform");
  public uploadMerchant = this.upload("merchant");

  private upload(scope: "platform" | "merchant") {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
        if (!mimeType || !supportedMimeTypes.has(mimeType as OfficialNoticeMediaMimeType)) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.official_notice.media_invalid",
            statusCode: 415
          });
        }
        if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.official_notice.media_invalid",
            statusCode: 400
          });
        }
        const input = {
          bytes: request.body,
          mimeType: mimeType as OfficialNoticeMediaMimeType,
          fileName: request.query.file_name as string,
          caption: typeof request.query.caption === "string" ? request.query.caption : null,
          now: new Date()
        };
        const actor = response.locals.auth as AuthenticatedAccessContext;
        const result = scope === "platform"
          ? await this.service.uploadPlatform(actor, getRequestContext(request), input)
          : await this.service.uploadMerchant(actor, getRequestContext(request), input);
        response.status(201).json(successResponse(result));
      } catch (error) {
        next(error);
      }
    };
  }
}
