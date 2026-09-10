import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import type { IdentityApplicationMediaMimeType } from "../services/identity-application-media.storage";
import type { IdentityApplicationMediaService } from "../services/identity-application-media.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import {
  identityApplicationMediaReadParamSchema,
  identityApplicationMediaUploadParamSchema,
  identityApplicationMediaUploadQuerySchema
} from "../validators/identity-application-media.validator";

const supportedMimeTypes = new Set<IdentityApplicationMediaMimeType>(["image/jpeg", "image/png"]);

export class IdentityApplicationMediaController {
  public constructor(private readonly service: IdentityApplicationMediaService) {}

  public upload = this.handle(async (request, response) => {
    const { id } = identityApplicationMediaUploadParamSchema.parse(request.params);
    const query = identityApplicationMediaUploadQuerySchema.parse(request.query);
    const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
    if (!mimeType || !supportedMimeTypes.has(mimeType as IdentityApplicationMediaMimeType)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.media_type_unsupported",
        statusCode: 415
      });
    }
    if (!Buffer.isBuffer(request.body)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.media_invalid",
        statusCode: 400
      });
    }
    response.status(201).json(
      successResponse(
        await this.service.upload({
          userId: this.auth(response).userId,
          applicationId: id,
          expectedVersion: query.expected_version,
          purpose: query.purpose,
          bytes: request.body,
          mimeType: mimeType as IdentityApplicationMediaMimeType,
          now: new Date()
        })
      )
    );
  });

  public read = this.handle(async (request, response) => {
    const { id, mediaId } = identityApplicationMediaReadParamSchema.parse(request.params);
    const result = await this.service.read(this.auth(response), id, mediaId);
    response.setHeader("Content-Type", result.mimeType);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Disposition", "inline");
    response.status(200).send(result.buffer);
  });

  private auth(response: Response): AuthenticatedAccessContext {
    return response.locals.auth as AuthenticatedAccessContext;
  }

  private handle(
    handler: (request: Request, response: Response) => Promise<void>
  ): (request: Request, response: Response, next: NextFunction) => Promise<void> {
    return async (request, response, next) => {
      try {
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
