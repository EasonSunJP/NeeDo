import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { ImVoiceMessageService } from "../services/im-voice-message.service";
import type { ImVoiceMimeType } from "../services/im-voice.storage";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  imVoiceMessageParamSchema,
  imVoiceMessageQuerySchema
} from "../validators/im-voice-message.validator";

const supportedMimeTypes = new Set<ImVoiceMimeType>(["audio/webm", "audio/mp4", "audio/ogg"]);

export class ImVoiceMessageController {
  public constructor(private readonly service: ImVoiceMessageService) {}

  public send = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { conversationId } = imVoiceMessageParamSchema.parse(request.params);
      const { durationSeconds, fileName } = imVoiceMessageQuerySchema.parse(request.query);
      const mimeType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
      if (
        !mimeType ||
        !supportedMimeTypes.has(mimeType as ImVoiceMimeType) ||
        !Buffer.isBuffer(request.body)
      ) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.im.voice_invalid",
          statusCode: 415
        });
      }

      response.status(201).json(
        successResponse(
          await this.service.send(getAuthenticatedAccess(response), {
            bytes: request.body,
            conversationId,
            durationSeconds,
            fileName,
            mimeType: mimeType as ImVoiceMimeType
          })
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
