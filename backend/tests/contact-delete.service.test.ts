import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeService friendship deletion", () => {
  it("returns the bilateral result and refreshes both accounts", async () => {
    const deletedFriendship = {
      actorUserId: 41,
      actorIdentityId: 410,
      counterpartUserId: 167,
      counterpartIdentityId: 1670,
      contactIds: [31, 32],
      deletedContactCount: 2,
      deletedFollowCount: 2,
      deletedConversationId: 91,
      deleted: true as const,
      deletedAt: new Date("2026-08-30T06:00:00.000Z")
    };
    const repository = { deleteContact: jest.fn(async () => deletedFriendship) };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway);

    await expect(
      service.deleteContact({ userId: 41, currentIdentityId: 410 } as never, 31)
    ).resolves.toBe(deletedFriendship);

    expect(repository.deleteContact).toHaveBeenCalledWith({
      contactId: 31,
      ownerIdentityId: 410,
      ownerUserId: 41
    });
    expect(eventGateway.publish).toHaveBeenCalledTimes(2);
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: deletedFriendship,
        recipientUserId: 41,
        recipientIdentityId: 410,
        type: "friendship.deleted"
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: deletedFriendship,
        recipientUserId: 167,
        recipientIdentityId: 1670,
        type: "friendship.deleted"
      })
    );
  });

  it("does not expose whether another user's contact exists", async () => {
    const repository = { deleteContact: jest.fn(async () => null) };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(service.deleteContact({ userId: 41 } as never, 999)).rejects.toMatchObject({
      message: "error.realtime.contact_not_found"
    });
  });
});
