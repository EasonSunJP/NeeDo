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
