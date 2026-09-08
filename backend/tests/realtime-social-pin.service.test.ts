import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeService Social post pin", () => {
  it("uses the active identity, returns the authoritative post, and publishes a refresh event", async () => {
    const post = { id: 701, authorUserId: 41, authorIdentityId: 71, isPinned: true };
    const repository = { setSocialPostPin: jest.fn(async () => post) };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const personalIdentityScope = {
      resolve: jest.fn(async () => ({ userId: 41, identityId: 71, identityType: "customer" }))
    };
    const service = new RealtimeService(
      repository as never,
      eventGateway,
      personalIdentityScope as never
    );

    await expect(
      service.setSocialPostPin({ userId: 41 } as never, 701, true, {
        ip: "127.0.0.1",
        userAgent: "social-pin-service-test"
      })
    ).resolves.toBe(post);

    expect(repository.setSocialPostPin).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 701,
        authorUserId: 41,
        authorIdentityId: 71,
        active: true
      })
    );
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "social.post.updated",
        recipientUserId: 41,
        recipientIdentityId: 71,
        payload: post
      })
    );
  });

  it("does not reveal a non-owned post", async () => {
    const service = new RealtimeService(
      { setSocialPostPin: jest.fn(async () => null) } as never,
      { publish: jest.fn(), subscribe: jest.fn() },
      {
        resolve: jest.fn(async () => ({ userId: 41, identityId: 71, identityType: "customer" }))
      } as never
    );

    await expect(
      service.setSocialPostPin({ userId: 41 } as never, 701, true, { ip: "127.0.0.1" })
    ).rejects.toMatchObject({ statusCode: 404, message: "error.realtime.social_post_not_found" });
  });
});
