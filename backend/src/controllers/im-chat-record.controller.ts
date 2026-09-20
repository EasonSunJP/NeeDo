import type { NextFunction, Request, Response } from "express";
import type { ChatRecordBundlePayload } from "../repositories/im-chat-record.repository";
import type { ImChatRecordService } from "../services/im-chat-record.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  chatRecordCommandBodySchema,
  chatRecordForwardBodySchema,
  chatRecordItemsQuerySchema,
  chatRecordMediaParamSchema,
  chatRecordPublicIdParamSchema,
  favoriteIdParamSchema,
  favoriteListQuerySchema,
  targetConversationParamSchema
} from "../validators/im-chat-record.validator";

const publicBundle = (bundle: ChatRecordBundlePayload): Omit<ChatRecordBundlePayload, "id"> => {
  const { id, ...result } = bundle;
  void id;
  return result;
};

export class ImChatRecordController {
  public constructor(private readonly service: ImChatRecordService) {}

  public createDelivery = this.createJsonHandler(async (request, response) => {
    const params = targetConversationParamSchema.parse(request.params);
    const body = chatRecordCommandBodySchema.parse(request.body);
    const result = await this.service.createDelivery(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      { ...body, targetConversationId: params.targetConversationId }
    );
    return {
      replayed: result.replayed,
      bundle: publicBundle(result.bundle),
      message: result.message
    };
  }, 201);

  public getBundle = this.createJsonHandler(async (request, response) => {
    const { publicId } = chatRecordPublicIdParamSchema.parse(request.params);
    return publicBundle(await this.service.getBundle(getAuthenticatedAccess(response), publicId));
  });

  public forwardBundle = this.createJsonHandler(async (request, response) => {
    const { publicId } = chatRecordPublicIdParamSchema.parse(request.params);
    const body = chatRecordForwardBodySchema.parse(request.body);
    const result = await this.service.forwardBundle(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      publicId,
      body
    );
    return { replayed: result.replayed, bundle: publicBundle(result.bundle), message: result.message };
  }, 201);

  public listItems = this.createJsonHandler(async (request, response) => {
    const { publicId } = chatRecordPublicIdParamSchema.parse(request.params);
    const query = chatRecordItemsQuerySchema.parse(request.query);
    const result = await this.service.listItems(getAuthenticatedAccess(response), publicId, query);
    return {
      list: result.list,
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      nextCursor: result.nextCursor
    };
  });

  public getMedia = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { publicId, checksumSha256 } = chatRecordMediaParamSchema.parse(request.params);
      const media = await this.service.resolveAuthorizedMedia(
        getAuthenticatedAccess(response),
        publicId,
        checksumSha256
      );
      response.setHeader("Content-Type", media.mimeType);
      response.setHeader("Content-Length", String(media.size));
      response.setHeader("ETag", `"${media.checksumSha256}"`);
      response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      response.status(200).send(media.bytes);
    } catch (error) {
      next(error);
    }
  };

  public createFavorite = this.createJsonHandler(
    async (request, response) =>
      this.service.createFavorite(
        getAuthenticatedAccess(response),
        getRequestContext(request),
        chatRecordCommandBodySchema.parse(request.body)
      ),
    201
  );

  public listFavorites = this.createJsonHandler((request, response) =>
    this.service.listFavorites(
      getAuthenticatedAccess(response),
      favoriteListQuerySchema.parse(request.query)
    )
  );

  public removeFavorite = this.createJsonHandler((request, response) => {
    const { favoriteId } = favoriteIdParamSchema.parse(request.params);
    return this.service.removeFavorite(
      getAuthenticatedAccess(response),
      getRequestContext(request),
      favoriteId
    );
  });

  private createJsonHandler(
    handler: (request: Request, response: Response) => Promise<unknown> | unknown,
    statusCode = 200
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const data = await handler(request, response);
        response.status(statusCode).json(successResponse(data));
      } catch (error) {
        next(error);
      }
    };
  }
}
