import {
  ConversationAccessPolicy,
  ConversationType,
  FriendRequestStatus,
  ImDeletionAction,
  MessageRecallMode,
  MessageType,
  NotificationType,
  Prisma,
  SocialPostVisibility
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { EnsureTechnicianApplicationContactInput } from "../services/technician-application-review.service";
import { AppError } from "../utils/app-error";

export type ConversationTypePayload = "direct" | "group";
export type MessageTypePayload = "text" | "system" | "orderStatus";
export type MessageRecallModePayload = "standard" | "traceless";
export type FriendRequestStatusPayload = "pending" | "accepted" | "rejected" | "expired";
export type SocialPostVisibilityPayload = "public" | "followers";
export type NotificationTypePayload = "orderStatus" | "friendRequest" | "system" | "social";

export function toFriendshipPairKey(leftUserId: number, rightUserId: number): string {
  const [lowUserId, highUserId] = [leftUserId, rightUserId].sort(
    (left, right) => left - right
  );
  return `${lowUserId}:${highUserId}`;
}

export interface ParticipantPayload {
  userId: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
  role?: "owner" | "admin" | "member";
}

export interface ConversationPayload {
  id: number;
  type: ConversationTypePayload;
  title: string | null;
  participants: ParticipantPayload[];
  lastMessage: MessagePayload | null;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isHidden: boolean;
  privacyModeEnabled: boolean;
  hideMemberProfiles: boolean;
  disappearingTtlSeconds: number | null;
  disappearingStartMode: "sent" | "read_by_all";
  privacyPolicyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagePayload {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  type: MessageTypePayload;
  content: string | null;
  metadata: unknown;
  reactions: MessageReactionSummaryPayload[];
  createdAt: Date;
  recallDeadlineAt: Date;
  recalledAt: Date | null;
  recallMode: MessageRecallModePayload | null;
  contentPurgedAt: Date | null;
  lifecycleVersion: number;
  reactionVersion: number;
  availableRecallModes: MessageRecallModePayload[];
}

export interface MessageReactionPersonPayload {
  userId: number;
  username: string;
  avatarUrl: string | null;
}

export interface MessageReactionSummaryPayload {
  emoji: string;
  people: MessageReactionPersonPayload[];
  reactedByMe: boolean;
}

export interface MessageHistoryPayload extends PaginatedResponse<MessagePayload> {
  nextCursor: number | null;
}

export interface ContactPayload {
  id: number;
  ownerUserId: number;
  contactUserId: number;
  contactUser: ParticipantPayload;
  nickname: string | null;
  source: string;
  isBlocked: boolean;
  createdAt: Date;
}

export interface SetContactBlockedInput {
  contactId: number;
  ownerUserId: number;
  isBlocked: boolean;
}

export interface DeleteContactInput {
  contactId: number;
  ownerUserId: number;
}

export interface DeletedContactPayload {
  contactId: number;
  ownerUserId: number;
  contactUserId: number;
  deleted: true;
  deletedAt: Date;
}

export interface DirectorySearchInput extends PaginationInput {
  query: string;
}

export interface AddContactInput {
  contactUserId: number;
  ownerUserId: number;
  source: "manual";
}

export interface FriendRequestPayload {
  id: number;
  requesterUserId: number;
  targetUserId: number;
  requester: ParticipantPayload;
  target: ParticipantPayload;
  status: FriendRequestStatusPayload;
  message: string | null;
  respondedAt: Date | null;
  expiresAt: Date;
  expiredAt: Date | null;
  createdAt: Date;
}

export interface CreateFriendRequestResult {
  friendRequest: FriendRequestPayload;
  created: boolean;
}

export type CreateFriendRequestOutcome =
  | { status: "ready"; result: CreateFriendRequestResult }
  | { status: "already_friends" }
  | { status: "target_unavailable" };

export interface DirectoryProfilePayload {
  user: ParticipantPayload;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending";
  contactId: number | null;
  friendRequest: FriendRequestPayload | null;
}

export interface RespondFriendRequestResult {
  friendRequest: FriendRequestPayload;
  recipientUserIds: number[];
}

export type RespondFriendRequestOutcome =
  | { status: "responded"; result: RespondFriendRequestResult }
  | { status: "expired"; friendRequest: FriendRequestPayload }
  | { status: "not_found" };

export interface SocialPostAuthorPayload {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  entityType: "user" | "technician" | "shop";
  joinedAt: Date;
}

export type SocialActivityStatus = "recent_posts" | "no_recent_posts";

export interface SocialActivityStatusPayload {
  status: SocialActivityStatus;
  profile: SocialPostAuthorPayload;
  latestVisiblePostAt: Date | null;
}

export interface SocialPostPayload {
  id: number;
  authorUserId: number;
  content: string;
  media: unknown;
  visibility: SocialPostVisibilityPayload;
  createdAt: Date;
  updatedAt: Date;
  author: SocialPostAuthorPayload;
  viewerFollowsAuthor: boolean;
  authorFollowsViewer: boolean;
  viewerIsFriend: boolean;
}

type SocialRelationshipMap = {
  follows: Set<string>;
  friendUserIds: Set<number>;
};

export interface FollowPayload {
  id: number;
  followerUserId: number;
  followingUserId: number;
  createdAt: Date;
}

export interface NotificationPayload {
  id: number;
  recipientUserId: number;
  actorUserId: number | null;
  type: NotificationTypePayload;
  title: string;
  body: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export interface UnreadCountsPayload {
  conversations: number;
  notifications: number;
  friendRequests: number;
  total: number;
}

export interface CreateConversationInput {
  creatorUserId: number;
  type: ConversationTypePayload;
  title?: string | null;
  participantUserIds: number[];
  privacyModeEnabled?: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
}

export interface UpdateConversationPrivacyInput {
  actorUserId: number;
  conversationId: number;
  privacyModeEnabled: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
}

export interface LeaveConversationInput {
  conversationId: number;
  userId: number;
  transferOwnerUserId?: number;
}

export interface LeaveConversationPayload {
  conversationId: number;
  removedUserId: number;
  newOwnerUserId: number | null;
  dissolved: boolean;
  recipientUserIds: number[];
}

export type LeaveConversationOutcome =
  | { status: "left"; result: LeaveConversationPayload }
  | { status: "not_found" }
  | { status: "transfer_required" }
  | { status: "invalid_transfer" };

export interface ListMessagesInput {
  conversationId: number;
  userId: number;
  beforeId?: number;
  pageSize?: number;
}

export interface CreateMessageInput {
  conversationId: number;
  senderUserId: number;
  type: MessageTypePayload;
  content: string;
  metadata?: unknown;
}

export interface RecallMessageInput {
  conversationId: number;
  messageId: number;
  senderUserId: number;
  now: Date;
}

export type StandardRecallRepositoryOutcome =
  | { status: "recalled" | "already_recalled"; message: MessagePayload }
  | { status: "not_found" | "window_expired" };

export interface MessageReactionMutationInput {
  conversationId: number;
  messageId: number;
  userId: number;
  emoji: string;
}

export interface DeleteMessageForUserInput {
  conversationId: number;
  messageId: number;
  userId: number;
}

export interface DeleteMessageForUserPayload {
  conversationId: number;
  messageId: number;
  deleted: true;
}

export interface UpdateConversationPreferencesInput {
  conversationId: number;
  userId: number;
  isPinned?: boolean;
  isMuted?: boolean;
}

export interface FriendRequestListInput extends PaginationInput {
  status?: FriendRequestStatusPayload;
  direction?: "incoming" | "outgoing" | "all";
}

export interface CreateFriendRequestInput {
  requesterUserId: number;
  targetUserId: number;
  message?: string | null;
}

export interface RespondFriendRequestInput {
  id: number;
  actorUserId: number;
  action: "accept" | "reject";
}

export interface CreateSocialPostInput {
  authorUserId: number;
  content: string;
  media?: CreateSocialPostMediaEnvelope;
  mentionUserIds: number[];
  visibility: SocialPostVisibilityPayload;
  context: AuthRequestContext;
}

export interface CreateSocialPostMediaItem {
  id: string;
  type: "image";
  mediaAssetPublicId: string;
  alt?: string;
}

export interface CreateSocialPostMediaEnvelope {
  items: CreateSocialPostMediaItem[];
  quotePostId?: number;
  replyToPostId?: number;
  repostPostId?: number;
  postType?: "post" | "reply" | "quote" | "repost" | "announcement" | "technician-daily";
  locationLabel?: string;
}

export interface CreateSocialPostResult {
  post: SocialPostPayload;
  notifications: NotificationPayload[];
}

export interface UpdateSocialPostInput extends CreateSocialPostInput {
  postId: number;
}

export type UpdateSocialPostResult = CreateSocialPostResult;

export interface SocialPostListInput extends PaginationInput {
  authorUserId?: number;
}

export interface SocialActivityStatusInput {
  viewerUserId: number;
  targetUserId: number;
  since: Date;
}

export interface CreateFollowInput {
  followerUserId: number;
  followingUserId: number;
}

export interface NotificationListInput extends PaginationInput {
  unreadOnly?: boolean;
}

export interface CreateOrderStatusNotificationInput {
  recipientUserIds: number[];
  actorUserId: number;
  orderId: number;
  orderNo: string;
  fromStatus: string;
  toStatus: string;
  serviceName: string;
}

export interface RealtimeRepositoryPort {
  findActiveUserIds: (ids: number[]) => Promise<number[]>;
  createConversation: (input: CreateConversationInput) => Promise<ConversationPayload>;
  updateConversationPrivacy: (
    input: UpdateConversationPrivacyInput
  ) => Promise<ConversationPayload | null>;
  leaveConversation: (
    input: LeaveConversationInput
  ) => Promise<LeaveConversationOutcome>;
  dissolveConversation: (input: {
    conversationId: number;
    ownerUserId: number;
  }) => Promise<LeaveConversationPayload | null>;
  getConversationForUser: (
    conversationId: number,
    userId: number
  ) => Promise<ConversationPayload | null>;
  listConversations: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ConversationPayload>>;
  createMessage: (input: CreateMessageInput) => Promise<MessagePayload | null>;
  isMessageSenderBlocked: (conversationId: number, senderUserId: number) => Promise<boolean>;
  recallMessage: (input: RecallMessageInput) => Promise<StandardRecallRepositoryOutcome>;
  listMessages: (input: ListMessagesInput) => Promise<MessageHistoryPayload | null>;
  deleteMessageForUser: (
    input: DeleteMessageForUserInput
  ) => Promise<DeleteMessageForUserPayload | null>;
  setMessageReaction: (input: MessageReactionMutationInput) => Promise<MessagePayload | null>;
  removeMessageReaction: (input: MessageReactionMutationInput) => Promise<MessagePayload | null>;
  markConversationRead: (input: {
    conversationId: number;
    userId: number;
  }) => Promise<{ conversationId: number; unreadCount: number } | null>;
  markConversationUnread: (input: {
    conversationId: number;
    userId: number;
  }) => Promise<ConversationPayload | null>;
  updateConversationPreferences: (
    input: UpdateConversationPreferencesInput
  ) => Promise<ConversationPayload | null>;
  hideConversation: (input: {
    conversationId: number;
    userId: number;
  }) => Promise<ConversationPayload | null>;
  clearConversationMessages: (input: {
    conversationId: number;
    userId: number;
  }) => Promise<ConversationPayload | null>;
  listContacts: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ContactPayload>>;
  searchDirectory: (
    userId: number,
    input: DirectorySearchInput
  ) => Promise<PaginatedResponse<ParticipantPayload>>;
  addContact: (input: AddContactInput) => Promise<ContactPayload>;
  setContactBlocked: (input: SetContactBlockedInput) => Promise<ContactPayload | null>;
  deleteContact: (input: DeleteContactInput) => Promise<DeletedContactPayload | null>;
  ensureDirectContactConversation: (
    input: EnsureTechnicianApplicationContactInput
  ) => Promise<{ conversationId: number }>;
  getDirectoryProfile: (
    viewerUserId: number,
    targetUserId: number
  ) => Promise<DirectoryProfilePayload | null>;
  createFriendRequest: (input: CreateFriendRequestInput) => Promise<CreateFriendRequestOutcome>;
  listFriendRequests: (
    userId: number,
    input: FriendRequestListInput
  ) => Promise<PaginatedResponse<FriendRequestPayload>>;
  respondToFriendRequest: (
    input: RespondFriendRequestInput
  ) => Promise<RespondFriendRequestOutcome>;
  expireDueFriendRequests: (input: {
    batchSize: number;
  }) => Promise<FriendRequestPayload[]>;
  createSocialPost: (input: CreateSocialPostInput) => Promise<CreateSocialPostResult>;
  updateSocialPost: (input: UpdateSocialPostInput) => Promise<UpdateSocialPostResult | null>;
  listSocialPosts: (
    userId: number,
    input: SocialPostListInput
  ) => Promise<PaginatedResponse<SocialPostPayload>>;
  getSocialPost: (userId: number, postId: number) => Promise<SocialPostPayload | null>;
  getSocialActivityStatus: (
    input: SocialActivityStatusInput
  ) => Promise<SocialActivityStatusPayload | null>;
  listFollowerUserIds: (followingUserId: number) => Promise<number[]>;
  createFollow: (input: CreateFollowInput) => Promise<FollowPayload>;
  deleteFollow: (followerUserId: number, followingUserId: number) => Promise<{ deleted: boolean }>;
  listNotifications: (
    userId: number,
    input: NotificationListInput
  ) => Promise<PaginatedResponse<NotificationPayload>>;
  markNotificationRead: (
    userId: number,
    notificationId: number
  ) => Promise<NotificationPayload | null>;
  markAllNotificationsRead: (userId: number) => Promise<{ count: number }>;
  getUnreadCounts: (userId: number) => Promise<UnreadCountsPayload>;
  createOrderStatusNotifications: (
    input: CreateOrderStatusNotificationInput
  ) => Promise<NotificationPayload[]>;
}

const messageInclude = {
  reactions: {
    where: { deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: "asc" as const }
  }
} satisfies Prisma.MessageInclude;

const socialAuthorSelect = {
  id: true,
  username: true,
  avatarUrl: true,
  createdAt: true,
  identities: {
    where: { deletedAt: null, isActive: true },
    select: { type: true, displayName: true, isDefault: true },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.UserSelect;

const socialPostInclude = {
  author: {
    select: socialAuthorSelect
  }
} satisfies Prisma.SocialPostInclude;

const contactInclude = {
  contactUser: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
  }
} satisfies Prisma.ContactInclude;

const friendRequestInclude = {
  requester: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
  },
  target: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
  }
} satisfies Prisma.FriendRequestInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{
  include: {
    participants: {
      include: {
        user: {
          select: {
            id: true;
            needoId: true;
            username: true;
            avatarUrl: true;
          };
        };
      };
    };
    messages: {
      include: typeof messageInclude;
    };
  };
}>;

type MessageRecord = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type ContactRecord = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
type FriendRequestRecord = Prisma.FriendRequestGetPayload<{
  include: typeof friendRequestInclude;
}>;
type SocialAuthorRecord = Prisma.UserGetPayload<{ select: typeof socialAuthorSelect }>;
type SocialPostRecord = Prisma.SocialPostGetPayload<{ include: typeof socialPostInclude }>;
type FollowRecord = Prisma.FollowGetPayload<Record<string, never>>;
type NotificationRecord = Prisma.NotificationGetPayload<Record<string, never>>;

export class RealtimeRepository implements RealtimeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveUserIds(ids: number[]): Promise<number[]> {
    const uniqueIds = Array.from(new Set(ids));
    const users = await this.client.user.findMany({
      where: {
        id: { in: uniqueIds },
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });

    return users.map((user) => user.id);
  }

  public async createConversation(input: CreateConversationInput): Promise<ConversationPayload> {
    const participantUserIds = Array.from(
      new Set([input.creatorUserId, ...input.participantUserIds])
    ).sort((left, right) => left - right);
    const existingDirect =
      input.type === "direct"
        ? await this.findExistingDirectConversation(participantUserIds)
        : null;

    if (existingDirect) {
      await this.client.conversationParticipant.updateMany({
        where: {
          conversationId: existingDirect.id,
          userId: input.creatorUserId,
          deletedAt: null
        },
        data: { hiddenAt: null }
      });
      return (
        (await this.getConversationForUser(existingDirect.id, input.creatorUserId)) ??
        this.mapConversation(existingDirect, input.creatorUserId)
      );
    }

    const conversation = await this.client.conversation.create({
      data: {
        type: this.conversationTypeToDb(input.type),
        accessPolicy:
          input.type === "group"
            ? ConversationAccessPolicy.GROUP_MEMBERSHIP
            : ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        friendshipPairKey:
          input.type === "direct"
            ? toFriendshipPairKey(participantUserIds[0]!, participantUserIds[1]!)
            : null,
        title: input.title?.trim() || null,
        createdByUserId: input.creatorUserId,
        privacyModeEnabled: input.type === "group" && Boolean(input.privacyModeEnabled),
        hideMemberProfiles: input.type === "group" && Boolean(input.hideMemberProfiles),
        disappearingTtlSeconds:
          input.type === "group" && input.privacyModeEnabled
            ? (input.disappearingTtlSeconds ?? null)
            : null,
        disappearingStartMode:
          input.type === "group" && input.privacyModeEnabled
            ? (input.disappearingStartMode ?? "sent")
            : "sent",
        privacyPolicyVersion: input.type === "group" && input.privacyModeEnabled ? 1 : 0,
        privacyUpdatedAt: input.type === "group" && input.privacyModeEnabled ? new Date() : null,
        privacyUpdatedByUserId:
          input.type === "group" && input.privacyModeEnabled ? input.creatorUserId : null,
        participants: {
          create: participantUserIds.map((userId) => ({
            userId,
            role: userId === input.creatorUserId ? "owner" : "member"
          }))
        }
      },
      include: this.conversationInclude(input.creatorUserId)
    });

    return this.mapConversation(conversation, input.creatorUserId);
  }

  public async updateConversationPrivacy(
    input: UpdateConversationPrivacyInput
  ): Promise<ConversationPayload | null> {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.actorUserId,
          role: "owner",
          deletedAt: null,
          conversation: {
            type: ConversationType.GROUP,
            deletedAt: null
          }
        },
        select: { id: true }
      });

      if (!actor) {
        return null;
      }

      const updated = await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          privacyModeEnabled: input.privacyModeEnabled,
          hideMemberProfiles: input.hideMemberProfiles ?? false,
          disappearingTtlSeconds: input.privacyModeEnabled
            ? (input.disappearingTtlSeconds ?? null)
            : null,
          disappearingStartMode: input.privacyModeEnabled
            ? (input.disappearingStartMode ?? "sent")
            : "sent",
          privacyPolicyVersion: { increment: 1 },
          privacyUpdatedAt: new Date(),
          privacyUpdatedByUserId: input.actorUserId
        },
        include: this.conversationInclude(input.actorUserId)
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action: "im.conversation.privacy_updated",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: {
            privacyModeEnabled: input.privacyModeEnabled,
            hideMemberProfiles: input.hideMemberProfiles ?? false,
            disappearingTtlSeconds: input.privacyModeEnabled
              ? (input.disappearingTtlSeconds ?? null)
              : null,
            disappearingStartMode: input.privacyModeEnabled
              ? (input.disappearingStartMode ?? "sent")
              : "sent"
          }
        }
      });

      return this.mapConversation(updated, input.actorUserId);
    });
  }

  public async leaveConversation(
    input: LeaveConversationInput
  ): Promise<LeaveConversationOutcome> {
    return this.client.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: input.conversationId,
          type: ConversationType.GROUP,
          deletedAt: null,
          participants: {
            some: { userId: input.userId, deletedAt: null }
          }
        },
        include: {
          participants: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, userId: true, role: true }
          }
        }
      });

      if (!conversation) {
        return { status: "not_found" } as const;
      }

      const leaving = conversation.participants.find(
        (participant) => participant.userId === input.userId
      );
      if (!leaving) {
        return { status: "not_found" } as const;
      }

      const remaining = conversation.participants.filter(
        (participant) => participant.userId !== input.userId
      );
      const requestedOwner = input.transferOwnerUserId
        ? remaining.find((participant) => participant.userId === input.transferOwnerUserId)
        : undefined;
      if (leaving.role === "owner" && !input.transferOwnerUserId) {
        return { status: "transfer_required" } as const;
      }
      if (leaving.role === "owner" && !requestedOwner) {
        return { status: "invalid_transfer" } as const;
      }

      const shouldDissolve = remaining.length < 2;
      const nextOwner = leaving.role === "owner" && !shouldDissolve
        ? (requestedOwner ?? null)
        : null;
      const now = new Date();

      if (nextOwner) {
        await tx.conversationParticipant.update({
          where: { id: nextOwner.id },
          data: { role: "owner" }
        });
      }

      if (shouldDissolve) {
        await tx.conversationParticipant.updateMany({
          where: { conversationId: input.conversationId, deletedAt: null },
          data: {
            deletedAt: now,
            hiddenAt: now,
            unreadCount: 0,
            isPinned: false
          }
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { deletedAt: now }
        });
      } else {
        await tx.conversationParticipant.update({
          where: { id: leaving.id },
          data: {
            deletedAt: now,
            hiddenAt: now,
            unreadCount: 0,
            isPinned: false
          }
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { updatedAt: now }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.conversation.member_left",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: {
            newOwnerUserId: nextOwner?.userId ?? null,
            dissolved: shouldDissolve
          }
        }
      });

      return {
        status: "left" as const,
        result: {
          conversationId: input.conversationId,
          removedUserId: input.userId,
          newOwnerUserId: nextOwner?.userId ?? null,
          dissolved: shouldDissolve,
          recipientUserIds: conversation.participants.map((participant) => participant.userId)
        }
      };
    });
  }

  public async dissolveConversation(input: {
    conversationId: number;
    ownerUserId: number;
  }): Promise<LeaveConversationPayload | null> {
    return this.client.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: input.conversationId,
          type: ConversationType.GROUP,
          deletedAt: null,
          participants: {
            some: {
              userId: input.ownerUserId,
              role: "owner",
              deletedAt: null
            }
          }
        },
        include: {
          participants: {
            where: { deletedAt: null },
            select: { userId: true }
          }
        }
      });
      if (!conversation) return null;

      const now = new Date();
      await tx.conversationParticipant.updateMany({
        where: { conversationId: input.conversationId, deletedAt: null },
        data: {
          deletedAt: now,
          hiddenAt: now,
          unreadCount: 0,
          isPinned: false
        }
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { deletedAt: now }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.ownerUserId,
          action: "im.conversation.dissolved",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: { memberCount: conversation.participants.length }
        }
      });

      return {
        conversationId: input.conversationId,
        removedUserId: input.ownerUserId,
        newOwnerUserId: null,
        dissolved: true,
        recipientUserIds: conversation.participants.map((participant) => participant.userId)
      };
    });
  }

  public async getConversationForUser(
    conversationId: number,
    userId: number
  ): Promise<ConversationPayload | null> {
    const conversation = await this.client.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
        participants: {
          some: {
            userId,
            deletedAt: null
          }
        }
      },
      include: this.conversationInclude(userId)
    });

    return conversation ? this.mapConversation(conversation, userId) : null;
  }

  public async listConversations(
    userId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ConversationPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ConversationWhereInput = {
      deletedAt: null,
      participants: {
        some: {
          userId,
          hiddenAt: null,
          deletedAt: null
        }
      }
    };
    const [list, total] = await Promise.all([
      this.client.conversation.findMany({
        where,
        include: this.conversationInclude(userId),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      }),
      this.client.conversation.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((conversation) => this.mapConversation(conversation, userId)),
      total,
      pagination
    );
  }

  public async createMessage(input: CreateMessageInput): Promise<MessagePayload | null> {
    return this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.senderUserId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: { id: true }
      });

      if (!participant) {
        return null;
      }

      const policy = await tx.imPolicy.findFirst({
        where: { activeKey: "active", deletedAt: null },
        select: {
          textRetentionSeconds: true,
          recallWindowSeconds: true,
          version: true
        }
      });
      const createdAt = new Date();
      const recallWindowSeconds = policy?.recallWindowSeconds ?? 180;
      const expiresAt =
        policy?.textRetentionSeconds === null || policy?.textRetentionSeconds === undefined
          ? null
          : new Date(createdAt.getTime() + policy.textRetentionSeconds * 1_000);
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          type: this.messageTypeToDb(input.type),
          content: input.content,
          metadata: this.toJsonValue(input.metadata),
          createdAt,
          expiresAt,
          recallDeadlineAt: new Date(createdAt.getTime() + recallWindowSeconds * 1_000),
          privacyPolicyVersionAtSend: null,
          lifecycleVersion: policy?.version ?? 1
        },
        include: messageInclude
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() }
      });
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: input.conversationId,
          userId: input.senderUserId,
          deletedAt: null
        },
        data: {
          unreadCount: 0,
          hiddenAt: null,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt
        }
      });
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: input.conversationId,
          userId: { not: input.senderUserId },
          deletedAt: null
        },
        data: {
          unreadCount: { increment: 1 },
          hiddenAt: null
        }
      });

      return this.mapMessage(message, input.senderUserId);
    });
  }

  public async isMessageSenderBlocked(
    conversationId: number,
    senderUserId: number
  ): Promise<boolean> {
    const blockingRecipient = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: { not: senderUserId },
        deletedAt: null,
        conversation: {
          type: ConversationType.DIRECT,
          deletedAt: null,
          participants: {
            some: {
              userId: senderUserId,
              deletedAt: null
            }
          }
        },
        user: {
          ownedContacts: {
            some: {
              contactUserId: senderUserId,
              blockedAt: { not: null },
              deletedAt: null
            }
          }
        }
      },
      select: { id: true }
    });

    return Boolean(blockingRecipient);
  }

  public async recallMessage(
    input: RecallMessageInput
  ): Promise<StandardRecallRepositoryOutcome> {
    return this.client.$transaction(async (tx) => {
      const scope = {
        id: input.messageId,
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          participants: {
            some: {
              userId: input.senderUserId,
              deletedAt: null
            }
          }
        }
      } satisfies Prisma.MessageWhereInput;
      const candidate = await tx.message.findFirst({
        where: scope,
        include: messageInclude
      });

      if (!candidate) {
        return { status: "not_found" } as const;
      }

      if (candidate.recalledAt !== null || candidate.recallMode !== null) {
        return {
          status: "already_recalled",
          message: this.mapMessage(candidate, input.senderUserId, input.now)
        } as const;
      }

      if (input.now.getTime() > candidate.recallDeadlineAt.getTime()) {
        return { status: "window_expired" } as const;
      }

      const claimed = await tx.message.updateMany({
        where: {
          id: input.messageId,
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          recalledAt: null,
          recallMode: null,
          deletedAt: null,
          recallDeadlineAt: { gte: input.now }
        },
        data: {
          content: null,
          metadata: Prisma.DbNull,
          recalledAt: input.now,
          recallMode: MessageRecallMode.STANDARD,
          contentPurgedAt: input.now,
          lifecycleVersion: { increment: 1 }
        }
      });

      if (claimed.count !== 1) {
        const latest = await tx.message.findFirst({
          where: scope,
          include: messageInclude
        });

        if (latest?.recalledAt !== null && latest?.recalledAt !== undefined) {
          return {
            status: "already_recalled",
            message: this.mapMessage(latest, input.senderUserId, input.now)
          } as const;
        }
        if (latest && input.now.getTime() > latest.recallDeadlineAt.getTime()) {
          return { status: "window_expired" } as const;
        }
        return { status: "not_found" } as const;
      }

      await tx.messageReaction.updateMany({
        where: { messageId: input.messageId, deletedAt: null },
        data: { deletedAt: input.now }
      });
      await tx.imDeletionSync.upsert({
        where: {
          messageId_action: {
            messageId: input.messageId,
            action: ImDeletionAction.STANDARD_RECALL
          }
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          action: ImDeletionAction.STANDARD_RECALL,
          mediaKind: null,
          occurredAt: input.now
        },
        update: {}
      });
      await tx.auditLog.create({
        data: {
          actorId: input.senderUserId,
          action: "im.message.standard_recall",
          targetType: "Message",
          targetId: input.messageId,
          ip: null,
          userAgent: null,
          metadata: {
            conversationId: input.conversationId,
            recallMode: "standard"
          },
          createdAt: input.now
        }
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: input.now }
      });

      const updated = await tx.message.findUnique({
        where: { id: input.messageId },
        include: messageInclude
      });

      if (!updated) {
        return { status: "not_found" } as const;
      }

      return {
        status: "recalled",
        message: this.mapMessage(updated, input.senderUserId, input.now)
      } as const;
    });
  }

  public async listMessages(input: ListMessagesInput): Promise<MessageHistoryPayload | null> {
    const participant = await this.findConversationParticipant(input.conversationId, input.userId);

    if (!participant) {
      return null;
    }

    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const where: Prisma.MessageWhereInput = {
      conversationId: input.conversationId,
      deletedAt: null,
      userDeletions: {
        none: { userId: input.userId, deletedAt: null }
      },
      ...(input.beforeId || participant.clearedThroughMessageId
        ? {
            id: {
              ...(input.beforeId ? { lt: input.beforeId } : {}),
              ...(participant.clearedThroughMessageId
                ? { gt: participant.clearedThroughMessageId }
                : {})
            }
          }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.message.findMany({
        where,
        include: messageInclude,
        take: pageSize,
        orderBy: [{ id: "desc" }]
      }),
      this.client.message.count({ where })
    ]);

    return {
      list: list.map((message) => this.mapMessage(message, input.userId)),
      total,
      page: 1,
      page_size: pageSize,
      nextCursor: total > list.length ? (list[list.length - 1]?.id ?? null) : null
    };
  }

  public async deleteMessageForUser(
    input: DeleteMessageForUserInput
  ): Promise<DeleteMessageForUserPayload | null> {
    return this.client.$transaction(async (tx) => {
      const message = await tx.message.findFirst({
        where: {
          id: input.messageId,
          conversationId: input.conversationId,
          deletedAt: null,
          conversation: {
            deletedAt: null,
            participants: {
              some: { userId: input.userId, deletedAt: null }
            }
          }
        },
        select: { id: true }
      });
      if (!message) return null;

      await tx.messageUserDeletion.upsert({
        where: {
          userId_messageId: {
            userId: input.userId,
            messageId: input.messageId
          }
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: input.userId
        },
        update: { deletedAt: null }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.message.deleted_for_user",
          targetType: "Message",
          targetId: input.messageId,
          ip: null,
          userAgent: null,
          metadata: { conversationId: input.conversationId }
        }
      });

      return {
        conversationId: input.conversationId,
        messageId: input.messageId,
        deleted: true
      };
    });
  }

  public async setMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessagePayload | null> {
    return this.client.$transaction(async (tx) => {
      const messageLocked = await this.lockMessageForParticipant(tx, input);
      if (!messageLocked) return null;

      await tx.messageReaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId: input.messageId,
            userId: input.userId,
            emoji: input.emoji
          }
        },
        create: {
          messageId: input.messageId,
          userId: input.userId,
          emoji: input.emoji
        },
        update: { deletedAt: null }
      });

      const updated = await tx.message.update({
        where: { id: input.messageId },
        data: { reactionVersion: { increment: 1 } },
        include: messageInclude
      });
      return this.mapMessage(updated, input.userId);
    });
  }

  public async removeMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessagePayload | null> {
    return this.client.$transaction(async (tx) => {
      const messageLocked = await this.lockMessageForParticipant(tx, input);
      if (!messageLocked) return null;

      await tx.messageReaction.updateMany({
        where: {
          messageId: input.messageId,
          userId: input.userId,
          emoji: input.emoji,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      const updated = await tx.message.update({
        where: { id: input.messageId },
        data: { reactionVersion: { increment: 1 } },
        include: messageInclude
      });
      return this.mapMessage(updated, input.userId);
    });
  }

  public async markConversationRead(input: {
    conversationId: number;
    userId: number;
  }): Promise<{ conversationId: number; unreadCount: number } | null> {
    const participant = await this.findConversationParticipant(input.conversationId, input.userId);

    if (!participant) {
      return null;
    }

    const latestMessage = await this.client.message.findFirst({
      where: {
        conversationId: input.conversationId,
        deletedAt: null
      },
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true }
    });

    await this.client.conversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
        deletedAt: null
      },
      data: {
        unreadCount: 0,
        lastReadMessageId: latestMessage?.id ?? null,
        lastReadAt: latestMessage?.createdAt ?? new Date()
      }
    });

    return {
      conversationId: input.conversationId,
      unreadCount: 0
    };
  }

  public async markConversationUnread(input: {
    conversationId: number;
    userId: number;
  }): Promise<ConversationPayload | null> {
    const participant = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true, unreadCount: true }
    });
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: { unreadCount: Math.max(1, participant.unreadCount), hiddenAt: null }
    });
    return this.getConversationForUser(input.conversationId, input.userId);
  }

  public async updateConversationPreferences(
    input: UpdateConversationPreferencesInput
  ): Promise<ConversationPayload | null> {
    const participant = await this.findConversationParticipant(input.conversationId, input.userId);
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: {
        ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
        ...(input.isMuted === undefined ? {} : { isMuted: input.isMuted }),
        hiddenAt: null
      }
    });
    return this.getConversationForUser(input.conversationId, input.userId);
  }

  public async hideConversation(input: {
    conversationId: number;
    userId: number;
  }): Promise<ConversationPayload | null> {
    const participant = await this.findConversationParticipant(input.conversationId, input.userId);
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: { hiddenAt: new Date(), isPinned: false, unreadCount: 0 }
    });
    return this.getConversationForUser(input.conversationId, input.userId);
  }

  public async clearConversationMessages(input: {
    conversationId: number;
    userId: number;
  }): Promise<ConversationPayload | null> {
    const cleared = await this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.userId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: { id: true }
      });
      if (!participant) return false;

      const latestMessage = await tx.message.findFirst({
        where: { conversationId: input.conversationId, deletedAt: null },
        orderBy: { id: "desc" },
        select: { id: true, createdAt: true }
      });

      await tx.conversationParticipant.update({
        where: { id: participant.id },
        data: {
          clearedThroughMessageId: latestMessage?.id ?? null,
          lastReadMessageId: latestMessage?.id ?? null,
          lastReadAt: latestMessage?.createdAt ?? new Date(),
          unreadCount: 0
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.conversation.messages_cleared",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: { clearedThroughMessageId: latestMessage?.id ?? null }
        }
      });
      return true;
    });

    return cleared
      ? this.getConversationForUser(input.conversationId, input.userId)
      : null;
  }

  public async listContacts(
    userId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ContactPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ContactWhereInput = {
      ownerUserId: userId,
      deletedAt: null,
      contactUser: {
        deletedAt: null,
        isActive: true
      }
    };
    const [list, total] = await Promise.all([
      this.client.contact.findMany({
        where,
        include: contactInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.contact.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((contact) => this.mapContact(contact)),
      total,
      pagination
    );
  }

  public async searchDirectory(
    userId: number,
    input: DirectorySearchInput
  ): Promise<PaginatedResponse<ParticipantPayload>> {
    const pagination = toPrismaPagination(input);
    const query = input.query.trim();
    const where: Prisma.UserWhereInput = {
      id: { not: userId },
      isActive: true,
      deletedAt: null,
      OR: [
        { username: { contains: query } },
        { needoId: { contains: query } }
      ],
      NOT: {
        contactEntries: {
          some: {
            ownerUserId: userId,
            deletedAt: null
          }
        }
      }
    };
    const select = {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    } satisfies Prisma.UserSelect;
    const [list, total] = await Promise.all([
      this.client.user.findMany({
        where,
        select,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ username: "asc" }, { id: "asc" }]
      }),
      this.client.user.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((user) => ({
        userId: user.id,
        needoId: user.needoId,
        username: user.username,
        avatarUrl: user.avatarUrl
      })),
      total,
      pagination
    );
  }

  public async addContact(input: AddContactInput): Promise<ContactPayload> {
    const contact = await this.client.contact.upsert({
      where: {
        ownerUserId_contactUserId: {
          ownerUserId: input.ownerUserId,
          contactUserId: input.contactUserId
        }
      },
      create: {
        ownerUserId: input.ownerUserId,
        contactUserId: input.contactUserId,
        source: input.source
      },
      update: {
        blockedAt: null,
        deletedAt: null,
        source: input.source
      },
      include: contactInclude
    });

    return this.mapContact(contact);
  }

  public async setContactBlocked(input: SetContactBlockedInput): Promise<ContactPayload | null> {
    const contact = await this.client.contact.findFirst({
      where: {
        id: input.contactId,
        ownerUserId: input.ownerUserId,
        deletedAt: null,
        contactUser: {
          deletedAt: null,
          isActive: true
        }
      },
      select: { id: true, blockedAt: true }
    });
    if (!contact) return null;

    const updated = await this.client.contact.update({
      where: { id: contact.id },
      data: {
        blockedAt: input.isBlocked ? (contact.blockedAt ?? new Date()) : null
      },
      include: contactInclude
    });
    return this.mapContact(updated);
  }

  public async deleteContact(input: DeleteContactInput): Promise<DeletedContactPayload | null> {
    return this.client.$transaction(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: {
          id: input.contactId,
          ownerUserId: input.ownerUserId,
          deletedAt: null,
          contactUser: {
            deletedAt: null,
            isActive: true
          }
        },
        select: { id: true, contactUserId: true }
      });
      if (!contact) return null;

      const deletedAt = new Date();
      await tx.contact.update({
        where: { id: contact.id },
        data: { blockedAt: null, deletedAt }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.ownerUserId,
          action: "im.contact.deleted",
          targetType: "Contact",
          targetId: contact.id,
          ip: null,
          userAgent: null,
          metadata: { contactUserId: contact.contactUserId }
        }
      });

      return {
        contactId: contact.id,
        ownerUserId: input.ownerUserId,
        contactUserId: contact.contactUserId,
        deleted: true,
        deletedAt
      };
    });
  }

  public ensureDirectContactConversation(
    input: EnsureTechnicianApplicationContactInput
  ): Promise<{ conversationId: number }> {
    return this.client.$transaction(async (transaction) => {
      await Promise.all([
        this.upsertTechnicianApplicationContact(
          transaction,
          input.serviceUserId,
          input.applicantUserId
        ),
        this.upsertTechnicianApplicationContact(
          transaction,
          input.applicantUserId,
          input.serviceUserId
        )
      ]);

      const candidates = await transaction.conversation.findMany({
        where: {
          type: ConversationType.DIRECT,
          accessPolicy: ConversationAccessPolicy.BUSINESS_CONTEXT,
          deletedAt: null,
          participants: {
            some: {
              userId: { in: [input.serviceUserId, input.applicantUserId] },
              deletedAt: null
            }
          }
        },
        select: {
          id: true,
          participants: {
            where: { deletedAt: null },
            select: { userId: true }
          }
        }
      });
      const exact = candidates.find((conversation) => {
        const participants = new Set(conversation.participants.map((item) => item.userId));
        return (
          participants.size === 2 &&
          participants.has(input.serviceUserId) &&
          participants.has(input.applicantUserId)
        );
      });
      if (exact) {
        return { conversationId: exact.id };
      }

      const created = await transaction.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          accessPolicy: ConversationAccessPolicy.BUSINESS_CONTEXT,
          friendshipPairKey: null,
          createdByUserId: input.createdByUserId,
          participants: {
            create: [
              { userId: input.serviceUserId, role: "member" },
              { userId: input.applicantUserId, role: "member" }
            ]
          }
        },
        select: { id: true }
      });
      return { conversationId: created.id };
    });
  }

  public async getDirectoryProfile(
    viewerUserId: number,
    targetUserId: number
  ): Promise<DirectoryProfilePayload | null> {
    const databaseClock = await this.client.$queryRaw<Array<{ dbNow: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
    );
    const dbNow = databaseClock[0]?.dbNow;
    if (!dbNow) {
      throw new Error("Database clock query returned no row");
    }
    const user = await this.client.user.findFirst({
      where: { id: targetUserId, isActive: true, deletedAt: null },
      select: { id: true, needoId: true, username: true, avatarUrl: true }
    });
    if (!user) {
      return null;
    }
    const contact = await this.client.contact.findFirst({
      where: {
        ownerUserId: viewerUserId,
        contactUserId: targetUserId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (contact) {
      return {
        user: this.mapParticipant(user),
        relationship: "friend",
        contactId: contact.id,
        friendRequest: null
      };
    }
    const friendRequest = await this.client.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        expiresAt: { gt: dbNow },
        deletedAt: null,
        OR: [
          { requesterUserId: viewerUserId, targetUserId },
          { requesterUserId: targetUserId, targetUserId: viewerUserId }
        ]
      },
      include: friendRequestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      user: this.mapParticipant(user),
      relationship: friendRequest
        ? friendRequest.requesterUserId === viewerUserId
          ? "outgoing_pending"
          : "incoming_pending"
        : "none",
      contactId: null,
      friendRequest: friendRequest ? this.mapFriendRequest(friendRequest, dbNow) : null
    };
  }

  public async createFriendRequest(
    input: CreateFriendRequestInput
  ): Promise<CreateFriendRequestOutcome> {
    return this.client.$transaction(async (tx) => {
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      const orderedUserIds = [input.requesterUserId, input.targetUserId].sort(
        (left, right) => left - right
      );
      const lockedUsers = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM users
          WHERE id IN (${Prisma.join(orderedUserIds)})
            AND is_active = 1
            AND deleted_at IS NULL
          ORDER BY id
          FOR UPDATE
        `
      );
      if (lockedUsers.length !== 2) {
        return { status: "target_unavailable" };
      }
      const reciprocalContactCount = await tx.contact.count({
        where: {
          deletedAt: null,
          OR: [
            { ownerUserId: input.requesterUserId, contactUserId: input.targetUserId },
            { ownerUserId: input.targetUserId, contactUserId: input.requesterUserId }
          ]
        }
      });
      if (reciprocalContactCount === 2) {
        return { status: "already_friends" };
      }
      await this.expireDuePendingForPair(tx, input.requesterUserId, input.targetUserId, dbNow);
      const activePending = await tx.friendRequest.findFirst({
        where: {
          status: FriendRequestStatus.PENDING,
          expiresAt: { gt: dbNow },
          deletedAt: null,
          OR: [
            {
              requesterUserId: input.requesterUserId,
              targetUserId: input.targetUserId
            },
            {
              requesterUserId: input.targetUserId,
              targetUserId: input.requesterUserId
            }
          ]
        },
        include: friendRequestInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
      if (activePending) {
        return {
          status: "ready",
          result: {
            friendRequest: this.mapFriendRequest(activePending, dbNow),
            created: false
          }
        };
      }
      const expiresAt = new Date(dbNow.getTime() + 72 * 60 * 60 * 1_000);
      const friendRequest = await tx.friendRequest.create({
        data: {
          requesterUserId: input.requesterUserId,
          targetUserId: input.targetUserId,
          message: input.message?.trim() || null,
          expiresAt
        },
        include: friendRequestInclude
      });
      await tx.notification.create({
        data: {
          recipientUserId: input.targetUserId,
          actorUserId: input.requesterUserId,
          type: NotificationType.FRIEND_REQUEST,
          title: "New friend request",
          body: "You have a new friend request.",
          payload: { friendRequestId: friendRequest.id }
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.requesterUserId,
          action: "im.friend_request.created",
          targetType: "FriendRequest",
          targetId: friendRequest.id,
          ip: null,
          userAgent: null,
          metadata: {
            targetUserId: input.targetUserId,
            expiresAt: friendRequest.expiresAt.toISOString()
          }
        }
      });

      return {
        status: "ready",
        result: { friendRequest: this.mapFriendRequest(friendRequest, dbNow), created: true }
      };
    });
  }

  public async listFriendRequests(
    userId: number,
    input: FriendRequestListInput
  ): Promise<PaginatedResponse<FriendRequestPayload>> {
    const pagination = toPrismaPagination(input);
    const databaseClock = await this.client.$queryRaw<Array<{ dbNow: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
    );
    const dbNow = databaseClock[0]?.dbNow;
    if (!dbNow) {
      throw new Error("Database clock query returned no row");
    }
    const statusWhere: Prisma.FriendRequestWhereInput | undefined =
      input.status === "pending"
        ? { status: FriendRequestStatus.PENDING, expiresAt: { gt: dbNow } }
        : input.status === "expired"
          ? {
              OR: [
                { status: FriendRequestStatus.EXPIRED },
                { status: FriendRequestStatus.PENDING, expiresAt: { lte: dbNow } }
              ]
            }
          : input.status
            ? { status: this.friendRequestStatusToDb(input.status) }
            : undefined;
    const where: Prisma.FriendRequestWhereInput = {
      AND: [
        { deletedAt: null },
        this.friendRequestDirectionWhere(userId, input.direction ?? "all"),
        ...(statusWhere ? [statusWhere] : [])
      ]
    };
    const [list, total] = await Promise.all([
      this.client.friendRequest.findMany({
        where,
        include: friendRequestInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.friendRequest.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((friendRequest) => this.mapFriendRequest(friendRequest, dbNow)),
      total,
      pagination
    );
  }

  public async respondToFriendRequest(
    input: RespondFriendRequestInput
  ): Promise<RespondFriendRequestOutcome> {
    return this.client.$transaction(async (tx) => {
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM friend_requests
          WHERE id = ${input.id}
          FOR UPDATE
        `
      );
      const friendRequest = await tx.friendRequest.findFirst({
        where: {
          id: input.id,
          targetUserId: input.actorUserId,
          status: FriendRequestStatus.PENDING,
          deletedAt: null
        },
        include: friendRequestInclude
      });

      if (!friendRequest) {
        return { status: "not_found" };
      }
      if (friendRequest.expiresAt.getTime() <= dbNow.getTime()) {
        const expired = await tx.friendRequest.update({
          where: { id: friendRequest.id },
          data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow },
          include: friendRequestInclude
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "im.friend_request.expired",
            targetType: "FriendRequest",
            targetId: friendRequest.id,
            ip: null,
            userAgent: null,
            metadata: { source: "response_guard" }
          }
        });
        return { status: "expired", friendRequest: this.mapFriendRequest(expired, dbNow) };
      }

      const status =
        input.action === "accept" ? FriendRequestStatus.ACCEPTED : FriendRequestStatus.REJECTED;
      const updated = await tx.friendRequest.update({
        where: { id: friendRequest.id },
        data: {
          status,
          respondedAt: dbNow
        },
        include: friendRequestInclude
      });

      if (input.action === "accept") {
        await Promise.all([
          this.upsertContact(tx, friendRequest.requesterUserId, friendRequest.targetUserId),
          this.upsertContact(tx, friendRequest.targetUserId, friendRequest.requesterUserId),
          this.upsertFollow(tx, friendRequest.requesterUserId, friendRequest.targetUserId),
          this.upsertFollow(tx, friendRequest.targetUserId, friendRequest.requesterUserId)
        ]);
      }
      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action:
            input.action === "accept" ? "im.friend_request.accepted" : "im.friend_request.rejected",
          targetType: "FriendRequest",
          targetId: friendRequest.id,
          ip: null,
          userAgent: null,
          metadata: { requesterUserId: friendRequest.requesterUserId }
        }
      });

      return {
        status: "responded",
        result: {
          friendRequest: this.mapFriendRequest(updated, dbNow),
          recipientUserIds: [friendRequest.requesterUserId, friendRequest.targetUserId]
        }
      };
    });
  }

  public async expireDueFriendRequests(input: {
    batchSize: number;
  }): Promise<FriendRequestPayload[]> {
    return this.client.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM friend_requests
          WHERE status = 'pending'
            AND expires_at <= CURRENT_TIMESTAMP(3)
            AND deleted_at IS NULL
          ORDER BY expires_at, id
          LIMIT ${input.batchSize}
          FOR UPDATE SKIP LOCKED
        `
      );
      const ids = candidates.map((candidate) => candidate.id);
      if (ids.length === 0) {
        return [];
      }
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      await tx.friendRequest.updateMany({
        where: {
          id: { in: ids },
          status: FriendRequestStatus.PENDING,
          expiresAt: { lte: dbNow },
          deletedAt: null
        },
        data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
      });
      await tx.auditLog.createMany({
        data: ids.map((id) => ({
          actorId: null,
          action: "im.friend_request.expired",
          targetType: "FriendRequest",
          targetId: id,
          ip: null,
          userAgent: null,
          metadata: { source: "expiry_worker" }
        }))
      });
      const expired = await tx.friendRequest.findMany({
        where: { id: { in: ids }, status: FriendRequestStatus.EXPIRED },
        include: friendRequestInclude,
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }]
      });
      return expired.map((request) => this.mapFriendRequest(request, dbNow));
    });
  }

  public async createSocialPost(input: CreateSocialPostInput): Promise<CreateSocialPostResult> {
    return this.client.$transaction(async (transaction) => {
      const mentionUserIds = Array.from(new Set(input.mentionUserIds));
      if (
        mentionUserIds.length !== input.mentionUserIds.length ||
        mentionUserIds.length > 50 ||
        mentionUserIds.includes(input.authorUserId)
      ) {
        throw this.socialPostConflict("error.social.invalid_mention_contact");
      }

      if (mentionUserIds.length > 0) {
        const contacts = await transaction.contact.findMany({
          where: {
            ownerUserId: input.authorUserId,
            contactUserId: { in: mentionUserIds },
            blockedAt: null,
            deletedAt: null,
            contactUser: { isActive: true, deletedAt: null }
          },
          select: { contactUserId: true }
        });
        const matchedContactIds = new Set(contacts.map((contact) => contact.contactUserId));
        if (
          matchedContactIds.size !== mentionUserIds.length ||
          mentionUserIds.some((userId) => !matchedContactIds.has(userId))
        ) {
          throw this.socialPostConflict("error.social.invalid_mention_contact");
        }
      }

      const requestedMediaItems = input.media?.items ?? [];
      const mediaPublicIds = requestedMediaItems.map((item) => item.mediaAssetPublicId);
      if (new Set(mediaPublicIds).size !== mediaPublicIds.length) {
        throw this.socialPostConflict("error.social.media_not_owned");
      }

      const selectedMediaByPublicId = new Map<
        string,
        { id: number; checksumSha256: string | null; url: string }
      >();
      if (mediaPublicIds.length > 0) {
        const mediaAssets = await transaction.mediaAsset.findMany({
          where: {
            ownerUserId: input.authorUserId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null,
            checksumSha256: { in: mediaPublicIds }
          },
          select: {
            id: true,
            checksumSha256: true,
            url: true,
            createdAt: true
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        for (const mediaAsset of mediaAssets) {
          if (
            mediaAsset.checksumSha256 &&
            !selectedMediaByPublicId.has(mediaAsset.checksumSha256)
          ) {
            selectedMediaByPublicId.set(mediaAsset.checksumSha256, mediaAsset);
          }
        }
        if (
          selectedMediaByPublicId.size !== mediaPublicIds.length ||
          mediaPublicIds.some((publicId) => !selectedMediaByPublicId.has(publicId))
        ) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const media = input.media
        ? {
            ...(input.media.quotePostId !== undefined
              ? { quotePostId: input.media.quotePostId }
              : {}),
            ...(input.media.replyToPostId !== undefined
              ? { replyToPostId: input.media.replyToPostId }
              : {}),
            ...(input.media.repostPostId !== undefined
              ? { repostPostId: input.media.repostPostId }
              : {}),
            ...(input.media.postType !== undefined ? { postType: input.media.postType } : {}),
            ...(input.media.locationLabel !== undefined
              ? { locationLabel: input.media.locationLabel }
              : {}),
            items: requestedMediaItems.map((item) => {
              const mediaAsset = selectedMediaByPublicId.get(item.mediaAssetPublicId);
              if (!mediaAsset) {
                throw this.socialPostConflict("error.social.media_not_owned");
              }
              return {
                id: item.id,
                type: item.type,
                url: mediaAsset.url,
                mediaAssetPublicId: item.mediaAssetPublicId,
                ...(item.alt ? { alt: item.alt } : {})
              };
            }),
            mentionUserIds,
            counters: { likes: 0, replies: 0, reposts: 0, views: 1, bookmarks: 0 }
          }
        : undefined;

      const socialPost = await transaction.socialPost.create({
        data: {
          authorUserId: input.authorUserId,
          content: input.content,
          media: this.toJsonValue(media),
          visibility: this.socialPostVisibilityToDb(input.visibility)
        },
        include: socialPostInclude
      });

      const selectedMediaAssetIds = mediaPublicIds.map(
        (publicId) => selectedMediaByPublicId.get(publicId)!.id
      );
      if (selectedMediaAssetIds.length > 0) {
        const updateResult = await transaction.mediaAsset.updateMany({
          where: {
            id: { in: selectedMediaAssetIds },
            ownerUserId: input.authorUserId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null
          },
          data: { entityType: "social_post", entityId: socialPost.id }
        });
        if (updateResult.count !== selectedMediaAssetIds.length) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const notifications: NotificationPayload[] = [];
      for (const recipientUserId of mentionUserIds) {
        const notification = await transaction.notification.create({
          data: {
            recipientUserId,
            actorUserId: input.authorUserId,
            type: NotificationType.SOCIAL,
            title: "动态提醒",
            body: "提醒你查看一条新动态。",
            payload: { kind: "post_mention", postId: socialPost.id }
          }
        });
        notifications.push(this.mapNotification(notification));
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.authorUserId,
          action: "social.post.created",
          targetType: "SocialPost",
          targetId: socialPost.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            mentionUserIds,
            mediaAssetPublicIds: mediaPublicIds,
            visibility: input.visibility
          } satisfies Prisma.InputJsonValue
        }
      });

      return {
        post: this.mapSocialPost(socialPost, input.authorUserId, input.authorUserId),
        notifications
      };
    });
  }

  public async updateSocialPost(input: UpdateSocialPostInput): Promise<UpdateSocialPostResult | null> {
    return this.client.$transaction(async (transaction) => {
      const existingPost = await transaction.socialPost.findFirst({
        where: {
          id: input.postId,
          authorUserId: input.authorUserId,
          deletedAt: null
        },
        include: socialPostInclude
      });
      if (!existingPost) {
        return null;
      }

      const mentionUserIds = Array.from(new Set(input.mentionUserIds));
      if (
        mentionUserIds.length !== input.mentionUserIds.length ||
        mentionUserIds.length > 50 ||
        mentionUserIds.includes(input.authorUserId)
      ) {
        throw this.socialPostConflict("error.social.invalid_mention_contact");
      }

      if (mentionUserIds.length > 0) {
        const contacts = await transaction.contact.findMany({
          where: {
            ownerUserId: input.authorUserId,
            contactUserId: { in: mentionUserIds },
            blockedAt: null,
            deletedAt: null,
            contactUser: { isActive: true, deletedAt: null }
          },
          select: { contactUserId: true }
        });
        const matchedContactIds = new Set(contacts.map((contact) => contact.contactUserId));
        if (
          matchedContactIds.size !== mentionUserIds.length ||
          mentionUserIds.some((userId) => !matchedContactIds.has(userId))
        ) {
          throw this.socialPostConflict("error.social.invalid_mention_contact");
        }
      }

      const requestedMediaItems = input.media?.items ?? [];
      const mediaPublicIds = requestedMediaItems.map((item) => item.mediaAssetPublicId);
      if (new Set(mediaPublicIds).size !== mediaPublicIds.length) {
        throw this.socialPostConflict("error.social.media_not_owned");
      }

      const selectedMediaByPublicId = new Map<
        string,
        { id: number; checksumSha256: string | null; url: string; entityType: string; entityId: number }
      >();
      if (mediaPublicIds.length > 0) {
        const mediaAssets = await transaction.mediaAsset.findMany({
          where: {
            ownerUserId: input.authorUserId,
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null,
            checksumSha256: { in: mediaPublicIds },
            OR: [
              { entityType: "social_post_upload" },
              { entityType: "social_post", entityId: input.postId }
            ]
          },
          select: {
            id: true,
            checksumSha256: true,
            url: true,
            entityType: true,
            entityId: true,
            createdAt: true
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        for (const mediaAsset of mediaAssets) {
          if (mediaAsset.checksumSha256 && !selectedMediaByPublicId.has(mediaAsset.checksumSha256)) {
            selectedMediaByPublicId.set(mediaAsset.checksumSha256, mediaAsset);
          }
        }
        if (
          selectedMediaByPublicId.size !== mediaPublicIds.length ||
          mediaPublicIds.some((publicId) => !selectedMediaByPublicId.has(publicId))
        ) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const existingEnvelope = this.jsonRecord(existingPost.media);
      const existingCounters = this.jsonRecord(existingEnvelope?.counters);
      const counters = {
        likes: this.jsonCounter(existingCounters?.likes, 0),
        replies: this.jsonCounter(existingCounters?.replies, 0),
        reposts: this.jsonCounter(existingCounters?.reposts, 0),
        views: this.jsonCounter(existingCounters?.views, 1),
        bookmarks: this.jsonCounter(existingCounters?.bookmarks, 0)
      };
      const existingMentionUserIds = this.jsonPositiveIntegerArray(existingEnvelope?.mentionUserIds);
      const media = input.media
        ? {
            ...(input.media.quotePostId !== undefined ? { quotePostId: input.media.quotePostId } : {}),
            ...(input.media.replyToPostId !== undefined ? { replyToPostId: input.media.replyToPostId } : {}),
            ...(input.media.repostPostId !== undefined ? { repostPostId: input.media.repostPostId } : {}),
            ...(input.media.postType !== undefined ? { postType: input.media.postType } : {}),
            ...(input.media.locationLabel !== undefined ? { locationLabel: input.media.locationLabel } : {}),
            items: requestedMediaItems.map((item) => {
              const mediaAsset = selectedMediaByPublicId.get(item.mediaAssetPublicId);
              if (!mediaAsset) {
                throw this.socialPostConflict("error.social.media_not_owned");
              }
              return {
                id: item.id,
                type: item.type,
                url: mediaAsset.url,
                mediaAssetPublicId: item.mediaAssetPublicId,
                ...(item.alt ? { alt: item.alt } : {})
              };
            }),
            mentionUserIds,
            counters
          }
        : undefined;

      const updatedPost = await transaction.socialPost.update({
        where: { id: existingPost.id },
        data: {
          content: input.content,
          media: this.toJsonValue(media),
          visibility: this.socialPostVisibilityToDb(input.visibility)
        },
        include: socialPostInclude
      });

      const pendingMediaAssetIds = mediaPublicIds
        .map((publicId) => selectedMediaByPublicId.get(publicId)!)
        .filter((mediaAsset) => mediaAsset.entityType === "social_post_upload")
        .map((mediaAsset) => mediaAsset.id);
      if (pendingMediaAssetIds.length > 0) {
        const updateResult = await transaction.mediaAsset.updateMany({
          where: {
            id: { in: pendingMediaAssetIds },
            ownerUserId: input.authorUserId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null
          },
          data: { entityType: "social_post", entityId: existingPost.id }
        });
        if (updateResult.count !== pendingMediaAssetIds.length) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const previousMentionUserIds = new Set(existingMentionUserIds);
      const notifications: NotificationPayload[] = [];
      for (const recipientUserId of mentionUserIds.filter((userId) => !previousMentionUserIds.has(userId))) {
        const notification = await transaction.notification.create({
          data: {
            recipientUserId,
            actorUserId: input.authorUserId,
            type: NotificationType.SOCIAL,
            title: "动态提醒",
            body: "提醒你查看一条动态。",
            payload: { kind: "post_mention", postId: updatedPost.id }
          }
        });
        notifications.push(this.mapNotification(notification));
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.authorUserId,
          action: "social.post.updated",
          targetType: "SocialPost",
          targetId: updatedPost.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            previousMentionUserIds: existingMentionUserIds,
            mentionUserIds,
            mediaAssetPublicIds: mediaPublicIds,
            visibility: input.visibility
          } satisfies Prisma.InputJsonValue
        }
      });

      return {
        post: this.mapSocialPost(updatedPost, input.authorUserId, input.authorUserId),
        notifications
      };
    });
  }

  public async listSocialPosts(
    userId: number,
    input: SocialPostListInput
  ): Promise<PaginatedResponse<SocialPostPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.SocialPostWhereInput = {
      deletedAt: null,
      ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
      OR: [
        { visibility: SocialPostVisibility.PUBLIC },
        { authorUserId: userId },
        {
          author: {
            followers: {
              some: {
                followerUserId: userId,
                deletedAt: null
              }
            }
          }
        }
      ]
    };
    const [list, total] = await Promise.all([
      this.client.socialPost.findMany({
        where,
        include: socialPostInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.socialPost.count({ where })
    ]);

    const relationshipMap = await this.loadSocialRelationshipMap(
      userId,
      list.map((socialPost) => socialPost.authorUserId)
    );

    return buildPaginatedResponse(
      list.map((socialPost) =>
        this.mapSocialPost(socialPost, userId, socialPost.authorUserId, relationshipMap)
      ),
      total,
      pagination
    );
  }

  public async getSocialPost(userId: number, postId: number): Promise<SocialPostPayload | null> {
    const socialPost = await this.client.socialPost.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        OR: [
          { visibility: SocialPostVisibility.PUBLIC },
          { authorUserId: userId },
          {
            author: {
              followers: {
                some: {
                  followerUserId: userId,
                  deletedAt: null
                }
              }
            }
          }
        ]
      },
      include: socialPostInclude
    });

    if (!socialPost) {
      return null;
    }

    const relationshipMap = await this.loadSocialRelationshipMap(userId, [socialPost.authorUserId]);
    return this.mapSocialPost(socialPost, userId, socialPost.authorUserId, relationshipMap);
  }

  public async getSocialActivityStatus(
    input: SocialActivityStatusInput
  ): Promise<SocialActivityStatusPayload | null> {
    const profile = await this.client.user.findFirst({
      where: {
        id: input.targetUserId,
        isActive: true,
        deletedAt: null
      },
      select: socialAuthorSelect
    });

    if (!profile) {
      return null;
    }

    const latestVisiblePost = await this.client.socialPost.findFirst({
      where: {
        authorUserId: input.targetUserId,
        createdAt: { gte: input.since },
        deletedAt: null,
        OR: [
          { visibility: SocialPostVisibility.PUBLIC },
          { authorUserId: input.viewerUserId },
          {
            author: {
              followers: {
                some: {
                  followerUserId: input.viewerUserId,
                  deletedAt: null
                }
              }
            }
          }
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true, id: true }
    });

    return {
      status: latestVisiblePost ? "recent_posts" : "no_recent_posts",
      profile: this.mapSocialAuthor(profile),
      latestVisiblePostAt: latestVisiblePost?.createdAt ?? null
    };
  }

  public async listFollowerUserIds(followingUserId: number): Promise<number[]> {
    const follows = await this.client.follow.findMany({
      where: {
        followingUserId,
        deletedAt: null
      },
      select: {
        followerUserId: true
      }
    });

    return follows.map((follow) => follow.followerUserId);
  }

  public async createFollow(input: CreateFollowInput): Promise<FollowPayload> {
    const follow = await this.client.follow.upsert({
      where: {
        followerUserId_followingUserId: {
          followerUserId: input.followerUserId,
          followingUserId: input.followingUserId
        }
      },
      create: {
        followerUserId: input.followerUserId,
        followingUserId: input.followingUserId
      },
      update: {
        deletedAt: null
      }
    });

    return this.mapFollow(follow);
  }

  public async deleteFollow(
    followerUserId: number,
    followingUserId: number
  ): Promise<{ deleted: boolean }> {
    const result = await this.client.follow.updateMany({
      where: {
        followerUserId,
        followingUserId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    return { deleted: result.count > 0 };
  }

  public async listNotifications(
    userId: number,
    input: NotificationListInput
  ): Promise<PaginatedResponse<NotificationPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.NotificationWhereInput = {
      recipientUserId: userId,
      deletedAt: null,
      ...(input.unreadOnly ? { readAt: null } : {})
    };
    const [list, total] = await Promise.all([
      this.client.notification.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.notification.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((notification) => this.mapNotification(notification)),
      total,
      pagination
    );
  }

  public async markNotificationRead(
    userId: number,
    notificationId: number
  ): Promise<NotificationPayload | null> {
    const notification = await this.client.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
        deletedAt: null
      }
    });

    if (!notification) {
      return null;
    }

    const updated = await this.client.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() }
    });

    return this.mapNotification(updated);
  }

  public async markAllNotificationsRead(userId: number): Promise<{ count: number }> {
    const result = await this.client.notification.updateMany({
      where: {
        recipientUserId: userId,
        readAt: null,
        deletedAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return { count: result.count };
  }

  public async getUnreadCounts(userId: number): Promise<UnreadCountsPayload> {
    const [conversationUnread, notifications, friendRequests] = await Promise.all([
      this.client.conversationParticipant.aggregate({
        where: {
          userId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        _sum: { unreadCount: true }
      }),
      this.client.notification.count({
        where: {
          recipientUserId: userId,
          readAt: null,
          deletedAt: null
        }
      }),
      this.client.friendRequest.count({
        where: {
          targetUserId: userId,
          status: FriendRequestStatus.PENDING,
          deletedAt: null
        }
      })
    ]);
    const conversations = conversationUnread._sum.unreadCount ?? 0;

    return {
      conversations,
      notifications,
      friendRequests,
      total: conversations + notifications + friendRequests
    };
  }

  public async createOrderStatusNotifications(
    input: CreateOrderStatusNotificationInput
  ): Promise<NotificationPayload[]> {
    const recipientUserIds = Array.from(new Set(input.recipientUserIds)).filter(
      (recipientUserId) => recipientUserId !== input.actorUserId
    );

    if (recipientUserIds.length === 0) {
      return [];
    }

    const notifications = await this.client.$transaction(
      recipientUserIds.map((recipientUserId) =>
        this.client.notification.create({
          data: {
            recipientUserId,
            actorUserId: input.actorUserId,
            type: NotificationType.ORDER_STATUS,
            title: "Order status updated",
            body: `${input.serviceName} changed from ${input.fromStatus} to ${input.toStatus}.`,
            payload: {
              orderId: input.orderId,
              orderNo: input.orderNo,
              fromStatus: input.fromStatus,
              toStatus: input.toStatus
            }
          }
        })
      )
    );

    return notifications.map((notification) => this.mapNotification(notification));
  }

  private async findExistingDirectConversation(
    participantUserIds: number[]
  ): Promise<ConversationRecord | null> {
    if (participantUserIds.length !== 2) {
      return null;
    }

    return this.client.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        friendshipPairKey: toFriendshipPairKey(
          participantUserIds[0]!,
          participantUserIds[1]!
        ),
        deletedAt: null,
      },
      include: this.conversationInclude(participantUserIds[0])
    });
  }

  private async findConversationParticipant(conversationId: number, userId: number) {
    return this.client.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true, clearedThroughMessageId: true }
    });
  }

  private async lockMessageForParticipant(
    tx: Prisma.TransactionClient,
    input: MessageReactionMutationInput
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT m.id
        FROM messages AS m
        INNER JOIN conversations AS c
          ON c.id = m.conversation_id
          AND c.deleted_at IS NULL
        WHERE m.id = ${input.messageId}
          AND m.conversation_id = ${input.conversationId}
          AND m.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM conversation_participants AS cp
            WHERE cp.conversation_id = m.conversation_id
              AND cp.user_id = ${input.userId}
              AND cp.deleted_at IS NULL
          )
        FOR UPDATE
      `
    );

    return rows.length > 0;
  }

  private upsertContact(tx: Prisma.TransactionClient, ownerUserId: number, contactUserId: number) {
    return tx.contact.upsert({
      where: {
        ownerUserId_contactUserId: {
          ownerUserId,
          contactUserId
        }
      },
      create: {
        ownerUserId,
        contactUserId,
        source: "friend_request"
      },
      update: {
        source: "friend_request",
        deletedAt: null
      }
    });
  }

  private upsertFollow(
    tx: Prisma.TransactionClient,
    followerUserId: number,
    followingUserId: number
  ) {
    return tx.follow.upsert({
      where: {
        followerUserId_followingUserId: {
          followerUserId,
          followingUserId
        }
      },
      create: { followerUserId, followingUserId },
      update: { deletedAt: null }
    });
  }

  private async expireDuePendingForPair(
    tx: Prisma.TransactionClient,
    requesterUserId: number,
    targetUserId: number,
    dbNow: Date
  ): Promise<void> {
    const due = await tx.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.PENDING,
        expiresAt: { lte: dbNow },
        deletedAt: null,
        OR: [
          { requesterUserId, targetUserId },
          { requesterUserId: targetUserId, targetUserId: requesterUserId }
        ]
      },
      select: { id: true }
    });
    const dueIds = due.map((request) => request.id);
    if (dueIds.length === 0) {
      return;
    }
    await tx.friendRequest.updateMany({
      where: {
        id: { in: dueIds },
        status: FriendRequestStatus.PENDING,
        expiresAt: { lte: dbNow },
        deletedAt: null
      },
      data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
    });
    await tx.auditLog.createMany({
      data: dueIds.map((id) => ({
        actorId: requesterUserId,
        action: "im.friend_request.expired",
        targetType: "FriendRequest",
        targetId: id,
        ip: null,
        userAgent: null,
        metadata: { source: "new_request_guard" }
      }))
    });
  }

  private upsertTechnicianApplicationContact(
    transaction: Prisma.TransactionClient,
    ownerUserId: number,
    contactUserId: number
  ) {
    return transaction.contact.upsert({
      where: {
        ownerUserId_contactUserId: { ownerUserId, contactUserId }
      },
      create: {
        ownerUserId,
        contactUserId,
        source: "technician_application"
      },
      update: {
        source: "technician_application",
        deletedAt: null
      }
    });
  }

  private conversationInclude(viewerUserId?: number) {
    return {
      participants: {
        where: { deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              needoId: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      },
      messages: {
        where: {
          deletedAt: null,
          ...(viewerUserId
            ? {
                userDeletions: {
                  none: { userId: viewerUserId, deletedAt: null }
                }
              }
            : {})
        },
        include: messageInclude,
        orderBy: { id: "desc" as const },
        take: 1
      }
    };
  }

  private mapConversation(
    conversation: ConversationRecord,
    viewerUserId: number
  ): ConversationPayload {
    const viewer = conversation.participants.find(
      (participant) => participant.userId === viewerUserId
    );

    return {
      id: conversation.id,
      type: this.conversationTypeFromDb(conversation.type),
      title: conversation.title,
      participants: conversation.participants.map((participant) =>
        this.mapParticipant(participant.user, participant.role)
      ),
      lastMessage: conversation.messages[0]
        && conversation.messages[0].id > (viewer?.clearedThroughMessageId ?? 0)
        ? this.mapMessage(conversation.messages[0], viewerUserId)
        : null,
      unreadCount: viewer?.unreadCount ?? 0,
      isPinned: viewer?.isPinned ?? false,
      isMuted: viewer?.isMuted ?? false,
      isHidden: viewer?.hiddenAt !== null && viewer?.hiddenAt !== undefined,
      privacyModeEnabled: conversation.privacyModeEnabled,
      hideMemberProfiles: conversation.hideMemberProfiles,
      disappearingTtlSeconds: conversation.disappearingTtlSeconds,
      disappearingStartMode:
        conversation.disappearingStartMode === "read_by_all" ? "read_by_all" : "sent",
      privacyPolicyVersion: conversation.privacyPolicyVersion,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  private mapMessage(
    message: MessageRecord,
    viewerUserId: number,
    now: Date = new Date()
  ): MessagePayload {
    const reactions = new Map<string, MessageReactionPersonPayload[]>();
    for (const reaction of message.reactions) {
      const people = reactions.get(reaction.emoji) ?? [];
      people.push({
        userId: reaction.user.id,
        username: reaction.user.username,
        avatarUrl: reaction.user.avatarUrl
      });
      reactions.set(reaction.emoji, people);
    }

    const recallMode =
      message.recallMode === MessageRecallMode.STANDARD
        ? "standard"
        : message.recallMode === MessageRecallMode.TRACELESS
          ? "traceless"
          : null;
    const canRecall =
      message.senderUserId === viewerUserId &&
      message.recalledAt === null &&
      message.recallMode === null &&
      message.contentPurgedAt === null &&
      now.getTime() <= message.recallDeadlineAt.getTime() &&
      (message.expiresAt === null || now.getTime() < message.expiresAt.getTime());

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      type: this.messageTypeFromDb(message.type),
      content: message.content,
      metadata: message.metadata,
      reactions: Array.from(reactions.entries()).map(([emoji, people]) => ({
        emoji,
        people,
        reactedByMe: people.some((person) => person.userId === viewerUserId)
      })),
      createdAt: message.createdAt,
      recallDeadlineAt: message.recallDeadlineAt,
      recalledAt: message.recalledAt,
      recallMode,
      contentPurgedAt: message.contentPurgedAt,
      lifecycleVersion: message.lifecycleVersion,
      reactionVersion: message.reactionVersion,
      availableRecallModes: canRecall ? ["standard"] : []
    };
  }

  private mapContact(contact: ContactRecord): ContactPayload {
    return {
      id: contact.id,
      ownerUserId: contact.ownerUserId,
      contactUserId: contact.contactUserId,
      contactUser: this.mapParticipant(contact.contactUser),
      nickname: contact.nickname,
      source: contact.source,
      isBlocked: contact.blockedAt !== null,
      createdAt: contact.createdAt
    };
  }

  private mapParticipant(user: {
    id: number;
    needoId: string;
    username: string;
    avatarUrl: string | null;
  }, role?: string): ParticipantPayload {
    return {
      userId: user.id,
      needoId: user.needoId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      ...(role === "owner" || role === "admin" || role === "member" ? { role } : {})
    };
  }

  private mapFriendRequest(friendRequest: FriendRequestRecord, dbNow?: Date): FriendRequestPayload {
    const effectivelyExpired =
      friendRequest.status === FriendRequestStatus.PENDING &&
      dbNow !== undefined &&
      friendRequest.expiresAt.getTime() <= dbNow.getTime();
    return {
      id: friendRequest.id,
      requesterUserId: friendRequest.requesterUserId,
      targetUserId: friendRequest.targetUserId,
      requester: this.mapParticipant(friendRequest.requester),
      target: this.mapParticipant(friendRequest.target),
      status: effectivelyExpired ? "expired" : this.friendRequestStatusFromDb(friendRequest.status),
      message: friendRequest.message,
      respondedAt: friendRequest.respondedAt,
      expiresAt: friendRequest.expiresAt,
      expiredAt: effectivelyExpired
        ? (friendRequest.expiredAt ?? friendRequest.expiresAt)
        : friendRequest.expiredAt,
      createdAt: friendRequest.createdAt
    };
  }

  private async loadSocialRelationshipMap(
    viewerUserId: number,
    authorUserIds: number[]
  ): Promise<SocialRelationshipMap> {
    const uniqueAuthorUserIds = [...new Set(authorUserIds)];
    if (uniqueAuthorUserIds.length === 0) {
      return { follows: new Set(), friendUserIds: new Set() };
    }

    const [relationships, contacts] = await Promise.all([
      this.client.follow.findMany({
        where: {
          deletedAt: null,
          OR: [
            {
              followerUserId: viewerUserId,
              followingUserId: { in: uniqueAuthorUserIds }
            },
            {
              followerUserId: { in: uniqueAuthorUserIds },
              followingUserId: viewerUserId
            }
          ]
        },
        select: {
          followerUserId: true,
          followingUserId: true
        }
      }),
      this.client.contact.findMany({
        where: {
          blockedAt: null,
          deletedAt: null,
          OR: [
            { ownerUserId: viewerUserId, contactUserId: { in: uniqueAuthorUserIds } },
            { ownerUserId: { in: uniqueAuthorUserIds }, contactUserId: viewerUserId }
          ]
        },
        select: { ownerUserId: true, contactUserId: true }
      })
    ]);
    const follows = new Set(
      relationships.map(
        (relationship) => `${relationship.followerUserId}:${relationship.followingUserId}`
      )
    );
    const contactPairs = new Set(
      contacts.map((contact) => `${contact.ownerUserId}:${contact.contactUserId}`)
    );
    const friendUserIds = new Set(
      uniqueAuthorUserIds.filter(
        (authorUserId) =>
          authorUserId !== viewerUserId &&
          contactPairs.has(`${viewerUserId}:${authorUserId}`) &&
          contactPairs.has(`${authorUserId}:${viewerUserId}`)
      )
    );

    return { follows, friendUserIds };
  }

  private mapSocialAuthor(author: SocialAuthorRecord): SocialPostAuthorPayload {
    const identity =
      author.identities.find((item) =>
        ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(
          item.type
        )
      ) ?? author.identities[0];
    const entityType: SocialPostAuthorPayload["entityType"] =
      identity?.type === "technician"
        ? "technician"
        : identity?.type === "merchant" ||
            identity?.type === "merchant_owner" ||
            identity?.type === "merchant_staff"
          ? "shop"
          : "user";

    return {
      userId: author.id,
      username: author.username,
      displayName: identity?.displayName?.trim() || author.username,
      avatarUrl: author.avatarUrl,
      entityType,
      joinedAt: author.createdAt
    };
  }

  private mapSocialPost(
    socialPost: SocialPostRecord,
    viewerUserId: number,
    authorUserId: number,
    relationshipMap: SocialRelationshipMap = {
      follows: new Set(),
      friendUserIds: new Set()
    }
  ): SocialPostPayload {
    return {
      id: socialPost.id,
      authorUserId: socialPost.authorUserId,
      content: socialPost.content,
      media: socialPost.media,
      visibility: this.socialPostVisibilityFromDb(socialPost.visibility),
      createdAt: socialPost.createdAt,
      updatedAt: socialPost.updatedAt,
      viewerFollowsAuthor:
        viewerUserId === authorUserId ||
        relationshipMap.follows.has(`${viewerUserId}:${authorUserId}`),
      authorFollowsViewer:
        viewerUserId === authorUserId ||
        relationshipMap.follows.has(`${authorUserId}:${viewerUserId}`),
      viewerIsFriend: relationshipMap.friendUserIds.has(authorUserId),
      author: this.mapSocialAuthor(socialPost.author)
    };
  }

  private mapFollow(follow: FollowRecord): FollowPayload {
    return {
      id: follow.id,
      followerUserId: follow.followerUserId,
      followingUserId: follow.followingUserId,
      createdAt: follow.createdAt
    };
  }

  private mapNotification(notification: NotificationRecord): NotificationPayload {
    return {
      id: notification.id,
      recipientUserId: notification.recipientUserId,
      actorUserId: notification.actorUserId,
      type: this.notificationTypeFromDb(notification.type),
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt
    };
  }

  private friendRequestDirectionWhere(
    userId: number,
    direction: "incoming" | "outgoing" | "all"
  ): Prisma.FriendRequestWhereInput {
    if (direction === "incoming") {
      return { targetUserId: userId };
    }
    if (direction === "outgoing") {
      return { requesterUserId: userId };
    }

    return {
      OR: [{ requesterUserId: userId }, { targetUserId: userId }]
    };
  }

  private conversationTypeToDb(type: ConversationTypePayload): ConversationType {
    return type === "group" ? ConversationType.GROUP : ConversationType.DIRECT;
  }

  private conversationTypeFromDb(type: ConversationType): ConversationTypePayload {
    return type === ConversationType.GROUP ? "group" : "direct";
  }

  private messageTypeToDb(type: MessageTypePayload): MessageType {
    if (type === "system") {
      return MessageType.SYSTEM;
    }
    if (type === "orderStatus") {
      return MessageType.ORDER_STATUS;
    }

    return MessageType.TEXT;
  }

  private messageTypeFromDb(type: MessageType): MessageTypePayload {
    if (type === MessageType.SYSTEM) {
      return "system";
    }
    if (type === MessageType.ORDER_STATUS) {
      return "orderStatus";
    }

    return "text";
  }

  private friendRequestStatusToDb(status: FriendRequestStatusPayload): FriendRequestStatus {
    if (status === "accepted") {
      return FriendRequestStatus.ACCEPTED;
    }
    if (status === "rejected") {
      return FriendRequestStatus.REJECTED;
    }
    if (status === "expired") {
      return FriendRequestStatus.EXPIRED;
    }

    return FriendRequestStatus.PENDING;
  }

  private friendRequestStatusFromDb(status: FriendRequestStatus): FriendRequestStatusPayload {
    if (status === FriendRequestStatus.ACCEPTED) {
      return "accepted";
    }
    if (status === FriendRequestStatus.REJECTED) {
      return "rejected";
    }
    if (status === FriendRequestStatus.EXPIRED) {
      return "expired";
    }

    return "pending";
  }

  private socialPostVisibilityToDb(visibility: SocialPostVisibilityPayload): SocialPostVisibility {
    return visibility === "followers"
      ? SocialPostVisibility.FOLLOWERS
      : SocialPostVisibility.PUBLIC;
  }

  private socialPostVisibilityFromDb(
    visibility: SocialPostVisibility
  ): SocialPostVisibilityPayload {
    return visibility === SocialPostVisibility.FOLLOWERS ? "followers" : "public";
  }

  private notificationTypeFromDb(type: NotificationType): NotificationTypePayload {
    if (type === NotificationType.ORDER_STATUS) {
      return "orderStatus";
    }
    if (type === NotificationType.FRIEND_REQUEST) {
      return "friendRequest";
    }
    if (type === NotificationType.SOCIAL) {
      return "social";
    }

    return "system";
  }

  private socialPostConflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 409
    });
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private jsonCounter(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private jsonPositiveIntegerArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter(
      (item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0
    )));
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value as Prisma.InputJsonValue;
  }
}
