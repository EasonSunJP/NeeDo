import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeService } from "../src/services/realtime.service";

const auth = {
  userId: 7,
  currentIdentityId: 71,
  currentIdentityType: "scout"
} as never;

const scopeResolver = {
  resolve: jest.fn(async () => ({ identityId: 70, userId: 7, identityType: "customer" }))
};

const eventGateway = {
  publish: jest.fn(),
  subscribe: jest.fn()
};

describe("RealtimeService personal identity scope", () => {
  it("lists customer and affiliate contacts from their shared canonical identity", async () => {
    const result = { list: [], total: 0, page: 1, page_size: 20 };
    const repository = { listContacts: jest.fn(async () => result) };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await expect(service.listContacts(auth, { page: 1, pageSize: 20 })).resolves.toBe(result);

    expect(scopeResolver.resolve).toHaveBeenCalledWith(auth);
    expect(repository.listContacts).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 });
    expect(repository.listContacts).not.toHaveBeenCalledWith(7, expect.anything());
  });

  it("lists conversations and messages through the active personal identity", async () => {
    const conversations = { list: [], total: 0, page: 1, page_size: 20 };
    const messages = { list: [], total: 0, page: 1, page_size: 20, nextCursor: null };
    const repository = {
      listConversations: jest.fn(async () => conversations),
      listMessages: jest.fn(async () => messages)
    };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await expect(service.listConversations(auth, { page: 1, pageSize: 20 })).resolves.toBe(conversations);
    await expect(service.listMessages(auth, {
      conversationId: 99,
      userId: 7,
      pageSize: 20
    })).resolves.toBe(messages);

    expect(repository.listConversations).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 });
    expect(repository.listMessages).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 99,
      identityId: 70,
      userId: 7
    }));
  });

  it("writes a friend request and message with server-derived identity ownership", async () => {
    const friendRequest = {
      id: 4,
      requesterUserId: 7,
      requesterIdentityId: 70,
      targetUserId: 8,
      targetIdentityId: 80,
      status: "pending" as const
    };
    const message = { id: 5, conversationId: 99, senderUserId: 7 };
    const repository = {
      findActiveUserIds: jest.fn(async () => [8]),
      findCanonicalIdentityIdForUser: jest.fn(async () => 80),
      createFriendRequest: jest.fn(async () => ({
        status: "ready" as const,
        result: { friendRequest, created: true }
      })),
      isMessageSenderBlocked: jest.fn(async () => false),
      createMessage: jest.fn(async () => message),
      getConversationForUser: jest.fn(async () => ({ participants: [] }))
    };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await service.createFriendRequest(auth, { targetUserId: 8 });
    await service.createMessage(auth, {
      conversationId: 99,
      type: "text",
      content: "formal"
    });

    expect(repository.createFriendRequest).toHaveBeenCalledWith({
      requesterIdentityId: 70,
      requesterUserId: 7,
      targetIdentityId: 80,
      targetUserId: 8,
      message: undefined
    });
    expect(repository.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      senderIdentityId: 70,
      senderUserId: 7
    }));
    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      recipientIdentityId: 80,
      type: "friend_request.created"
    }));
  });

  it("subscribes SSE by canonical identity instead of account user id", async () => {
    const repository = {};
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);
    const response = {} as never;

    await service.streamEvents(auth, response);

    expect(eventGateway.subscribe).toHaveBeenCalledWith(70, response);
    expect(eventGateway.subscribe).not.toHaveBeenCalledWith(7, response);
  });

  it("owns social posts, follows, notifications, and unread counts by canonical identity", async () => {
    const post = { id: 12, authorUserId: 7, authorIdentityId: 70 };
    const notifications = { list: [], total: 0, page: 1, page_size: 20 };
    const repository = {
      createSocialPost: jest.fn(async () => ({ post, notifications: [] })),
      listFollowerRecipients: jest.fn(async () => [{ userId: 8, identityId: 80 }]),
      listSocialPosts: jest.fn(async () => ({ list: [post], total: 1, page: 1, page_size: 20 })),
      findActiveUserIds: jest.fn(async () => [8]),
      findCanonicalIdentityIdForUser: jest.fn(async () => 80),
      createFollow: jest.fn(async () => ({ id: 3 })),
      listNotifications: jest.fn(async () => notifications),
      getUnreadCounts: jest.fn(async () => ({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
    };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await service.createSocialPost(
      auth,
      { content: "identity-owned", mentionUserIds: [], visibility: "public" },
      { ip: "127.0.0.1" }
    );
    await service.listSocialPosts(auth, { page: 1, pageSize: 20 });
    await service.createFollow(auth, { targetUserId: 8 });
    await service.listNotifications(auth, { page: 1, pageSize: 20 });
    await service.getUnreadCounts(auth);

    expect(repository.createSocialPost).toHaveBeenCalledWith(expect.objectContaining({
      authorIdentityId: 70,
      authorUserId: 7
    }));
    expect(repository.listSocialPosts).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 }, 7);
    expect(repository.createFollow).toHaveBeenCalledWith({
      followerIdentityId: 70,
      followerUserId: 7,
      followingIdentityId: 80,
      followingUserId: 8
    });
    expect(repository.listNotifications).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 });
    expect(repository.getUnreadCounts).toHaveBeenCalledWith(70);
    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      recipientIdentityId: 80,
      type: "social.post.created"
    }));
  });
});
