import type { NextFunction, Request, Response } from "express";
import type { RealtimeService } from "../services/realtime.service";
import { successResponse } from "../utils/api-response";
import { getAuthenticatedAccess, getRequestContext } from "../utils/request-context";
import {
  contactIdParamSchema,
  contactCardCandidateListQuerySchema,
  contactCardIdempotencyKeySchema,
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
  followDeleteQuerySchema,
  followTargetParamSchema,
  friendRequestCreateBodySchema,
  friendRequestIdParamSchema,
  friendRequestListQuerySchema,
  messageBatchDeleteBodySchema,
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
  socialPostIdempotencyKeySchema,
  socialPostIdParamSchema,
  socialPostListQuerySchema,
  socialPostShareBodySchema,
  socialPostUpdateBodySchema,
  socialActivityStatusQuerySchema,
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

  public listContactCardCandidates = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    return this.service.listContactCardCandidates(
      getAuthenticatedAccess(response),
      params.conversationId,
      contactCardCandidateListQuerySchema.parse(request.query)
    );
  });

  public sendContactCard = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = contactCardSendBodySchema.parse(request.body);
    const idempotencyKey = contactCardIdempotencyKeySchema.parse(request.get("Idempotency-Key"));
    return this.service.sendContactCard(
      getAuthenticatedAccess(response),
      params.conversationId,
      body.targetUserId,
      idempotencyKey
    );
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

  public deleteMessagesForUser = this.createHandler((request, response) => {
    const params = conversationIdParamSchema.parse(request.params);
    const body = messageBatchDeleteBodySchema.parse(request.body);
    return this.service.deleteMessagesForUser(getAuthenticatedAccess(response), {
      conversationId: params.conversationId,
      ...body
    });
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
    return this.service.hideConversation(getAuthenticatedAccess(response), params.conversationId);
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

  public getDirectoryProfile = this.createHandler((request, response) => {
    const params = directoryUserIdParamSchema.parse(request.params);
    return this.service.getDirectoryProfile(getAuthenticatedAccess(response), params.userId);
  });

  public blockContact = this.createHandler((request, response) => {
    const params = contactIdParamSchema.parse(request.params);
    return this.service.setContactBlocked(getAuthenticatedAccess(response), params.contactId, true);
  });

  public unblockContact = this.createHandler((request, response) => {
    const params = contactIdParamSchema.parse(request.params);
    return this.service.setContactBlocked(
      getAuthenticatedAccess(response),
      params.contactId,
      false
    );
  });

  public deleteContact = this.createHandler((request, response) => {
    const params = contactIdParamSchema.parse(request.params);
    return this.service.deleteContact(getAuthenticatedAccess(response), params.contactId);
  });

  public listFriendRequests = this.createHandler((request, response) =>
    this.service.listFriendRequests(
      getAuthenticatedAccess(response),
      friendRequestListQuerySchema.parse(request.query)
    )
  );

  public createFriendRequest = this.createHandler((request, response) =>
    this.service.createFriendRequest(
      getAuthenticatedAccess(response),
      friendRequestCreateBodySchema.parse(request.body)
    )
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

  public updateSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);

    return this.service.updateSocialPost(
      getAuthenticatedAccess(response),
      params.id,
      socialPostUpdateBodySchema.parse(request.body),
      getRequestContext(request)
    );
  });

  public pinSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostPin(
      getAuthenticatedAccess(response),
      params.id,
      true,
      getRequestContext(request)
    );
  });

  public unpinSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostPin(
      getAuthenticatedAccess(response),
      params.id,
      false,
      getRequestContext(request)
    );
  });

  public getSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);

    return this.service.getSocialPost(getAuthenticatedAccess(response), params.id);
  });

  public likeSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostLike(
      getAuthenticatedAccess(response),
      params.id,
      true,
      getRequestContext(request)
    );
  });

  public unlikeSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostLike(
      getAuthenticatedAccess(response),
      params.id,
      false,
      getRequestContext(request)
    );
  });

  public bookmarkSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostBookmark(
      getAuthenticatedAccess(response),
      params.id,
      true,
      getRequestContext(request)
    );
  });

  public unbookmarkSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.setSocialPostBookmark(
      getAuthenticatedAccess(response),
      params.id,
      false,
      getRequestContext(request)
    );
  });

  public recordSocialPostView = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    return this.service.recordSocialPostView(
      getAuthenticatedAccess(response),
      params.id,
      getRequestContext(request)
    );
  });

  public shareSocialPost = this.createHandler((request, response) => {
    const params = socialPostIdParamSchema.parse(request.params);
    const body = socialPostShareBodySchema.parse(request.body);
    return this.service.shareSocialPost(
      getAuthenticatedAccess(response),
      params.id,
      {
        ...body,
        idempotencyKey: socialPostIdempotencyKeySchema.parse(request.get("Idempotency-Key"))
      },
      getRequestContext(request)
    );
  });

  public getSocialActivityStatus = this.createHandler((request, response) => {
    const params = socialUserIdParamSchema.parse(request.params);
    const query = socialActivityStatusQuerySchema.parse(request.query);

    return this.service.getSocialActivityStatus(
      getAuthenticatedAccess(response),
      params.userId,
      query.identityId
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
    const query = followDeleteQuerySchema.parse(request.query);

    return this.service.deleteFollow(
      getAuthenticatedAccess(response),
      params.targetUserId,
      query.identityId
    );
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
