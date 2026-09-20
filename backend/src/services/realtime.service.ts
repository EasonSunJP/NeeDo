import type { Response } from "express";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { PRISMA_INT_MAX } from "../constants/database";
import type {
  ConversationPayload,
  CreateConversationInput,
  CreateFriendRequestInput,
  CreateMessageInput,
  CreateNeedoEntityShareInput,
  CreateOrderStatusNotificationInput,
  CreateSocialPostInput,
  ContactCardCandidateListInput,
  FriendRequestListInput,
  DirectorySearchInput,
  DeleteMessagesForUserInput,
  ListMessagesInput,
  MessageReactionMutationInput,
  NotificationListInput,
  RealtimeRepositoryPort,
  SocialPostListInput,
  SocialPostPayload,
  UpdateSocialPostInput,
  UpdateConversationPrivacyInput,
  UpdateConversationPreferencesInput
} from "../repositories/realtime.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";
import type {
  PersonalIdentityActor,
  PersonalIdentityScope
} from "./personal-identity-scope.service";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { UserExperienceService } from "./user-experience.service";
import type { PlatformMembershipBenefitResolverPort } from "./platform-membership.service";
import type { ExchangeCommittedNotification } from "../types/exchange-booking-conversion.types";

const SOCIAL_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isClientAuthoredContactCard(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }
  const record = metadata as Record<string, unknown>;
  return (
    record.needoMessageType === "contact-card" ||
    (record.snapshotVersion === 2 && record.type === "contact-card")
  );
}

export interface OrderStatusNotificationInput {
  actorUserId: number;
  actorIdentityId?: number;
  actorSource?: "customer" | "merchant" | "technician" | "platform" | "system";
  actorDisplayName?: string | null;
  orderId: number;
  orderNo: string;
  fromStatus: string;
  toStatus: string;
  serviceName: string;
  shopName?: string;
  startsAt?: Date;
  reason?: string | null;
  recipientUserIds: number[];
  recipientIdentities?: Array<{ userId: number; identityId: number }>;
}

export type OrderRealtimeChangeType =
  | "status"
  | "add_on"
  | "checkout"
  | "review"
  | "assignment"
  | "timeline_comment";

export interface OrderChangedRealtimeInput {
  actorIdentityId?: number;
  actorUserId: number;
  changeType: OrderRealtimeChangeType;
  orderId: number;
  orderNo: string;
  recipients: Array<{ identityId: number; userId: number }>;
}

export interface OrderStatusNotificationPort {
  notifyOrderStatusChanged: (input: OrderStatusNotificationInput) => Promise<void>;
  notifyOrderChanged?: (input: OrderChangedRealtimeInput) => Promise<void>;
}

export interface ProfileUpdatedNotificationInput {
  userId: number;
  identityId: number;
  includePersonalIdentities: boolean;
}

export interface ProfileUpdatedNotificationPort {
  notifyProfileUpdated: (input: ProfileUpdatedNotificationInput) => Promise<void>;
}

export class RealtimeService
  implements OrderStatusNotificationPort, ProfileUpdatedNotificationPort
{
  public constructor(
    private readonly repository: RealtimeRepositoryPort,
    private readonly eventGateway: RealtimeEventGatewayPort,
    private readonly personalIdentityScope?: {
      resolve: (actor: PersonalIdentityActor) => Promise<PersonalIdentityScope>;
    },
    private readonly userExperienceService?: Pick<UserExperienceService, "recordEvent">,
    private readonly now: () => Date = () => new Date(),
    private readonly membershipBenefitResolver?: PlatformMembershipBenefitResolverPort
  ) {}

  public async notifyProfileUpdated(input: ProfileUpdatedNotificationInput): Promise<void> {
    if (!this.repository.listProfileUpdateRecipients) {
      return;
    }

    try {
      const recipients = await this.repository.listProfileUpdateRecipients(input);
      for (const recipient of recipients) {
        this.eventGateway.publish({
          id: this.createEventId(),
          type: "profile.updated",
          recipientUserId: recipient.userId,
          recipientIdentityId: recipient.identityId,
          payload: { userId: input.userId, identityId: input.identityId },
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
          identityId: input.identityId,
          includePersonalIdentities: input.includePersonalIdentities,
          userId: input.userId
        },
        "Realtime profile publication failed after profile commit"
      );
    }
  }

  public async createConversation(
    auth: AuthenticatedAccessContext,
    input: Omit<
      CreateConversationInput,
      "creatorUserId" | "creatorIdentityId" | "participantIdentities"
    >
  ): Promise<ConversationPayload> {
    const participantUserIds = Array.from(new Set([auth.userId, ...input.participantUserIds]));

    if (input.type === "direct" && participantUserIds.length !== 2) {
      throw this.validationError("error.realtime.direct_conversation_requires_two_users");
    }

    if (input.type === "group" && participantUserIds.length < 2) {
      throw this.validationError("error.realtime.group_conversation_requires_members");
    }

    await this.assertActiveUsers(participantUserIds);
    const scope = await this.resolvePersonalIdentityScope(auth);
    const participantIdentities = await Promise.all(
      participantUserIds.map(async (userId) => ({
        userId,
        identityId:
          userId === auth.userId
            ? scope.identityId
            : await this.requireCanonicalTargetIdentity(userId)
      }))
    );

    const outcome = await this.repository.createConversation({
      creatorUserId: auth.userId,
      creatorIdentityId: scope.identityId,
      type: input.type,
      title: input.title,
      participantUserIds: input.participantUserIds,
      participantIdentities,
      privacyModeEnabled: input.privacyModeEnabled,
      hideMemberProfiles: input.hideMemberProfiles,
      disappearingTtlSeconds: input.disappearingTtlSeconds,
      disappearingStartMode: input.disappearingStartMode
    });
    if (outcome.status === "not_friends") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.not_friends",
        statusCode: 403
      });
    }
    return outcome.conversation;
  }

  public async updateConversationPrivacy(
    auth: AuthenticatedAccessContext,
    input: Omit<UpdateConversationPrivacyInput, "actorUserId">
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const conversation = await this.repository.updateConversationPrivacy({
      ...input,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId
    });

    if (!conversation) {
      throw this.notFoundError("error.realtime.group_conversation_not_found");
    }

    const recipients = this.repository.listConversationRecipients
      ? await this.repository.listConversationRecipients(input.conversationId)
      : conversation.participants.map((participant) => ({
          userId: participant.userId,
          identityId: participant.userId
        }));
    for (const participant of recipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "conversation.privacy.updated",
        recipientUserId: participant.userId,
        recipientIdentityId: participant.identityId,
        payload: conversation,
        createdAt: new Date().toISOString()
      });
    }

    return conversation;
  }

  public async leaveConversation(
    auth: AuthenticatedAccessContext,
    conversationId: number,
    transferOwnerUserId?: number
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const recipients = this.repository.listConversationRecipients
      ? await this.repository.listConversationRecipients(conversationId)
      : [];
    const outcome = await this.repository.leaveConversation({
      conversationId,
      userId: auth.userId,
      identityId: scope.identityId,
      transferOwnerUserId
    });

    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.group_conversation_not_found");
    }
    if (outcome.status === "transfer_required") {
      throw this.validationError("error.realtime.group_owner_transfer_required");
    }
    if (outcome.status === "invalid_transfer") {
      throw this.validationError("error.realtime.group_owner_transfer_invalid");
    }

    const { result } = outcome;

    const eventRecipients =
      recipients.length > 0
        ? recipients
        : result.recipientUserIds.map((userId) => ({ userId, identityId: userId }));
    for (const recipient of eventRecipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: result.dissolved ? "conversation.dissolved" : "conversation.member.left",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: result,
        createdAt: new Date().toISOString()
      });
    }

    return result;
  }

  public async dissolveConversation(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const recipients = this.repository.listConversationRecipients
      ? await this.repository.listConversationRecipients(conversationId)
      : [];
    const result = await this.repository.dissolveConversation({
      conversationId,
      ownerUserId: auth.userId,
      ownerIdentityId: scope.identityId
    });

    if (!result) {
      throw this.notFoundError("error.realtime.group_conversation_not_found");
    }

    const eventRecipients =
      recipients.length > 0
        ? recipients
        : result.recipientUserIds.map((userId) => ({ userId, identityId: userId }));
    for (const recipient of eventRecipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "conversation.dissolved",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: result,
        createdAt: new Date().toISOString()
      });
    }

    return result;
  }

  public async listConversations(auth: AuthenticatedAccessContext, input: PaginationInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.listConversations(scope.identityId, input);
  }

  public async assertMessageSendAllowed(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const eligibility = await this.repository.checkMessageSendEligibility({
      conversationId,
      senderUserId: auth.userId,
      senderIdentityId: scope.identityId
    });
    if (eligibility === "not_found") {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }
    if (eligibility === "recipient_blocked") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.recipient_blocked",
        statusCode: 403
      });
    }
    if (eligibility === "not_friends") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.not_friends",
        statusCode: 403
      });
    }
    return scope;
  }

  public async createMessage(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateMessageInput, "senderUserId">
  ) {
    if (isClientAuthoredContactCard(input.metadata)) {
      throw this.validationError("error.im.contact_card_requires_dedicated_endpoint");
    }
    const scope = await this.assertMessageSendAllowed(auth, input.conversationId);

    const outcome = await this.repository.createMessage({
      ...input,
      senderUserId: auth.userId,
      senderIdentityId: scope.identityId
    });

    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }
    if (outcome.status === "recipient_blocked") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.recipient_blocked",
        statusCode: 403
      });
    }
    if (outcome.status === "not_friends") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.not_friends",
        statusCode: 403
      });
    }
    if (outcome.status === "media_invalid") {
      throw this.validationError("error.im.media_invalid");
    }
    const { message } = outcome;

    try {
      await this.publishToConversation(
        input.conversationId,
        "message.created",
        message,
        auth.userId,
        scope.identityId
      );
    } catch (error) {
      logger.error(
        {
          conversationId: input.conversationId,
          error,
          eventType: "message.created",
          messageId: message.id
        },
        "Realtime message publication failed after message commit"
      );
    }

    return message;
  }

  public async createNeedoEntityShare(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateNeedoEntityShareInput, "actorUserId" | "actorIdentityId">
  ) {
    const scope = await this.assertMessageSendAllowed(auth, input.conversationId);
    const outcome = await this.repository.createNeedoEntityShare({
      ...input,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId
    });
    if (outcome.status === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency_key_reused",
        statusCode: 409
      });
    }
    if (outcome.status === "recipient_not_found") {
      throw this.notFoundError("error.realtime.recipient_not_found");
    }
    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }
    if (outcome.status === "recipient_blocked") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.recipient_blocked",
        statusCode: 403
      });
    }
    if (outcome.status === "not_friends") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.not_friends",
        statusCode: 403
      });
    }
    if (outcome.status !== "created" && outcome.status !== "replayed") {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.internal_server_error",
        statusCode: 500
      });
    }

    if (outcome.status === "created") {
      try {
        await this.publishToConversation(
          input.conversationId,
          "message.created",
          outcome.message,
          auth.userId,
          scope.identityId
        );
      } catch (error) {
        logger.error(
          {
            conversationId: input.conversationId,
            error,
            eventType: "message.created",
            messageId: outcome.message.id
          },
          "Realtime entity-share publication failed after message and share event commit"
        );
      }
    }
    return outcome.receipt;
  }

  public async sendContactCard(
    auth: AuthenticatedAccessContext,
    conversationId: number,
    targetUserPublicId: string,
    idempotencyKey: string
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const outcome = await this.repository.sendContactCard({
      conversationId,
      senderUserId: auth.userId,
      senderIdentityId: scope.identityId,
      targetUserPublicId,
      idempotencyKey
    });
    if (outcome.status === "target_not_found") {
      throw this.notFoundError("error.realtime.user_not_found");
    }
    if (outcome.status === "target_not_allowed") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.contact_card_target_not_allowed",
        statusCode: 403
      });
    }
    if (outcome.status === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency_key_reused",
        statusCode: 409
      });
    }
    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }
    if (outcome.status === "recipient_blocked") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.recipient_blocked",
        statusCode: 403
      });
    }
    if (outcome.status === "not_friends") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.im.not_friends",
        statusCode: 403
      });
    }
    if (outcome.status === "created") {
      await this.publishToConversation(
        conversationId,
        "message.created",
        outcome.message,
        auth.userId,
        scope.identityId
      );
    }
    return { message: outcome.message, replayed: outcome.status === "replayed" };
  }

  public async listMessages(auth: AuthenticatedAccessContext, input: ListMessagesInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const messages = await this.repository.listMessages({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });

    if (!messages) {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }

    return messages;
  }

  public async deleteMessageForUser(
    auth: AuthenticatedAccessContext,
    input: { conversationId: number; messageId: number }
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const deleted = await this.repository.deleteMessageForUser({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!deleted) throw this.notFoundError("error.realtime.message_not_found");
    return deleted;
  }

  public async deleteMessagesForUser(
    auth: AuthenticatedAccessContext,
    input: Omit<DeleteMessagesForUserInput, "userId" | "identityId">
  ) {
    if (
      !Number.isSafeInteger(input.conversationId) ||
      input.conversationId <= 0 ||
      input.conversationId > PRISMA_INT_MAX ||
      input.messageIds.some(
        (messageId) =>
          !Number.isSafeInteger(messageId) || messageId <= 0 || messageId > PRISMA_INT_MAX
      )
    ) {
      throw this.validationError("error.validation_failed");
    }
    const scope = await this.resolvePersonalIdentityScope(auth);
    const deleted = await this.repository.deleteMessagesForUser({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!deleted) throw this.notFoundError("error.realtime.message_not_found");
    return deleted;
  }

  public async setMessageReaction(
    auth: AuthenticatedAccessContext,
    input: Omit<MessageReactionMutationInput, "userId">
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const outcome = await this.repository.setMessageReaction({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.message_not_found");
    }
    if (outcome.status === "slot_occupied") {
      throw new AppError({
        code: ERROR_CODES.MESSAGE_REACTION_SLOT_OCCUPIED,
        message: "error.im.reaction_slot_occupied",
        statusCode: 409
      });
    }

    if (outcome.status === "updated") {
      await this.publishToConversation(
        input.conversationId,
        "message.reaction.updated",
        outcome.message,
        auth.userId,
        scope.identityId
      );
    }
    return outcome.message;
  }

  public async removeMessageReaction(
    auth: AuthenticatedAccessContext,
    input: Omit<MessageReactionMutationInput, "userId">
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const outcome = await this.repository.removeMessageReaction({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.message_not_found");
    }

    if (outcome.status === "updated") {
      await this.publishToConversation(
        input.conversationId,
        "message.reaction.updated",
        outcome.message,
        auth.userId,
        scope.identityId
      );
    }
    return outcome.message;
  }

  public async recallMessage(
    auth: AuthenticatedAccessContext,
    input: { conversationId: number; messageId: number; mode: "standard" }
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const occurredAt = this.now();
    const mode =
      (await this.membershipBenefitResolver?.hasEffectiveBenefitAt(
        auth.userId,
        "traceless_recall",
        occurredAt
      )) === true
        ? "traceless"
        : "standard";
    const outcome = await this.repository.recallMessage({
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderUserId: auth.userId,
      senderIdentityId: scope.identityId,
      mode,
      now: occurredAt
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
        auth.userId,
        scope.identityId
      );
    }

    return {
      action:
        outcome.message.recallMode === "traceless"
          ? ("traceless_recall" as const)
          : ("standard_recall" as const),
      conversationId: input.conversationId,
      messageId: input.messageId,
      message: outcome.message
    };
  }

  public async markConversationRead(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.markConversationRead({
      conversationId,
      userId: auth.userId,
      identityId: scope.identityId
    });

    if (!result) {
      throw this.notFoundError("error.realtime.conversation_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "conversation.read",
      recipientUserId: auth.userId,
      recipientIdentityId: scope.identityId,
      payload: result,
      createdAt: new Date().toISOString()
    });

    return result;
  }

  public async markConversationUnread(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const conversation = await this.repository.markConversationUnread({
      conversationId,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async updateConversationPreferences(
    auth: AuthenticatedAccessContext,
    input: Omit<UpdateConversationPreferencesInput, "userId">
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const conversation = await this.repository.updateConversationPreferences({
      ...input,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async hideConversation(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const conversation = await this.repository.hideConversation({
      conversationId,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async clearConversationMessages(auth: AuthenticatedAccessContext, conversationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const conversation = await this.repository.clearConversationMessages({
      conversationId,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!conversation) throw this.notFoundError("error.realtime.conversation_not_found");
    return conversation;
  }

  public async listContacts(auth: AuthenticatedAccessContext, input: PaginationInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.listContacts(scope.identityId, input);
  }

  public async listContactCardCandidates(
    auth: AuthenticatedAccessContext,
    conversationId: number,
    input: ContactCardCandidateListInput
  ) {
    const scope = await this.assertMessageSendAllowed(auth, conversationId);
    return this.repository.listContactCardCandidates(auth.userId, scope.identityId, input);
  }

  public async searchDirectory(auth: AuthenticatedAccessContext, input: DirectorySearchInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.searchDirectory(auth.userId, {
      ...input,
      ownerIdentityId: scope.identityId
    });
  }

  public async getDirectoryProfile(auth: AuthenticatedAccessContext, targetUserId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const targetIdentityId =
      auth.userId === targetUserId
        ? scope.identityId
        : null;
    const profile = await this.repository.getDirectoryProfile(
      auth.userId,
      scope.identityId,
      targetUserId,
      targetIdentityId
    );
    if (!profile) {
      throw this.notFoundError("error.realtime.user_not_found");
    }
    if (profile.identityCard.entityType !== "technician" && profile.technicianContactDetails) {
      const safeProfile = { ...profile };
      delete safeProfile.technicianContactDetails;
      return safeProfile;
    }
    return profile;
  }

  public async setContactBlocked(
    auth: AuthenticatedAccessContext,
    contactId: number,
    isBlocked: boolean
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const contact = await this.repository.setContactBlocked({
      contactId,
      ownerUserId: auth.userId,
      ownerIdentityId: scope.identityId,
      isBlocked
    });
    if (!contact) throw this.notFoundError("error.realtime.contact_not_found");

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "contact.updated",
      recipientUserId: auth.userId,
      recipientIdentityId: scope.identityId,
      payload: contact,
      createdAt: new Date().toISOString()
    });
    return contact;
  }

  public async deleteContact(auth: AuthenticatedAccessContext, contactId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const contact = await this.repository.deleteContact({
      contactId,
      ownerUserId: auth.userId,
      ownerIdentityId: scope.identityId
    });
    if (!contact) throw this.notFoundError("error.realtime.contact_not_found");

    for (const recipient of [
      { userId: contact.actorUserId, identityId: contact.actorIdentityId },
      { userId: contact.counterpartUserId, identityId: contact.counterpartIdentityId }
    ]) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "friendship.deleted",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: contact,
        createdAt: new Date().toISOString()
      });
    }
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
    const scope = await this.resolvePersonalIdentityScope(auth);
    const targetIdentityId = await this.requireCanonicalTargetIdentity(input.targetUserId);
    const outcome = await this.repository.createFriendRequest({
      requesterUserId: auth.userId,
      requesterIdentityId: scope.identityId,
      targetUserId: input.targetUserId,
      targetIdentityId,
      message: input.message
    });
    if (outcome.status === "target_unavailable") {
      throw this.notFoundError("error.realtime.user_not_found");
    }
    if (outcome.status === "already_friends") {
      throw this.validationError("error.realtime.already_friends");
    }
    if (outcome.result.created) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "friend_request.created",
        recipientUserId: input.targetUserId,
        recipientIdentityId: targetIdentityId,
        payload: outcome.result.friendRequest,
        createdAt: new Date().toISOString()
      });
    }

    return outcome.result;
  }

  public async listFriendRequests(auth: AuthenticatedAccessContext, input: FriendRequestListInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.listFriendRequests(scope.identityId, input);
  }

  public async respondToFriendRequest(
    auth: AuthenticatedAccessContext,
    id: number,
    action: "accept" | "reject"
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const outcome = await this.repository.respondToFriendRequest({
      id,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId,
      action
    });

    if (outcome.status === "not_found") {
      throw this.notFoundError("error.realtime.friend_request_not_found");
    }
    if (outcome.status === "expired") {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.realtime.friend_request_expired",
        statusCode: 409
      });
    }

    const request = outcome.result.friendRequest;
    for (const recipient of [
      { userId: request.requesterUserId, identityId: request.requesterIdentityId },
      { userId: request.targetUserId, identityId: request.targetIdentityId }
    ]) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: `friend_request.${outcome.result.friendRequest.status}`,
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: outcome.result.friendRequest,
        createdAt: new Date().toISOString()
      });
      if (outcome.result.friendRequest.status === "accepted") {
        for (const type of ["contact.updated", "social.follow.updated"] as const) {
          this.eventGateway.publish({
            id: this.createEventId(),
            type,
            recipientUserId: recipient.userId,
            recipientIdentityId: recipient.identityId,
            payload: outcome.result.friendRequest,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return outcome.result.friendRequest;
  }

  public async createSocialPost(
    auth: AuthenticatedAccessContext,
    input: Omit<CreateSocialPostInput, "authorUserId" | "context">,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.createSocialPost({
      authorUserId: auth.userId,
      authorIdentityId: scope.identityId,
      content: input.content,
      media: input.media,
      mentionUserIds: input.mentionUserIds,
      visibility: input.visibility,
      context
    });
    const followerRecipients = this.repository.listFollowerRecipients
      ? await this.repository.listFollowerRecipients(scope.identityId)
      : (await this.repository.listFollowerUserIds(auth.userId)).map((userId) => ({
          userId,
          identityId: userId
        }));
    const recipients = [
      { userId: auth.userId, identityId: scope.identityId },
      ...followerRecipients
    ].filter(
      (recipient, index, all) =>
        all.findIndex((candidate) => candidate.identityId === recipient.identityId) === index
    );

    for (const notification of result.notifications) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "notification.created",
        recipientUserId: notification.recipientUserId,
        recipientIdentityId: notification.recipientIdentityId,
        payload: notification,
        createdAt: new Date().toISOString()
      });
    }

    for (const recipient of recipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "social.post.created",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: result.post,
        createdAt: new Date().toISOString()
      });
    }

    return result.post;
  }

  public async updateSocialPost(
    auth: AuthenticatedAccessContext,
    postId: number,
    input: Omit<UpdateSocialPostInput, "postId" | "authorUserId" | "context">,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.updateSocialPost({
      postId,
      authorUserId: auth.userId,
      authorIdentityId: scope.identityId,
      content: input.content,
      media: input.media,
      mentionUserIds: input.mentionUserIds,
      visibility: input.visibility,
      context
    });
    if (!result) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }

    const followerRecipients = this.repository.listFollowerRecipients
      ? await this.repository.listFollowerRecipients(scope.identityId)
      : (await this.repository.listFollowerUserIds(auth.userId)).map((userId) => ({
          userId,
          identityId: userId
        }));
    const recipients = [
      { userId: auth.userId, identityId: scope.identityId },
      ...followerRecipients
    ].filter(
      (recipient, index, all) =>
        all.findIndex((candidate) => candidate.identityId === recipient.identityId) === index
    );
    for (const notification of result.notifications) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "notification.created",
        recipientUserId: notification.recipientUserId,
        recipientIdentityId: notification.recipientIdentityId,
        payload: notification,
        createdAt: new Date().toISOString()
      });
    }
    for (const recipient of recipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "social.post.updated",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: result.post,
        createdAt: new Date().toISOString()
      });
    }

    return result.post;
  }

  public async setSocialPostPin(
    auth: AuthenticatedAccessContext,
    postId: number,
    active: boolean,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const post = await this.repository.setSocialPostPin({
      postId,
      authorUserId: auth.userId,
      authorIdentityId: scope.identityId,
      active,
      context
    });
    if (!post) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "social.post.updated",
      recipientUserId: auth.userId,
      recipientIdentityId: scope.identityId,
      payload: post,
      createdAt: new Date().toISOString()
    });
    return post;
  }

  public async listSocialPosts(auth: AuthenticatedAccessContext, input: SocialPostListInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.listSocialPosts(
      scope.identityId,
      input.authorUserId === auth.userId && !input.authorIdentityId
        ? { ...input, authorIdentityId: scope.identityId }
        : input,
      auth.userId
    );
  }

  public async getSocialPost(auth: AuthenticatedAccessContext, postId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const post = await this.repository.getSocialPost(scope.identityId, postId, auth.userId);

    if (!post) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }

    return post;
  }

  public async setSocialPostLike(
    auth: AuthenticatedAccessContext,
    postId: number,
    active: boolean,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const occurredAt = this.now();
    const result = await this.repository.setSocialPostLike({
      postId,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId,
      active,
      context,
      onActiveLike: this.userExperienceService
        ? ({ transactionClient, postId: persistedPostId, authorUserId, actorUserId }) =>
            this.userExperienceService!.recordEvent(
              {
                userId: authorUserId,
                eventType: "social_post_liked",
                sourceType: "social_post_like",
                sourcePublicId: String(persistedPostId),
                idempotencyKey: `social-post-like:${persistedPostId}:${actorUserId}`,
                baseUnits: 10_000n,
                occurredAt
              },
              { transactionClient }
            ).then(() => undefined)
        : undefined
    });
    if (!result) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }
    if (result.changed) {
      await this.publishSocialPostInteraction(result.post, {
        userId: auth.userId,
        identityId: scope.identityId
      });
    }
    return result.post;
  }

  public async setSocialPostBookmark(
    auth: AuthenticatedAccessContext,
    postId: number,
    active: boolean,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.setSocialPostBookmark({
      postId,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId,
      active,
      context
    });
    if (!result) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }
    if (result.changed) {
      await this.publishSocialPostInteraction(result.post, {
        userId: auth.userId,
        identityId: scope.identityId
      });
    }
    return result.post;
  }

  public async recordSocialPostView(
    auth: AuthenticatedAccessContext,
    postId: number,
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.recordSocialPostView({
      postId,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId,
      context
    });
    if (!result) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }
    if (result.changed) {
      await this.publishSocialPostInteraction(result.post, {
        userId: auth.userId,
        identityId: scope.identityId
      });
    }
    return result.post;
  }

  public async shareSocialPost(
    auth: AuthenticatedAccessContext,
    postId: number,
    input: { targetUserIds: number[]; idempotencyKey: string },
    context: AuthRequestContext
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const result = await this.repository.shareSocialPost({
      postId,
      actorUserId: auth.userId,
      actorIdentityId: scope.identityId,
      targetUserIds: input.targetUserIds,
      idempotencyKey: input.idempotencyKey,
      context
    });
    if (!result) {
      throw this.notFoundError("error.realtime.social_post_not_found");
    }

    for (const delivery of result.deliveries.filter((item) => item.created)) {
      for (const recipient of [
        { userId: auth.userId, identityId: scope.identityId },
        { userId: delivery.recipientUserId, identityId: delivery.recipientIdentityId }
      ]) {
        this.eventGateway.publish({
          id: this.createEventId(),
          type: "message.created",
          recipientUserId: recipient.userId,
          recipientIdentityId: recipient.identityId,
          payload: delivery.message,
          createdAt: new Date().toISOString()
        });
      }
    }
    if (result.changed) {
      await this.publishSocialPostInteraction(result.post, {
        userId: auth.userId,
        identityId: scope.identityId
      });
    }
    return {
      post: result.post,
      deliveredUserIds: result.deliveries.map((delivery) => delivery.recipientUserId)
    };
  }

  public async getSocialActivityStatus(
    auth: AuthenticatedAccessContext,
    targetUserId: number,
    requestedTargetIdentityId?: number,
    now: Date = new Date()
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const targetIdentityId =
      requestedTargetIdentityId ?? (targetUserId === auth.userId
        ? scope.identityId
        : await this.repository.findCanonicalIdentityIdForUser(targetUserId));
    if (!targetIdentityId) {
      throw this.notFoundError("error.realtime.social_profile_not_found");
    }
    const result = await this.repository.getSocialActivityStatus({
      viewerUserId: auth.userId,
      viewerIdentityId: scope.identityId,
      targetUserId,
      targetIdentityId,
      since: new Date(now.getTime() - SOCIAL_ACTIVITY_WINDOW_MS)
    });

    if (!result) {
      throw this.notFoundError("error.realtime.social_profile_not_found");
    }

    return result;
  }

  public async createFollow(
    auth: AuthenticatedAccessContext,
    input: { targetUserId: number; targetIdentityId?: number }
  ) {
    if (auth.userId === input.targetUserId) {
      throw this.validationError("error.realtime.follow_self");
    }

    await this.assertActiveUsers([input.targetUserId]);
    const scope = await this.resolvePersonalIdentityScope(auth);
    const targetIdentityId = await this.requireTargetIdentity(
      input.targetUserId,
      input.targetIdentityId
    );
    const follow = await this.repository.createFollow({
      followerUserId: auth.userId,
      followerIdentityId: scope.identityId,
      followingUserId: input.targetUserId,
      followingIdentityId: targetIdentityId
    });
    this.eventGateway.publish({
      id: this.createEventId(),
      type: "follow.created",
      recipientUserId: input.targetUserId,
      recipientIdentityId: targetIdentityId,
      payload: follow,
      createdAt: new Date().toISOString()
    });

    return follow;
  }

  public async deleteFollow(
    auth: AuthenticatedAccessContext,
    targetUserId: number,
    requestedTargetIdentityId?: number
  ) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const targetIdentityId = await this.requireTargetIdentity(
      targetUserId,
      requestedTargetIdentityId
    );
    return this.repository.deleteFollow(scope.identityId, targetIdentityId);
  }

  public async listNotifications(auth: AuthenticatedAccessContext, input: NotificationListInput) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.listNotifications(scope.identityId, input);
  }

  public async markNotificationRead(auth: AuthenticatedAccessContext, notificationId: number) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    const notification = await this.repository.markNotificationRead(
      scope.identityId,
      notificationId
    );

    if (!notification) {
      throw this.notFoundError("error.realtime.notification_not_found");
    }

    this.eventGateway.publish({
      id: this.createEventId(),
      type: "notification.read",
      recipientUserId: auth.userId,
      recipientIdentityId: scope.identityId,
      payload: notification,
      createdAt: new Date().toISOString()
    });

    return notification;
  }

  public async markAllNotificationsRead(auth: AuthenticatedAccessContext) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.markAllNotificationsRead(scope.identityId);
  }

  public async getUnreadCounts(auth: AuthenticatedAccessContext) {
    const scope = await this.resolvePersonalIdentityScope(auth);
    return this.repository.getUnreadCounts(scope.identityId);
  }

  public async streamEvents(auth: AuthenticatedAccessContext, response: Response): Promise<void> {
    const scope = await this.resolvePersonalIdentityScope(auth);
    await this.eventGateway.subscribe(scope.identityId, response);
  }

  public async notifyOrderStatusChanged(input: OrderStatusNotificationInput): Promise<void> {
    const notificationsInput: CreateOrderStatusNotificationInput = {
      actorUserId: input.actorUserId,
      actorIdentityId: input.actorIdentityId,
      actorSource: input.actorSource,
      actorDisplayName: input.actorDisplayName,
      recipientUserIds: input.recipientUserIds,
      recipientIdentities: input.recipientIdentities,
      orderId: input.orderId,
      orderNo: input.orderNo,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      serviceName: input.serviceName,
      shopName: input.shopName,
      startsAt: input.startsAt,
      reason: input.reason
    };
    const notifications = await this.repository.createOrderStatusNotifications(notificationsInput);

    for (const notification of notifications) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "notification.order_status",
        recipientUserId: notification.recipientUserId,
        recipientIdentityId: notification.recipientIdentityId,
        payload: notification,
        createdAt: new Date().toISOString()
      });
    }
  }

  public async publishCommittedNotifications(
    notifications: ExchangeCommittedNotification[]
  ): Promise<void> {
    for (const notification of notifications) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "notification.created",
        recipientUserId: notification.recipientUserId,
        recipientIdentityId: notification.recipientIdentityId,
        payload: notification,
        createdAt: notification.createdAt.toISOString()
      });
    }
  }

  public async notifyOrderChanged(input: OrderChangedRealtimeInput): Promise<void> {
    const recipients = new Map<number, { identityId: number; userId: number }>();
    for (const recipient of input.recipients) {
      if (recipient.identityId === input.actorIdentityId) continue;
      recipients.set(recipient.identityId, recipient);
    }

    for (const recipient of recipients.values()) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "booking.order_changed",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: {
          orderId: input.orderId,
          orderNo: input.orderNo,
          changeType: input.changeType
        },
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

  private resolvePersonalIdentityScope(
    auth: AuthenticatedAccessContext
  ): Promise<PersonalIdentityScope> {
    if (this.personalIdentityScope) {
      return this.personalIdentityScope.resolve(auth);
    }

    return Promise.resolve({
      identityId: auth.currentIdentityId ?? auth.userId,
      userId: auth.userId,
      identityType: auth.currentIdentityType ?? "customer",
      scopeType: auth.currentIdentityScopeType ?? null,
      scopeId: auth.currentIdentityScopeId ?? null
    });
  }

  private async requireCanonicalTargetIdentity(userId: number): Promise<number> {
    const identityId = await this.repository.findCanonicalIdentityIdForUser(userId);
    if (!identityId) {
      throw this.notFoundError("error.realtime.user_not_found");
    }
    return identityId;
  }

  private async requireTargetIdentity(userId: number, identityId?: number): Promise<number> {
    if (identityId === undefined) {
      return this.requireCanonicalTargetIdentity(userId);
    }

    const resolvedIdentityId = await this.repository.findIdentityIdForUser(userId, identityId);
    if (!resolvedIdentityId) {
      throw this.notFoundError("error.realtime.user_not_found");
    }
    return resolvedIdentityId;
  }

  private async publishToConversation(
    conversationId: number,
    type: string,
    payload: unknown,
    senderUserId: number,
    senderIdentityId: number
  ): Promise<void> {
    const recipients = this.repository.listConversationRecipients
      ? await this.repository.listConversationRecipients(conversationId)
      : ((
          await this.repository.getConversationForUser(
            conversationId,
            senderIdentityId,
            senderUserId
          )
        )?.participants.map((participant) => ({
          userId: participant.userId,
          identityId: participant.userId
        })) ?? []);

    for (const participant of recipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type,
        recipientUserId: participant.userId,
        recipientIdentityId: participant.identityId,
        payload,
        createdAt: new Date().toISOString()
      });
    }
  }

  private async publishSocialPostInteraction(
    post: SocialPostPayload,
    actor: { userId: number; identityId: number }
  ): Promise<void> {
    const followerRecipients = this.repository.listFollowerRecipients
      ? await this.repository.listFollowerRecipients(post.authorIdentityId)
      : (await this.repository.listFollowerUserIds(post.authorUserId)).map((userId) => ({
          userId,
          identityId: userId
        }));
    const recipients = [
      actor,
      { userId: post.authorUserId, identityId: post.authorIdentityId },
      ...followerRecipients
    ].filter(
      (recipient, index, all) =>
        all.findIndex((candidate) => candidate.identityId === recipient.identityId) === index
    );

    for (const recipient of recipients) {
      this.eventGateway.publish({
        id: this.createEventId(),
        type: "social.post.interaction.updated",
        recipientUserId: recipient.userId,
        recipientIdentityId: recipient.identityId,
        payload: post,
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
