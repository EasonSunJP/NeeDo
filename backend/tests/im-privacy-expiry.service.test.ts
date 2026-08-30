import {
  ImPrivacyExpiryService,
  type DuePrivacyMessage,
  type ImPrivacyExpiryRepositoryPort
} from "../src/services/im-privacy-expiry.service";

const now = new Date("2026-08-30T06:02:00.000Z");

describe("ImPrivacyExpiryService", () => {
  it("purges each due message and publishes a content-free deletion event to every participant", async () => {
    const candidate: DuePrivacyMessage = {
      id: 41,
      conversationId: 3,
      senderUserId: 7,
      createdAt: new Date("2026-08-30T06:00:00.000Z"),
      expiresAt: now,
      lifecycleVersion: 7,
      privacyPolicyVersionAtSend: 4
    };
    const repository: jest.Mocked<ImPrivacyExpiryRepositoryPort> = {
      listDue: jest.fn(async (input: { now: Date; take: number }) => {
        void input;
        return [candidate];
      }),
      expire: jest.fn(async (input: { candidate: DuePrivacyMessage; now: Date }) => {
        void input;
        return {
          directiveId: 91,
          conversationId: 3,
          messageId: 41,
          occurredAt: now,
          participantUserIds: [7, 8]
        };
      })
    };
    const gateway = {
      publish: jest.fn()
    };

    await expect(
      new ImPrivacyExpiryService(repository, gateway).expireDue({ now, batchSize: 20 })
    ).resolves.toEqual({ scanned: 1, expired: 1, failed: 0, publishFailed: 0 });
    expect(repository.expire).toHaveBeenCalledWith({ candidate, now });
    expect(gateway.publish).toHaveBeenCalledTimes(2);
    expect(gateway.publish).toHaveBeenCalledWith({
      id: "im-privacy-expired-91",
      type: "message.deleted",
      recipientUserId: 7,
      payload: {
        id: 91,
        conversationId: 3,
        messageId: 41,
        action: "privacy_expired",
        occurredAt: now.toISOString()
      },
      createdAt: now.toISOString()
    });
    expect(JSON.stringify((gateway.publish as jest.Mock).mock.calls)).not.toContain(
      "隐私倒计时消息"
    );
  });
});
