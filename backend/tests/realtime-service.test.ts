import { ConversationAccessPolicy } from "@prisma/client";
import { logger } from "../src/config/logger";
import { RealtimeRepository } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeRepository message-send eligibility", () => {
  const createFixture = ({
    accessPolicy = ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
    blocked = false,
    identityIds = [410, 1670],
    member = true,
    reciprocalContactCount = 2
  }: {
    accessPolicy?: ConversationAccessPolicy;
    blocked?: boolean;
    identityIds?: number[];
    member?: boolean;
    reciprocalContactCount?: number;
  } = {}) => {
    const findParticipant = jest.fn(async () =>
      member
        ? {
            conversation: {
              accessPolicy,
              participants: identityIds.map((identityId) => ({ identityId }))
            }
          }
        : null
    );
    const countContacts = jest.fn(async () => reciprocalContactCount);
    const repository = new RealtimeRepository({
      conversationParticipant: { findFirst: findParticipant },
      contact: { count: countContacts }
    } as never);
    const blockSpy = jest.spyOn(repository, "isMessageSenderBlocked").mockResolvedValue(blocked);

    return { repository, findParticipant, countContacts, blockSpy };
  };

  it("returns not_found for a non-member without checking block or contacts", async () => {
    const { repository, findParticipant, countContacts, blockSpy } = createFixture({
      member: false
    });

    await expect(
      repository.checkMessageSendEligibility({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410
      })
    ).resolves.toBe("not_found");

    expect(findParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 91,
          identityId: 410,
          deletedAt: null,
          conversation: { deletedAt: null }
        })
      })
    );
    expect(blockSpy).not.toHaveBeenCalled();
    expect(countContacts).not.toHaveBeenCalled();
  });

  it("returns recipient_blocked before checking friendship contacts", async () => {
    const { repository, countContacts, blockSpy } = createFixture({ blocked: true });

    await expect(
      repository.checkMessageSendEligibility({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410
      })
    ).resolves.toBe("recipient_blocked");

    expect(blockSpy).toHaveBeenCalledWith(91, 41, 410);
    expect(countContacts).not.toHaveBeenCalled();
  });

  it("returns not_friends when friendship-required membership is not exactly two", async () => {
    const { repository, countContacts } = createFixture({ identityIds: [410] });

    await expect(
      repository.checkMessageSendEligibility({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410
      })
    ).resolves.toBe("not_friends");

    expect(countContacts).not.toHaveBeenCalled();
  });

  it("returns not_friends when friendship-required reciprocal contacts are incomplete", async () => {
    const { repository, countContacts } = createFixture({ reciprocalContactCount: 1 });

    await expect(
      repository.checkMessageSendEligibility({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410
      })
    ).resolves.toBe("not_friends");

    expect(countContacts).toHaveBeenCalledTimes(1);
  });

  it("allows friendship-required sends with two reciprocal contacts", async () => {
    const { repository, countContacts } = createFixture({ reciprocalContactCount: 2 });

    await expect(
      repository.checkMessageSendEligibility({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410
      })
    ).resolves.toBe("allowed");

    expect(countContacts).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          { ownerIdentityId: 410, contactIdentityId: 1670 },
          { ownerIdentityId: 1670, contactIdentityId: 410 }
        ]
      }
    });
  });

  it.each([ConversationAccessPolicy.BUSINESS_CONTEXT, ConversationAccessPolicy.GROUP_MEMBERSHIP])(
    "allows unblocked %s sends without querying contacts",
    async (accessPolicy) => {
      const { repository, countContacts } = createFixture({ accessPolicy });

      await expect(
        repository.checkMessageSendEligibility({
          conversationId: 91,
          senderUserId: 41,
          senderIdentityId: 410
        })
      ).resolves.toBe("allowed");

      expect(countContacts).not.toHaveBeenCalled();
    }
  );
});

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
      service.searchDirectory({ userId: 41 } as never, {
        query: "u0000000167",
        page: 1,
        pageSize: 50
      })
    ).resolves.toBe(directoryResult);
    expect(repository.searchDirectory).toHaveBeenCalledWith(41, {
      ownerIdentityId: 41,
      query: "u0000000167",
      page: 1,
      pageSize: 50
    });
  });

  it("loads a safe directory profile for another user", async () => {
    const profile = {
      user: { userId: 167, needoId: "u0000000167", username: "Target", avatarUrl: null },
      identityCard: {
        entityType: "account" as const,
        profileId: null,
        displayName: "Target",
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
      relationship: "none" as const,
      contactId: null,
      friendRequest: null
    };
    const repository = {
      findCanonicalIdentityIdForUser: jest.fn(async () => 1670),
      getDirectoryProfile: jest.fn(async () => profile)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.getDirectoryProfile({ userId: 41, currentIdentityId: 410 } as never, 167)
    ).resolves.toBe(profile);

    expect(repository.getDirectoryProfile).toHaveBeenCalledWith(41, 410, 167, 1670);
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("strips technician-only details from a non-technician directory response", async () => {
    const repository = {
      findCanonicalIdentityIdForUser: jest.fn(async () => 1670),
      getDirectoryProfile: jest.fn(async () => ({
        user: { userId: 167, needoId: "u0000000167", username: "Target", avatarUrl: null },
        identityCard: {
          entityType: "user" as const,
          profileId: 67,
          displayName: "Target"
        },
        relationship: "friend" as const,
        contactId: 9,
        friendRequest: null,
        technicianContactDetails: {
          bidBudgetMinJpy: 12_000,
          bidBudgetMaxJpy: 28_000,
          paymentMethods: ["platform"],
          specialTags: ["internal"],
          profileTags: ["tag"],
          services: [],
          completedOrderCount: 12,
          acceptanceRateBps: 9_800
        }
      }))
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    const result = await service.getDirectoryProfile(
      { userId: 41, currentIdentityId: 410 } as never,
      167
    );

    expect(result.identityCard.entityType).toBe("user");
    expect(result).not.toHaveProperty("technicianContactDetails");
  });

  it("loads the authenticated account as a read-only directory profile in the active identity", async () => {
    const profile = {
      user: { userId: 41, needoId: "u0000000041", username: "Requester", avatarUrl: null },
      identityCard: {
        entityType: "technician" as const,
        profileId: 741,
        displayName: "Requester Technician",
        identityLabel: "INDEPENDENT",
        verified: true,
        creditValue: null,
        creditReviewCount: 0,
        gender: null,
        age: null,
        heightCm: null,
        languages: [],
        city: "东京",
        serviceArea: "新宿区",
        yearsExperience: 4,
        bio: null
      },
      relationship: "self" as const,
      contactId: null,
      friendRequest: null
    };
    const repository = {
      findCanonicalIdentityIdForUser: jest.fn(),
      getDirectoryProfile: jest.fn(async () => profile)
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.getDirectoryProfile({ userId: 41, currentIdentityId: 410 } as never, 41)
    ).resolves.toBe(profile);

    expect(repository.getDirectoryProfile).toHaveBeenCalledWith(41, 410, 41, 410);
    expect(repository.findCanonicalIdentityIdForUser).not.toHaveBeenCalled();
  });
});

describe("RealtimeService friend request lifecycle", () => {
  const friendRequest = {
    id: 19,
    requesterUserId: 41,
    requesterIdentityId: 410,
    targetUserId: 167,
    targetIdentityId: 1670,
    status: "pending" as const
  };

  it("publishes only when a new request was created", async () => {
    const repository = {
      findActiveUserIds: jest.fn(async () => [167]),
      findCanonicalIdentityIdForUser: jest.fn(async () => 1670),
      createFriendRequest: jest.fn(async () => ({
        status: "ready" as const,
        result: { friendRequest, created: false }
      }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);
    const auth = { userId: 41, currentIdentityId: 410 } as never;

    await expect(service.createFriendRequest(auth, { targetUserId: 167 })).resolves.toEqual({
      friendRequest,
      created: false
    });
    expect(eventGateway.publish).not.toHaveBeenCalled();

    repository.createFriendRequest.mockResolvedValueOnce({
      status: "ready",
      result: { friendRequest, created: true }
    });
    await service.createFriendRequest(auth, { targetUserId: 167 });
    expect(eventGateway.publish).toHaveBeenCalledTimes(1);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.created",
        recipientUserId: 167,
        recipientIdentityId: 1670,
        payload: friendRequest
      })
    );
  });

  it("publishes an accepted request to both identities", async () => {
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
      service.respondToFriendRequest(
        { userId: 167, currentIdentityId: 1670 } as never,
        19,
        "accept"
      )
    ).resolves.toBe(accepted);
    expect(eventGateway.publish).toHaveBeenCalledTimes(6);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.accepted",
        recipientUserId: 41,
        recipientIdentityId: 410
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.accepted",
        recipientUserId: 167,
        recipientIdentityId: 1670
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "contact.updated", recipientIdentityId: 410 })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "social.follow.updated", recipientIdentityId: 1670 })
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
      service.respondToFriendRequest(
        { userId: 167, currentIdentityId: 1670 } as never,
        19,
        "accept"
      )
    ).rejects.toMatchObject({ message: "error.realtime.friend_request_expired" });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });
});

describe("RealtimeService message reaction outcomes", () => {
  const message = {
    id: 41,
    conversationId: 3,
    senderUserId: 2,
    type: "text" as const,
    content: "收到",
    metadata: null,
    reactions: [],
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    recallDeadlineAt: new Date("2026-08-30T00:03:00.000Z"),
    recalledAt: null,
    recallMode: null,
    contentPurgedAt: null,
    lifecycleVersion: 0,
    reactionVersion: 1,
    availableRecallModes: []
  };

  function createFixture(
    setOutcome: unknown,
    removeOutcome: unknown = { status: "unchanged", message }
  ) {
    const repository = {
      setMessageReaction: jest.fn(async () => setOutcome),
      removeMessageReaction: jest.fn(async () => removeOutcome),
      getConversationForUser: jest.fn(async () => ({ participants: [{ userId: 1 }] }))
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    return {
      eventGateway,
      repository,
      service: new RealtimeService(repository as never, eventGateway)
    };
  }

  it("returns and publishes an updated reaction", async () => {
    const { eventGateway, service } = createFixture({ status: "updated", message });

    await expect(
      service.setMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "OK"
      })
    ).resolves.toBe(message);
    expect(eventGateway.publish).toHaveBeenCalledTimes(1);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.reaction.updated", payload: message })
    );
  });

  it("returns an unchanged reaction without publishing", async () => {
    const { eventGateway, service } = createFixture({ status: "unchanged", message });

    await expect(
      service.setMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "OK"
      })
    ).resolves.toBe(message);
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("maps an occupied reaction slot to the formal 409 error", async () => {
    const { eventGateway, service } = createFixture({
      status: "slot_occupied",
      message,
      activeEmoji: "OK"
    });

    await expect(
      service.setMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "NO"
      })
    ).rejects.toMatchObject({
      code: 40946,
      message: "error.im.reaction_slot_occupied",
      statusCode: 409
    });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("keeps the existing not-found behavior", async () => {
    const { service } = createFixture({ status: "not_found" });

    await expect(
      service.setMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "OK"
      })
    ).rejects.toMatchObject({ statusCode: 404, message: "error.realtime.message_not_found" });
  });

  it("publishes only a changed DELETE outcome", async () => {
    const updated = createFixture({ status: "unchanged", message }, { status: "updated", message });
    await expect(
      updated.service.removeMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "OK"
      })
    ).resolves.toBe(message);
    expect(updated.eventGateway.publish).toHaveBeenCalledTimes(1);

    const unchanged = createFixture(
      { status: "unchanged", message },
      { status: "unchanged", message }
    );
    await expect(
      unchanged.service.removeMessageReaction({ userId: 1 } as never, {
        conversationId: 3,
        messageId: 41,
        emoji: "OK"
      })
    ).resolves.toBe(message);
    expect(unchanged.eventGateway.publish).not.toHaveBeenCalled();
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

    await expect(
      service.updateSocialPost(
        { userId: 1 } as never,
        44,
        { content: "edited", mentionUserIds: [5], visibility: "followers" },
        { ip: "127.0.0.1" }
      )
    ).resolves.toBe(post);

    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "social.post.updated",
        recipientUserId: 2,
        payload: post
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "notification.created",
        recipientUserId: 5,
        payload: notification
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
      service.recallMessage({ userId: 1 } as never, {
        conversationId: 91,
        messageId: 700,
        mode: "standard"
      })
    ).resolves.toEqual({
      action: "standard_recall",
      conversationId: 91,
      messageId: 700,
      message: recalledMessage
    });

    expect(repository.recallMessage).toHaveBeenCalledWith({
      conversationId: 91,
      messageId: 700,
      senderIdentityId: 1,
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
      service.recallMessage({ userId: 1 } as never, {
        conversationId: 91,
        messageId: 700,
        mode: "standard"
      })
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
      service.recallMessage({ userId: 1 } as never, {
        conversationId: 91,
        messageId: 700,
        mode: "standard"
      })
    ).rejects.toMatchObject({
      message: "error.im.recall_window_expired",
      statusCode: 400
    });
  });

  it("keeps out-of-scope messages behind the safe not-found error", async () => {
    const { service } = createRecallFixture({ status: "not_found" });

    await expect(
      service.recallMessage({ userId: 2 } as never, {
        conversationId: 91,
        messageId: 700,
        mode: "standard"
      })
    ).rejects.toMatchObject({
      message: "error.realtime.message_not_found",
      statusCode: 404
    });
  });
});

describe("RealtimeService message-send preflight", () => {
  it.each([
    ["not_found", "error.realtime.conversation_not_found", 404],
    ["recipient_blocked", "error.im.recipient_blocked", 403],
    ["not_friends", "error.im.not_friends", 403]
  ] as const)("maps %s before createMessage", async (status, message, statusCode) => {
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue(status),
      createMessage: jest.fn()
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.createMessage({ userId: 41 } as never, {
        conversationId: 91,
        type: "text",
        content: "hello"
      })
    ).rejects.toMatchObject({
      message,
      statusCode
    });
    expect(repository.createMessage).not.toHaveBeenCalled();
  });

  it("keeps the transaction-time friendship result as the final race-safe gate", async () => {
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
      createMessage: jest.fn().mockResolvedValue({ status: "not_friends" })
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway);

    await expect(
      service.createMessage({ userId: 41 } as never, {
        conversationId: 91,
        type: "text",
        content: "hello"
      })
    ).rejects.toMatchObject({
      message: "error.im.not_friends",
      statusCode: 403
    });
    expect(gateway.publish).not.toHaveBeenCalled();
  });

  it("keeps the transaction-time recipient block as the final race-safe gate", async () => {
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
      createMessage: jest.fn().mockResolvedValue({ status: "recipient_blocked" })
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway);

    await expect(
      service.createMessage({ userId: 41 } as never, {
        conversationId: 91,
        type: "text",
        content: "hello"
      })
    ).rejects.toMatchObject({
      message: "error.im.recipient_blocked",
      statusCode: 403
    });
    expect(gateway.publish).not.toHaveBeenCalled();
  });

  it("returns the committed message when recipient discovery fails after commit", async () => {
    const message = { id: 501, conversationId: 91 };
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
      createMessage: jest.fn().mockResolvedValue({ status: "created", message }),
      listConversationRecipients: jest.fn(async () => {
        throw new Error("recipient query failed after commit");
      })
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway);
    const logError = jest.spyOn(logger, "error").mockImplementation(() => undefined);

    try {
      await expect(
        service.createMessage({ userId: 41 } as never, {
          conversationId: 91,
          type: "text",
          content: "hello"
        })
      ).resolves.toBe(message);
      expect(gateway.publish).not.toHaveBeenCalled();
    } finally {
      logError.mockRestore();
    }
  });

  it("returns the committed message when synchronous publication fails after commit", async () => {
    const message = { id: 501, conversationId: 91 };
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
      createMessage: jest.fn().mockResolvedValue({ status: "created", message }),
      listConversationRecipients: jest.fn().mockResolvedValue([{ userId: 167, identityId: 1670 }])
    };
    const gateway = {
      publish: jest.fn(() => {
        throw new Error("synchronous publication failure");
      }),
      subscribe: jest.fn()
    };
    const service = new RealtimeService(repository as never, gateway);
    const logError = jest.spyOn(logger, "error").mockImplementation(() => undefined);

    try {
      await expect(
        service.createMessage({ userId: 41 } as never, {
          conversationId: 91,
          type: "text",
          content: "hello"
        })
      ).resolves.toBe(message);
      expect(gateway.publish).toHaveBeenCalledTimes(1);
    } finally {
      logError.mockRestore();
    }
  });
});

describe("RealtimeRepository transaction-time recipient block", () => {
  it("checks block state on the transaction client before creating a message", async () => {
    const createdAt = new Date("2026-08-31T00:00:00.000Z");
    const participantFindFirst = jest.fn().mockResolvedValue({
      id: 77,
      createdAt,
      conversation: {
        type: "DIRECT",
        privacyModeEnabled: false,
        disappearingTtlSeconds: null,
        privacyPolicyVersion: 1,
        accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        participants: [
          {
            userId: 41,
            identityId: 410,
            identity: { ownedContacts: [] }
          },
          {
            userId: 167,
            identityId: 1670,
            identity: { ownedContacts: [{ id: 900 }] }
          }
        ]
      }
    });
    const messageCreate = jest.fn(async () => ({
      id: 501,
      conversationId: 91,
      senderUserId: 41,
      senderIdentityId: 410,
      type: "TEXT",
      content: "hello",
      metadata: null,
      expiresAt: null,
      expiredAt: null,
      recallDeadlineAt: new Date("2026-08-31T00:03:00.000Z"),
      recalledAt: null,
      recallMode: null,
      contentPurgedAt: null,
      privacyPolicyVersionAtSend: null,
      lifecycleVersion: 1,
      reactionVersion: 0,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      reactions: []
    }));
    const transaction = {
      conversationParticipant: {
        findFirst: participantFindFirst,
        updateMany: jest.fn()
      },
      contact: { count: jest.fn().mockResolvedValue(2) },
      imPolicy: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { create: messageCreate },
      conversation: { update: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    };

    await expect(
      new RealtimeRepository(client as never).createMessage({
        conversationId: 91,
        senderUserId: 41,
        senderIdentityId: 410,
        type: "text",
        content: "hello"
      })
    ).resolves.toEqual({ status: "recipient_blocked" });

    expect(participantFindFirst).toHaveBeenCalledTimes(1);
    expect(participantFindFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 91,
        identityId: 410,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: {
        id: true,
        createdAt: true,
        conversation: {
          select: expect.objectContaining({
            participants: {
              where: { deletedAt: null },
              select: {
                userId: true,
                identityId: true,
                identity: {
                  select: {
                    ownedContacts: {
                      where: {
                        contactIdentityId: 410,
                        blockedAt: { not: null },
                        deletedAt: null
                      },
                      select: { id: true }
                    }
                  }
                }
              }
            }
          })
        }
      }
    });
    expect(transaction.contact.count).not.toHaveBeenCalled();
    expect(messageCreate).not.toHaveBeenCalled();
    expect(transaction.conversation.update).not.toHaveBeenCalled();
    expect(transaction.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });
});

describe("RealtimeService friendship authorization", () => {
  it("maps unauthorized direct conversation creation to a 403", async () => {
    const repository = {
      findActiveUserIds: jest.fn().mockResolvedValue([41, 167]),
      findCanonicalIdentityIdForUser: jest.fn().mockResolvedValue(1670),
      createConversation: jest.fn().mockResolvedValue({ status: "not_friends" })
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.createConversation({ userId: 41 } as never, {
        type: "direct",
        participantUserIds: [167]
      })
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
      service.updateConversationPrivacy({ userId: 1 } as never, {
        conversationId: 91,
        privacyModeEnabled: true,
        disappearingTtlSeconds: 3_600,
        hideMemberProfiles: true,
        disappearingStartMode: "sent"
      })
    ).resolves.toBe(conversation);

    expect(repository.updateConversationPrivacy).toHaveBeenCalledWith({
      actorIdentityId: 1,
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
      identityId: 1,
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
      ownerIdentityId: 1,
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

    await expect(service.clearConversationMessages({ userId: 1 } as never, 91)).resolves.toBe(
      conversation
    );
    expect(repository.clearConversationMessages).toHaveBeenCalledWith({
      conversationId: 91,
      identityId: 1,
      userId: 1
    });
  });

  it("forwards auto translation preference through the active identity without publishing an event", async () => {
    const conversation = { id: 91, autoTranslateMessages: true };
    const repository = {
      updateConversationPreferences: jest.fn(async () => conversation)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.updateConversationPreferences({ userId: 41, currentIdentityId: 410 } as never, {
        conversationId: 91,
        autoTranslateMessages: true
      })
    ).resolves.toBe(conversation);

    expect(repository.updateConversationPreferences).toHaveBeenCalledWith({
      conversationId: 91,
      userId: 41,
      identityId: 410,
      autoTranslateMessages: true
    });
    expect(eventGateway.publish).not.toHaveBeenCalled();
  });

  it("rejects unsafe batch-delete conversation and message IDs before repository access", async () => {
    const repository = { deleteMessagesForUser: jest.fn() };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });
    const unsafe = 2_147_483_648;

    await expect(
      service.deleteMessagesForUser(
        { userId: 41, currentIdentityId: 71, currentIdentityType: "customer" } as never,
        { conversationId: unsafe, messageIds: [11], idempotencyKey: "key" }
      )
    ).rejects.toThrow("error.validation_failed");
    await expect(
      service.deleteMessagesForUser(
        { userId: 41, currentIdentityId: 71, currentIdentityType: "customer" } as never,
        { conversationId: 91, messageIds: [unsafe], idempotencyKey: "key" }
      )
    ).rejects.toThrow("error.validation_failed");
    expect(repository.deleteMessagesForUser).not.toHaveBeenCalled();
  });
});

describe("NeeDo entity-share atomicity", () => {
  const target = {
    targetType: "shop" as const,
    publicId: "shop0000000001",
    shopId: 7,
    technicianProfileId: null
  };

  it.each([
    ["not_found", "error.realtime.conversation_not_found", 404],
    ["recipient_blocked", "error.im.recipient_blocked", 403],
    ["not_friends", "error.im.not_friends", 403]
  ] as const)(
    "creates no share event when preflight returns %s",
    async (status, message, statusCode) => {
      const repository = {
        checkMessageSendEligibility: jest.fn().mockResolvedValue(status),
        createNeedoEntityShare: jest.fn()
      };
      const service = new RealtimeService(repository as never, {
        publish: jest.fn(),
        subscribe: jest.fn()
      });

      await expect(
        service.createNeedoEntityShare({ userId: 41 } as never, {
          conversationId: 91,
          recipientIdentityId: 1670,
          target,
          idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
          requestFingerprint: "fingerprint"
        })
      ).rejects.toMatchObject({ message, statusCode });
      expect(repository.createNeedoEntityShare).not.toHaveBeenCalled();
    }
  );

  it("publishes only a newly committed NeeDo share message", async () => {
    const message = { id: 501, conversationId: 91 };
    const repository = {
      checkMessageSendEligibility: jest.fn().mockResolvedValue("allowed"),
      createNeedoEntityShare: jest.fn().mockResolvedValue({
        status: "created",
        message,
        receipt: {
          targetType: "shop",
          publicId: "shop0000000001",
          eventId: 21,
          messageId: 501,
          shareCount: 4,
          replayed: false
        }
      }),
      listConversationRecipients: jest.fn(async () => [{ userId: 167, identityId: 1670 }])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway);

    await expect(
      service.createNeedoEntityShare({ userId: 41 } as never, {
        conversationId: 91,
        recipientIdentityId: 1670,
        target,
        idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
        requestFingerprint: "fingerprint"
      })
    ).resolves.toMatchObject({ eventId: 21, shareCount: 4, replayed: false });
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.created", payload: message })
    );
  });

  it("persists the message and share event in one repository transaction", async () => {
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const message = {
      id: 501,
      conversationId: 91,
      senderUserId: 41,
      senderIdentityId: 410,
      type: "SYSTEM",
      content: "shop0000000001",
      metadata: null,
      expiresAt: null,
      expiredAt: null,
      recallDeadlineAt: new Date("2026-09-01T00:03:00.000Z"),
      recalledAt: null,
      recallMode: null,
      contentPurgedAt: null,
      privacyPolicyVersionAtSend: null,
      lifecycleVersion: 1,
      reactionVersion: 0,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      reactions: []
    };
    const transaction = {
      entityShareEvent: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 21 })),
        count: jest.fn(async () => 4)
      },
      conversationParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ userId: 167, identityId: 1670 })
          .mockResolvedValueOnce({
            id: 77,
            createdAt,
            conversation: {
              type: "DIRECT",
              privacyModeEnabled: false,
              disappearingTtlSeconds: null,
              privacyPolicyVersion: 1,
              accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
              participants: [
                { userId: 41, identityId: 410, identity: { ownedContacts: [] } },
                { userId: 167, identityId: 1670, identity: { ownedContacts: [] } }
              ]
            }
          }),
        updateMany: jest.fn()
      },
      contact: { count: jest.fn(async () => 2) },
      imPolicy: { findFirst: jest.fn(async () => null) },
      message: { create: jest.fn(async () => message) },
      conversation: { update: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    };

    await expect(
      new RealtimeRepository(client as never).createNeedoEntityShare({
        actorUserId: 41,
        actorIdentityId: 410,
        conversationId: 91,
        recipientIdentityId: 1670,
        target,
        idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
        requestFingerprint: "fingerprint"
      })
    ).resolves.toMatchObject({
      status: "created",
      receipt: { eventId: 21, messageId: 501, shareCount: 4, replayed: false }
    });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.entityShareEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 41,
        actorIdentityId: 410,
        shopId: 7,
        technicianProfileId: null,
        conversationId: 91,
        messageId: 501,
        recipientUserId: 167,
        recipientIdentityId: 1670,
        channel: "NEEDO_MESSAGE"
      })
    });
  });
});
