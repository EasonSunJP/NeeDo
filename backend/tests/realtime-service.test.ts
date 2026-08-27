import { RealtimeService } from "../src/services/realtime.service";

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
