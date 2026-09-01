import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { RealtimeController } from "../controllers/realtime.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { RealtimeRepository } from "../repositories/realtime.repository";
import { AuthRepository } from "../repositories/auth.repository";
import { SseRealtimeEventGateway } from "../services/realtime-event.gateway";
import { RealtimeService } from "../services/realtime.service";
import { PersonalIdentityScopeService } from "../services/personal-identity-scope.service";
import {
  contactIdParamSchema,
  contactCardCandidateListQuerySchema,
  contactCardSendBodySchema,
  contactListQuerySchema,
  conversationCreateBodySchema,
  conversationIdParamSchema,
  conversationLeaveBodySchema,
  conversationListQuerySchema,
  conversationPrivacyBodySchema,
  conversationPreferencesBodySchema,
  directorySearchQuerySchema,
  directoryUserIdParamSchema,
  followCreateBodySchema,
  followTargetParamSchema,
  friendRequestCreateBodySchema,
  friendRequestIdParamSchema,
  friendRequestListQuerySchema,
  messageCreateBodySchema,
  messageBatchDeleteBodySchema,
  messageDeleteParamSchema,
  messageListQuerySchema,
  messageRecallBodySchema,
  messageRecallParamSchema,
  messageReactionBodySchema,
  messageReactionParamSchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
  socialPostCreateBodySchema,
  socialPostIdParamSchema,
  socialPostListQuerySchema,
  socialPostShareBodySchema,
  socialPostUpdateBodySchema,
  socialUserIdParamSchema
} from "../validators/realtime.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const REALTIME_ROUTE_PERMISSIONS = {
  listConversations: "conversation:list",
  createConversation: "conversation:create",
  listMessages: "message:list",
  createMessage: "message:create",
  recallMessage: "message:recall",
  deleteMessageForUser: "message:list",
  deleteMessagesForUser: "message:list",
  reactToMessage: "message:react",
  markConversationRead: "message:read",
  markConversationUnread: "message:read",
  updateConversationPreferences: "conversation:list",
  updateConversationPrivacy: "conversation:create",
  leaveConversation: "conversation:list",
  dissolveConversation: "conversation:create",
  hideConversation: "conversation:list",
  clearConversationMessages: "message:list",
  listContacts: "contact:list",
  searchDirectory: "contact:list",
  blockContact: "contact:block",
  deleteContact: "contact:delete",
  listFriendRequests: "friend-request:list",
  createFriendRequest: "friend-request:create",
  respondFriendRequest: "friend-request:respond",
  listSocialPosts: "social-post:list",
  getSocialPost: "social-post:list",
  createSocialPost: "social-post:create",
  updateSocialPost: "social-post:create",
  interactSocialPost: "social-post:interact",
  writeFollow: "follow:write",
  listNotifications: "notification:list",
  readNotification: "notification:read",
  unreadCounts: "realtime:unread-counts",
  events: "realtime:events"
} as const;

export const createRealtimeRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const service =
    dependencies.realtimeService ??
    new RealtimeService(
      dependencies.realtimeRepository ?? new RealtimeRepository(),
      dependencies.realtimeEventGateway ?? new SseRealtimeEventGateway(),
      dependencies.personalIdentityScopeService ??
        new PersonalIdentityScopeService(dependencies.authRepository ?? new AuthRepository())
    );
  const controller = new RealtimeController(service);

  router.get(
    "/im/conversations",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listConversations),
    validateRequest({ query: conversationListQuerySchema }),
    controller.listConversations
  );
  router.post(
    "/im/conversations",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createConversation),
    validateRequest({ body: conversationCreateBodySchema }),
    controller.createConversation
  );
  router.get(
    "/im/conversations/:conversationId/messages",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listMessages),
    validateRequest({ params: conversationIdParamSchema, query: messageListQuerySchema }),
    controller.listMessages
  );
  router.post(
    "/im/conversations/:conversationId/messages",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createMessage),
    validateRequest({ params: conversationIdParamSchema, body: messageCreateBodySchema }),
    controller.createMessage
  );
  router.get(
    "/im/conversations/:conversationId/contact-card-candidates",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createMessage),
    validateRequest({
      params: conversationIdParamSchema,
      query: contactCardCandidateListQuerySchema
    }),
    controller.listContactCardCandidates
  );
  router.post(
    "/im/conversations/:conversationId/contact-cards",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createMessage),
    validateRequest({
      params: conversationIdParamSchema,
      body: contactCardSendBodySchema
    }),
    controller.sendContactCard
  );
  router.post(
    "/im/conversations/:conversationId/messages/:messageId/recall",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.recallMessage),
    validateRequest({ params: messageRecallParamSchema, body: messageRecallBodySchema }),
    controller.recallMessage
  );
  router.post(
    "/im/conversations/:conversationId/messages/delete-for-me",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.deleteMessagesForUser),
    validateRequest({
      params: conversationIdParamSchema,
      body: messageBatchDeleteBodySchema
    }),
    controller.deleteMessagesForUser
  );
  router.delete(
    "/im/conversations/:conversationId/messages/:messageId",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.deleteMessageForUser),
    validateRequest({ params: messageDeleteParamSchema }),
    controller.deleteMessageForUser
  );
  router.put(
    "/im/conversations/:conversationId/messages/:messageId/reactions",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.reactToMessage),
    validateRequest({ params: messageReactionParamSchema, body: messageReactionBodySchema }),
    controller.setMessageReaction
  );
  router.delete(
    "/im/conversations/:conversationId/messages/:messageId/reactions",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.reactToMessage),
    validateRequest({ params: messageReactionParamSchema, body: messageReactionBodySchema }),
    controller.removeMessageReaction
  );
  router.post(
    "/im/conversations/:conversationId/read",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.markConversationRead),
    validateRequest({ params: conversationIdParamSchema }),
    controller.markConversationRead
  );
  router.post(
    "/im/conversations/:conversationId/unread",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.markConversationUnread),
    validateRequest({ params: conversationIdParamSchema }),
    controller.markConversationUnread
  );
  router.patch(
    "/im/conversations/:conversationId/preferences",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.updateConversationPreferences),
    validateRequest({
      params: conversationIdParamSchema,
      body: conversationPreferencesBodySchema
    }),
    controller.updateConversationPreferences
  );
  router.patch(
    "/im/conversations/:conversationId/privacy",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.updateConversationPrivacy),
    validateRequest({
      params: conversationIdParamSchema,
      body: conversationPrivacyBodySchema
    }),
    controller.updateConversationPrivacy
  );
  router.post(
    "/im/conversations/:conversationId/leave",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.leaveConversation),
    validateRequest({ params: conversationIdParamSchema, body: conversationLeaveBodySchema }),
    controller.leaveConversation
  );
  router.post(
    "/im/conversations/:conversationId/dissolve",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.dissolveConversation),
    validateRequest({ params: conversationIdParamSchema }),
    controller.dissolveConversation
  );
  router.delete(
    "/im/conversations/:conversationId/messages",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.clearConversationMessages),
    validateRequest({ params: conversationIdParamSchema }),
    controller.clearConversationMessages
  );
  router.delete(
    "/im/conversations/:conversationId",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.hideConversation),
    validateRequest({ params: conversationIdParamSchema }),
    controller.hideConversation
  );
  router.get(
    "/im/directory",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.searchDirectory),
    validateRequest({ query: directorySearchQuerySchema }),
    controller.searchDirectory
  );
  router.get(
    "/im/directory/:userId",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.searchDirectory),
    validateRequest({ params: directoryUserIdParamSchema }),
    controller.getDirectoryProfile
  );
  router.get(
    "/im/contacts",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listContacts),
    validateRequest({ query: contactListQuerySchema }),
    controller.listContacts
  );
  router.post(
    "/im/contacts/:contactId/block",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.blockContact),
    validateRequest({ params: contactIdParamSchema }),
    controller.blockContact
  );
  router.delete(
    "/im/contacts/:contactId/block",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.blockContact),
    validateRequest({ params: contactIdParamSchema }),
    controller.unblockContact
  );
  router.delete(
    "/im/contacts/:contactId",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.deleteContact),
    validateRequest({ params: contactIdParamSchema }),
    controller.deleteContact
  );
  router.get(
    "/im/friend-requests",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listFriendRequests),
    validateRequest({ query: friendRequestListQuerySchema }),
    controller.listFriendRequests
  );
  router.post(
    "/im/friend-requests",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createFriendRequest),
    validateRequest({ body: friendRequestCreateBodySchema }),
    controller.createFriendRequest
  );
  router.post(
    "/im/friend-requests/:id/accept",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.respondFriendRequest),
    validateRequest({ params: friendRequestIdParamSchema }),
    controller.acceptFriendRequest
  );
  router.post(
    "/im/friend-requests/:id/reject",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.respondFriendRequest),
    validateRequest({ params: friendRequestIdParamSchema }),
    controller.rejectFriendRequest
  );
  router.get(
    "/social/posts",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listSocialPosts),
    validateRequest({ query: socialPostListQuerySchema }),
    controller.listSocialPosts
  );
  router.post(
    "/social/posts",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.createSocialPost),
    validateRequest({ body: socialPostCreateBodySchema }),
    controller.createSocialPost
  );
  router.get(
    "/social/users/:userId/activity-status",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listSocialPosts),
    validateRequest({ params: socialUserIdParamSchema }),
    controller.getSocialActivityStatus
  );
  router.get(
    "/social/posts/:id",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.getSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.getSocialPost
  );
  router.patch(
    "/social/posts/:id",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.updateSocialPost),
    validateRequest({ params: socialPostIdParamSchema, body: socialPostUpdateBodySchema }),
    controller.updateSocialPost
  );
  router.put(
    "/social/posts/:id/like",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.likeSocialPost
  );
  router.delete(
    "/social/posts/:id/like",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.unlikeSocialPost
  );
  router.put(
    "/social/posts/:id/bookmark",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.bookmarkSocialPost
  );
  router.delete(
    "/social/posts/:id/bookmark",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.unbookmarkSocialPost
  );
  router.post(
    "/social/posts/:id/view",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    validateRequest({ params: socialPostIdParamSchema }),
    controller.recordSocialPostView
  );
  router.post(
    "/social/posts/:id/shares",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.interactSocialPost),
    authorize(REALTIME_ROUTE_PERMISSIONS.createMessage),
    validateRequest({ params: socialPostIdParamSchema, body: socialPostShareBodySchema }),
    controller.shareSocialPost
  );
  router.post(
    "/social/follows",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.writeFollow),
    validateRequest({ body: followCreateBodySchema }),
    controller.createFollow
  );
  router.delete(
    "/social/follows/:targetUserId",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.writeFollow),
    validateRequest({ params: followTargetParamSchema }),
    controller.deleteFollow
  );
  router.get(
    "/notifications",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.listNotifications),
    validateRequest({ query: notificationListQuerySchema }),
    controller.listNotifications
  );
  router.post(
    "/notifications/:id/read",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.readNotification),
    validateRequest({ params: notificationIdParamSchema }),
    controller.markNotificationRead
  );
  router.post(
    "/notifications/read-all",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.readNotification),
    controller.markAllNotificationsRead
  );
  router.get(
    "/realtime/unread-counts",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.unreadCounts),
    controller.unreadCounts
  );
  router.get(
    "/realtime/events",
    authenticate(),
    authorize(REALTIME_ROUTE_PERMISSIONS.events),
    controller.streamEvents
  );

  return router;
};
