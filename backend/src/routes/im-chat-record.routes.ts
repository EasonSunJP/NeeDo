import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ImChatRecordController } from "../controllers/im-chat-record.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ImChatRecordRepository } from "../repositories/im-chat-record.repository";
import { AuthRepository } from "../repositories/auth.repository";
import {
  ImChatRecordMediaFileStorage,
  resolveImChatRecordMediaDirectory
} from "../services/im-chat-record-media.storage";
import { ImChatRecordService } from "../services/im-chat-record.service";
import { PersonalIdentityScopeService } from "../services/personal-identity-scope.service";
import { SseRealtimeEventGateway } from "../services/realtime-event.gateway";
import {
  chatRecordCommandBodySchema,
  chatRecordItemsQuerySchema,
  chatRecordMediaParamSchema,
  chatRecordPublicIdParamSchema,
  favoriteIdParamSchema,
  favoriteListQuerySchema,
  targetConversationParamSchema
} from "../validators/im-chat-record.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const IM_CHAT_RECORD_ROUTE_PERMISSIONS = {
  createDelivery: "message:forward",
  read: "message:list",
  favorite: "message:favorite"
} as const;

export const createImChatRecordRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const publicBaseUrl =
    config.IM_MEDIA_PUBLIC_BASE_URL ??
    new URL("/media/im", config.CUSTOMER_AVATAR_PUBLIC_BASE_URL).toString();
  const contentPublicBaseUrl = new URL(
    "/media/content",
    config.CUSTOMER_AVATAR_PUBLIC_BASE_URL
  ).toString();
  const repository = dependencies.imChatRecordRepository ?? new ImChatRecordRepository();
  const storage =
    dependencies.imChatRecordMediaStorage ??
    new ImChatRecordMediaFileStorage({
      directory: resolveImChatRecordMediaDirectory(config.IM_MEDIA_STORAGE_DIR),
      sourceRoots: [
        { directory: config.IM_MEDIA_STORAGE_DIR, publicBaseUrl },
        { directory: config.CONTENT_MEDIA_STORAGE_DIR, publicBaseUrl: contentPublicBaseUrl }
      ]
    });
  const service =
    dependencies.imChatRecordService ??
    new ImChatRecordService(
      repository,
      dependencies.personalIdentityScopeService ??
        new PersonalIdentityScopeService(dependencies.authRepository ?? new AuthRepository()),
      storage,
      dependencies.realtimeEventGateway ?? new SseRealtimeEventGateway()
    );
  const controller = new ImChatRecordController(service);

  router.post(
    "/im/conversations/:targetConversationId/chat-records",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.createDelivery),
    validateRequest({ params: targetConversationParamSchema, body: chatRecordCommandBodySchema }),
    controller.createDelivery
  );
  router.get(
    "/im/chat-records/:publicId/items",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.read),
    validateRequest({ params: chatRecordPublicIdParamSchema, query: chatRecordItemsQuerySchema }),
    controller.listItems
  );
  router.get(
    "/im/chat-records/:publicId/media/:checksumSha256",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.read),
    validateRequest({ params: chatRecordMediaParamSchema }),
    controller.getMedia
  );
  router.get(
    "/im/chat-records/:publicId",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.read),
    validateRequest({ params: chatRecordPublicIdParamSchema }),
    controller.getBundle
  );
  router.post(
    "/im/chat-record-favorites",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.favorite),
    validateRequest({ body: chatRecordCommandBodySchema }),
    controller.createFavorite
  );
  router.get(
    "/im/chat-record-favorites",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.favorite),
    validateRequest({ query: favoriteListQuerySchema }),
    controller.listFavorites
  );
  router.delete(
    "/im/chat-record-favorites/:favoriteId",
    authenticate(),
    createAuthorizeMiddleware(IM_CHAT_RECORD_ROUTE_PERMISSIONS.favorite),
    validateRequest({ params: favoriteIdParamSchema }),
    controller.removeFavorite
  );

  return router;
};
