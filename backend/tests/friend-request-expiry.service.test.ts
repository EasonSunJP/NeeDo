import { FriendRequestExpiryService } from "../src/services/friend-request-expiry.service";

describe("FriendRequestExpiryService", () => {
  it("publishes one terminal event to each side of each newly expired request", async () => {
    const request = {
      id: 9,
      requesterUserId: 1,
      targetUserId: 2,
      status: "expired" as const
    };
    const repository = {
      expireDueFriendRequests: jest.fn().mockResolvedValue([request])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new FriendRequestExpiryService(repository as never, gateway);

    await expect(service.expireDue({ batchSize: 100 })).resolves.toEqual({ expired: 1 });
    expect(repository.expireDueFriendRequests).toHaveBeenCalledWith({ batchSize: 100 });
    expect(gateway.publish).toHaveBeenCalledTimes(2);
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.expired",
        recipientUserId: 1,
        payload: request
      })
    );
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "friend_request.expired",
        recipientUserId: 2,
        payload: request
      })
    );
  });
});
