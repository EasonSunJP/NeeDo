import type { NextFunction, Request, Response } from "express";
import type { RealtimeService } from "../services/realtime.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  contactIdParamSchema,
  contactCreateBodySchema,
  contactListQuerySchema,
  conversationCreateBodySchema,
  conversationIdParamSchema,
  conversationLeaveBodySchema,
  conversationListQuerySchema,
  conversationPrivacyBodySchema,
  conversationPreferencesBodySchema,
  directorySearchQuerySchema,
  followCreateBodySchema,
  followTargetParamSchema,
  friendRequestCreateBodySchema,
  friendRequestIdParamSchema,
  friendRequestListQuerySchema,
  messageCreateBodySchema,
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
  socialUserIdParamSchema
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

  public setMessageReaction = this.createHandler((request, response) => {
    const params = messageReactionParamSchema.parse(request.params);
    const body = messageReactionBodySchema.parse(request.body);

    return this.service.setMessageReaction(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      messageId: params.messageId,
      emoji: body.emoji
    });
  });

  public removeMessageReaction = this.createHandler((request, response) => {
    const params = messageReactionParamSchema.parse(request.params);
    const body = messageReactionBodySchema.parse(request.body);

    return this.service.removeMessageReaction(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      messageId: params.messageId,
      emoji: body.emoji
    });
  });

  public recallMessage = this.createHandler((request, response) => {
    const params = messageRecallParamSchema.parse(request.params);
    const body = messageRecallBodySchema.parse(request.body);

    return this.service.recallMessage(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      messageId: params.messageId,
      mode: body.mode
    });
  });

  public deleteMessageForUser = this.createHandler((request, response) => {
    const params = messageDeleteParamSchema.parse(request.params);

    return this.service.deleteMessageForUser(getAuthenticatedAccess(response), params);
  });

  public markConversationRead = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);

    return this.service.markConversationRead(
      getAuthenticatedAccess(response),
      params.conversationId
    );
  });

  public markConversationUnread = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    return this.service.markConversationUnread(
      getAuthenticatedAccess(response),
      params.conversationId
    );
  });

  public updateConversationPreferences = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = conversationPreferencesBodySchema.parse(request.body);
    return this.service.updateConversationPreferences(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      ...body
    });
  });

  public updateConversationPrivacy = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = conversationPrivacyBodySchema.parse(request.body);
    return this.service.updateConversationPrivacy(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      ...body
    });
  });

  public leaveConversation = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = conversationLeaveBodySchema.parse(request.body ?? {});
    return this.service.leaveConversation(
      getAuthenticatedAccess(response),
      params.conversationId,
      body.transferOwnerUserId
    );
  });

  public dissolveConversation = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    return this.service.dissolveConversation(
      getAuthenticatedAccess(response),
      params.conversationId
    );
  });

  public hideConversation = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    return this.service.hideConversation(
      getAuthenticatedAccess(response),
      params.conversationId
    );
  });

  public clearConversationMessages = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    return this.service.clearConversationMessages(
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

  public searchDirectory = this.createHandler((request, response) =>
    this.service.searchDirectory(
      getAuthenticatedAccess(response),
      directorySearchQuerySchema.parse(request.query)
    )
  );

  public addContact = this.createHandler(
    (request, response) => {
      const body = contactCreateBodySchema.parse(request.body);
      return this.service.addContact(getAuthenticatedAccess(response), body.targetUserId);
    },
    201
  );

  public blockContact = this.createHandler((request, response) => {
    const params = contactIdParamSchema.parse(request.params);
    return this.service.setContactBlocked(
      getAuthenticatedAccess(response),
      params.contactId,
      true
    );
  });

  public unblockContact = this.createHandler((request, response) => {
    const params = contactIdParamSchema.parse(request.params);
    return this.service.setContactBlocked(
      getAuthenticatedAccess(response),
      params.contactId,
      false
    );
  });

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
        socialPostCreateBodySchema.parse(request.body),
        getRequestContext(request)
      ),
    201
  );

  public getSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);

    return this.service.getSocialPost(getAuthenticatedAccess(response), params.id);
  });

  public getSocialActivityStatus = this.createHandler((request, response) => {
    const params = socialUserIdParamSchema.parse(request.params);

    return this.service.getSocialActivityStatus(
      getAuthenticatedAccess(response),
      params.userId
    );
  });

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

  public streamEvents = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      void request;
      await this.service.streamEvents(getAuthenticatedAccess(response), response);
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
