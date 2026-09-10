import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeService } from "../src/services/realtime.service";

const message = {
  id: 801,
  conversationId: 91,
  senderUserId: 41,
  type: "text",
  content: "佐藤花子",
  metadata: { snapshotVersion: 2, type: "contact-card" },
  reactions: [],
  expiresAt: null,
  createdAt: new Date("2026-09-01T03:00:00.000Z"),
  recallDeadlineAt: new Date("2026-09-01T03:03:00.000Z"),
  recalledAt: null,
  recallMode: null,
  contentPurgedAt: null,
  privacyPolicyVersionAtSend: null,
  lifecycleVersion: 1,
  reactionVersion: 0,
  availableRecallModes: ["standard"]
};

describe("RealtimeService formal contact-card sending", () => {
  it("delegates only the target public ID and publishes a normal message event after creation", async () => {
    const repository = {
      sendContactCard: jest.fn(async () => ({ status: "created", message })),
      listConversationRecipients: jest.fn(async () => [
        { userId: 41, identityId: 410 },
        { userId: 67, identityId: 670 }
      ])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway as never);

    await expect(
      service.sendContactCard(
        { userId: 41, currentIdentityId: 410 } as never,
        91,
        "u0000000052",
        "contact-card-send-1"
      )
    ).resolves.toEqual({ message, replayed: false });
    expect(repository.sendContactCard).toHaveBeenCalledWith({
      conversationId: 91,
      senderUserId: 41,
      senderIdentityId: 410,
      targetUserPublicId: "u0000000052",
      idempotencyKey: "contact-card-send-1"
    });
    expect(gateway.publish).toHaveBeenCalledTimes(2);
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message.created",
        payload: message
      })
    );
  });

  it("returns an idempotent replay without publishing a duplicate event", async () => {
    const repository = {
      sendContactCard: jest.fn(async () => ({ status: "replayed", message })),
      listConversationRecipients: jest.fn()
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, gateway as never);

    await expect(
      service.sendContactCard(
        { userId: 41, currentIdentityId: 410 } as never,
        91,
        "u0000000052",
        "contact-card-send-1"
      )
    ).resolves.toEqual({ message, replayed: true });
    expect(gateway.publish).not.toHaveBeenCalled();
    expect(repository.listConversationRecipients).not.toHaveBeenCalled();
  });

  it("maps a target outside self/current-friends to a safe forbidden error", async () => {
    const repository = {
      sendContactCard: jest.fn(async () => ({ status: "target_not_allowed" }))
    };
    const service = new RealtimeService(
      repository as never,
      { publish: jest.fn(), subscribe: jest.fn() } as never
    );

    await expect(
      service.sendContactCard(
        { userId: 41, currentIdentityId: 410 } as never,
        91,
        "u0000000099",
        "contact-card-send-2"
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "error.im.contact_card_target_not_allowed"
    });
  });

  it("rejects client-authored contact-card metadata on the generic message path", async () => {
    const repository = { createMessage: jest.fn() };
    const service = new RealtimeService(
      repository as never,
      { publish: jest.fn(), subscribe: jest.fn() } as never
    );

    await expect(
      service.createMessage({ userId: 41, currentIdentityId: 410 } as never, {
        conversationId: 91,
        type: "text",
        content: "伪造名片",
        metadata: {
          needoMessageType: "contact-card",
          needoMessageExt: { contactCard: { displayName: "伪造" } }
        }
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "error.im.contact_card_requires_dedicated_endpoint"
    });
    expect(repository.createMessage).not.toHaveBeenCalled();
  });
});
