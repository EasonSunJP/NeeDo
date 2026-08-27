import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";

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
  "message:react",
  "message:read",
  "contact:list",
  "contact:block",
  "friend-request:list",
  "friend-request:create",
  "friend-request:respond",
  "social-post:list",
  "social-post:create",
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
    unreadByUserId: Map<number, number>;
    preferencesByUserId: Map<
      number,
      { isHidden: boolean; isMuted: boolean; isPinned: boolean }
    >;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const messages: Array<{
    id: number;
    conversationId: number;
    senderUserId: number;
    type: string;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }> = [];
  const messageReactions: Array<{
    messageId: number;
    userId: number;
    emoji: string;
  }> = [];
  const contacts: Array<{
    id: number;
    ownerUserId: number;
    contactUserId: number;
    nickname: string | null;
    isBlocked: boolean;
    createdAt: Date;
  }> = [];
  const friendRequests: Array<{
    id: number;
    requesterUserId: number;
    targetUserId: number;
    status: string;
    message: string | null;
    respondedAt: Date | null;
    createdAt: Date;
  }> = [];
  const socialPosts: Array<{
    id: number;
    authorUserId: number;
    content: string;
    media: unknown;
    visibility: string;
    createdAt: Date;
  }> = [];
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
      reactions: Array.from(grouped.entries()).map(([emoji, people]) => ({
        emoji,
        people,
        reactedByMe: people.some((person) => person.userId === viewerUserId)
      }))
    };
  };

  const mapConversation = (conversation: (typeof conversations)[number], userId: number) => {
    const lastMessage = messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((left, right) => right.id - left.id)[0];

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      participants: conversation.participantUserIds.map((participantUserId) => ({
        userId: participantUserId,
        username: users.find((user) => user.id === participantUserId)?.username ?? "Unknown",
        avatarUrl: null
      })),
      lastMessage: lastMessage ? mapMessage(lastMessage, userId) : null,
      unreadCount: conversation.unreadByUserId.get(userId) ?? 0,
      ...(conversation.preferencesByUserId.get(userId) ?? {
        isHidden: false,
        isMuted: false,
        isPinned: false
      }),
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
    createConversation: jest.fn(
      async (input: {
        creatorUserId: number;
        type: "direct" | "group";
        title?: string | null;
        participantUserIds: number[];
      }) => {
        const participantUserIds = Array.from(
          new Set([input.creatorUserId, ...input.participantUserIds])
        );
        const conversation = {
          id: conversationId++,
          type: input.type,
          title: input.title ?? null,
          participantUserIds,
          unreadByUserId: new Map(participantUserIds.map((userId) => [userId, 0])),
          preferencesByUserId: new Map(
            participantUserIds.map((userId) => [
              userId,
              { isHidden: false, isMuted: false, isPinned: false }
            ])
          ),
          createdAt: now,
          updatedAt: now
        };
        conversations.push(conversation);

        return mapConversation(conversation, input.creatorUserId);
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
          return null;
        }

        const message = {
          id: messageId++,
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          type: input.type,
          content: input.content,
          metadata: input.metadata ?? null,
          createdAt: now
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

        return mapMessage(message, input.senderUserId);
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
        if (!conversation?.participantUserIds.includes(input.userId) || !message) return null;

        if (
          !messageReactions.some(
            (reaction) =>
              reaction.messageId === input.messageId &&
              reaction.userId === input.userId &&
              reaction.emoji === input.emoji
          )
        ) {
          messageReactions.push({
            messageId: input.messageId,
            userId: input.userId,
            emoji: input.emoji
          });
        }
        return mapMessage(message, input.userId);
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
        if (!conversation?.participantUserIds.includes(input.userId) || !message) return null;

        const reactionIndex = messageReactions.findIndex(
          (reaction) =>
            reaction.messageId === input.messageId &&
            reaction.userId === input.userId &&
            reaction.emoji === input.emoji
        );
        if (reactionIndex >= 0) messageReactions.splice(reactionIndex, 1);
        return mapMessage(message, input.userId);
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
    markConversationUnread: jest.fn(
      async (input: { conversationId: number; userId: number }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.userId)) return null;
        conversation.unreadByUserId.set(
          input.userId,
          Math.max(1, conversation.unreadByUserId.get(input.userId) ?? 0)
        );
        return mapConversation(conversation, input.userId);
      }
    ),
    updateConversationPreferences: jest.fn(
      async (input: {
        conversationId: number;
        userId: number;
        isMuted?: boolean;
        isPinned?: boolean;
      }) => {
        const conversation = conversations.find((item) => item.id === input.conversationId);
        if (!conversation?.participantUserIds.includes(input.userId)) return null;
        const current = conversation.preferencesByUserId.get(input.userId) ?? {
          isHidden: false,
          isMuted: false,
          isPinned: false
        };
        conversation.preferencesByUserId.set(input.userId, {
          ...current,
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
    listContacts: jest.fn(async (userId: number) =>
      listPage(contacts.filter((contact) => contact.ownerUserId === userId))
    ),
    setContactBlocked: jest.fn(
      async (input: {
        contactId: number;
        isBlocked: boolean;
        ownerUserId: number;
      }) => {
        const contact = contacts.find(
          (item) => item.id === input.contactId && item.ownerUserId === input.ownerUserId
        );
        if (!contact) return null;
        contact.isBlocked = input.isBlocked;
        return contact;
      }
    ),
    createFriendRequest: jest.fn(
      async (input: { requesterUserId: number; targetUserId: number; message?: string | null }) => {
        const friendRequest = {
          id: friendRequestId++,
          requesterUserId: input.requesterUserId,
          targetUserId: input.targetUserId,
          status: "pending",
          message: input.message ?? null,
          respondedAt: null,
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

        return friendRequest;
      }
    ),
    listFriendRequests: jest.fn(async (userId: number) =>
      listPage(
        friendRequests.filter(
          (friendRequest) =>
            friendRequest.requesterUserId === userId || friendRequest.targetUserId === userId
        )
      )
    ),
    respondToFriendRequest: jest.fn(
      async (input: { id: number; actorUserId: number; action: "accept" | "reject" }) => {
        const friendRequest = friendRequests.find((item) => item.id === input.id);
        if (
          !friendRequest ||
          friendRequest.targetUserId !== input.actorUserId ||
          friendRequest.status !== "pending"
        ) {
          return null;
        }

        friendRequest.status = input.action === "accept" ? "accepted" : "rejected";
        friendRequest.respondedAt = now;
        if (input.action === "accept") {
          contacts.push({
            id: contactId++,
            ownerUserId: friendRequest.requesterUserId,
            contactUserId: friendRequest.targetUserId,
            nickname: null,
            isBlocked: false,
            createdAt: now
          });
          contacts.push({
            id: contactId++,
            ownerUserId: friendRequest.targetUserId,
            contactUserId: friendRequest.requesterUserId,
            nickname: null,
            isBlocked: false,
            createdAt: now
          });
        }

        return friendRequest;
      }
    ),
    createSocialPost: jest.fn(
      async (input: {
        authorUserId: number;
        content: string;
        media?: unknown;
        visibility: string;
      }) => {
        const socialPost = {
          id: socialPostId++,
          authorUserId: input.authorUserId,
          content: input.content,
          media: input.media ?? null,
          visibility: input.visibility,
          createdAt: now
        };
        socialPosts.push(socialPost);

        return socialPost;
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
            entityType: target.identities[0]?.type === "technician" ? ("technician" as const) : ("user" as const),
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
    getUnreadCounts: jest.fn(async (userId: number) => {
      const conversationsUnread = conversations.reduce(
        (sum, conversation) => sum + (conversation.unreadByUserId.get(userId) ?? 0),
        0
      );
      const notificationsUnread = notifications.filter(
        (notification) => notification.recipientUserId === userId && notification.readAt === null
      ).length;
      const friendRequestsUnread = friendRequests.filter(
        (friendRequest) =>
          friendRequest.targetUserId === userId && friendRequest.status === "pending"
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

  it("keeps pin, mute, unread, and deletion state private to each conversation participant", async () => {
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
      .send({ isPinned: true, isMuted: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ isMuted: true, isPinned: true });
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

  it("persists message reactions and returns them when the conversation is loaded again", async () => {
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

    await request(fixture.app)
      .put(`/api/v1/im/conversations/1/messages/${messageResponse.body.data.id}/reactions`)
      .set("Authorization", `Bearer ${mikaToken}`)
      .send({ emoji: "😂" })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          id: messageResponse.body.data.id,
          reactions: [
            {
              emoji: "😂",
              reactedByMe: true,
              people: [{ userId: 2, username: "Mika Technician" }]
            }
          ]
        });
      });

    await request(fixture.app)
      .get("/api/v1/im/conversations/1/messages?pageSize=20")
      .set("Authorization", `Bearer ${ayaToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          id: messageResponse.body.data.id,
          reactions: [
            {
              emoji: "😂",
              reactedByMe: false,
              people: [{ userId: 2, username: "Mika Technician" }]
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
      .expect(201);
    expect(friendRequestResponse.body.data).toMatchObject({
      id: 1,
      requesterUserId: 1,
      targetUserId: 2,
      status: "pending"
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
});
