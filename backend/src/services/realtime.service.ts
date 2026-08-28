import type { Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  ConversationPayload,
  CreateConversationInput,
  CreateFollowInput,
  CreateFriendRequestInput,
  CreateMessageInput,
  CreateOrderStatusNotificationInput,
  CreateSocialPostInput,
  FriendRequestListInput,
  DirectorySearchInput,
  ListMessagesInput,
  MessageReactionMutationInput,
  NotificationListInput,
  RealtimeRepositoryPort,
  SocialPostListInput,
  UpdateConversationPreferencesInput
} from "../repositories/realtime.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";

const SOCIAL_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface OrderStatusNotificationInput {
  actorUserId: number;
  orderId: number;
  orderNo: string;
  fromStatus: string;
  toStatus: string;
  serviceName: string;
  recipientUserIds: number[];
}

export interface OrderStatusNotificationPort {
  notifyOrderStatusChanged: (input: OrderStatusNotificationInput) => Promise<void>;
}

export class RealtimeService implements OrderStatusNotificationPort {
  public constructor(
    private readonly repository: RealtimeRepositoryPort,
    private readonly eventGateway: RealtimeEventGatewayPort
  ) {}

  public async createConversation(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateConversationInput, "creatorUserId">
  ): Promise<ConversationPayload> {
    const participantUserIds = Array.from(new Set([auth.userId, ...input.participantUserIds]));

    if (input.type === "direct" && participantUserIds.length !== 2) {
      throw this.validationError("error.realtime.direct_conversation_requires_two_users");
    }

    if (input.type === "group" && participantUserIds.length < 2) {
      throw this.validationError("error.realtime.group_conversation_requires_members");
    }

    await this.assertActiveUsers(participantUserIds);

    return this.repository.createConversation({
      creatorUserId: auth.userId,
      type: input.type,
      title: input.title,
      participantUserIds: input.participantUserIds
    });
  }

  public listConversations(auth: AuthenticatedAccessContext, input: PaginationInput) {
    return this.repository.listConversations(auth.userId, input);
  }

  public async createMessage(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateMessageInput, "senderUserId">
  ) {
    if (await this.repository.isMessageSenderBlocked(input.conversationId, auth.userId)) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.recipient_blocked",
        statusCode: 403
      });
    }

    const message = await this.repository.createMessage({
      ...input,
      senderUserId: auth.userId
    });

    if (!message) {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }

    await this.publishToConversation(input.conversationId, "message.created", message, auth.userId);

    return message;
  }

  public async listMessages(auth: AuthenticatedAccessContext, input: ListMessagesInput) {
    const messages = await this.repository.listMessages({
      ...input,
      userId: auth.userId
    });

    if (!messages) {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }

    return messages;
  }

  public async setMessageReaction(
    auth: AuthenticatedAccessContext,
    input: Omit<MessageReactionMutationInput, "userId">
  ) {
    const message = await this.repository.setMessageReaction({
      ...input,
      userId: auth.userId
    });
    if (!message) throw this.notFoundError("error.realtime.message_not_found");

    await this.publishToConversation(
      input.conversationId,
      "message.reaction.updated",
      message,
      auth.userId
    );
    return message;
  }

  public async removeMessageReaction(
    auth: AuthenticatedAccessContext,
    input: Omit<MessageReactionMutationInput, "userId">
  ) {
    const message = await this.repository.removeMessageReaction({
      ...input,
      userId: auth.userId
    });
    if (!message) throw this.notFoundError("error.realtime.message_not_found");

    await this.publishToConversation(
      input.conversationId,
      "message.reaction.updated",
      message,
      auth.userId
    );
    return message;
  }

  public async recallMessage(
    auth: AuthenticatedAccessContext,
    input: { conversationId: number; messageId: number; mode: "standard" }
  ) {
    const outcome = await this.repository.recallMessage({
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderUserId: auth.userId,
      now: new Date()
    });

    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.message_not_found");
    }
    if (outcome.status === "window_expired") {
      throw this.validationError("error.im.recall_window_expired");
    }
    if (!("message" in outcome)) {
      throw this.notFoundError("error.realtime.message_not_found");
    }

    if (outcome.status === "recalled") {
      await this.publishToConversation(
        input.conversationId,
        "message.recalled",
        outcome.message,
        auth.userId
      );
    }

    return {
      action: "standard_recall" as const,
      conversationId: input.conversationId,
      messageId: input.messageId,
      message: outcome.message
    };
  }

  public async markConversationRead(auth: AuthenticatedAccessContext, conversationId: number) {
    const result = await this.repository.markConversationRead({
      conversationId,
      userId: auth.userId
    });

    if (!result) {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "conversation.read",
      recipientUserId: auth.userId,
      payload: result,
      createdAt: new Date().toISOString()
    });

    return result;
  }

  public async markConversationUnread(auth: AuthenticatedAccessContext, conversationId: number) {
    const conversation = await this.repository.markConversationUnread({
      conversationId,
      userId: auth.userId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async updateConversationPreferences(
    auth: AuthenticatedAccessContext,
    input: Omit<UpdateConversationPreferencesInput, "userId">
  ) {
    const conversation = await this.repository.updateConversationPreferences({
      ...input,
      userId: auth.userId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async hideConversation(auth: AuthenticatedAccessContext, conversationId: number) {
    const conversation = await this.repository.hideConversation({
      conversationId,
      userId: auth.userId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public listContacts(auth: AuthenticatedAccessContext, input: PaginationInput) {
    return this.repository.listContacts(auth.userId, input);
  }

  public searchDirectory(auth: AuthenticatedAccessContext, input: DirectorySearchInput) {
    return this.repository.searchDirectory(auth.userId, input);
  }

  public async addContact(auth: AuthenticatedAccessContext, contactUserId: number) {
    if (auth.userId === contactUserId) {
      throw this.validationError("error.realtime.contact_self");
    }

    await this.assertActiveUsers([contactUserId]);
    const contact = await this.repository.addContact({
      ownerUserId: auth.userId,
      contactUserId,
      source: "manual"
    });
    this.eventGateway.publish({
      id: this.createEventId(),
      type: "contact.updated",
      recipientUserId: auth.userId,
      payload: contact,
      createdAt: new Date().toISOString()
    });
    return contact;
  }

  public async setContactBlocked(
    auth: AuthenticatedAccessContext,
    contactId: number,
    isBlocked: boolean
  ) {
    const contact = await this.repository.setContactBlocked({
      contactId,
      ownerUserId: auth.userId,
      isBlocked
    });
    if (!contact) throw this.notFoundError("error.realtime.contact_not_found");

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "contact.updated",
      recipientUserId: auth.userId,
      payload: contact,
      createdAt: new Date().toISOString()
    });
    return contact;
  }

  public async createFriendRequest(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateFriendRequestInput, "requesterUserId">
  ) {
    if (auth.userId === input.targetUserId) {
      throw this.validationError("error.realtime.friend_request_self");
    }

    await this.assertActiveUsers([input.targetUserId]);
    const friendRequest = await this.repository.createFriendRequest({
      requesterUserId: auth.userId,
      targetUserId: input.targetUserId,
      message: input.message
    });
    this.eventGateway.publish({
      id: this.createEventId(),
      type: "friend_request.created",
      recipientUserId: input.targetUserId,
      payload: friendRequest,
      createdAt: new Date().toISOString()
    });

    return friendRequest;
  }

  public listFriendRequests(auth: AuthenticatedAccessContext, input: FriendRequestListInput) {
    return this.repository.listFriendRequests(auth.userId, input);
  }

  public async respondToFriendRequest(
    auth: AuthenticatedAccessContext,
    id: number,
    action: "accept" | "reject"
  ) {
    const friendRequest = await this.repository.respondToFriendRequest({
      id,
      actorUserId: auth.userId,
      action
    });

    if (!friendRequest) {
      throw this.notFoundError("error.realtime.friend_request_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: `friend_request.${friendRequest.status}`,
      recipientUserId: friendRequest.requesterUserId,
      payload: friendRequest,
      createdAt: new Date().toISOString()
    });

    return friendRequest;
  }

  public async createSocialPost(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateSocialPostInput, "authorUserId">
  ) {
    const post = await this.repository.createSocialPost({
      authorUserId: auth.userId,
      content: input.content,
      media: input.media,
      visibility: input.visibility
    });
    const recipientUserIds = Array.from(
      new Set([auth.userId, ...(await this.repository.listFollowerUserIds(auth.userId))])
    );

    for (const recipientUserId of recipientUserIds) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "social.post.created",
        recipientUserId,
        payload: post,
        createdAt: new Date().toISOString()
      });
    }

    return post;
  }

  public listSocialPosts(auth: AuthenticatedAccessContext, input: SocialPostListInput) {
    return this.repository.listSocialPosts(auth.userId, input);
  }

  public async getSocialPost(auth: AuthenticatedAccessContext, postId: number) {
    const post = await this.repository.getSocialPost(auth.userId, postId);

    if (!post) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }

    return post;
  }

  public async getSocialActivityStatus(
    auth: AuthenticatedAccessContext,
    targetUserId: number,
    now: Date = new Date()
  ) {
    const result = await this.repository.getSocialActivityStatus({
      viewerUserId: auth.userId,
      targetUserId,
      since: new Date(now.getTime() - SOCIAL_ACTIVITY_WINDOW_MS)
    });

    if (!result) {
      throw this.notFoundError("error.realtime.social_profile_not_found");
    }

    return result;
  }

  public async createFollow(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateFollowInput, "followerUserId" | "followingUserId"> & { targetUserId: number }
  ) {
    if (auth.userId === input.targetUserId) {
      throw this.validationError("error.realtime.follow_self");
    }

    await this.assertActiveUsers([input.targetUserId]);
    const follow = await this.repository.createFollow({
      followerUserId: auth.userId,
      followingUserId: input.targetUserId
    });
    this.eventGateway.publish({
      id: this.createEventId(),
      type: "follow.created",
      recipientUserId: input.targetUserId,
      payload: follow,
      createdAt: new Date().toISOString()
    });

    return follow;
  }

  public deleteFollow(auth: AuthenticatedAccessContext, targetUserId: number) {
    return this.repository.deleteFollow(auth.userId, targetUserId);
  }

  public listNotifications(auth: AuthenticatedAccessContext, input: NotificationListInput) {
    return this.repository.listNotifications(auth.userId, input);
  }

  public async markNotificationRead(auth: AuthenticatedAccessContext, notificationId: number) {
    const notification = await this.repository.markNotificationRead(auth.userId, notificationId);

    if (!notification) {
      throw this.notFoundError("error.realtime.notification_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "notification.read",
      recipientUserId: auth.userId,
      payload: notification,
      createdAt: new Date().toISOString()
    });

    return notification;
  }

  public markAllNotificationsRead(auth: AuthenticatedAccessContext) {
    return this.repository.markAllNotificationsRead(auth.userId);
  }

  public getUnreadCounts(auth: AuthenticatedAccessContext) {
    return this.repository.getUnreadCounts(auth.userId);
  }

  public streamEvents(auth: AuthenticatedAccessContext, response: Response): void {
    this.eventGateway.subscribe(auth.userId, response);
  }

  public async notifyOrderStatusChanged(input: OrderStatusNotificationInput): Promise<void> {
    const notificationsInput: CreateOrderStatusNotificationInput = {
      actorUserId: input.actorUserId,
      recipientUserIds: input.recipientUserIds,
      orderId: input.orderId,
      orderNo: input.orderNo,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      serviceName: input.serviceName
    };
    const notifications = await this.repository.createOrderStatusNotifications(notificationsInput);

    for (const notification of notifications) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "notification.order_status",
        recipientUserId: notification.recipientUserId,
        payload: notification,
        createdAt: new Date().toISOString()
      });
    }
  }

  private async assertActiveUsers(userIds: number[]): Promise<void> {
    const activeUserIds = await this.repository.findActiveUserIds(userIds);
    const missingUserIds = userIds.filter((userId) => !activeUserIds.includes(userId));

    if (missingUserIds.length > 0) {
      throw this.notFoundError("error.realtime.user_not_found");
    }
  }

  private async publishToConversation(
    conversationId: number,
    type: string,
    payload: unknown,
    senderUserId: number
  ): Promise<void> {
    const conversation = await this.repository.getConversationForUser(conversationId, senderUserId);

    for (const participant of conversation?.participants ?? []) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type,
        recipientUserId: participant.userId,
        payload,
        createdAt: new Date().toISOString()
      });
    }
  }

  private validationError(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 400
    });
  }

  private notFoundError(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message,
      statusCode: 404
    });
  }

  private createEventId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
