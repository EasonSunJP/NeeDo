import type { NextFunction, Request, Response } from "express";
import type { RealtimeService } from "../services/realtime.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess } from "../utils/request-context";
import {
  contactListQuerySchema,
  conversationCreateBodySchema,
  conversationIdParamSchema,
  conversationListQuerySchema,
  followCreateBodySchema,
  followTargetParamSchema,
  friendRequestCreateBodySchema,
  friendRequestIdParamSchema,
  friendRequestListQuerySchema,
  messageCreateBodySchema,
  messageListQuerySchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
  socialPostCreateBodySchema,
  socialPostListQuerySchema
} from "../validators/realtime.validator";

export class RealtimeController {
  public constructor(private readonly service: RealtimeService) {}

  public listConversations = this.createHandler((request, response) =>
    this.service.listConversations(
      getAuthenticatedAccess(response),
      conversationListQuerySchema.parse(request.query)
    )
  );

  public createConversation = this.createHandler(
    async (request, response) =>
      this.service.createConversation(
        getAuthenticatedAccess(response),
        conversationCreateBodySchema.parse(request.body)
      ),
    201
  );

  public listMessages = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const query = messageListQuerySchema.parse(request.query);

    return this.service.listMessages(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      userId: getAuthenticatedAccess(response).userId,
      beforeId: query.beforeId,
      pageSize: query.pageSize
    });
  });

  public createMessage = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = messageCreateBodySchema.parse(request.body);

    return this.service.createMessage(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      type: body.type,
      content: body.content,
      metadata: body.metadata
    });
  }, 201);

  public markConversationRead = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);

    return this.service.markConversationRead(
      getAuthenticatedAccess(response),
      params.conversationId
    );
  });

  public listContacts = this.createHandler((request, response) =>
    this.service.listContacts(
      getAuthenticatedAccess(response),
      contactListQuerySchema.parse(request.query)
    )
  );

  public listFriendRequests = this.createHandler((request, response) =>
    this.service.listFriendRequests(
      getAuthenticatedAccess(response),
      friendRequestListQuerySchema.parse(request.query)
    )
  );

  public createFriendRequest = this.createHandler(
    (request, response) =>
      this.service.createFriendRequest(
        getAuthenticatedAccess(response),
        friendRequestCreateBodySchema.parse(request.body)
      ),
    201
  );

  public acceptFriendRequest = this.createHandler((request, response) => {
    const params = friendRequestIdParamSchema.parse(request.params);

    return this.service.respondToFriendRequest(
      getAuthenticatedAccess(response),
      params.id,
      "accept"
    );
  });

  public rejectFriendRequest = this.createHandler((request, response) => {
    const params = friendRequestIdParamSchema.parse(request.params);

    return this.service.respondToFriendRequest(
      getAuthenticatedAccess(response),
      params.id,
      "reject"
    );
  });

  public listSocialPosts = this.createHandler((request, response) =>
    this.service.listSocialPosts(
      getAuthenticatedAccess(response),
      socialPostListQuerySchema.parse(request.query)
    )
  );

  public createSocialPost = this.createHandler(
    (request, response) =>
      this.service.createSocialPost(
        getAuthenticatedAccess(response),
        socialPostCreateBodySchema.parse(request.body)
      ),
    201
  );

  public createFollow = this.createHandler(
    (request, response) =>
      this.service.createFollow(
        getAuthenticatedAccess(response),
        followCreateBodySchema.parse(request.body)
      ),
    201
  );

  public deleteFollow = this.createHandler((request, response) => {
    const params = followTargetParamSchema.parse(request.params);

    return this.service.deleteFollow(getAuthenticatedAccess(response), params.targetUserId);
  });

  public listNotifications = this.createHandler((request, response) =>
    this.service.listNotifications(
      getAuthenticatedAccess(response),
      notificationListQuerySchema.parse(request.query)
    )
  );

  public markNotificationRead = this.createHandler((request, response) => {
    const params = notificationIdParamSchema.parse(request.params);

    return this.service.markNotificationRead(getAuthenticatedAccess(response), params.id);
  });

  public markAllNotificationsRead = this.createHandler((_request, response) =>
    this.service.markAllNotificationsRead(getAuthenticatedAccess(response))
  );

  public unreadCounts = this.createHandler((_request, response) =>
    this.service.getUnreadCounts(getAuthenticatedAccess(response))
  );

  public streamEvents = (request: Request, response: Response, next: NextFunction): void => {
    try {
      void request;
      this.service.streamEvents(getAuthenticatedAccess(response), response);
    } catch (error) {
      next(error);
    }
  };

  private createHandler<TPayload>(
    handler: (request: Request, response: Response) => Promise<TPayload> | TPayload,
    statusCode = 200
  ) {
    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        response.status(statusCode).json(successResponse(await handler(request, response)));
      } catch (error) {
        next(error);
      }
    };
  }
}
