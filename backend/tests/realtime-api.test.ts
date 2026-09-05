import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import {
  compareMessageReactionCategories,
  getMessageReactionCategory
} from "../src/constants/message-reaction.constants";
import { socialPostCreateBodySchema } from "../src/validators/realtime.validator";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);

    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }

    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);

    if (!stored) {
      return null;
    }

    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }

    return stored.value;
  }
}

type TestUser = {
  id: number;
  email: string;
  phone: string | null;
  passwordHash: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  identities: Array<{
    id: number;
    userId: number;
    type: string;
    scopeType: string | null;
    scopeId: number | null;
    displayName: string | null;
    isDefault: boolean;
    isActive: boolean;
    deletedAt: Date | null;
  }>;
  userRoles: Array<{
    id: number;
    userId: number;
    roleId: number;
    scopeType: string | null;
    scopeId: number | null;
    deletedAt: Date | null;
    role: {
      id: number;
      name: string;
      code: string;
      description: string | null;
      isSystem: boolean;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
      rolePermissions: Array<{
        id: number;
        roleId: number;
        permissionId: number;
        deletedAt: Date | null;
        permission: {
          id: number;
          name: string;
          code: string;
          type: string;
          module: string;
          description: string | null;
          isSystem: boolean;
          createdAt: Date;
          updatedAt: Date;
          deletedAt: Date | null;
        };
      }>;
    };
  }>;
};

const now = new Date("2026-05-25T00:00:00.000Z");

const realtimePermissions = [
  "auth:me",
  "auth:refresh",
  "auth:logout",
  "conversation:list",
  "conversation:create",
  "message:list",
  "message:create",
  "message:recall",
  "message:react",
  "message:read",
  "contact:list",
  "contact:block",
  "contact:delete",
  "friend-request:list",
  "friend-request:create",
  "friend-request:respond",
  "social-post:list",
  "social-post:create",
  "social-post:interact",
  "follow:write",
  "notification:list",
  "notification:read",
  "realtime:events",
  "realtime:unread-counts"
] as const;

const createUser = async (
  id: number,
  email: string,
  username: string,
  roleCode: string
): Promise<TestUser> => {
  const permissions = realtimePermissions.map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: code.split(":")[0],
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const role = {
    id,
    name: roleCode,
    code: roleCode,
    description: roleCode,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      id: index + 1,
      roleId: id,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };

  return {
    id,
    email,
    phone: null,
    passwordHash: await hash("Abcd@1234", 12),
    username,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id,
        userId: id,
        type: roleCode,
        scopeType: null,
        scopeId: null,
        displayName: username,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id,
        userId: id,
        roleId: id,
        scopeType: null,
        scopeId: null,
        deletedAt: null,
        role
      }
    ]
  };
};

const createFixture = async () => {
  const users = [
    await createUser(1, "aya@example.com", "Aya Customer", "customer"),
    await createUser(2, "mika@example.com", "Mika Technician", "technician")
  ];
  let conversationId = 1;
  let messageId = 1;
  let friendRequestId = 1;
  let contactId = 1;
  let socialPostId = 1;
  let followId = 1;
  let notificationId = 1;
  const conversations: Array<{
    id: number;
    type: "direct" | "group";
    title: string | null;
    participantUserIds: number[];
    privacyModeEnabled: boolean;
    hideMemberProfiles: boolean;
    disappearingTtlSeconds: number | null;
    disappearingStartMode: "sent" | "read_by_all";
    privacyPolicyVersion: number;
    unreadByUserId: Map<number, number>;
    preferencesByUserId: Map<
      number,
      {
        autoTranslateMessages: boolean;
        isHidden: boolean;
        isMuted: boolean;
        isPinned: boolean;
      }
    >;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const messages: Array<{
    id: number;
    conversationId: number;
    senderUserId: number;
    type: string;
    content: string | null;
    metadata: unknown;
    createdAt: Date;
    recallDeadlineAt: Date;
    recalledAt: Date | null;
    recallMode: "standard" | null;
    contentPurgedAt: Date | null;
    lifecycleVersion: number;
    reactionVersion: number;
  }> = [];
  const messageReactions: Array<{
    messageId: number;
    userId: number;
    emoji: string;
  }> = [];
  const clearedThroughMessageIdByParticipant = new Map<string, number>();
  const deletedMessageKeys = new Set<string>();
  const participantClearKey = (conversationId: number, userId: number) =>
    `${conversationId}:${userId}`;
  const deletedMessageKey = (conversationId: number, userId: number, messageId: number) =>
    `${conversationId}:${userId}:${messageId}`;
  const contacts: Array<{
    id: number;
    ownerUserId: number;
    ownerIdentityId: number;
    contactUserId: number;
    contactIdentityId: number;
    nickname: string | null;
    isBlocked: boolean;
    createdAt: Date;
  }> = [];
  const friendRequests: Array<{
    id: number;
    requesterUserId: number;
    requesterIdentityId: number;
    targetUserId: number;
    targetIdentityId: number;
    requester: { userId: number; needoId: string; username: string; avatarUrl: null };
    target: { userId: number; needoId: string; username: string; avatarUrl: null };
    status: "pending" | "accepted" | "rejected" | "expired";
    message: string | null;
    respondedAt: Date | null;
    expiresAt: Date;
    expiredAt: Date | null;
    createdAt: Date;
  }> = [];
  const socialPosts: Array<{
    id: number;
    authorUserId: number;
    content: string;
    media: unknown;
    replyToPostId: number | null;
    replyCount: number;
    visibility: string;
    createdAt: Date;
  }> = [];
  const socialLikeKeys = new Set<string>();
  const socialBookmarkKeys = new Set<string>();
  const socialViewKeys = new Set<string>();
  const socialShareKeys = new Set<string>();
  const follows: Array<{
    id: number;
    followerUserId: number;
    followingUserId: number;
    createdAt: Date;
  }> = [];
  const notifications: Array<{
    id: number;
    recipientUserId: number;
    actorUserId: number | null;
    type: string;
    title: string;
    body: string;
    payload: unknown;
    readAt: Date | null;
    createdAt: Date;
  }> = [];

  const publicProfile = (userId: number) => ({
    userId,
    needoId: `u${String(userId).padStart(10, "0")}`,
    username: users.find((user) => user.id === userId)?.username ?? "Unknown",
    avatarUrl: null
  });

  const mapSocialInteractionPost = (
    post: (typeof socialPosts)[number],
    viewerIdentityId: number
  ) => ({
    ...post,
    authorIdentityId: post.authorUserId,
    updatedAt: post.createdAt,
    author: {
      ...publicProfile(post.authorUserId),
      identityId: post.authorUserId,
      displayName: publicProfile(post.authorUserId).username,
      entityType: "user" as const,
      joinedAt: post.createdAt
    },
    viewerFollowsAuthor: false,
    authorFollowsViewer: false,
    viewerIsFriend: false,
    counters: {
      likes: [...socialLikeKeys].filter((key) => key.startsWith(`${post.id}:`)).length,
      bookmarks: [...socialBookmarkKeys].filter((key) => key.startsWith(`${post.id}:`)).length,
      views: [...socialViewKeys].filter((key) => key.startsWith(`${post.id}:`)).length,
      reposts: [...socialShareKeys].filter((key) => key.startsWith(`${post.id}:`)).length
    },
    viewerInteraction: {
      liked: socialLikeKeys.has(`${post.id}:${viewerIdentityId}`),
      bookmarked: socialBookmarkKeys.has(`${post.id}:${viewerIdentityId}`),
      shared: [...socialShareKeys].some((key) => key.startsWith(`${post.id}:${viewerIdentityId}:`))
    }
  });

  const mapMessage = (message: (typeof messages)[number], viewerUserId: number) => {
    const grouped = new Map<string, Array<{ userId: number; username: string; avatarUrl: null }>>();
    messageReactions
      .filter((reaction) => reaction.messageId === message.id)
      .forEach((reaction) => {
        const people = grouped.get(reaction.emoji) ?? [];
        const user = users.find((candidate) => candidate.id === reaction.userId);
        people.push({
          userId: reaction.userId,
          username: user?.username ?? "Unknown",
          avatarUrl: null
        });
        grouped.set(reaction.emoji, people);
      });

    return {
      ...message,
      reactions: Array.from(grouped.entries())
        .sort(([left], [right]) => compareMessageReactionCategories(left, right))
        .map(([emoji, people]) => ({
          emoji,
          people,
          reactedByMe: people.some((person) => person.userId === viewerUserId)
        }))
    };
  };

  const mapConversation = (conversation: (typeof conversations)[number], userId: number) => {
    const clearedThroughMessageId =
      clearedThroughMessageIdByParticipant.get(participantClearKey(conversation.id, userId)) ?? 0;
    const lastMessage = messages
      .filter(
        (message) =>
          message.conversationId === conversation.id &&
          message.id > clearedThroughMessageId &&
          !deletedMessageKeys.has(deletedMessageKey(conversation.id, userId, message.id))
      )
      .sort((left, right) => right.id - left.id)[0];

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      participants: conversation.participantUserIds.map((participantUserId) => ({
        userId: participantUserId,
        needoId: `u${String(participantUserId).padStart(10, "0")}`,
        username: users.find((user) => user.id === participantUserId)?.username ?? "Unknown",
        avatarUrl: null,
        role: participantUserId === conversation.participantUserIds[0] ? "owner" : "member"
      })),
      lastMessage: lastMessage ? mapMessage(lastMessage, userId) : null,
      unreadCount: conversation.unreadByUserId.get(userId) ?? 0,
      ...(conversation.preferencesByUserId.get(userId) ?? {
        autoTranslateMessages: false,
        isHidden: false,
        isMuted: false,
        isPinned: false
      }),
      privacyModeEnabled: conversation.privacyModeEnabled,
      hideMemberProfiles: conversation.hideMemberProfiles,
      disappearingTtlSeconds: conversation.disappearingTtlSeconds,
      disappearingStartMode: conversation.disappearingStartMode,
      privacyPolicyVersion: conversation.privacyPolicyVersion,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  };

  const listPage = <T>(items: T[], pageSize = 20) => ({
    list: items.slice(0, pageSize),
    total: items.length,
    page: 1,
    page_size: pageSize
  });

  const realtimeRepository = {
    findActiveUserIds: jest.fn(async (ids: number[]) =>
      ids.filter((id) => users.some((user) => user.id === id))
    ),
    findCanonicalIdentityIdForUser: jest.fn(
      async (userId: number) => users.find((user) => user.id === userId)?.identities[0]?.id ?? null
    ),
    listConversationRecipients: jest.fn(async (conversationIdToFind: number) => {
      const conversation = conversations.find((item) => item.id === conversationIdToFind);
      return (conversation?.participantUserIds ?? []).map((userId) => ({
        userId,
        identityId: users.find((user) => user.id === userId)?.identities[0]?.id ?? userId
      }));
    }),
    createConversation: jest.fn(
      async (input: {
        creatorUserId: number;
        type: "direct" | "group";
        title?: string | null;
        participantUserIds: number[];
        privacyModeEnabled?: boolean;
        hideMemberProfiles?: boolean;
        disappearingTtlSeconds?: number | null;
        disappearingStartMode?: "sent" | "read_by_all";
      }) => {
        const participantUserIds = Array.from(
          new Set([input.creatorUserId, ...input.participantUserIds])
        );
        const conversation = {
          id: conversationId++,
          type: input.type,
          title: input.title ?? null,
          participantUserIds,
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
          unreadByUserId: new Map(participantUserIds.map((userId) => [userId, 0])),
          preferencesByUserId: new Map(
            participantUserIds.map((userId) => [
              userId,
              {
                autoTranslateMessages: false,
                isHidden: false,
                isMuted: false,
                isPinned: false
              }
            ])
          ),
          createdAt: now,
          updatedAt: now
        };
        conversations.push(conversation);

        return {
          status: "ready" as const,
          conversation: mapConversation(conversation, input.creatorUserId)
        };
      }
    ),
    updateConversationPrivacy: jest.fn(
      async (input: {
        actorUserId: number;
        conversationId: number;
        privacyModeEnabled: boolean;
        hideMemberProfiles?: boolean;
        disappearingTtlSeconds?: number | null;
        disappearingStartMode?: "sent" | "read_by_all";
      }) => {
        const conversation = conversations.find(
          (item) =>
            item.id === input.conversationId &&
            item.type === "group" &&
            item.participantUserIds[0] === input.actorUserId
        );
        if (!conversation) return null;
        conversation.privacyModeEnabled = input.privacyModeEnabled;
        conversation.hideMemberProfiles = input.hideMemberProfiles ?? false;
        conversation.disappearingTtlSeconds = input.privacyModeEnabled
          ? (input.disappearingTtlSeconds ?? null)
          : null;
        conversation.disappearingStartMode = input.privacyModeEnabled
          ? (input.disappearingStartMode ?? "sent")
          : "sent";
        conversation.privacyPolicyVersion += 1;
        return mapConversation(conversation, input.actorUserId);
      }
    ),
    leaveConversation: jest.fn(
      async (input: { conversationId: number; userId: number; transferOwnerUserId?: number }) => {
        const conversation = conversations.find(
          (item) =>
            item.id === input.conversationId &&
            item.type === "group" &&
            item.participantUserIds.includes(input.userId)
        );
        if (!conversation) return { status: "not_found" as const };
        if (conversation.participantUserIds[0] === input.userId && !input.transferOwnerUserId) {
          return { status: "transfer_required" as const };
        }
        if (
          input.transferOwnerUserId &&
          !conversation.participantUserIds.includes(input.transferOwnerUserId)
        ) {
          return { status: "invalid_transfer" as const };
        }
        const recipientUserIds = [...conversation.participantUserIds];
        conversation.participantUserIds = conversation.participantUserIds.filter(
          (userId) => userId !== input.userId
        );
        if (input.transferOwnerUserId) {
          conversation.participantUserIds = [
            input.transferOwnerUserId,
            ...conversation.participantUserIds.filter(
              (userId) => userId !== input.transferOwnerUserId
            )
          ];
        }
        const dissolved = conversation.participantUserIds.length < 2;
        return {
          status: "left" as const,
          result: {
            conversationId: input.conversationId,
            removedUserId: input.userId,
            newOwnerUserId: dissolved ? null : (conversation.participantUserIds[0] ?? null),
            dissolved,
            recipientUserIds
          }
        };
      }
    ),
    dissolveConversation: jest.fn(
      async (input: { conversationId: number; ownerUserId: number }) => {
        const conversation = conversations.find(
          (item) =>
            item.id === input.conversationId &&
            item.type === "group" &&
            item.participantUserIds[0] === input.ownerUserId
        );
        if (!conversation) return null;
        const recipientUserIds = [...conversation.participantUserIds];
        conversation.participantUserIds = [];
        return {
          conversationId: input.conversationId,
          removedUserId: input.ownerUserId,
          newOwnerUserId: null,
          dissolved: true,
          recipientUserIds
        };
      }
    ),
    getConversationForUser: jest.fn(async (conversationIdToFind: number, userId: number) => {
      const conversation = conversations.find(
        (item) => item.id === conversationIdToFind && item.participantUserIds.includes(userId)
      );

      return conversation ? mapConversation(conversation, userId) : null;
    }),
    listConversations: jest.fn(async (userId: number) =>
      listPage(
        conversations
          .filter(
            (conversation) =>
              conversation.participantUserIds.includes(userId) &&
              !conversation.preferencesByUserId.get(userId)?.isHidden
          )
          .map((conversation) => mapConversation(conversation, userId))
      )
    ),
    createMessage: jest.fn(
      async (input: {
        conversationId: number;
        senderUserId: number;
        type: string;
        content: string;
        metadata?: unknown;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.senderUserId)) {
          return { status: "not_found" as const };
        }

        const message = {
          id: messageId++,
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          type: input.type,
          content: input.content,
          metadata: input.metadata ?? null,
          createdAt: now,
          recallDeadlineAt: new Date(Date.now() + 180_000),
          recalledAt: null,
          recallMode: null,
          contentPurgedAt: null,
          lifecycleVersion: 0,
          reactionVersion: 0
        };
        messages.push(message);
        conversation.updatedAt = now;
        for (const participantUserId of conversation.participantUserIds) {
          conversation.unreadByUserId.set(
            participantUserId,
            participantUserId === input.senderUserId
              ? 0
              : (conversation.unreadByUserId.get(participantUserId) ?? 0) + 1
          );
        }

        return {
          status: "created" as const,
          message: mapMessage(message, input.senderUserId)
        };
      }
    ),
    checkMessageSendEligibility: jest.fn(async () => "allowed" as const),
    isMessageSenderBlocked: jest.fn(async () => false),
    recallMessage: jest.fn(
      async (input: {
        conversationId: number;
        messageId: number;
        senderUserId: number;
        now: Date;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        const message = messages.find(
          (item) => item.id === input.messageId && item.conversationId === input.conversationId
        );
        if (
          !conversation?.participantUserIds.includes(input.senderUserId) ||
          !message ||
          message.senderUserId !== input.senderUserId
        ) {
          return { status: "not_found" as const };
        }
        if (message.recalledAt || message.recallMode) {
          return {
            status: "already_recalled" as const,
            message: mapMessage(message, input.senderUserId)
          };
        }
        if (input.now.getTime() > message.recallDeadlineAt.getTime()) {
          return { status: "window_expired" as const };
        }

        message.content = null;
        message.metadata = null;
        message.recalledAt = input.now;
        message.recallMode = "standard";
        message.contentPurgedAt = input.now;
        message.lifecycleVersion += 1;
        for (let index = messageReactions.length - 1; index >= 0; index -= 1) {
          if (messageReactions[index]?.messageId === message.id) {
            messageReactions.splice(index, 1);
          }
        }

        return {
          status: "recalled" as const,
          message: mapMessage(message, input.senderUserId)
        };
      }
    ),
    listMessages: jest.fn(
      async (input: {
        conversationId: number;
        userId: number;
        beforeId?: number;
        pageSize?: number;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.userId)) {
          return null;
        }

        const sorted = messages
          .filter((message) => message.conversationId === input.conversationId)
          .filter(
            (message) =>
              !deletedMessageKeys.has(
                deletedMessageKey(input.conversationId, input.userId, message.id)
              )
          )
          .filter(
            (message) =>
              message.id >
              (clearedThroughMessageIdByParticipant.get(
                participantClearKey(input.conversationId, input.userId)
              ) ?? 0)
          )
          .filter((message) => (input.beforeId ? message.id < input.beforeId : true))
          .sort((left, right) => right.id - left.id);
        const pageSize = input.pageSize ?? 20;
        const list = sorted.slice(0, pageSize).map((message) => mapMessage(message, input.userId));

        return {
          list,
          total: sorted.length,
          page: 1,
          page_size: pageSize,
          nextCursor: list.length === pageSize ? list[list.length - 1].id : null
        };
      }
    ),
    deleteMessageForUser: jest.fn(
      async (input: { conversationId: number; messageId: number; userId: number }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        const message = messages.find(
          (item) => item.id === input.messageId && item.conversationId === input.conversationId
        );
        if (!conversation?.participantUserIds.includes(input.userId) || !message) return null;
        deletedMessageKeys.add(
          deletedMessageKey(input.conversationId, input.userId, input.messageId)
        );
        return {
          conversationId: input.conversationId,
          messageId: input.messageId,
          deleted: true
        };
      }
    ),
    setMessageReaction: jest.fn(
      async (input: {
        conversationId: number;
        messageId: number;
        userId: number;
        emoji: string;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        const message = messages.find(
          (item) => item.id === input.messageId && item.conversationId === input.conversationId
        );
        if (!conversation?.participantUserIds.includes(input.userId) || !message) {
          return { status: "not_found" as const };
        }

        const activeInSlot = messageReactions.find(
          (reaction) =>
            reaction.messageId === input.messageId &&
            reaction.userId === input.userId &&
            getMessageReactionCategory(reaction.emoji) === getMessageReactionCategory(input.emoji)
        );

        if (activeInSlot?.emoji === input.emoji) {
          return {
            status: "unchanged" as const,
            message: mapMessage(message, input.userId)
          };
        }

        if (activeInSlot) {
          return {
            status: "slot_occupied" as const,
            message: mapMessage(message, input.userId),
            activeEmoji: activeInSlot.emoji
          };
        }

        messageReactions.push({
          messageId: input.messageId,
          userId: input.userId,
          emoji: input.emoji
        });
        message.reactionVersion += 1;
        return { status: "updated" as const, message: mapMessage(message, input.userId) };
      }
    ),
    removeMessageReaction: jest.fn(
      async (input: {
        conversationId: number;
        messageId: number;
        userId: number;
        emoji: string;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        const message = messages.find(
          (item) => item.id === input.messageId && item.conversationId === input.conversationId
        );
        if (!conversation?.participantUserIds.includes(input.userId) || !message) {
          return { status: "not_found" as const };
        }

        const reactionIndex = messageReactions.findIndex(
          (reaction) =>
            reaction.messageId === input.messageId &&
            reaction.userId === input.userId &&
            reaction.emoji === input.emoji
        );
        if (reactionIndex < 0) {
          return {
            status: "unchanged" as const,
            message: mapMessage(message, input.userId)
          };
        }

        messageReactions.splice(reactionIndex, 1);
        message.reactionVersion += 1;
        return { status: "updated" as const, message: mapMessage(message, input.userId) };
      }
    ),
    markConversationRead: jest.fn(async (input: { conversationId: number; userId: number }) => {
      const conversation = conversations.find((item) => item.id === input.conversationId);
      if (!conversation?.participantUserIds.includes(input.userId)) {
        return null;
      }
      conversation.unreadByUserId.set(input.userId, 0);

      return { conversationId: input.conversationId, unreadCount: 0 };
    }),
    markConversationUnread: jest.fn(async (input: { conversationId: number; userId: number }) => {
      const conversation = conversations.find((item) => item.id === input.conversationId);
      if (!conversation?.participantUserIds.includes(input.userId)) return null;
      conversation.unreadByUserId.set(
        input.userId,
        Math.max(1, conversation.unreadByUserId.get(input.userId) ?? 0)
      );
      return mapConversation(conversation, input.userId);
    }),
    updateConversationPreferences: jest.fn(
      async (input: {
        conversationId: number;
        userId: number;
        autoTranslateMessages?: boolean;
        isMuted?: boolean;
        isPinned?: boolean;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.userId)) return null;
        const current = conversation.preferencesByUserId.get(input.userId) ?? {
          autoTranslateMessages: false,
          isHidden: false,
          isMuted: false,
          isPinned: false
        };
        conversation.preferencesByUserId.set(input.userId, {
          ...current,
          ...(input.autoTranslateMessages === undefined
            ? {}
            : { autoTranslateMessages: input.autoTranslateMessages }),
          ...(input.isMuted === undefined ? {} : { isMuted: input.isMuted }),
          ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned })
        });
        return mapConversation(conversation, input.userId);
      }
    ),
    hideConversation: jest.fn(async (input: { conversationId: number; userId: number }) => {
      const conversation = conversations.find((item) => item.id === input.conversationId);
      if (!conversation?.participantUserIds.includes(input.userId)) return null;
      const current = conversation.preferencesByUserId.get(input.userId) ?? {
        autoTranslateMessages: false,
        isHidden: false,
        isMuted: false,
        isPinned: false
      };
      conversation.preferencesByUserId.set(input.userId, {
        ...current,
        isHidden: true,
        isPinned: false
      });
      conversation.unreadByUserId.set(input.userId, 0);
      return mapConversation(conversation, input.userId);
    }),
    clearConversationMessages: jest.fn(
      async (input: { conversationId: number; userId: number }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.userId)) return null;
        const latestMessageId = messages
          .filter((message) => message.conversationId === input.conversationId)
          .reduce((latest, message) => Math.max(latest, message.id), 0);
        clearedThroughMessageIdByParticipant.set(
          participantClearKey(input.conversationId, input.userId),
          latestMessageId
        );
        conversation.unreadByUserId.set(input.userId, 0);
        return mapConversation(conversation, input.userId);
      }
    ),
    listContacts: jest.fn(async (identityId: number) =>
      listPage(contacts.filter((contact) => contact.ownerIdentityId === identityId))
    ),
    getDirectoryProfile: jest.fn(
      async (
        viewerUserId: number,
        viewerIdentityId: number,
        targetUserId: number,
        targetIdentityId: number
      ) => {
        const targetUser = users.find((user) => user.id === targetUserId);
        if (!targetUser) return null;
        const contact = contacts.find(
          (item) =>
            item.ownerIdentityId === viewerIdentityId && item.contactIdentityId === targetIdentityId
        );
        const friendRequest = [...friendRequests]
          .reverse()
          .find(
            (item) =>
              item.status === "pending" &&
              ((item.requesterIdentityId === viewerIdentityId &&
                item.targetIdentityId === targetIdentityId) ||
                (item.requesterIdentityId === targetIdentityId &&
                  item.targetIdentityId === viewerIdentityId))
          );
        return {
          user: publicProfile(targetUserId),
          identityCard: {
            entityType: "account" as const,
            profileId: null,
            displayName: targetUser.username,
            identityLabel: null,
            verified: false,
            creditValue: null,
            creditReviewCount: 0,
            gender: null,
            age: null,
            heightCm: null,
            languages: [],
            city: null,
            serviceArea: null,
            yearsExperience: null,
            bio: null
          },
          relationship: contact
            ? ("friend" as const)
            : friendRequest?.requesterIdentityId === viewerIdentityId
              ? ("outgoing_pending" as const)
              : friendRequest
                ? ("incoming_pending" as const)
                : ("none" as const),
          contactId: contact?.id ?? null,
          friendRequest: friendRequest ?? null
        };
      }
    ),
    setContactBlocked: jest.fn(
      async (input: { contactId: number; isBlocked: boolean; ownerUserId: number }) => {
        const contact = contacts.find(
          (item) => item.id === input.contactId && item.ownerUserId === input.ownerUserId
        );
        if (!contact) return null;
        contact.isBlocked = input.isBlocked;
        return contact;
      }
    ),
    deleteContact: jest.fn(async (input: { contactId: number; ownerUserId: number }) => {
      const ownedContact = contacts.find(
        (item) => item.id === input.contactId && item.ownerUserId === input.ownerUserId
      );
      if (!ownedContact) return null;
      const counterpartUserId = ownedContact.contactUserId;
      const removedContactIds = contacts
        .filter(
          (item) =>
            (item.ownerUserId === input.ownerUserId && item.contactUserId === counterpartUserId) ||
            (item.ownerUserId === counterpartUserId && item.contactUserId === input.ownerUserId)
        )
        .map((item) => item.id);
      for (let index = contacts.length - 1; index >= 0; index -= 1) {
        if (removedContactIds.includes(contacts[index]!.id)) contacts.splice(index, 1);
      }
      let deletedFollowCount = 0;
      for (let index = follows.length - 1; index >= 0; index -= 1) {
        const follow = follows[index]!;
        if (
          (follow.followerUserId === input.ownerUserId &&
            follow.followingUserId === counterpartUserId) ||
          (follow.followerUserId === counterpartUserId &&
            follow.followingUserId === input.ownerUserId)
        ) {
          follows.splice(index, 1);
          deletedFollowCount += 1;
        }
      }
      const conversation = conversations.find(
        (item) =>
          item.type === "direct" &&
          item.participantUserIds.includes(input.ownerUserId) &&
          item.participantUserIds.includes(counterpartUserId)
      );
      if (conversation) {
        conversation.participantUserIds = conversation.participantUserIds.filter(
          (userId) => userId !== input.ownerUserId
        );
      }
      return {
        actorUserId: input.ownerUserId,
        counterpartUserId,
        contactIds: removedContactIds,
        deletedContactCount: removedContactIds.length,
        deletedFollowCount,
        deletedConversationId: conversation?.id ?? null,
        deleted: true as const,
        deletedAt: now
      };
    }),
    createFriendRequest: jest.fn(
      async (input: {
        requesterUserId: number;
        requesterIdentityId: number;
        targetUserId: number;
        targetIdentityId: number;
        message?: string | null;
      }) => {
        const existing = friendRequests.find(
          (item) =>
            item.status === "pending" &&
            ((item.requesterIdentityId === input.requesterIdentityId &&
              item.targetIdentityId === input.targetIdentityId) ||
              (item.requesterIdentityId === input.targetIdentityId &&
                item.targetIdentityId === input.requesterIdentityId))
        );
        if (existing) {
          return {
            status: "ready" as const,
            result: { friendRequest: existing, created: false }
          };
        }
        const friendRequest = {
          id: friendRequestId++,
          requesterUserId: input.requesterUserId,
          requesterIdentityId: input.requesterIdentityId,
          targetUserId: input.targetUserId,
          targetIdentityId: input.targetIdentityId,
          requester: publicProfile(input.requesterUserId),
          target: publicProfile(input.targetUserId),
          status: "pending" as const,
          message: input.message ?? null,
          respondedAt: null,
          expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1_000),
          expiredAt: null,
          createdAt: now
        };
        friendRequests.push(friendRequest);
        notifications.push({
          id: notificationId++,
          recipientUserId: input.targetUserId,
          actorUserId: input.requesterUserId,
          type: "friendRequest",
          title: "New friend request",
          body: "Aya Customer sent a friend request",
          payload: { friendRequestId: friendRequest.id },
          readAt: null,
          createdAt: now
        });

        return {
          status: "ready" as const,
          result: { friendRequest, created: true }
        };
      }
    ),
    listFriendRequests: jest.fn(async (identityId: number) =>
      listPage(
        friendRequests.filter(
          (friendRequest) =>
            friendRequest.requesterIdentityId === identityId ||
            friendRequest.targetIdentityId === identityId
        )
      )
    ),
    respondToFriendRequest: jest.fn(
      async (input: {
        id: number;
        actorUserId: number;
        actorIdentityId: number;
        action: "accept" | "reject";
      }) => {
        const friendRequest = friendRequests.find((item) => item.id === input.id);
        if (
          !friendRequest ||
          friendRequest.targetIdentityId !== input.actorIdentityId ||
          friendRequest.status !== "pending"
        ) {
          return { status: "not_found" as const };
        }

        friendRequest.status = input.action === "accept" ? "accepted" : "rejected";
        friendRequest.respondedAt = now;
        if (input.action === "accept") {
          contacts.push({
            id: contactId++,
            ownerUserId: friendRequest.requesterUserId,
            ownerIdentityId: friendRequest.requesterIdentityId,
            contactUserId: friendRequest.targetUserId,
            contactIdentityId: friendRequest.targetIdentityId,
            nickname: null,
            isBlocked: false,
            createdAt: now
          });
          contacts.push({
            id: contactId++,
            ownerUserId: friendRequest.targetUserId,
            ownerIdentityId: friendRequest.targetIdentityId,
            contactUserId: friendRequest.requesterUserId,
            contactIdentityId: friendRequest.requesterIdentityId,
            nickname: null,
            isBlocked: false,
            createdAt: now
          });
          follows.push({
            id: followId++,
            followerUserId: friendRequest.requesterUserId,
            followingUserId: friendRequest.targetUserId,
            createdAt: now
          });
          follows.push({
            id: followId++,
            followerUserId: friendRequest.targetUserId,
            followingUserId: friendRequest.requesterUserId,
            createdAt: now
          });
        }

        return {
          status: "responded" as const,
          result: {
            friendRequest,
            recipientUserIds: [friendRequest.requesterUserId, friendRequest.targetUserId]
          }
        };
      }
    ),
    createSocialPost: jest.fn(
      async (input: {
        authorUserId: number;
        content: string;
        media?: unknown;
        mentionUserIds: number[];
        visibility: string;
      }) => {
        const mediaEnvelope =
          input.media && typeof input.media === "object"
            ? (input.media as { replyToPostId?: unknown })
            : null;
        const replyToPostId =
          typeof mediaEnvelope?.replyToPostId === "number" ? mediaEnvelope.replyToPostId : null;
        const socialPost = {
          id: socialPostId++,
          authorUserId: input.authorUserId,
          content: input.content,
          media: input.media ?? null,
          replyToPostId,
          replyCount: 0,
          visibility: input.visibility,
          createdAt: now
        };
        socialPosts.push(socialPost);
        if (replyToPostId !== null) {
          const replyTarget = socialPosts.find((post) => post.id === replyToPostId);
          if (replyTarget) {
            replyTarget.replyCount += 1;
          }
        }

        return { post: socialPost, notifications: [] };
      }
    ),
    updateSocialPost: jest.fn(
      async (input: {
        postId: number;
        authorUserId: number;
        content: string;
        media?: unknown;
        mentionUserIds: number[];
        visibility: string;
      }) => {
        const post = socialPosts.find(
          (candidate) =>
            candidate.id === input.postId && candidate.authorUserId === input.authorUserId
        );
        if (!post) return null;
        post.content = input.content;
        post.media = input.media ?? null;
        post.visibility = input.visibility;
        return { post, notifications: [] };
      }
    ),
    setSocialPostLike: jest.fn(
      async (input: { postId: number; actorIdentityId: number; active: boolean }) => {
        const post = socialPosts.find((candidate) => candidate.id === input.postId);
        if (!post) return null;
        const key = `${input.postId}:${input.actorIdentityId}`;
        const changed = input.active ? !socialLikeKeys.has(key) : socialLikeKeys.has(key);
        if (input.active) socialLikeKeys.add(key);
        else socialLikeKeys.delete(key);
        return { changed, post: mapSocialInteractionPost(post, input.actorIdentityId) };
      }
    ),
    setSocialPostBookmark: jest.fn(
      async (input: { postId: number; actorIdentityId: number; active: boolean }) => {
        const post = socialPosts.find((candidate) => candidate.id === input.postId);
        if (!post) return null;
        const key = `${input.postId}:${input.actorIdentityId}`;
        const changed = input.active ? !socialBookmarkKeys.has(key) : socialBookmarkKeys.has(key);
        if (input.active) socialBookmarkKeys.add(key);
        else socialBookmarkKeys.delete(key);
        return { changed, post: mapSocialInteractionPost(post, input.actorIdentityId) };
      }
    ),
    recordSocialPostView: jest.fn(async (input: { postId: number; actorIdentityId: number }) => {
      const post = socialPosts.find((candidate) => candidate.id === input.postId);
      if (!post) return null;
      const key = `${input.postId}:${input.actorIdentityId}`;
      const changed = !socialViewKeys.has(key);
      socialViewKeys.add(key);
      return { changed, post: mapSocialInteractionPost(post, input.actorIdentityId) };
    }),
    shareSocialPost: jest.fn(
      async (input: {
        postId: number;
        actorUserId: number;
        actorIdentityId: number;
        targetUserIds: number[];
        idempotencyKey: string;
      }) => {
        const post = socialPosts.find((candidate) => candidate.id === input.postId);
        if (!post) return null;
        const deliveries = input.targetUserIds.map((recipientUserId) => {
          const key = `${input.postId}:${input.actorIdentityId}:${recipientUserId}:${input.idempotencyKey}`;
          const created = !socialShareKeys.has(key);
          socialShareKeys.add(key);
          return {
            recipientUserId,
            recipientIdentityId: recipientUserId,
            created,
            message: {
              id: 900 + recipientUserId,
              conversationId: 800 + recipientUserId,
              senderUserId: input.actorUserId,
              type: "text" as const,
              content: "转发了一条动态",
              metadata: { needoMessageType: "social-post-card" },
              reactions: [],
              createdAt: now,
              recallDeadlineAt: new Date(now.getTime() + 180_000),
              recalledAt: null,
              recallMode: null,
              contentPurgedAt: null,
              expiresAt: null,
              privacyPolicyVersionAtSend: null,
              lifecycleVersion: 1,
              reactionVersion: 0,
              availableRecallModes: ["standard" as const]
            }
          };
        });
        return {
          changed: deliveries.some((delivery) => delivery.created),
          deliveries,
          post: mapSocialInteractionPost(post, input.actorIdentityId)
        };
      }
    ),
    listSocialPosts: jest.fn(async () => listPage(socialPosts)),
    getSocialPost: jest.fn(async (userId: number, postId: number) => {
      const post = socialPosts.find((item) => item.id === postId);
      if (!post) return null;
      const canRead =
        post.visibility === "public" ||
        post.authorUserId === userId ||
        follows.some(
          (follow) =>
            follow.followerUserId === userId && follow.followingUserId === post.authorUserId
        );
      return canRead ? post : null;
    }),
    getSocialActivityStatus: jest.fn(
      async (input: { viewerUserId: number; targetUserId: number; since: Date }) => {
        const target = users.find((user) => user.id === input.targetUserId);
        if (!target) return null;
        const latestVisiblePost = socialPosts
          .filter((post) => post.authorUserId === input.targetUserId)
          .filter((post) => post.createdAt >= input.since)
          .filter(
            (post) =>
              post.visibility === "public" ||
              post.authorUserId === input.viewerUserId ||
              follows.some(
                (follow) =>
                  follow.followerUserId === input.viewerUserId &&
                  follow.followingUserId === post.authorUserId
              )
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

        return {
          status: latestVisiblePost ? ("recent_posts" as const) : ("no_recent_posts" as const),
          latestVisiblePostAt: latestVisiblePost?.createdAt ?? null,
          profile: {
            userId: target.id,
            username: target.username,
            displayName: target.username,
            avatarUrl: target.avatarUrl,
            entityType:
              target.identities[0]?.type === "technician"
                ? ("technician" as const)
                : ("user" as const),
            joinedAt: target.createdAt
          }
        };
      }
    ),
    listFollowerUserIds: jest.fn(async (followingUserId: number) =>
      follows
        .filter((follow) => follow.followingUserId === followingUserId)
        .map((follow) => follow.followerUserId)
    ),
    createFollow: jest.fn(async (input: { followerUserId: number; followingUserId: number }) => {
      const existing = follows.find(
        (follow) =>
          follow.followerUserId === input.followerUserId &&
          follow.followingUserId === input.followingUserId
      );
      if (existing) {
        return existing;
      }

      const follow = {
        id: followId++,
        followerUserId: input.followerUserId,
        followingUserId: input.followingUserId,
        createdAt: now
      };
      follows.push(follow);

      return follow;
    }),
    deleteFollow: jest.fn(async () => ({ deleted: true })),
    listNotifications: jest.fn(async (userId: number, input: { unreadOnly?: boolean }) =>
      listPage(
        notifications.filter(
          (notification) =>
            notification.recipientUserId === userId &&
            (!input.unreadOnly || notification.readAt === null)
        )
      )
    ),
    markNotificationRead: jest.fn(async (userId: number, notificationIdToRead: number) => {
      const notification = notifications.find(
        (item) => item.id === notificationIdToRead && item.recipientUserId === userId
      );
      if (!notification) {
        return null;
      }
      notification.readAt = now;

      return notification;
    }),
    markAllNotificationsRead: jest.fn(async (userId: number) => {
      let count = 0;
      for (const notification of notifications) {
        if (notification.recipientUserId === userId && notification.readAt === null) {
          notification.readAt = now;
          count += 1;
        }
      }

      return { count };
    }),
    getUnreadCounts: jest.fn(async (identityId: number) => {
      const conversationsUnread = conversations.reduce(
        (sum, conversation) => sum + (conversation.unreadByUserId.get(identityId) ?? 0),
        0
      );
      const notificationsUnread = notifications.filter(
        (notification) =>
          notification.recipientUserId === identityId && notification.readAt === null
      ).length;
      const friendRequestsUnread = friendRequests.filter(
        (friendRequest) =>
          friendRequest.targetIdentityId === identityId && friendRequest.status === "pending"
      ).length;

      return {
        conversations: conversationsUnread,
        notifications: notificationsUnread,
        friendRequests: friendRequestsUnread,
        total: conversationsUnread + notificationsUnread + friendRequestsUnread
      };
    }),
    createOrderStatusNotifications: jest.fn(async () => [])
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) =>
          users.find((user) => user.email === identifier || user.username === identifier) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
        const user = users.find((item) => item.id === id);
        if (user) {
          user.lastLoginAt = loggedInAt;
        }
      }),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    realtimeRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  const revokePermission = (email: string, permissionCode: string) => {
    const user = users.find((candidate) => candidate.email === email);
    for (const userRole of user?.userRoles ?? []) {
      userRole.role.rolePermissions = userRole.role.rolePermissions.filter(
        (rolePermission) => rolePermission.permission.code !== permissionCode
      );
    }
  };

  return { app, login, realtimeRepository, revokePermission };
};

describe("Step 13 realtime IM / Social / Notification API", () => {
  it("accepts matching version-one judgement rich text and rejects invalid fallback values", () => {
    const richText = {
      version: 1 as const,
      parts: [
        { type: "text" as const, value: "确认" },
        { type: "judgement" as const, value: "Pending" }
      ]
    };

    const parsed = socialPostCreateBodySchema.parse({
      content: "确认Pending",
      media: { items: [], postType: "reply", replyToPostId: 700, richText }
    });
    expect((parsed.media as { richText?: unknown } | undefined)?.richText).toEqual(richText);

    expect(() =>
      socialPostCreateBodySchema.parse({
        content: "Later",
        media: {
          items: [],
          richText: { version: 1, parts: [{ type: "judgement", value: "Later" }] }
        }
      })
    ).toThrow();

    expect(() =>
      socialPostCreateBodySchema.parse({
        content: "Pending!",
        media: { items: [], richText }
      })
    ).toThrow();
  });

  it("accepts an image-only post while rejecting an empty post", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const checksum = "b".repeat(64);

    await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        content: "",
        media: {
          items: [{ id: "image-only", type: "image", mediaAssetPublicId: checksum }]
        },
        visibility: "public"
      })
      .expect(201);

    expect(fixture.realtimeRepository.createSocialPost).toHaveBeenLastCalledWith(
      expect.objectContaining({
        authorUserId: 1,
        content: "",
        media: {
          items: [{ id: "image-only", type: "image", mediaAssetPublicId: checksum }]
        }
      })
    );

    await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "", media: { items: [] }, visibility: "public" })
      .expect(400);
  });

  it("returns the reply relation on creation and the authoritative active count on its parent", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    const parent = await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "Parent", visibility: "public" })
      .expect(201);

    const reply = await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        content: "Reply",
        visibility: "public",
        media: { items: [], postType: "reply", replyToPostId: parent.body.data.id }
      })
      .expect(201);

    expect(reply.body.data).toMatchObject({
      replyToPostId: parent.body.data.id,
      replyCount: 0
    });

    const parentDetail = await request(fixture.app)
      .get(`/api/v1/social/posts/${parent.body.data.id}`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);

    expect(parentDetail.body.data).toMatchObject({ replyCount: 1 });
  });

  it("accepts only request-owned image references and unique contact reminder IDs", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const checksum = "a".repeat(64);

    await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        content: "Formal image post",
        media: {
          items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum, alt: "Quiet room" }],
          postType: "post",
          locationLabel: "东京 银座"
        },
        mentionUserIds: [2],
        visibility: "public"
      })
      .expect(201);

    expect(fixture.realtimeRepository.createSocialPost).toHaveBeenLastCalledWith(
      expect.objectContaining({
        authorUserId: 1,
        mentionUserIds: [2],
        media: {
          items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum, alt: "Quiet room" }],
          postType: "post",
          locationLabel: "东京 银座"
        },
        context: expect.objectContaining({ ip: expect.any(String) })
      })
    );

    for (const invalidBody of [
      {
        content: "Duplicate reminders",
        mentionUserIds: [2, 2]
      },
      {
        content: "Client URL is forbidden",
        media: { items: [{ id: "m1", type: "image", url: "/media/content/client.png" }] }
      },
      {
        content: "Video is not ready",
        media: { items: [{ id: "m1", type: "video", mediaAssetPublicId: checksum }] }
      },
      {
        content: "Counters are server owned",
        media: { items: [], counters: { likes: 99 } }
      }
    ]) {
      await request(fixture.app)
        .post("/api/v1/social/posts")
        .set("Authorization", `Bearer ${ayaToken}`)
        .send(invalidBody)
        .expect(400);
    }
  });

  it("updates only the authenticated author's published post through the strict PATCH contract", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    const created = await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "Before", visibility: "public" })
      .expect(201);
    const postId = created.body.data.id as number;

    const updated = await request(fixture.app)
      .patch(`/api/v1/social/posts/${postId}`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "After", mentionUserIds: [2], visibility: "followers" })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      id: postId,
      content: "After",
      visibility: "followers"
    });
    expect(fixture.realtimeRepository.updateSocialPost).toHaveBeenLastCalledWith(
      expect.objectContaining({
        postId,
        authorUserId: 1,
        content: "After",
        mentionUserIds: [2],
        context: expect.objectContaining({ ip: expect.any(String) })
      })
    );

    await request(fixture.app)
      .patch(`/api/v1/social/posts/${postId}`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ content: "Hijack", visibility: "public" })
      .expect(404);

    await request(fixture.app)
      .patch(`/api/v1/social/posts/${postId}`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "", media: { items: [] }, visibility: "public" })
      .expect(400);
  });

  it("returns a protected 30-day friend activity status without media payloads", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ content: "Recent appointment note", visibility: "public" })
      .expect(201);

    const response = await request(fixture.app)
      .get("/api/v1/social/users/2/activity-status")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        status: "no_recent_posts",
        latestVisiblePostAt: null,
        profile: {
          userId: 2,
          username: "Mika Technician",
          displayName: "Mika Technician",
          avatarUrl: null,
          entityType: "technician",
          joinedAt: now.toISOString()
        }
      }
    });
    expect(response.body.data).not.toHaveProperty("media");
    expect(fixture.realtimeRepository.getSocialActivityStatus).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: 1, targetUserId: 2 })
    );

    await request(fixture.app)
      .get("/api/v1/social/users/0/activity-status")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(400);
  });

  it("requires social-post:list for friend activity status", async () => {
    const fixture = await createFixture();
    fixture.revokePermission("aya@example.com", "social-post:list");
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .get("/api/v1/social/users/2/activity-status")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(403);
  });

  it("uses verified friend requests instead of direct contact creation", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .post("/api/v1/im/contacts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2 })
      .expect(404);

    const first = await request(fixture.app)
      .post("/api/v1/im/friend-requests")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2 })
      .expect(200);
    const repeated = await request(fixture.app)
      .post("/api/v1/im/friend-requests")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2 })
      .expect(200);

    expect(first.body.data).toMatchObject({
      created: true,
      friendRequest: { requesterUserId: 1, targetUserId: 2, status: "pending" }
    });
    expect(repeated.body.data).toMatchObject({
      created: false,
      friendRequest: { id: first.body.data.friendRequest.id }
    });

    await request(fixture.app)
      .get("/api/v1/im/directory/2")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.relationship).toBe("outgoing_pending");
        expect(body.data.user).not.toHaveProperty("email");
        expect(body.data.identityCard).toMatchObject({
          entityType: "account",
          creditValue: null,
          creditReviewCount: 0,
          languages: []
        });
        expect(body.data.identityCard).not.toHaveProperty("points");
        expect(body.data.identityCard).not.toHaveProperty("usageCount");
      });
  });

  it("blocks and unblocks only a contact owned by the authenticated user", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/friend-requests")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2 })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/im/friend-requests/1/accept")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);

    await request(fixture.app)
      .post("/api/v1/im/contacts/1/block")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ id: 1, isBlocked: true });
      });

    await request(fixture.app)
      .post("/api/v1/im/contacts/1/block")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(404);

    await request(fixture.app)
      .delete("/api/v1/im/contacts/1/block")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ id: 1, isBlocked: false });
      });
  });

  it("hard-deletes the bilateral friendship for an owned contact", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/friend-requests")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2 })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/im/friend-requests/1/accept")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);

    await request(fixture.app)
      .delete("/api/v1/im/contacts/1")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(404);

    await request(fixture.app)
      .delete("/api/v1/im/contacts/1")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          actorUserId: 1,
          counterpartUserId: 2,
          contactIds: [1, 2],
          deletedContactCount: 2,
          deleted: true
        });
      });

    await request(fixture.app)
      .get("/api/v1/im/contacts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list).toEqual([]);
      });
  });

  it("creates conversations, paginates messages with a cursor, and clears unread counts", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    const conversationResponse = await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);
    expect(conversationResponse.body.data).toMatchObject({
      id: 1,
      type: "direct",
      unreadCount: 0
    });

    await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "first hello" })
      .expect(201);
    const secondMessageResponse = await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "second hello" })
      .expect(201);

    const unreadBeforeRead = await request(fixture.app)
      .get("/api/v1/realtime/unread-counts")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(unreadBeforeRead.body.data).toMatchObject({
      conversations: 2,
      notifications: 0,
      friendRequests: 0,
      total: 2
    });

    const newestPage = await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=1")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(newestPage.body.data).toMatchObject({
      total: 2,
      page: 1,
      page_size: 1,
      nextCursor: secondMessageResponse.body.data.id
    });
    expect(newestPage.body.data.list[0]).toMatchObject({ content: "second hello" });

    const olderPage = await request(fixture.app)
      .get(
        `/api/v1/im/conversations/1/messages?pageSize=1&beforeId=${secondMessageResponse.body.data.id}`
      )
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(olderPage.body.data.list[0]).toMatchObject({ content: "first hello" });

    await request(fixture.app)
      .post("/api/v1/im/conversations/1/read")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual({ conversationId: 1, unreadCount: 0 });
      });

    const unreadAfterRead = await request(fixture.app)
      .get("/api/v1/realtime/unread-counts")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(unreadAfterRead.body.data.total).toBe(0);
  });

  it("creates and updates a formal private group, then lets the owner leave safely", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        type: "group",
        title: "Private group",
        participantUserIds: [2],
        privacyModeEnabled: true,
        hideMemberProfiles: true,
        disappearingTtlSeconds: 3_600,
        disappearingStartMode: "sent"
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          id: 1,
          privacyModeEnabled: true,
          hideMemberProfiles: true,
          disappearingTtlSeconds: 3_600,
          disappearingStartMode: "sent"
        });
      });

    await request(fixture.app)
      .patch("/api/v1/im/conversations/1/privacy")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        privacyModeEnabled: true,
        hideMemberProfiles: false,
        disappearingTtlSeconds: 7_200,
        disappearingStartMode: "read_by_all"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          privacyModeEnabled: true,
          hideMemberProfiles: false,
          disappearingTtlSeconds: 7_200,
          disappearingStartMode: "read_by_all"
        });
      });

    await request(fixture.app)
      .post("/api/v1/im/conversations/1/leave")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ transferOwnerUserId: 2 })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          conversationId: 1,
          removedUserId: 1,
          newOwnerUserId: null,
          dissolved: true
        });
      });

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "group", title: "Dissolve group", participantUserIds: [2] })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/im/conversations/2/dissolve")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ conversationId: 2, dissolved: true });
      });
  });

  it("rejects group privacy countdowns above 99 hours 59 minutes", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    const rejectedCreate = await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        type: "group",
        title: "Privacy countdown boundary",
        participantUserIds: [2],
        privacyModeEnabled: true,
        disappearingTtlSeconds: 359_941,
        disappearingStartMode: "sent"
      })
      .expect(400);
    expect(rejectedCreate.body.message).toBe("error.validation");

    const validCreate = await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        type: "group",
        title: "Privacy countdown boundary",
        participantUserIds: [2],
        privacyModeEnabled: true,
        disappearingTtlSeconds: 359_940,
        disappearingStartMode: "sent"
      })
      .expect(201);

    const rejectedUpdate = await request(fixture.app)
      .patch(`/api/v1/im/conversations/${validCreate.body.data.id}/privacy`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        privacyModeEnabled: true,
        disappearingTtlSeconds: 359_941,
        disappearingStartMode: "read_by_all"
      })
      .expect(400);
    expect(rejectedUpdate.body.message).toBe("error.validation");

    await request(fixture.app)
      .patch(`/api/v1/im/conversations/${validCreate.body.data.id}/privacy`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({
        privacyModeEnabled: true,
        disappearingTtlSeconds: 359_940,
        disappearingStartMode: "read_by_all"
      })
      .expect(200);
  });

  it("recalls an owned message through the protected formal endpoint", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);
    const messageResponse = await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "撤回后重新编辑" })
      .expect(201);

    await request(fixture.app)
      .post(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/recall`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ mode: "standard" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          action: "standard_recall",
          conversationId: 1,
          messageId: messageResponse.body.data.id,
          message: {
            id: messageResponse.body.data.id,
            content: null,
            metadata: null,
            recallMode: "standard"
          }
        });
      });
  });

  it("requires message:recall and rejects unsupported recall modes", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages/1/recall")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ mode: "traceless" })
      .expect(400);

    fixture.revokePermission("aya@example.com", "message:recall");
    const tokenWithoutPermission = await fixture.login("aya@example.com");
    await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages/1/recall")
      .set("Authorization", `Bearer ${tokenWithoutPermission}`)
      .send({ mode: "standard" })
      .expect(403);
  });

  it("keeps pin, mute, auto translation, unread, and deletion state private to each conversation participant", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);

    await request(fixture.app)
      .patch("/api/v1/im/conversations/1/preferences")
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({})
      .expect(400);

    await request(fixture.app)
      .patch("/api/v1/im/conversations/1/preferences")
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ autoTranslateMessages: "yes" })
      .expect(400);

    await request(fixture.app)
      .patch("/api/v1/im/conversations/1/preferences")
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ isPinned: true, isMuted: true, autoTranslateMessages: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          autoTranslateMessages: true,
          isMuted: true,
          isPinned: true
        });
      });

    await request(fixture.app)
      .post("/api/v1/im/conversations/1/unread")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ unreadCount: 1 });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          isHidden: false,
          autoTranslateMessages: false,
          isMuted: false,
          isPinned: false,
          unreadCount: 0
        });
      });

    await request(fixture.app)
      .delete("/api/v1/im/conversations/1")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ isHidden: true, unreadCount: 0 });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ list: [], total: 0 });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ total: 1 });
      });
  });

  it("clears history permanently for only the requesting participant", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "仅删除我方历史" })
      .expect(201);

    await request(fixture.app)
      .delete("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ lastMessage: null, unreadCount: 0 });
      });
    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ list: [], total: 0 });
      });
    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list).toHaveLength(1);
        expect(response.body.data.list[0]).toMatchObject({ content: "仅删除我方历史" });
      });
  });

  it("deletes one message permanently for only the requesting participant", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);
    const messageResponse = await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "只从我的聊天记录删除" })
      .expect(201);

    const messageId = messageResponse.body.data.id as number;
    await request(fixture.app)
      .delete(`/api/v1/im/conversations/1/messages/${messageId}`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual({
          conversationId: 1,
          messageId,
          deleted: true
        });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ list: [], total: 0 });
      });
    await request(fixture.app)
      .get("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({ lastMessage: null });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          id: messageId,
          content: "只从我的聊天记录删除"
        });
      });
  });

  it("enforces one judgement plus one emoji and returns the authoritative state", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    await request(fixture.app)
      .post("/api/v1/im/conversations")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "direct", participantUserIds: [2] })
      .expect(201);
    const messageResponse = await request(fixture.app)
      .post("/api/v1/im/conversations/1/messages")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ type: "text", content: "承知しました。" })
      .expect(201);

    const judgementResponse = await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "OK" })
      .expect(200);
    expect(judgementResponse.body.data).toMatchObject({
      id: messageResponse.body.data.id,
      reactionVersion: 1,
      reactions: [
        {
          emoji: "OK",
          reactedByMe: true,
          people: [{ userId: 2, username: "Mika Technician" }]
        }
      ]
    });

    const emojiResponse = await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "😂" })
      .expect(200);
    expect(emojiResponse.body.data).toMatchObject({
      reactionVersion: 2,
      reactions: [{ emoji: "OK" }, { emoji: "😂" }]
    });

    await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "NO" })
      .expect(409)
      .expect((response) => {
        expect(response.body).toEqual({
          code: 40946,
          message: "error.im.reaction_slot_occupied",
          data: null
        });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          id: messageResponse.body.data.id,
          reactionVersion: 2,
          reactions: [
            { emoji: "OK", reactedByMe: true },
            { emoji: "😂", reactedByMe: true }
          ]
        });
      });

    await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "OK" })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.reactionVersion).toBe(2);
      });

    await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ emoji: "😂" })
      .expect(200);

    await request(fixture.app)
      .delete(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "OK" })
      .expect(200);

    await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "NO" })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          reactionVersion: 5,
          reactions: [
            {
              emoji: "NO",
              reactedByMe: true,
              people: [{ userId: 2, username: "Mika Technician" }]
            },
            {
              emoji: "😂",
              reactedByMe: true,
              people: [
                { userId: 2, username: "Mika Technician" },
                { userId: 1, username: "Aya Customer" }
              ]
            }
          ]
        });
      });
  });

  it("handles friend requests, contacts, social posts, follows, and notification reads", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const mikaToken = await fixture.login("mika@example.com");

    const friendRequestResponse = await request(fixture.app)
      .post("/api/v1/im/friend-requests")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserId: 2, message: "let us connect" })
      .expect(200);
    expect(friendRequestResponse.body.data).toMatchObject({
      created: true,
      friendRequest: {
        id: 1,
        requesterUserId: 1,
        targetUserId: 2,
        status: "pending"
      }
    });

    const mikaNotifications = await request(fixture.app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(mikaNotifications.body.data).toMatchObject({
      total: 1,
      list: [expect.objectContaining({ type: "friendRequest", readAt: null })]
    });

    await request(fixture.app)
      .post("/api/v1/im/friend-requests/1/accept")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.status).toBe("accepted");
      });

    const ayaContacts = await request(fixture.app)
      .get("/api/v1/im/contacts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);
    expect(ayaContacts.body.data.list).toEqual([
      expect.objectContaining({ ownerUserId: 1, contactUserId: 2 })
    ]);

    const socialPostResponse = await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "A quiet recovery note", visibility: "public" })
      .expect(201);
    expect(socialPostResponse.body.data).toMatchObject({
      id: 1,
      authorUserId: 1,
      content: "A quiet recovery note"
    });

    await request(fixture.app)
      .get("/api/v1/social/posts/1")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          id: 1,
          authorUserId: 1,
          content: "A quiet recovery note"
        });
      });

    await request(fixture.app)
      .get("/api/v1/social/posts/999")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(404);

    await request(fixture.app)
      .post("/api/v1/social/follows")
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ targetUserId: 1 })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ followerUserId: 2, followingUserId: 1 });
      });

    const postsResponse = await request(fixture.app)
      .get("/api/v1/social/posts?page=1&pageSize=20")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(postsResponse.body.data.list).toEqual([
      expect.objectContaining({ authorUserId: 1, content: "A quiet recovery note" })
    ]);

    await request(fixture.app)
      .post("/api/v1/notifications/1/read")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.readAt).not.toBeNull();
      });

    const unreadCounts = await request(fixture.app)
      .get("/api/v1/realtime/unread-counts")
      .set("Authorization", `Bearer ${mikaToken}`)
      .expect(200);
    expect(unreadCounts.body.data).toMatchObject({
      notifications: 0,
      friendRequests: 0,
      total: 0
    });
  });

  it("accepts a first-class reply relation filter for paginated social lists", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .get("/api/v1/social/posts?replyToPostId=700&page=2&pageSize=100")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);

    expect(fixture.realtimeRepository.listSocialPosts).toHaveBeenLastCalledWith(
      1,
      { page: 2, pageSize: 100, replyToPostId: 700 },
      1
    );
  });

  it("serves the bilateral friends timeline through its permission-protected route", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");

    await request(fixture.app)
      .get("/api/v1/social/timeline/friends?page=2&pageSize=20")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);

    expect(fixture.realtimeRepository.listSocialPosts).toHaveBeenLastCalledWith(
      1,
      { friendsOnly: true, page: 2, pageSize: 20 },
      1
    );
  });

  it("wires formal like, bookmark, unique-view, and friend-share endpoints", async () => {
    const fixture = await createFixture();
    const ayaToken = await fixture.login("aya@example.com");
    const created = await request(fixture.app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ content: "Interaction contract", visibility: "public" })
      .expect(201);
    const postId = created.body.data.id as number;

    await request(fixture.app)
      .put(`/api/v1/social/posts/${postId}/like`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          counters: { likes: 1 },
          viewerInteraction: { liked: true }
        });
      });
    await request(fixture.app)
      .delete(`/api/v1/social/posts/${postId}/like`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          counters: { likes: 0 },
          viewerInteraction: { liked: false }
        });
      });
    await request(fixture.app)
      .put(`/api/v1/social/posts/${postId}/bookmark`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.viewerInteraction.bookmarked).toBe(true);
      });
    await request(fixture.app)
      .get("/api/v1/social/posts?bookmarked=true&page=1&pageSize=20")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);
    expect(fixture.realtimeRepository.listSocialPosts).toHaveBeenLastCalledWith(
      1,
      { bookmarked: true, page: 1, pageSize: 20 },
      1
    );

    await request(fixture.app)
      .post(`/api/v1/social/posts/${postId}/view`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/social/posts/${postId}/view`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.counters.views).toBe(1);
      });

    await request(fixture.app)
      .post(`/api/v1/social/posts/${postId}/shares`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .send({ targetUserIds: [2] })
      .expect(400);
    await request(fixture.app)
      .post(`/api/v1/social/posts/${postId}/shares`)
      .set("Authorization", `Bearer ${ayaToken}`)
      .set("Idempotency-Key", "social-share-contract-1")
      .send({ targetUserIds: [2] })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ deliveredUserIds: [2] });
        expect(response.body.data.post.counters.reposts).toBe(1);
      });
  });
});
