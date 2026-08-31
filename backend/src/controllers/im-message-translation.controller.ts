import type { NextFunction, Request, Response } from "express";
import type { ImMessageTranslationService } from "../services/im-message-translation.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  imMessageTranslationBodySchema,
  imMessageTranslationParamsSchema
} from "../validators/im-message-translation.validator";

export class ImMessageTranslationController {
  public constructor(
    private readonly service: Pick<ImMessageTranslationService, "translateVisibleMessages">
  ) {}

  public translate = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { conversationId } = imMessageTranslationParamsSchema.parse(request.params);
      const body = imMessageTranslationBodySchema.parse(request.body);
      const result = await this.service.translateVisibleMessages(getAuthenticatedAccess(response), {
        conversationId,
        ...body
      });
      response.status(200).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };
}
