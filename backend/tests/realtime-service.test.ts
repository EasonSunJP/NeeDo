import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeService fuzzy search", () => {
  it("keeps add-friend discovery scoped to the authenticated user", async () => {
    const directoryResult = { list: [], total: 0, page: 1, page_size: 50 };
    const repository = {
      searchDirectory: jest.fn(async () => directoryResult)
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.searchDirectory(
        { userId: 41 } as never,
        { query: "u0000000167", page: 1, pageSize: 50 }
      )
    ).resolves.toBe(directoryResult);
    expect(repository.searchDirectory).toHaveBeenCalledWith(41, {
      query: "u0000000167",
      page: 1,
      pageSize: 50
    });
  });

  it("creates a manual contact for another active user and publishes the update", async () => {
    const contact = { id: 31, ownerUserId: 41, contactUserId: 167 };
    const repository = {
      findActiveUserIds: jest.fn(async () => [167]),
      addContact: jest.fn(async () => contact)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(service.addContact({ userId: 41 } as never, 167)).resolves.toBe(contact);

    expect(repository.addContact).toHaveBeenCalledWith({
      contactUserId: 167,
      ownerUserId: 41,
      source: "manual"
    });
    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      payload: contact,
      recipientUserId: 41,
      type: "contact.updated"
    }));
  });
});

describe("RealtimeService friend request lifecycle", () => {
  const friendRequest = {
    id: 19,
    requesterUserId: 41,
    targetUserId: 167,
    status: "pending" as const
  };

  it("publishes only when a new request was created", async () => {
    const repository = {
      findActiveUserIds: jest.fn(async () => [167]),
      createFriendRequest: jest.fn(async () => ({
        status: "ready" as const,
        result: { friendRequest, created: false }
      }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.createFriendRequest({ userId: 41 } as never, { targetUserId: 167 })
    ).resolves.toBe(friendRequest);
    expect(eventGateway.publish).not.toHaveBeenCalled();

    repository.createFriendRequest.mockResolvedValueOnce({
      status: "ready",
      result: { friendRequest, created: true }
    });
    await service.createFriendRequest({ userId: 41 } as never, { targetUserId: 167 });
    expect(eventGateway.publish).toHaveBeenCalledTimes(1);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.created",
        recipientUserId: 167,
        payload: friendRequest
      })
    );
  });

  it("publishes an accepted request to both accounts", async () => {
    const accepted = { ...friendRequest, status: "accepted" as const };
    const repository = {
      respondToFriendRequest: jest.fn(async () => ({
        status: "responded" as const,
        result: { friendRequest: accepted, recipientUserIds: [41, 167] }
      }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.respondToFriendRequest({ userId: 167 } as never, 19, "accept")
    ).resolves.toBe(accepted);
    expect(eventGateway.publish).toHaveBeenCalledTimes(2);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "friend_request.accepted", recipientUserId: 41 })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "friend_request.accepted", recipientUserId: 167 })
    );
  });

  it("rejects an expired response without publishing", async () => {
    const repository = {
      respondToFriendRequest: jest.fn(async () => ({
        status: "expired" as const,
        friendRequest: { ...friendRequest, status: "expired" as const }
      }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.respondToFriendRequest({ userId: 167 } as never, 19, "accept")
    ).rejects.toMatchObject({ message: "error.realtime.friend_request_expired" });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });
});

describe("RealtimeService social events", () => {
  it("publishes a created post to followers and persisted reminders to their recipients", async () => {
    const post = {
      id: 44,
      authorUserId: 1,
      content: "live update",
      media: null,
      visibility: "public" as const,
      createdAt: new Date("2026-08-25T00:00:00.000Z")
    };
    const repository = {
      createSocialPost: jest.fn(async () => ({
        post,
        notifications: [
          {
            id: 501,
            recipientUserId: 4,
            actorUserId: 1,
            type: "social" as const,
            title: "动态提醒",
            body: "提醒你查看一条新动态。",
            payload: { kind: "post_mention", postId: 44 },
            readAt: null,
            createdAt: post.createdAt
          }
        ]
      })),
      listFollowerUserIds: jest.fn(async () => [2, 3])
    };
    const eventGateway = {
      publish: jest.fn(),
      subscribe: jest.fn()
    };
    const service = new RealtimeService(repository as never, eventGateway);

    await service.createSocialPost(
      { userId: 1 } as never,
      { content: post.content, mentionUserIds: [4], visibility: post.visibility },
      { ip: "127.0.0.1", userAgent: "realtime-service-test" }
    );

    expect(repository.listFollowerUserIds).toHaveBeenCalledWith(1);
    expect(eventGateway.publish).toHaveBeenCalledTimes(4);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "social.post.created",
        recipientUserId: 2,
        payload: post
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "notification.created",
        recipientUserId: 4,
        payload: expect.objectContaining({ id: 501, recipientUserId: 4 })
      })
    );
  });

  it("publishes no events when the repository transaction rejects", async () => {
    const repository = {
      createSocialPost: jest.fn(async () => {
        throw new Error("transaction rolled back");
      }),
      listFollowerUserIds: jest.fn()
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.createSocialPost(
        { userId: 1 } as never,
        { content: "failed post", mentionUserIds: [4], visibility: "public" },
        { ip: "127.0.0.1" }
      )
    ).rejects.toThrow("transaction rolled back");
    expect(repository.listFollowerUserIds).not.toHaveBeenCalled();
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("publishes a post update and only the new reminder notifications returned by the transaction", async () => {
    const post = {
      id: 44,
      authorUserId: 1,
      content: "edited",
      media: null,
      visibility: "followers" as const,
      createdAt: new Date("2026-08-25T00:00:00.000Z")
    };
    const notification = {
      id: 502,
      recipientUserId: 5,
      actorUserId: 1,
      type: "social" as const,
      title: "动态提醒",
      body: "提醒你查看一条动态。",
      payload: { kind: "post_mention", postId: 44 },
      readAt: null,
      createdAt: post.createdAt
    };
    const repository = {
      updateSocialPost: jest.fn(async () => ({ post, notifications: [notification] })),
      listFollowerUserIds: jest.fn(async () => [2])
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(service.updateSocialPost(
      { userId: 1 } as never,
      44,
      { content: "edited", mentionUserIds: [5], visibility: "followers" },
      { ip: "127.0.0.1" }
    )).resolves.toBe(post);

    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "social.post.updated",
      recipientUserId: 2,
      payload: post
    }));
    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "notification.created",
      recipientUserId: 5,
      payload: notification
    }));
  });
});

describe("RealtimeService standard message recall", () => {
  const recalledMessage = {
    id: 700,
    conversationId: 91,
    senderUserId: 1,
    type: "text" as const,
    content: null,
    metadata: null,
    reactions: [],
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    recallDeadlineAt: new Date("2026-08-28T00:03:00.000Z"),
    recalledAt: new Date("2026-08-28T00:01:00.000Z"),
    recallMode: "standard" as const,
    contentPurgedAt: new Date("2026-08-28T00:01:00.000Z"),
    lifecycleVersion: 1,
    availableRecallModes: []
  };

  const createRecallFixture = (
    outcome:
      | { status: "recalled" | "already_recalled"; message: typeof recalledMessage }
      | { status: "not_found" | "window_expired" }
  ) => {
    const repository = {
      recallMessage: jest.fn(async () => outcome),
      getConversationForUser: jest.fn(async () => ({
        participants: [{ userId: 1 }, { userId: 2 }]
      }))
    };
    const eventGateway = {
      publish: jest.fn(),
      subscribe: jest.fn()
    };
    const service = new RealtimeService(repository as never, eventGateway);

    return { eventGateway, repository, service };
  };

  it("publishes a content-free standard recall to every participant", async () => {
    const { eventGateway, repository, service } = createRecallFixture({
      status: "recalled",
      message: recalledMessage
    });

    await expect(
      service.recallMessage(
        { userId: 1 } as never,
        { conversationId: 91, messageId: 700, mode: "standard" }
      )
    ).resolves.toEqual({
      action: "standard_recall",
      conversationId: 91,
      messageId: 700,
      message: recalledMessage
    });

    expect(repository.recallMessage).toHaveBeenCalledWith({
      conversationId: 91,
      messageId: 700,
      senderUserId: 1,
      now: expect.any(Date)
    });
    expect(recalledMessage.content).toBeNull();
    expect(recalledMessage.metadata).toBeNull();
    expect(eventGateway.publish).toHaveBeenCalledTimes(2);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message.recalled",
        recipientUserId: 2,
        payload: recalledMessage
      })
    );
  });

  it("returns an idempotent tombstone without publishing duplicate events", async () => {
    const { eventGateway, service } = createRecallFixture({
      status: "already_recalled",
      message: recalledMessage
    });

    await expect(
      service.recallMessage(
        { userId: 1 } as never,
        { conversationId: 91, messageId: 700, mode: "standard" }
      )
    ).resolves.toEqual({
      action: "standard_recall",
      conversationId: 91,
      messageId: 700,
      message: recalledMessage
    });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("maps the authoritative deadline failure to a stable error", async () => {
    const { service } = createRecallFixture({ status: "window_expired" });

    await expect(
      service.recallMessage(
        { userId: 1 } as never,
        { conversationId: 91, messageId: 700, mode: "standard" }
      )
    ).rejects.toMatchObject({
      message: "error.im.recall_window_expired",
      statusCode: 400
    });
  });

  it("keeps out-of-scope messages behind the safe not-found error", async () => {
    const { service } = createRecallFixture({ status: "not_found" });

    await expect(
      service.recallMessage(
        { userId: 2 } as never,
        { conversationId: 91, messageId: 700, mode: "standard" }
      )
    ).rejects.toMatchObject({
      message: "error.realtime.message_not_found",
      statusCode: 404
    });
  });
});

describe("RealtimeService blocked-recipient delivery guard", () => {
  it("rejects before persistence when the direct-chat recipient has blocked the sender", async () => {
    const repository = {
      isMessageSenderBlocked: jest.fn(async () => true),
      createMessage: jest.fn()
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.createMessage(
        { userId: 41 } as never,
        { conversationId: 91, type: "text", content: "hello" }
      )
    ).rejects.toMatchObject({
      message: "error.im.recipient_blocked",
      statusCode: 403
    });
    expect(repository.createMessage).not.toHaveBeenCalled();
  });
});

describe("RealtimeService friendship authorization", () => {
  it("maps a removed friendship send to a 403 without publishing", async () => {
    const repository = {
      isMessageSenderBlocked: jest.fn().mockResolvedValue(false),
      createMessage: jest.fn().mockResolvedValue({ status: "not_friends" })
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.createMessage(
        { userId: 167 } as never,
        { conversationId: 91, type: "text", content: "still there?" }
      )
    ).rejects.toMatchObject({
      message: "error.im.not_friends",
      statusCode: 403
    });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("maps unauthorized direct conversation creation to a 403", async () => {
    const repository = {
      findActiveUserIds: jest.fn().mockResolvedValue([41, 167]),
      createConversation: jest.fn().mockResolvedValue({ status: "not_friends" })
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.createConversation(
        { userId: 41 } as never,
        { type: "direct", participantUserIds: [167] }
      )
    ).rejects.toMatchObject({
      message: "error.im.not_friends",
      statusCode: 403
    });
  });
});

describe("RealtimeService group privacy and membership", () => {
  it("persists owner-managed privacy settings and publishes one conversation update per member", async () => {
    const conversation = {
      id: 91,
      privacyModeEnabled: true,
      disappearingTtlSeconds: 3_600,
      hideMemberProfiles: true,
      disappearingStartMode: "sent" as const,
      participants: [{ userId: 1 }, { userId: 2 }]
    };
    const repository = {
      updateConversationPrivacy: jest.fn(async () => conversation)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.updateConversationPrivacy(
        { userId: 1 } as never,
        {
          conversationId: 91,
          privacyModeEnabled: true,
          disappearingTtlSeconds: 3_600,
          hideMemberProfiles: true,
          disappearingStartMode: "sent"
        }
      )
    ).resolves.toBe(conversation);

    expect(repository.updateConversationPrivacy).toHaveBeenCalledWith({
      actorUserId: 1,
      conversationId: 91,
      privacyModeEnabled: true,
      disappearingTtlSeconds: 3_600,
      hideMemberProfiles: true,
      disappearingStartMode: "sent"
    });
    expect(eventGateway.publish).toHaveBeenCalledTimes(2);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation.privacy.updated",
        recipientUserId: 2,
        payload: conversation
      })
    );
  });

  it("leaves a group only after the owner selects a successor and notifies every affected account", async () => {
    const result = {
      conversationId: 91,
      removedUserId: 1,
      newOwnerUserId: 2,
      dissolved: false,
      recipientUserIds: [1, 2, 3]
    };
    const repository = {
      leaveConversation: jest.fn(async () => ({ status: "left" as const, result }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(service.leaveConversation({ userId: 1 } as never, 91, 2)).resolves.toBe(result);
    expect(repository.leaveConversation).toHaveBeenCalledWith({
      conversationId: 91,
      userId: 1,
      transferOwnerUserId: 2
    });
    expect(eventGateway.publish).toHaveBeenCalledTimes(3);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation.member.left",
        recipientUserId: 1,
        payload: result
      })
    );
  });

  it("requires a group owner to choose a valid successor before leaving", async () => {
    const repository = {
      leaveConversation: jest.fn(async () => ({ status: "transfer_required" as const }))
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(service.leaveConversation({ userId: 1 } as never, 91)).rejects.toMatchObject({
      message: "error.realtime.group_owner_transfer_required",
      statusCode: 400
    });
  });

  it("allows only the owner to dissolve the group for every member", async () => {
    const result = {
      conversationId: 91,
      removedUserId: 1,
      newOwnerUserId: null,
      dissolved: true,
      recipientUserIds: [1, 2, 3]
    };
    const repository = {
      dissolveConversation: jest.fn(async () => result)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(service.dissolveConversation({ userId: 1 } as never, 91)).resolves.toBe(result);
    expect(repository.dissolveConversation).toHaveBeenCalledWith({
      conversationId: 91,
      ownerUserId: 1
    });
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "conversation.dissolved", recipientUserId: 3 })
    );
  });

  it("clears history only for the authenticated participant", async () => {
    const conversation = { id: 91, lastMessage: null, unreadCount: 0 };
    const repository = {
      clearConversationMessages: jest.fn(async () => conversation)
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.clearConversationMessages({ userId: 1 } as never, 91)
    ).resolves.toBe(conversation);
    expect(repository.clearConversationMessages).toHaveBeenCalledWith({
      conversationId: 91,
      userId: 1
    });
  });
});
