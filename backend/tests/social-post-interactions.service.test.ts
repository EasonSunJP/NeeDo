import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeService } from "../src/services/realtime.service";

const auth = { userId: 7, currentIdentityId: 71 } as never;
const context = { ip: "127.0.0.1", userAgent: "social-interaction-test" };
const scopeResolver = {
  resolve: jest.fn(async () => ({ identityId: 70, userId: 7, identityType: "customer" }))
};

const post = {
  id: 88,
  authorUserId: 9,
  authorIdentityId: 90,
  content: "formal post",
  counters: { likes: 4, reposts: 2, views: 11, bookmarks: 3 },
  viewerInteraction: { liked: true, bookmarked: false, shared: false }
};

type SocialInteractionService = {
  setSocialPostLike: (
    authContext: typeof auth,
    postId: number,
    active: boolean,
    requestContext: typeof context
  ) => Promise<typeof post>;
  setSocialPostBookmark: (
    authContext: typeof auth,
    postId: number,
    active: boolean,
    requestContext: typeof context
  ) => Promise<typeof post>;
  recordSocialPostView: (
    authContext: typeof auth,
    postId: number,
    requestContext: typeof context
  ) => Promise<typeof post>;
  shareSocialPost: (
    authContext: typeof auth,
    postId: number,
    input: { targetUserIds: number[]; idempotencyKey: string },
    requestContext: typeof context
  ) => Promise<{ post: typeof post; deliveredUserIds: number[] }>;
};

describe("RealtimeService formal social interactions", () => {
  it("scopes like, bookmark, and unique view mutations to the active identity", async () => {
    const repository = {
      setSocialPostLike: jest.fn(async () => ({ changed: true, post })),
      setSocialPostBookmark: jest.fn(async () => ({ changed: true, post })),
      recordSocialPostView: jest.fn(async () => ({ changed: true, post })),
      listFollowerRecipients: jest.fn(async () => [{ userId: 10, identityId: 100 }])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(
      repository as never,
      gateway as never,
      scopeResolver as never
    ) as unknown as SocialInteractionService;

    await expect(service.setSocialPostLike(auth, 88, true, context)).resolves.toBe(post);
    await expect(service.setSocialPostBookmark(auth, 88, true, context)).resolves.toBe(post);
    await expect(service.recordSocialPostView(auth, 88, context)).resolves.toBe(post);

    expect(repository.setSocialPostLike).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 70,
      actorUserId: 7,
      active: true,
      postId: 88
    }));
    expect(repository.setSocialPostBookmark).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 70,
      actorUserId: 7,
      active: true,
      postId: 88
    }));
    expect(repository.recordSocialPostView).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 70,
      actorUserId: 7,
      postId: 88
    }));
    expect(gateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "social.post.interaction.updated",
      payload: post
    }));
  });

  it("publishes persisted friend-share messages and returns delivered users", async () => {
    const message = { id: 501, conversationId: 61, senderUserId: 7 };
    const repository = {
      shareSocialPost: jest.fn(async () => ({
        changed: true,
        post: { ...post, viewerInteraction: { ...post.viewerInteraction, shared: true } },
        deliveries: [{ recipientUserId: 8, recipientIdentityId: 80, message, created: true }]
      })),
      listFollowerRecipients: jest.fn(async () => [])
    };
    const gateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(
      repository as never,
      gateway as never,
      scopeResolver as never
    ) as unknown as SocialInteractionService;

    await expect(service.shareSocialPost(
      auth,
      88,
      { targetUserIds: [8], idempotencyKey: "share-88-8" },
      context
    )).resolves.toEqual(expect.objectContaining({ deliveredUserIds: [8] }));

    expect(repository.shareSocialPost).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 70,
      actorUserId: 7,
      idempotencyKey: "share-88-8",
      postId: 88,
      targetUserIds: [8]
    }));
    expect(gateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "message.created",
      recipientIdentityId: 80,
      payload: message
    }));
  });
});
