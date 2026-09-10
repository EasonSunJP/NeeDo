import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../services/auth.service";
import type { ContentMediaMimeType } from "../services/content-media.storage";
import type { ShopPresentationService } from "../services/shop-presentation.service";
import type { ShopPresentationLocaleSyncBody, ShopPresentationLocaleUpdateBody } from "../validators/shop-presentation.validator";
import type { ContentLocaleCode } from "../constants/content-locales";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";

const supportedMimeTypes = new Set<ContentMediaMimeType>(["image/jpeg", "image/png", "image/webp"]);

export class ShopPresentationController {
  public constructor(private readonly service: ShopPresentationService) {}

  public workspace = this.handle(async (request, response) => {
    return this.service.getWorkspace(this.auth(response), this.context(request));
  });

  public updateLocale = this.handle(async (request, response) => {
    return this.service.updateLocale(
      this.auth(response),
      this.context(request),
      request.params.locale as ContentLocaleCode,
      request.body as ShopPresentationLocaleUpdateBody
    );
  });

  public syncLocale = this.handle(async (request, response) => {
    return this.service.syncLocale(
      this.auth(response),
      this.context(request),
      request.params.locale as ContentLocaleCode,
      request.body as ShopPresentationLocaleSyncBody
    );
  });

  public uploadMedia = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
      if (!mimeType || !supportedMimeTypes.has(mimeType as ContentMediaMimeType)) {
        throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_presentation.media_invalid", statusCode: 415 });
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_presentation.media_invalid", statusCode: 400 });
      }
      response.status(201).json(successResponse(await this.service.uploadMedia(
        this.auth(response),
        this.context(request),
        {
          bytes: request.body,
          mimeType: mimeType as ContentMediaMimeType,
          altText: typeof request.query.alt_text === "string" ? request.query.alt_text : null
        }
      )));
    } catch (error) {
      next(error);
    }
  };

  private handle(operation: (request: Request, response: Response) => Promise<unknown>) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        response.json(successResponse(await operation(request, response)));
      } catch (error) {
        next(error);
      }
    };
  }

  private auth(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private context(request: Request): AuthRequestContext {
    const forwardedFor = request.get("x-forwarded-for");
    return {
      ip: forwardedFor?.split(",")[0]?.trim() || request.ip || request.socket.remoteAddress || "unknown",
      userAgent: request.get("user-agent") ?? undefined
    };
  }
}
