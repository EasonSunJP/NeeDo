import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../services/auth.service";
import type { ContentMediaMimeType } from "../services/content-media.storage";
import type { ContentMediaService } from "../services/content-media.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";

const supportedMimeTypes = new Set<ContentMediaMimeType>(["image/jpeg", "image/png", "image/webp"]);

export class ContentMediaController {
  public constructor(private readonly service: ContentMediaService) {}

  public upload = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
      if (!mimeType || !supportedMimeTypes.has(mimeType as ContentMediaMimeType)) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.content.media_invalid",
          statusCode: 415
        });
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.content.media_invalid",
          statusCode: 400
        });
      }

      const altText = typeof request.query.alt_text === "string" ? request.query.alt_text : null;
      response.status(201).json(
        successResponse(
          await this.service.upload(this.auth(response), this.context(request), {
            bytes: request.body,
            mimeType: mimeType as ContentMediaMimeType,
            altText,
            now: new Date()
          })
        )
      );
    } catch (error) {
      next(error);
    }
  };

  private auth(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private context(request: Request): AuthRequestContext {
    const forwardedFor = request.get("x-forwarded-for");
    return {
      ip:
        forwardedFor?.split(",")[0]?.trim() ||
        request.ip ||
        request.socket.remoteAddress ||
        "unknown",
      userAgent: request.get("user-agent") ?? undefined
    };
  }
}
