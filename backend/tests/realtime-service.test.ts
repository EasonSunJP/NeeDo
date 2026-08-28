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

describe("RealtimeService social events", () => {
  it("publishes a created post to the author and current followers", async () => {
    const post = {
      id: 44,
      authorUserId: 1,
      content: "live update",
      media: null,
      visibility: "public" as const,
      createdAt: new Date("2026-08-25T00:00:00.000Z")
    };
    const repository = {
      createSocialPost: jest.fn(async () => post),
      listFollowerUserIds: jest.fn(async () => [2, 3])
    };
    const eventGateway = {
      publish: jest.fn(),
      subscribe: jest.fn()
    };
    const service = new RealtimeService(repository as never, eventGateway);

    await service.createSocialPost(
      { userId: 1 } as never,
      { content: post.content, visibility: post.visibility }
    );

    expect(repository.listFollowerUserIds).toHaveBeenCalledWith(1);
    expect(eventGateway.publish).toHaveBeenCalledTimes(3);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "social.post.created",
        recipientUserId: 2,
        payload: post
      })
    );
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
});
