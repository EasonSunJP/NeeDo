import {
  ConversationType,
  FriendRequestStatus,
  MessageType,
  NotificationType,
  SocialPostVisibility
} from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { EnsureTechnicianApplicationContactInput } from "../services/technician-application-review.service";

export type ConversationTypePayload = "direct" | "group";
export type MessageTypePayload = "text" | "system" | "orderStatus";
export type FriendRequestStatusPayload = "pending" | "accepted" | "rejected";
export type SocialPostVisibilityPayload = "public" | "followers";
export type NotificationTypePayload = "orderStatus" | "friendRequest" | "system" | "social";

export interface ParticipantPayload {
  userId: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
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
  createdAt: Date;
}

export interface FriendRequestPayload {
  id: number;
  requesterUserId: number;
  targetUserId: number;
  status: FriendRequestStatusPayload;
  message: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}

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
  author: SocialPostAuthorPayload;
  viewerFollowsAuthor: boolean;
  authorFollowsViewer: boolean;
}

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
}

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

export interface MessageReactionMutationInput {
  conversationId: number;
  messageId: number;
  userId: number;
  emoji: string;
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
  media?: unknown;
  visibility: SocialPostVisibilityPayload;
}

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
  getConversationForUser: (
    conversationId: number,
    userId: number
  ) => Promise<ConversationPayload | null>;
  listConversations: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ConversationPayload>>;
  createMessage: (input: CreateMessageInput) => Promise<MessagePayload | null>;
  listMessages: (input: ListMessagesInput) => Promise<MessageHistoryPayload | null>;
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
  listContacts: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ContactPayload>>;
  ensureDirectContactConversation: (
    input: EnsureTechnicianApplicationContactInput
  ) => Promise<{ conversationId: number }>;
  createFriendRequest: (input: CreateFriendRequestInput) => Promise<FriendRequestPayload>;
  listFriendRequests: (
    userId: number,
    input: FriendRequestListInput
  ) => Promise<PaginatedResponse<FriendRequestPayload>>;
  respondToFriendRequest: (
    input: RespondFriendRequestInput
  ) => Promise<FriendRequestPayload | null>;
  createSocialPost: (input: CreateSocialPostInput) => Promise<SocialPostPayload>;
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
type FriendRequestRecord = Prisma.FriendRequestGetPayload<Record<string, never>>;
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
        title: input.title?.trim() || null,
        createdByUserId: input.creatorUserId,
        participants: {
          create: participantUserIds.map((userId) => ({
            userId,
            role: userId === input.creatorUserId ? "owner" : "member"
          }))
        }
      },
      include: this.conversationInclude()
    });

    return this.mapConversation(conversation, input.creatorUserId);
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
      include: this.conversationInclude()
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
        include: this.conversationInclude(),
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

      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          type: this.messageTypeToDb(input.type),
          content: input.content,
          metadata: this.toJsonValue(input.metadata)
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

  public async listMessages(input: ListMessagesInput): Promise<MessageHistoryPayload | null> {
    const participant = await this.findConversationParticipant(input.conversationId, input.userId);

    if (!participant) {
      return null;
    }

    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const where: Prisma.MessageWhereInput = {
      conversationId: input.conversationId,
      deletedAt: null,
      ...(input.beforeId ? { id: { lt: input.beforeId } } : {})
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

  public async setMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessagePayload | null> {
    return this.client.$transaction(async (tx) => {
      const message = await this.findMessageForParticipant(tx, input);
      if (!message) return null;

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

      const updated = await tx.message.findUnique({
        where: { id: input.messageId },
        include: messageInclude
      });
      return updated ? this.mapMessage(updated, input.userId) : null;
    });
  }

  public async removeMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessagePayload | null> {
    return this.client.$transaction(async (tx) => {
      const message = await this.findMessageForParticipant(tx, input);
      if (!message) return null;

      await tx.messageReaction.updateMany({
        where: {
          messageId: input.messageId,
          userId: input.userId,
          emoji: input.emoji,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      const updated = await tx.message.findUnique({
        where: { id: input.messageId },
        include: messageInclude
      });
      return updated ? this.mapMessage(updated, input.userId) : null;
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

  public async createFriendRequest(input: CreateFriendRequestInput): Promise<FriendRequestPayload> {
    return this.client.$transaction(async (tx) => {
      const friendRequest = await tx.friendRequest.create({
        data: {
          requesterUserId: input.requesterUserId,
          targetUserId: input.targetUserId,
          message: input.message?.trim() || null
        }
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

      return this.mapFriendRequest(friendRequest);
    });
  }

  public async listFriendRequests(
    userId: number,
    input: FriendRequestListInput
  ): Promise<PaginatedResponse<FriendRequestPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.FriendRequestWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: this.friendRequestStatusToDb(input.status) } : {}),
      ...this.friendRequestDirectionWhere(userId, input.direction ?? "all")
    };
    const [list, total] = await Promise.all([
      this.client.friendRequest.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.friendRequest.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((friendRequest) => this.mapFriendRequest(friendRequest)),
      total,
      pagination
    );
  }

  public async respondToFriendRequest(
    input: RespondFriendRequestInput
  ): Promise<FriendRequestPayload | null> {
    return this.client.$transaction(async (tx) => {
      const friendRequest = await tx.friendRequest.findFirst({
        where: {
          id: input.id,
          targetUserId: input.actorUserId,
          status: FriendRequestStatus.PENDING,
          deletedAt: null
        }
      });

      if (!friendRequest) {
        return null;
      }

      const status =
        input.action === "accept" ? FriendRequestStatus.ACCEPTED : FriendRequestStatus.REJECTED;
      const updated = await tx.friendRequest.update({
        where: { id: friendRequest.id },
        data: {
          status,
          respondedAt: new Date()
        }
      });

      if (input.action === "accept") {
        await Promise.all([
          this.upsertContact(tx, friendRequest.requesterUserId, friendRequest.targetUserId),
          this.upsertContact(tx, friendRequest.targetUserId, friendRequest.requesterUserId)
        ]);
      }

      return this.mapFriendRequest(updated);
    });
  }

  public async createSocialPost(input: CreateSocialPostInput): Promise<SocialPostPayload> {
    const socialPost = await this.client.socialPost.create({
      data: {
        authorUserId: input.authorUserId,
        content: input.content,
        media: this.toJsonValue(input.media),
        visibility: this.socialPostVisibilityToDb(input.visibility)
      },
      include: socialPostInclude
    });

    return this.mapSocialPost(socialPost, input.authorUserId, input.authorUserId);
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
        this.mapSocialPost(
          socialPost,
          userId,
          socialPost.authorUserId,
          relationshipMap
        )
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
    return this.mapSocialPost(
      socialPost,
      userId,
      socialPost.authorUserId,
      relationshipMap
    );
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
    const candidates = await this.client.conversation.findMany({
      where: {
        type: ConversationType.DIRECT,
        deletedAt: null,
        participants: {
          some: {
            userId: participantUserIds[0],
            deletedAt: null
          }
        }
      },
      include: this.conversationInclude()
    });

    return (
      candidates.find((conversation) => {
        const existingIds = conversation.participants
          .filter((participant) => participant.deletedAt === null)
          .map((participant) => participant.userId)
          .sort((left, right) => left - right);

        return (
          existingIds.length === participantUserIds.length &&
          existingIds.every((userId, index) => userId === participantUserIds[index])
        );
      }) ?? null
    );
  }

  private async findConversationParticipant(conversationId: number, userId: number) {
    return this.client.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true }
    });
  }

  private findMessageForParticipant(
    tx: Prisma.TransactionClient,
    input: MessageReactionMutationInput
  ) {
    return tx.message.findFirst({
      where: {
        id: input.messageId,
        conversationId: input.conversationId,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          participants: {
            some: {
              userId: input.userId,
              deletedAt: null
            }
          }
        }
      },
      select: { id: true }
    });
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

  private conversationInclude() {
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
        where: { deletedAt: null },
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
        this.mapParticipant(participant.user)
      ),
      lastMessage: conversation.messages[0]
        ? this.mapMessage(conversation.messages[0], viewerUserId)
        : null,
      unreadCount: viewer?.unreadCount ?? 0,
      isPinned: viewer?.isPinned ?? false,
      isMuted: viewer?.isMuted ?? false,
      isHidden: viewer?.hiddenAt !== null && viewer?.hiddenAt !== undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  private mapMessage(message: MessageRecord, viewerUserId: number): MessagePayload {
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
      createdAt: message.createdAt
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
      createdAt: contact.createdAt
    };
  }

  private mapParticipant(user: {
    id: number;
    needoId: string;
    username: string;
    avatarUrl: string | null;
  }): ParticipantPayload {
    return {
      userId: user.id,
      needoId: user.needoId,
      username: user.username,
      avatarUrl: user.avatarUrl
    };
  }

  private mapFriendRequest(friendRequest: FriendRequestRecord): FriendRequestPayload {
    return {
      id: friendRequest.id,
      requesterUserId: friendRequest.requesterUserId,
      targetUserId: friendRequest.targetUserId,
      status: this.friendRequestStatusFromDb(friendRequest.status),
      message: friendRequest.message,
      respondedAt: friendRequest.respondedAt,
      createdAt: friendRequest.createdAt
    };
  }

  private async loadSocialRelationshipMap(
    viewerUserId: number,
    authorUserIds: number[]
  ): Promise<Set<string>> {
    const uniqueAuthorUserIds = [...new Set(authorUserIds)];
    if (uniqueAuthorUserIds.length === 0) {
      return new Set();
    }

    const relationships = await this.client.follow.findMany({
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
    });

    return new Set(
      relationships.map(
        (relationship) => `${relationship.followerUserId}:${relationship.followingUserId}`
      )
    );
  }

  private mapSocialAuthor(author: SocialAuthorRecord): SocialPostAuthorPayload {
    const identity =
      author.identities.find((item) =>
        ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(item.type)
      ) ?? author.identities[0];
    const entityType: SocialPostAuthorPayload["entityType"] =
      identity?.type === "technician"
        ? "technician"
        : identity?.type === "merchant" || identity?.type === "merchant_owner" || identity?.type === "merchant_staff"
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
    relationshipMap: Set<string> = new Set()
  ): SocialPostPayload {
    return {
      id: socialPost.id,
      authorUserId: socialPost.authorUserId,
      content: socialPost.content,
      media: socialPost.media,
      visibility: this.socialPostVisibilityFromDb(socialPost.visibility),
      createdAt: socialPost.createdAt,
      viewerFollowsAuthor:
        viewerUserId === authorUserId || relationshipMap.has(`${viewerUserId}:${authorUserId}`),
      authorFollowsViewer:
        viewerUserId === authorUserId || relationshipMap.has(`${authorUserId}:${viewerUserId}`),
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

    return FriendRequestStatus.PENDING;
  }

  private friendRequestStatusFromDb(status: FriendRequestStatus): FriendRequestStatusPayload {
    if (status === FriendRequestStatus.ACCEPTED) {
      return "accepted";
    }
    if (status === FriendRequestStatus.REJECTED) {
      return "rejected";
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

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value as Prisma.InputJsonValue;
  }
}
